import { getFirebaseAdmin } from "../lib/firebase-admin.js";
import { getFirestore, Transaction, DocumentReference } from "firebase-admin/firestore";
import { getUserPushToken, sendExpoPush } from "../lib/push.js";
import { sendRechargeEmail } from "../lib/email.js";

const FAPSHI_BASE   = "https://live.fapshi.com";
const FAPSHI_USER   = process.env.FAPSHI_API_USER   ?? "";
const FAPSHI_SECRET = process.env.FAPSHI_SECRET_KEY  ?? "";

const POLL_INTERVAL_MS = 15 * 60 * 1000;  // every 15 minutes (quota ×3 réduit)
const MAX_PER_RUN      = 20;              // max pending recharges per run
const SKIP_IF_CHECKED_WITHIN_MS = 12 * 60 * 1000; // skip if checked < 12 min ago
const EXPIRE_AFTER_MS = 24 * 60 * 60 * 1000; // abandon after 24h

// Type minimal pour contourner le conflit de `Response`
type HttpRes = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

async function checkFapshiStatus(transId: string): Promise<"SUCCESSFUL" | "FAILED" | "PENDING" | null> {
  try {
    const r = (await fetch(`${FAPSHI_BASE}/payment-status/${transId}`, {
      headers: { apiuser: FAPSHI_USER, apikey: FAPSHI_SECRET },
      signal: AbortSignal.timeout(12000),
    })) as unknown as HttpRes;
    if (!r.ok) return null;
    const raw = (await r.json()) as Record<string, unknown>;
    const statusObj = (raw?.data ?? raw) as Record<string, unknown>;
    const st = String(statusObj?.status ?? raw?.status ?? "").toUpperCase();
    if (st === "SUCCESSFUL") return "SUCCESSFUL";
    if (st === "FAILED" || st === "EXPIRED" || st === "CANCELLED") return "FAILED";
    return "PENDING";
  } catch {
    return null;
  }
}

// Le bonus parrainage est géré exclusivement par referralPoller (jobs/referralPoller.ts)
// qui est idempotent via le champ referralProcessed sur chaque rechargement.
// Ne pas ajouter de creditReferralBonus ici pour éviter tout double-crédit.

