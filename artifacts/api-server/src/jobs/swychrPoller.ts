import { getFirebaseAdmin } from "../lib/firebase-admin.js";
import { getFirestore, Transaction } from "firebase-admin/firestore";
import { getUserPushToken, sendExpoPush } from "../lib/push.js";

const POLL_INTERVAL_MS = 3 * 60 * 1000;   // toutes les 3 minutes
const MAX_PER_RUN      = 20;
const EXPIRE_AFTER_MS  = 24 * 60 * 60 * 1000; // abandon après 24h

function asNum(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

async function pollOnce(): Promise<void> {
  getFirebaseAdmin();
  const db  = getFirestore();
  const now = Date.now();

  const snap = await db.collection("rechargements")
    .where("status", "==", "pending")
    .where("method", "==", "Mobile Money International")
    .limit(MAX_PER_RUN)
    .get()
    .catch(() => null);

  if (!snap || snap.empty) return;

  console.log(`[swychr-poller] ${snap.docs.length} paiement(s) international(aux) en attente`);

  for (const doc of snap.docs) {
    const data          = doc.data();
    const transId       = String(data.transId ?? data.transactionId ?? "");
    const userId        = String(data.userId ?? "");
    const amount        = asNum(data.amount);
    const balanceBefore = asNum(data.balanceBefore);
    const createdAt     = String(data.createdAt ?? "");

    if (!transId || !userId || amount <= 0) continue;

    // Expirer après 24h sans confirmation
    const age = now - new Date(createdAt).getTime();
    if (!isNaN(age) && age > EXPIRE_AFTER_MS) {
      await doc.ref.update({ status: "expired", processedAt: new Date().toISOString() }).catch(() => {});
      console.log(`[swychr-poller] ⏰ Expiré: ${transId}`);
      continue;
    }

    // Vérifier si le backend externe a déjà crédité le solde
    const userSnap = await db.doc(`users/${userId}`).get().catch(() => null);
    if (!userSnap?.exists) continue;

    const currentBal      = asNum(userSnap.data()?.balance);
    const balanceIncrease = currentBal - balanceBefore;
    const verified        = balanceIncrease >= (amount - 1);

    if (!verified) {
      console.log(`[swychr-poller] ⏳ ${transId} — solde pas encore crédité (delta: ${balanceIncrease} FCFA, attendu: ${amount})`);
      continue;
    }

    // Solde déjà augmenté → confirmer le rechargement
    const rechargeRef = db.collection("rechargements").doc(`swychr_${transId}`);
    let debtRepaid = 0;
    let unblocked  = false;
    let userName   = "";
    let alreadyDone = false;

    try {
      await db.runTransaction(async (t: Transaction) => {
        const existing = await t.get(rechargeRef);
        if (existing.exists && (existing.data()?.status === "confirmed" || existing.data()?.processed === true)) {
          alreadyDone = true;
          return;
        }

        const userRef  = db.doc(`users/${userId}`);
        const userDoc  = await t.get(userRef);
        const userData = userDoc.data() ?? {};
        userName = String(userData.name ?? "").split(" ")[0] || "";

        const frozenDebt = asNum(userData.frozenDebt ?? 0);
        const isBlocked  = !!userData.blocked;
        const updates: Record<string, unknown> = {};

        if (frozenDebt > 0) {
          const repayable  = Math.min(amount, frozenDebt);
          debtRepaid       = repayable;
          updates.balance      = asNum(userData.balance) - repayable;
          updates.frozenDebt   = frozenDebt - repayable;
          if (frozenDebt <= amount && isBlocked) {
            updates.blocked    = false;
            updates.blockedAt  = null;
            unblocked = true;
          }
          t.update(userRef, updates);
        }

        const now2 = new Date().toISOString();
        t.set(rechargeRef, {
          amount,
          method:            data.method ?? "Mobile Money International",
          phone:             data.phone  ?? "",
          transId,
          transactionId:     transId,
          status:            "confirmed",
          userId,
          createdAt,
          depositNotifSent:  false,
          referralProcessed: false,
          debtRepaid:        debtRepaid > 0 ? debtRepaid : undefined,
          creditedBy:        "swychr-poller",
          processed:         true,
          processedAt:       now2,
        }, { merge: true });

        t.set(db.collection("activites").doc(), {
          userId,
          type:      "depot",
          label:     "Dépôt international confirmé (poller)",
          amount,
          status:    "confirmed",
          transId,
          createdAt: now2,
        });
      });

      if (alreadyDone) continue;

      // Notification push
      const greeting = userName ? `, ${userName}` : "";
      let pushTitle = "💰 Rechargement confirmé !";
      let pushBody  = `${amount.toLocaleString("fr-FR")} FCFA ont bien été crédités sur votre solde${greeting}.`;
      if (debtRepaid > 0 && unblocked) {
        pushTitle = "✅ Compte débloqué !";
        pushBody  = `Votre dette de ${debtRepaid.toLocaleString("fr-FR")} FCFA a été remboursée${greeting}. Compte débloqué !`;
      } else if (debtRepaid > 0) {
        pushTitle = "📉 Remboursement partiel de dette";
        pushBody  = `${debtRepaid.toLocaleString("fr-FR")} FCFA de votre recharge ont été appliqués à votre dette${greeting}.`;
      }

      getUserPushToken(userId)
        .then((token) => sendExpoPush(token, pushTitle, pushBody, { screen: "wallet" }, "wallet"))
        .catch(() => {});

      await rechargeRef.update({ depositNotifSent: true }).catch(() => {});
      console.log(`[swychr-poller] ✅ ${transId} confirmé pour ${userId} (${amount} FCFA)`);

    } catch (e) {
      console.error(`[swychr-poller] ❌ Erreur ${transId}:`, e);
    }
  }
}

export function startSwychrPoller(): void {
  console.log(`[swychr-poller] Démarrage (intervalle: ${POLL_INTERVAL_MS / 1000}s)`);
  const run = (): void => {
    pollOnce()
      .catch((e) => console.error("[swychr-poller] ❌ Erreur cycle:", e))
      .finally(() => setTimeout(run, POLL_INTERVAL_MS));
  };
  setTimeout(run, 10_000); // 1er cycle après 10s
}