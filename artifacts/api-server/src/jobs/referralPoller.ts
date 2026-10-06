/**
 * Referral + Deposit-Notification Poller
 *
 * Runs every 2 minutes. Handles TWO phases:
 *
 * PHASE 0 — Pending SwychrConnect detection (balance-increase fallback)
 *   For rechargements with status "pending" (written by record-pending-recharge
 *   when a SwychrConnect/international payment is initiated) that are at least
 *   5 minutes old, check if the user's current balance >= balanceBefore + amount.
 *   If so, the external backend has credited the payment — promote to "confirmed"
 *   so PHASE 1 picks it up on the next tick (or immediately).
 *
 * PHASE 1 — Confirmed rechargements processor
 *
 *   TASK A — Deposit confirmation notification (depositNotifSent !== true)
 *     → Sends a push notification to the depositing user telling them their
 *       balance has been credited.
 *
 *   TASK B — Referral bonus (referralProcessed !== true)
 *     → Credits 10% to the referrer's referralBalance, writes activity records
 *       for both parties, and sends a push notification to the referrer.
 *
 * A rechargement is considered "done" once both flags are true.
 */

import { getFirebaseAdmin } from "../lib/firebase-admin.js";
import {
  getFirestore,
  FieldValue,
  Firestore,
  QuerySnapshot,
} from "firebase-admin/firestore";
import { getUserPushToken, sendExpoPush } from "../lib/push.js";

const POLL_INTERVAL_MS = 45 * 60 * 1000; // 45 minutes (quota ×4.5 réduit)
const MAX_PER_RUN      = 20;
const BONUS_RATE       = 0.10;

function asNumber(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}
function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

async function promotePendingSwychr(db: Firestore): Promise<void> {
  // Find pending rechargements older than 5 minutes (swychr_ prefix = international)
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  let pendingSnap: QuerySnapshot;
  try {
    pendingSnap = await db.collection("rechargements")
      .where("status", "==", "pending")
      .limit(20)
      .get();
  } catch {
    return;
  }

  if (pendingSnap.empty) return;

  const candidates = pendingSnap.docs.filter((d) => {
    const id = d.id;
    const createdAt = asString(d.data().createdAt);
    return id.startsWith("swychr_") && createdAt < cutoff;
  });

  if (candidates.length === 0) return;

  console.log(`[referral-poller] 🔍 PHASE 0: ${candidates.length} rechargement(s) SwychrConnect en attente à vérifier`);

  for (const doc of candidates) {
    const data   = doc.data();
    const userId = asString(data.userId);
    const amount = asNumber(data.amount);
    const balanceBefore = asNumber(data.balanceBefore);

    if (!userId || amount <= 0) {
      await doc.ref.update({ status: "rejected" }).catch(() => {});
      continue;
    }

    try {
      const userDoc = await db.doc(`users/${userId}`).get();
      if (!userDoc.exists) continue;

      const currentBalance = asNumber(userDoc.data()?.balance);

      // External backend credited the balance if current >= before + amount.
      // Sécurité : on marque referralProcessed=true ici car on ne peut pas certifier
      // que l'augmentation de solde vient VRAIMENT de ce paiement SwychrConnect
      // (elle peut venir d'un rechargement Fapshi simultané). Le bonus parrainage
      // n'est donné que si le webhook SwychrConnect a confirmé le paiement
      // (webhook/swychr fixe referralProcessed=false pour les vrais paiements).
      if (currentBalance >= balanceBefore + amount) {
        await doc.ref.update({
          status:            "confirmed",
          depositNotifSent:  false,
          referralProcessed: true,   // ← sécurité : pas de double bonus via PHASE 0
          confirmedAt:       new Date().toISOString(),
          confirmedBy:       "phase0-balance-check",
        });
        console.log(`[referral-poller] ✅ PHASE 0: swychr_${asString(data.transId)} promu confirmed (bal: ${balanceBefore} → ${currentBalance}, attendu: ${balanceBefore + amount})`);
      } else {
        // Check if too old (>30 min) — mark rejected to stop retrying
        const createdAt = asString(data.createdAt);
        const ageMin = (Date.now() - new Date(createdAt).getTime()) / 60000;
        if (ageMin > 30) {
          await doc.ref.update({ status: "rejected" }).catch(() => {});
          console.log(`[referral-poller] ⏱ PHASE 0: ${doc.id} expiré (${Math.round(ageMin)} min)`);
        }
      }
    } catch (e) {
      console.error(`[referral-poller] PHASE 0 erreur pour ${doc.id}:`, e);
    }
  }
}