async function pollOnce(): Promise<void> {
  if (!FAPSHI_USER || !FAPSHI_SECRET) return;

  getFirebaseAdmin();
  const db  = getFirestore();
  const now = Date.now();

  // Find all pending Fapshi recharges that have a transId
  const snap = await db.collection("rechargements")
    .where("status", "==", "pending")
    .limit(MAX_PER_RUN)
    .get()
    .catch(() => null);

  if (!snap || snap.empty) return;

  // Also check activites for pending depots (created by record-pending-recharge)
  // We'll merge both sources
  const activitesSnap = await db.collection("activites")
    .where("status", "==", "pending")
    .where("type", "==", "depot")
    .limit(MAX_PER_RUN)
    .get()
    .catch(() => null);

  // Build a map of transId → {userId, amount} from all pending sources
  interface PendingEntry {
    transId: string;
    userId: string;
    amount: number;
    docRef: DocumentReference;
    docType: "rechargement" | "activite";
    createdAt: string;
  }

  const pending = new Map<string, PendingEntry>();

  for (const doc of snap.docs) {
    const d = doc.data();
    const transId = String(d.transId ?? d.transactionId ?? "");
    if (!transId) continue;
    if (pending.has(transId)) continue;
    pending.set(transId, {
      transId,
      userId: String(d.userId ?? ""),
      amount: Number(d.amount ?? 0),
      docRef: doc.ref,
      docType: "rechargement",
      createdAt: String(d.createdAt ?? ""),
    });
  }

  if (activitesSnap) {
    for (const doc of activitesSnap.docs) {
      const d = doc.data();
      const transId = String(d.transId ?? "");
      if (!transId) continue;
      if (pending.has(transId)) continue;
      pending.set(transId, {
        transId,
        userId: String(d.userId ?? ""),
        amount: Number(d.amount ?? 0),
        docRef: doc.ref,
        docType: "activite",
        createdAt: String(d.createdAt ?? ""),
      });
    }
  }

  if (pending.size === 0) return;
  console.log(`[fapshi-poller] ${pending.size} paiement(s) en attente à vérifier`);

  const promises = Array.from(pending.values()).map(async (entry) => {
    const { transId, userId, amount, docRef, createdAt } = entry;

    // Skip if no userId
    if (!userId) return;

    // Abandon payments older than 24h
    if (createdAt) {
      const age = now - new Date(createdAt).getTime();
      if (age > EXPIRE_AFTER_MS) {
        console.log(`[fapshi-poller] ⏱ Paiement ${transId} abandonné (> 24h)`);
        await docRef.update({ status: "expired" }).catch(() => {});
        return;
      }
    }

    // Skip if we just checked this one
    const lastChecked = (docRef as unknown as { _lastFapshiCheck?: number })._lastFapshiCheck ?? 0;
    if (now - lastChecked < SKIP_IF_CHECKED_WITHIN_MS) return;
    (docRef as unknown as { _lastFapshiCheck?: number })._lastFapshiCheck = now;

    // Check if already credited (idempotency check)
    const confirmRef = db.collection("rechargements").doc(`fapshi_${transId}`);
    const confirmDoc = await confirmRef.get().catch(() => null);
    if (confirmDoc?.exists) {
      // Already credited — just mark the pending doc as confirmed
      await docRef.update({ status: "confirmed" }).catch(() => {});
      console.log(`[fapshi-poller] ⚡ ${transId} déjà crédité — marqué confirmed`);
      return;
    }

    // Check Fapshi status
    const status = await checkFapshiStatus(transId);
    console.log(`[fapshi-poller] ${transId} → ${status ?? "timeout"}`);

    if (status === "FAILED") {
      await docRef.update({ status: "rejected" }).catch(() => {});
      return;
    }

    if (status !== "SUCCESSFUL") return; // still pending or timeout

    // ── SUCCESSFUL — atomic credit ──
    let referredBy = "";
    let firstName  = "";
    let userEmail  = "";
    let newBalance = 0;

    try {
      await db.runTransaction(async (t: Transaction) => {
        // Idempotency check inside transaction
        const existingDoc = await t.get(confirmRef);
        if (existingDoc.exists) {
          referredBy = ""; // already done
          return;
        }

        const userRef = db.doc(`users/${userId}`);
        const userDoc = await t.get(userRef);
        if (!userDoc.exists) return;

        const userData   = userDoc.data()!;
        const currentBal = Number(userData.balance ?? 0);
        referredBy = String(userData.referredBy ?? "");
        firstName  = String(userData.name ?? "").split(" ")[0] || "";
        userEmail  = String(userData.email ?? "");

        // ── Gestion de la dette avant de créditer le solde ──────────────────
        const currentDebt = Number(userData.frozenDebt ?? 0);
        const isBlocked   = !!userData.blocked;
        let creditToBalance = amount;
        const userUpdates: Record<string, unknown> = {};

        if (currentDebt > 0) {
          if (amount >= currentDebt) {
            creditToBalance = amount - currentDebt;
            userUpdates.frozenDebt = 0;
            if (isBlocked) { userUpdates.blocked = false; userUpdates.blockedAt = null; }
          } else {
            creditToBalance = 0;
            userUpdates.frozenDebt = currentDebt - amount;
          }
        }

        userUpdates.balance = currentBal + creditToBalance;
        t.update(userRef, userUpdates);
        newBalance = currentBal + creditToBalance;

        const nowIso = new Date().toISOString();
        t.set(confirmRef, {
          amount,
          method: "Fapshi Mobile Money",
          transactionId: transId,
          transId,
          status: "confirmed",
          userId,
          createdAt: nowIso,
          creditedBy: "server-poller",
          depositNotifSent: true, // notification sent below by sendExpoPush
        });

        // Update the pending doc to confirmed
        t.update(docRef, { status: "confirmed" });
      });

      console.log(`[fapshi-poller] ✅ ${transId} → ${amount} FCFA crédités à ${userId}`);

      // Activity log
      await db.collection("activites").add({
        userId,
        type: "depot",
        label: "Dépôt Fapshi confirmé",
        amount,
        status: "confirmed",
        transId,
        createdAt: new Date().toISOString(),
      }).catch(() => {});

      // Push notification
      getUserPushToken(userId).then((token) => {
        const greeting = firstName ? `, ${firstName}` : "";
        sendExpoPush(
          token,
          "💰 Rechargement confirmé !",
          `${amount.toLocaleString("fr-FR")} FCFA ont été crédités sur votre solde${greeting}. Vous pouvez maintenant passer vos commandes.`,
          { screen: "wallet" },
          "wallet"
        );
      }).catch(() => {});

      // Fire-and-forget recharge email
      if (userEmail) {
        sendRechargeEmail(userEmail, firstName, amount, "Fapshi Mobile Money", newBalance).catch(() => {});
      }

      // Referral bonus handled by referralPoller (runs every 2 min)
    } catch (e) {
      console.error(`[fapshi-poller] ❌ Erreur transaction ${transId}:`, e);
    }
  });

  await Promise.allSettled(promises);
}

let pollerTimer: ReturnType<typeof setInterval> | null = null;

export function startFapshiPoller(): void {
  if (pollerTimer) return;
  console.log(`[fapshi-poller] Démarrage (intervalle: ${POLL_INTERVAL_MS / 1000}s)`);

  // First check after 30s (let the server settle)
  setTimeout(() => {
    pollOnce().catch((e) => console.error("[fapshi-poller] error:", e));
  }, 30_000);

  pollerTimer = setInterval(() => {
    pollOnce().catch((e) => console.error("[fapshi-poller] error:", e));
  }, POLL_INTERVAL_MS);
}

export function stopFapshiPoller(): void {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
    console.log("[fapshi-poller] Arrêté.");
  }
}