async function pollOnce(): Promise<void> {
  getFirebaseAdmin();
  const db = getFirestore();

  // PHASE 0: Promote pending SwychrConnect rechargements whose balance has been credited
  await promotePendingSwychr(db).catch((e) =>
    console.error("[referral-poller] PHASE 0 error:", e)
  );

  // PHASE 1: Query confirmed rechargements that still need at least one of the two tasks.
  // We filter in memory to avoid needing a composite index.
  let snap: QuerySnapshot;
  try {
    snap = await db.collection("rechargements")
      .where("status", "==", "confirmed")
      .orderBy("createdAt", "desc")
      .limit(MAX_PER_RUN)
      .get();
  } catch {
    try {
      snap = await db.collection("rechargements")
        .where("status", "==", "confirmed")
        .limit(MAX_PER_RUN)
        .get();
    } catch (e) {
      console.error("[referral-poller] query error:", e);
      return;
    }
  }

  if (snap.empty) return;

  // Keep only docs where at least one task is pending
  const pending = snap.docs.filter(
    (d) => !d.data().depositNotifSent || !d.data().referralProcessed
  );
  if (pending.length === 0) return;

  console.log(`[referral-poller] ${pending.length} rechargement(s) à traiter`);

  const promises = pending.map(async (doc) => {
    const data   = doc.data();
    const userId = asString(data.userId);
    const amount = asNumber(data.amount);

    if (!userId || amount <= 0) {
      await doc.ref.update({ referralProcessed: true, depositNotifSent: true }).catch(() => {});
      return;
    }

    try {
      const userDoc = await db.doc(`users/${userId}`).get();
      if (!userDoc.exists) {
        await doc.ref.update({ referralProcessed: true, depositNotifSent: true }).catch(() => {});
        return;
      }

      const userData       = userDoc.data() ?? {};
      const referredByCode = asString(userData.referredBy);
      const userName       = String(userData.name ?? "").split(" ")[0] || "";
      const now            = new Date().toISOString();

      // ─── TASK A: Deposit confirmation notification ─────────────────────────
      const needsDepositNotif = !data.depositNotifSent;
      if (needsDepositNotif) {
        const greeting = userName ? `, ${userName}` : "";
        getUserPushToken(userId).then((token) =>
          sendExpoPush(
            token,
            "💰 Rechargement confirmé !",
            `${amount.toLocaleString("fr-FR")} FCFA ont bien été crédités sur votre solde${greeting}. Vous pouvez maintenant passer vos commandes.`,
            { screen: "wallet" },
            "wallet"
          )
        ).catch(() => {});
        console.log(`[referral-poller] 📱 Notif dépôt envoyée à ${userId} (${amount} FCFA)`);
      }

      // ─── TASK B: Referral bonus ────────────────────────────────────────────
      const needsReferral = !data.referralProcessed;
      let referralDone = !needsReferral; // already done if flag is already set

      if (needsReferral && referredByCode) {
        const bonus = Math.round(amount * BONUS_RATE);

        if (bonus > 0) {
          const referrerSnap = await db.collection("users")
            .where("referralCode", "==", referredByCode)
            .limit(1)
            .get();

          if (!referrerSnap.empty) {
            const referrerDoc  = referrerSnap.docs[0];
            const referrerId   = referrerDoc.id;
            const referrerName = String(referrerDoc.data()?.name ?? "").split(" ")[0] || "";

            const batch = db.batch();

            // Credit referrer's referralBalance
            batch.update(referrerDoc.ref, {
              referralBalance: FieldValue.increment(bonus),
            });

            // Activity for the referrer
            batch.set(db.collection("activites").doc(), {
              userId:     referrerId,
              type:       "parrainage",
              label:      `Bonus parrainage — dépôt de ${amount.toLocaleString("fr-FR")} FCFA`,
              amount:     bonus,
              status:     "confirmed",
              fromUserId: userId,
              createdAt:  now,
            });

            // Activity for the filleul
            batch.set(db.collection("activites").doc(), {
              userId:    userId,
              type:      "parrainage",
              label:     `Parrainage actif — ${bonus.toLocaleString("fr-FR")} FCFA reversés à votre parrain`,
              amount:    bonus,
              status:    "confirmed",
              toUserId:  referrerId,
              createdAt: now,
            });

            // ── IDEMPOTENCY : referralProcessed dans le même batch que le crédit ──
            // Si le serveur crash après batch.commit() mais avant le update séparé,
            // le champ est déjà à true → pas de double-crédit au prochain cycle.
            batch.update(doc.ref, { referralProcessed: true });

            await batch.commit();

            console.log(
              `[referral-poller] ✅ Bonus ${bonus} FCFA → parrain ${referrerId} (filleul ${userId}) — recharge: ${doc.id}`
            );

            // Push notification to referrer
            getUserPushToken(referrerId).then((token) => {
              const greeting = referrerName ? `, ${referrerName}` : "";
              return sendExpoPush(
                token,
                "🎁 Bonus parrainage reçu !",
                `Félicitations${greeting} ! Vous venez de gagner ${bonus.toLocaleString("fr-FR")} FCFA de commission grâce au dépôt de votre filleul.`,
                { screen: "parrainage" },
                "wallet"
              );
            }).catch(() => {});

            referralDone = true;
          } else {
            console.warn(`[referral-poller] Parrain introuvable pour code: ${referredByCode}`);
            referralDone = true; // mark done to avoid infinite retries
          }
        } else {
          referralDone = true; // bonus too small, skip
        }
      } else if (needsReferral && !referredByCode) {
        referralDone = true; // no referrer, nothing to do
      }

      // ─── Mark remaining tasks done ────────────────────────────────────────
      // NOTE: referralProcessed est déjà écrit dans le batch (atomique avec le crédit).
      // On met à jour seulement depositNotifSent ici si nécessaire.
      const flags: Record<string, boolean> = {};
      if (needsDepositNotif) flags.depositNotifSent = true;
      // referralProcessed est déjà dans le batch — ne pas le re-mettre ici
      // pour éviter toute confusion sur l'ordre des opérations.
      if (referralDone && !needsReferral) {
        // Cas où needsReferral était false dès le départ (pas de parrain / bonus nul)
        // → le batch n'avait pas de .update(doc.ref) → on doit marquer ici
        flags.referralProcessed = true;
      }
      if (Object.keys(flags).length > 0) {
        await doc.ref.update(flags).catch(() => {});
      }

    } catch (e) {
      console.error(`[referral-poller] ❌ Erreur pour recharge ${doc.id}:`, e);
    }
  });

  await Promise.allSettled(promises);
}

let pollerTimer: ReturnType<typeof setInterval> | null = null;

export function startReferralPoller(): void {
  if (pollerTimer) return;
  console.log(`[referral-poller] Démarrage (intervalle: ${POLL_INTERVAL_MS / 1000}s)`);

  // First run after 60s (let Firebase Admin settle)
  setTimeout(() => {
    pollOnce().catch((e) => console.error("[referral-poller] error:", e));
  }, 60_000);

  pollerTimer = setInterval(() => {
    pollOnce().catch((e) => console.error("[referral-poller] error:", e));
  }, POLL_INTERVAL_MS);
}

export function stopReferralPoller(): void {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
    console.log("[referral-poller] Arrêté.");
  }
}