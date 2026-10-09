import { Router } from "express";
import type { Request, Response as ExpressResponse } from "express";
import type { Transaction } from "firebase-admin/firestore";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { sendExpoPush, getUserPushToken } from "../lib/push.js";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  asIsoDate,
  asNumber,
  asString,
  firestoreCreate,
  firestoreGet,
  firestoreGetMany,
  firestoreQuery,
  firestoreUpdate,
  getFirebaseAdmin,
} from "../lib/firebase-admin.js";
import { enqueuePendingCredit } from "../lib/pendingCredits.js";
import { sendRechargeEmail, sendWithdrawalEmail } from "../lib/email.js";

const FAPSHI_USER   = process.env.FAPSHI_API_USER    ?? "";
const FAPSHI_SECRET = process.env.FAPSHI_SECRET_KEY  ?? "";
const FAPSHI_BASE   = "https://live.fapshi.com";
const INTL_PAYMENT_BACKEND = "https://social-boost-exaucenapopolo2.replit.app";
const ADMIN_WHATSAPP = "+237699853665";
const ACCOUNTPE_BASE = "https://api.accountpe.com/api/payin";

const router: ReturnType<typeof Router> = Router();

const walletCache = new Map<string, { data: unknown; ts: number }>();
const walletActivCache = new Map<string, { data: unknown[]; ts: number }>();
const WALLET_CACHE_MS = 5 * 60_000;

export function invalidateWalletCache(uid: string): void {
  walletCache.delete(uid);
  walletActivCache.delete(uid);
}

setInterval(() => {
  const now = Date.now();
  for (const [uid, e] of walletCache) {
    if (now - e.ts > WALLET_CACHE_MS) walletCache.delete(uid);
  }
  for (const [uid, e] of walletActivCache) {
    if (now - e.ts > WALLET_CACHE_MS) walletActivCache.delete(uid);
  }
}, 10 * 60_000);

// ─────────────────────────────────────────────────────────────
// AccountPe / Swychr — helpers d'authentification et vérification
// ─────────────────────────────────────────────────────────────
async function accountPeAuth(): Promise<string | null> {
  const email = process.env.ACCOUNTPE_USERNAME ?? "";
  const password = process.env.ACCOUNTPE_PASSWORD ?? "";
  if (!email || !password) {
    console.warn("[accountpe] ACCOUNTPE_USERNAME / ACCOUNTPE_PASSWORD manquants");
    return null;
  }
  try {
    const r = await fetch(`${ACCOUNTPE_BASE}/admin/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      console.error("[accountpe] auth HTTP", r.status, await r.text().catch(() => ""));
      return null;
    }
    const data = (await r.json()) as Record<string, unknown>;
    return typeof data.token === "string" ? data.token : null;
  } catch (e: any) {
    console.error("[accountpe] auth exception:", e?.message);
    return null;
  }
}

async function accountPeVerify(transId: string): Promise<{
  status: string;
  transactionId: string;
  amount: number;
  currency: string;
} | null> {
  const token = await accountPeAuth();
  if (!token) return null;
  try {
    const r = await fetch(`${ACCOUNTPE_BASE}/payment_link_status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ transaction_id: transId }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const raw = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    const attrs = ((raw.data as any)?.data?.attributes
      ?? (raw.data as any)?.attributes
      ?? raw) as Record<string, unknown>;
    return {
      status: String(attrs?.status ?? "").toLowerCase().trim(),
      transactionId: String(attrs?.transaction_id ?? transId),
      amount: Number(attrs?.amount ?? 0),
      currency: String(attrs?.currency ?? "").toUpperCase(),
    };
  } catch (e: any) {
    console.warn("[accountpe] verify exception:", e?.message);
    return null;
  }
}

async function logActivity(
  uid: string,
  idToken: string,
  type: "depot" | "commande" | "remboursement" | "transfert" | "retrait" | "parrainage" | "annulation",
  label: string,
  amount: number,
  status: "pending" | "confirmed" | "rejected" | "completed",
  meta?: Record<string, unknown>
) {
  const item: Record<string, unknown> = {
    userId: uid,
    type,
    label,
    amount,
    status,
    createdAt: new Date().toISOString(),
    ...(meta ?? {}),
  };
  await firestoreCreate("activites", item, idToken);
}

async function sendTwilioWhatsApp(body: string): Promise<void> {
  const SID   = process.env.TWILIO_ACCOUNT_SID  ?? "";
  const TOKEN = process.env.TWILIO_AUTH_TOKEN    ?? "";
  const FROM  = process.env.TWILIO_PHONE_NUMBER  ?? "";
  if (!SID || !TOKEN || !FROM) {
    console.warn("[twilio] Variables manquantes — WhatsApp non envoyé");
    return;
  }
  try {
    const params = new URLSearchParams({
      From: `whatsapp:${FROM}`,
      To:   `whatsapp:${ADMIN_WHATSAPP}`,
      Body: body,
    });
    const res: any = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        signal: AbortSignal.timeout(12000),
      }
    );
    if (!res.ok) {
      const txt = await res.text();
      console.error("[twilio] Erreur WhatsApp:", res.status, txt);
    } else {
      console.log("[twilio] WhatsApp envoyé à l'admin");
    }
  } catch (e) {
    console.error("[twilio] Exception WhatsApp:", e);
  }
}

async function creditReferralBonus(
  userId: string,
  referredByCode: string,
  rechargeAmount: number,
  _idToken: string
): Promise<void> {
  if (!referredByCode) return;
  try {
    const BONUS_RATE = 0.10;
    const bonus = Math.round(rechargeAmount * BONUS_RATE);
    if (bonus <= 0) return;

    getFirebaseAdmin();
    const db = getFirestore();

    const snap = await db.collection("users")
      .where("referralCode", "==", referredByCode)
      .limit(1)
      .get();

    if (snap.empty) {
      console.warn(`[referral] Aucun parrain trouvé pour code: ${referredByCode}`);
      return;
    }
    const referrerDoc = snap.docs[0];
    const referrerId  = referrerDoc.id;
    const now = new Date().toISOString();

    await referrerDoc.ref.update({
      referralBalance: FieldValue.increment(bonus),
    });

    const actParrain: Record<string, unknown> = {
      userId:     referrerId,
      type:       "parrainage",
      label:      `Bonus parrainage — dépôt de ${rechargeAmount.toLocaleString()} FCFA`,
      amount:     bonus,
      status:     "confirmed",
      fromUserId: userId,
      createdAt:  now,
    };
    await db.collection("activites").add(actParrain);

    const actFilleul: Record<string, unknown> = {
      userId:    userId,
      type:      "parrainage",
      label:     `Parrainage actif — ${bonus.toLocaleString()} FCFA reversés à votre parrain`,
      amount:    bonus,
      status:    "confirmed",
      toUserId:  referrerId,
      createdAt: now,
    };
    await db.collection("activites").add(actFilleul);

    const referrerName = String(referrerDoc.data()?.name ?? "").split(" ")[0] || "";
    const bonusGreeting = referrerName ? `, ${referrerName}` : "";
    getUserPushToken(referrerId).then((token) =>
      sendExpoPush(
        token,
        "🎁 Bonus parrainage reçu !",
        `Félicitations${bonusGreeting} ! Vous avez gagné ${bonus.toLocaleString("fr-FR")} FCFA de commission grâce au dépôt de votre filleul.`,
        { screen: "parrainage" },
        "wallet"
      )
    ).catch(() => {});

    console.log(`[referral] ✅ Bonus ${bonus} FCFA crédité à ${referrerId} (parrain de ${userId})`);
  } catch (e) {
    console.error("[referral] Erreur bonus parrainage:", e);
  }
}

router.get("/wallet", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  const uid = req.uid!;
  const idToken = req.idToken!;

  const cached = walletCache.get(uid);
  if (cached && Date.now() - cached.ts < WALLET_CACHE_MS) {
    res.set("X-Cache", "HIT");
    res.json({ success: true, data: cached.data });
    return;
  }

  const user = await firestoreGet(`users/${uid}`, idToken);

  getFirebaseAdmin();
  const db = getFirestore();

  const normalizeRecharge = (r: Record<string, unknown>): Record<string, unknown> => ({
    ...r,
    createdAt: asIsoDate(r.createdAt) ?? new Date(0).toISOString(),
  });

  let recharges: Record<string, unknown>[] = [];
  try {
    const snap = await db.collection("rechargements")
      .where("userId", "==", uid)
      .limit(50)
      .get();
    recharges = snap.docs
      .map((d: any) => normalizeRecharge({ id: d.id, ...d.data() } as Record<string, unknown>))
      .sort((a: any, b: any) => {
        const ta = new Date(a["createdAt"] as string).getTime();
        const tb = new Date(b["createdAt"] as string).getTime();
        return tb - ta;
      });
  } catch {
    const refs = Array.isArray(user?.recentRecharges) ? (user.recentRecharges as { id: string }[]) : [];
    if (refs.length > 0) {
      const ids = refs.slice(0, 50).map((r: any) => r.id).filter(Boolean);
      try {
        getFirebaseAdmin();
        const db2 = getFirestore();
        const snapshots = await Promise.all(ids.map((id: string) => db2.doc(`rechargements/${id}`).get()));
        recharges = snapshots.filter((d: any) => d.exists).map((d: any) => normalizeRecharge({ id: d.id, ...d.data() }));
      } catch {
        recharges = ((await firestoreGetMany("rechargements", ids, idToken)) as Record<string, unknown>[]).map(normalizeRecharge);
      }
      recharges.sort((a: any, b: any) => {
        const ta = new Date(a["createdAt"] as string).getTime();
        const tb = new Date(b["createdAt"] as string).getTime();
        return tb - ta;
      });
    }
  }

  const walletData = {
    balance: asNumber(user?.balance),
    referralBalance: asNumber(user?.referralBalance),
    withdrawalBalance: asNumber(user?.withdrawalBalance),
    recharges,
  };

  walletCache.set(uid, { data: walletData, ts: Date.now() });
  res.set("X-Cache", "MISS");
  res.json({ success: true, data: walletData });
});

router.get("/wallet/activities", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  const uid = req.uid!;
  const idToken = req.idToken!;

  const cachedActiv = walletActivCache.get(uid);
  if (cachedActiv && Date.now() - cachedActiv.ts < WALLET_CACHE_MS) {
    res.set("X-Cache", "HIT");
    res.json({ success: true, data: cachedActiv.data });
    return;
  }

  getFirebaseAdmin();
  const dbActiv = getFirestore();
  let [activites, recharges]: [Record<string, unknown>[], Record<string, unknown>[]] = [[], []];
  try {
    const [actSnap, rechSnap] = await Promise.all([
      dbActiv.collection("activites").where("userId", "==", uid).limit(50).get(),
      dbActiv.collection("rechargements").where("userId", "==", uid).limit(50).get(),
    ]);
    activites = actSnap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Record<string, unknown>));
    recharges = rechSnap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Record<string, unknown>));
  } catch {
    // Fallback silencieux ci-dessous
  }

  if (activites.length === 0 || recharges.length === 0) {
    const user = await firestoreGet(`users/${uid}`, idToken);

    if (activites.length === 0) {
      const recent = Array.isArray(user?.recentActivities)
        ? (user.recentActivities as Record<string, unknown>[])
        : [];
      if (recent.length > 0) activites = recent;
    }

    if (recharges.length === 0) {
      const refs = Array.isArray(user?.recentRecharges)
        ? (user.recentRecharges as { id: string }[])
        : [];
      if (refs.length > 0) {
        const ids = refs.slice(0, 50).map((r: any) => r.id).filter(Boolean);
        recharges = await firestoreGetMany("rechargements", ids, idToken);
      }
    }
  }

  const fromRecharges = (recharges as any[]).map((r: any) => ({
    id: r.id,
    userId: uid,
    type: "depot",
    label: r.method ?? "Dépôt",
    amount: r.amount ?? 0,
    status: r.status ?? "pending",
    transId: r.transId ?? "",
    phone: r.phone ?? "",
    createdAt: asIsoDate(r.createdAt) ?? new Date(0).toISOString(),
  }));

  const normalizedActivites = (activites as any[]).map((a: any) => ({
    ...a,
    createdAt: asIsoDate(a.createdAt) ?? new Date(0).toISOString(),
  }));

  const seen = new Set<string>();
  const all = [...normalizedActivites, ...fromRecharges]
    .filter((a: any) => {
      const key = a.id ?? `${a.type}-${a.createdAt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50);

  walletActivCache.set(uid, { data: all, ts: Date.now() });
  res.set("X-Cache", "MISS");
  res.json({ success: true, data: all });
});

router.post("/wallet/recharge", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  const { amount, phone, transactionId, method, transId } = req.body;
  if (!amount) {
    res.status(400).json({ success: false, error: "Montant requis" });
    return;
  }

  const txId = transId ?? transactionId ?? "";
  let verified = false;
  let verifiedStatus = "pending";

  if (txId) {
    try {
      const r: any = await fetch(`${FAPSHI_BASE}/payment-status/${txId}`, {
        headers: { apiuser: FAPSHI_USER, apikey: FAPSHI_SECRET },
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const data = await r.json() as Record<string, unknown>;
        const status = String(data?.data && typeof data.data === "object" ? (data.data as any).status : data?.status ?? "");
        verified = status === "SUCCESSFUL";
        verifiedStatus = verified ? "confirmed" : status === "FAILED" ? "rejected" : "pending";
      }
    } catch { verified = false; }
  }

  if (verified && txId) {
    const amt = Number(amount);
    getFirebaseAdmin();
    const db = getFirestore();
    const rechargeRef = db.collection("rechargements").doc(`fapshi_${txId}`);

    let alreadyCredited = false;
    let firstName = "";

    await db.runTransaction(async (t: Transaction) => {
      const existing = await t.get(rechargeRef);
      if (existing.exists) { alreadyCredited = true; return; }

      const userRef = db.doc(`users/${req.uid}`);
      const userDoc = await t.get(userRef);
      firstName = String(userDoc.data()?.name ?? "").split(" ")[0] || "";
      const currentBal = Number(userDoc.data()?.balance ?? 0);

      t.update(userRef, { balance: currentBal + amt });
      t.set(rechargeRef, {
        amount: amt,
        method: method ?? "Fapshi Mobile Money",
        phone: phone ?? "",
        transactionId: txId,
        transId: txId,
        status: "confirmed",
        userId: req.uid,
        createdAt: new Date().toISOString(),
        depositNotifSent: true,
        referralProcessed: false,
      });
    });

    if (alreadyCredited) {
      const userSnap = await db.doc(`users/${req.uid}`).get();
      res.status(201).json({ success: true, alreadyCredited: true, data: { id: `fapshi_${txId}`, verified: true, amount: amt, newBalance: Number(userSnap.data()?.balance ?? 0) } });
      return;
    }

    await logActivity(req.uid!, req.idToken!, "depot", `Dépôt ${method ?? "Fapshi"} confirmé`, amt, "confirmed", { phone, transId: txId });
    const greeting = firstName ? `, ${firstName}` : "";
    getUserPushToken(req.uid!).then((token) =>
      sendExpoPush(token, "💰 Rechargement réussi !", `${amt.toLocaleString("fr-FR")} FCFA ont bien été crédités sur votre solde${greeting}. Vous pouvez maintenant passer vos commandes.`, { screen: "wallet" }, "wallet")
    ).catch(() => {});
    invalidateWalletCache(req.uid!);
    res.status(201).json({ success: true, data: { id: `fapshi_${txId}`, verified: true, amount: amt } });
    return;
  }

  const recharge = await firestoreCreate(
    "rechargements",
    {
      amount: Number(amount),
      method: method ?? "Fapshi Mobile Money",
      phone: phone ?? "",
      transactionId: txId,
      transId: txId,
      status: "pending",
      userId: req.uid,
      createdAt: new Date().toISOString(),
      depositNotifSent: false,
      referralProcessed: false,
    },
    req.idToken!
  );

  if (!recharge) {
    res.status(500).json({ success: false, error: "Erreur lors de l'enregistrement" });
    return;
  }

  await logActivity(req.uid!, req.idToken!, "depot", `Dépôt ${method ?? "Fapshi"} en attente`, Number(amount), "pending", { phone, transId: txId });
  res.status(201).json({ success: true, data: { ...recharge, verified: false } });
});

router.post("/wallet/fapshi-confirm", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  const { transId, amount } = req.body ?? {};
  if (!transId) {
    res.status(400).json({ success: false, error: "transId requis" });
    return;
  }

  try {
    const r: any = await fetch(`${FAPSHI_BASE}/payment-status/${transId}`, {
      headers: { apiuser: FAPSHI_USER, apikey: FAPSHI_SECRET },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      res.status(502).json({ success: false, error: "Fapshi inaccessible" });
      return;
    }
    const raw = await r.json() as Record<string, unknown>;
    const statusObj = (raw?.data ?? raw) as Record<string, unknown>;
    const status = String(statusObj?.status ?? "");
    const amountFapshi = asNumber(statusObj?.amount) || asNumber(raw?.amount) || Number(amount ?? 0);

    if (status !== "SUCCESSFUL") {
      res.json({ success: false, status, message: "Paiement non confirmé par Fapshi" });
      return;
    }

    getFirebaseAdmin();
    const db = getFirestore();

    let toCredit = amountFapshi || Number(amount ?? 0);
    let alreadyCredited = false;
    let newBalance = 0;
    let referredBy = "";
    let fapshiFirstName = "";
    let fapshiEmail = "";

    const rechargeRef = db.collection("rechargements").doc(`fapshi_${transId}`);

    let debtRepaid = 0;
    let unblocked = false;

    await db.runTransaction(async (t: Transaction) => {
      const existingDoc = await t.get(rechargeRef);

      if (existingDoc.exists) {
        alreadyCredited = true;
        return;
      }

      const userRef = db.doc(`users/${req.uid}`);
      const userDoc = await t.get(userRef);
      const userData = userDoc.data() ?? {};
      const currentBal = asNumber(userData.balance);
      referredBy = asString(userData.referredBy);
      fapshiFirstName = String(userData.name ?? "").split(" ")[0] || "";
      fapshiEmail = asString(userData.email);

      const currentDebt = asNumber(userData.frozenDebt ?? 0);
      const isBlocked   = !!userData.blocked;
      let creditToBalance = toCredit;
      const userUpdates: Record<string, unknown> = {};

      if (currentDebt > 0) {
        if (toCredit >= currentDebt) {
          creditToBalance = toCredit - currentDebt;
          debtRepaid = currentDebt;
          userUpdates.frozenDebt = 0;
          if (isBlocked) {
            userUpdates.blocked = false;
            userUpdates.blockedAt = null;
            unblocked = true;
          }
        } else {
          creditToBalance = 0;
          debtRepaid = toCredit;
          userUpdates.frozenDebt = currentDebt - toCredit;
        }
      }

      userUpdates.balance = currentBal + creditToBalance;
      t.update(userRef, userUpdates);
      newBalance = currentBal + creditToBalance;

      const now = new Date().toISOString();
      t.set(rechargeRef, {
        amount: toCredit,
        method: "Fapshi Mobile Money",
        phone: String(statusObj?.phone ?? ""),
        transactionId: transId,
        transId,
        status: "confirmed",
        userId: req.uid,
        createdAt: now,
        depositNotifSent: true,
        debtRepaid: debtRepaid > 0 ? debtRepaid : undefined,
      });
    });

    if (alreadyCredited) {
      const userSnap = await db.doc(`users/${req.uid}`).get();
      res.json({
        success: true,
        alreadyCredited: true,
        data: { credited: toCredit, newBalance: asNumber(userSnap.data()?.balance) },
      });
      return;
    }

    const actLabel = debtRepaid > 0
      ? `Dépôt Fapshi — ${debtRepaid.toLocaleString("fr-FR")} FCFA appliqués à la dette`
      : "Dépôt Fapshi confirmé";
    await logActivity(req.uid!, req.idToken!, "depot", actLabel, toCredit, "confirmed", { transId, debtRepaid: debtRepaid || undefined });
    if (debtRepaid > 0) {
      await logActivity(req.uid!, req.idToken!, "depot",
        unblocked
          ? `Compte débloqué — dette de ${debtRepaid.toLocaleString("fr-FR")} FCFA remboursée`
          : `Remboursement partiel de dette — ${debtRepaid.toLocaleString("fr-FR")} FCFA`,
        debtRepaid, "confirmed", { transId }
      );
    }

    const greeting = fapshiFirstName ? `, ${fapshiFirstName}` : "";
    let pushTitle = "💰 Rechargement reçu !";
    let pushBody  = `${toCredit.toLocaleString("fr-FR")} FCFA reçus`;
    if (debtRepaid > 0 && unblocked) {
      pushTitle = "✅ Compte débloqué !";
      pushBody  = `Votre dette de ${debtRepaid.toLocaleString("fr-FR")} FCFA a été remboursée${greeting}. Votre compte est maintenant débloqué. Bonne continuation !`;
    } else if (debtRepaid > 0) {
      pushTitle = "📉 Remboursement partiel de dette";
      const remaining = (Number((await db.doc(`users/${req.uid!}`).get()).data()?.frozenDebt ?? 0)).toLocaleString("fr-FR");
      pushBody  = `${debtRepaid.toLocaleString("fr-FR")} FCFA appliqués à votre dette${greeting}. Il reste ${remaining} FCFA à rembourser.`;
    } else {
      pushBody = `${toCredit.toLocaleString("fr-FR")} FCFA ont bien été crédités sur votre solde${greeting}. Vous pouvez maintenant passer vos commandes.`;
    }
    getUserPushToken(req.uid!).then((token) =>
      sendExpoPush(token, pushTitle, pushBody, { screen: "wallet" }, "wallet")
    ).catch(() => {});

    if (fapshiEmail) {
      sendRechargeEmail(fapshiEmail, fapshiFirstName, toCredit, "Fapshi Mobile Money", newBalance).catch(() => {});
    }

    res.json({ success: true, data: { credited: toCredit, newBalance, debtRepaid: debtRepaid || undefined, unblocked: unblocked || undefined } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message ?? "Erreur interne" });
  }
});

router.post("/webhook/fapshi", async (req: Request, res: ExpressResponse) => {
  let webhookTransId = "";
  let webhookExtId   = "";
  let webhookAmount  = 0;
  let webhookPhone   = "";

  try {
    const { transId, userId, amount: rawAmount } = req.body ?? {};
    webhookTransId = String(transId ?? "");
    webhookPhone   = String((req.body as Record<string, unknown>)?.phone ?? "");

    if (!webhookTransId) {
      res.status(400).json({ success: false, error: "transId manquant" });
      return;
    }

    const r: any = await fetch(`${FAPSHI_BASE}/payment-status/${webhookTransId}`, {
      headers: { apiuser: FAPSHI_USER, apikey: FAPSHI_SECRET },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) { res.status(502).json({ success: false }); return; }

    const raw = await r.json() as Record<string, unknown>;
    const statusObj = (raw?.data ?? raw) as Record<string, unknown>;
    const status = String(statusObj?.status ?? "");
    if (status !== "SUCCESSFUL") {
      res.json({ success: false, status });
      return;
    }

    webhookAmount = asNumber(statusObj?.amount) || asNumber(raw?.amount) || Number(rawAmount ?? 0);
    webhookExtId  = String(statusObj?.externalId ?? raw?.externalId ?? userId ?? "");
    if (!webhookPhone) webhookPhone = String(statusObj?.phone ?? "");

    if (!webhookExtId) {
      res.status(400).json({ success: false, error: "userId/externalId manquant" });
      return;
    }

    const { initializeApp, getApps, cert } = await import("firebase-admin/app");
    const { getFirestore: getFS } = await import("firebase-admin/firestore");
    if (getApps().length === 0) {
      initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID }) });
    }
    const db = getFS();

    const rechargeRef = db.collection("rechargements").doc(`fapshi_${webhookTransId}`);

    let webhookUserName = "";
    let alreadyDone    = false;

    await db.runTransaction(async (t: Transaction) => {
      const existingDoc = await t.get(rechargeRef);
      if (existingDoc.exists) { alreadyDone = true; return; }

      const userRef = db.doc(`users/${webhookExtId}`);
      const userDoc = await t.get(userRef);
      const userData    = userDoc.data() ?? {};
      const currentBal  = asNumber(userData.balance);
      webhookUserName   = String(userData.name ?? "").split(" ")[0] || "";

      const currentDebt     = asNumber(userData.frozenDebt ?? 0);
      const isBlocked       = !!userData.blocked;
      let   creditToBalance = webhookAmount;
      const webhookUpdates: Record<string, unknown> = {};

      if (currentDebt > 0) {
        if (webhookAmount >= currentDebt) {
          creditToBalance = webhookAmount - currentDebt;
          webhookUpdates.frozenDebt = 0;
          if (isBlocked) { webhookUpdates.blocked = false; webhookUpdates.blockedAt = null; }
        } else {
          creditToBalance = 0;
          webhookUpdates.frozenDebt = currentDebt - webhookAmount;
        }
      }

      webhookUpdates.balance = currentBal + creditToBalance;
      t.update(userRef, webhookUpdates);
      t.set(rechargeRef, {
        amount: webhookAmount, method: "Fapshi Mobile Money",
        phone: webhookPhone, transactionId: webhookTransId,
        transId: webhookTransId, status: "confirmed",
        userId: webhookExtId, createdAt: new Date().toISOString(),
        depositNotifSent: true,
        debtRepaid: currentDebt > 0 ? Math.min(webhookAmount, currentDebt) : undefined,
      });
      t.set(db.collection("activites").doc(), {
        userId: webhookExtId, type: "depot",
        label: "Dépôt Fapshi confirmé (webhook)",
        amount: webhookAmount, status: "confirmed",
        transId: webhookTransId, createdAt: new Date().toISOString(),
      });
    });

    if (alreadyDone) {
      res.json({ success: false, message: "Déjà traité" });
      return;
    }

    invalidateWalletCache(webhookExtId);

    const greeting = webhookUserName ? `, ${webhookUserName}` : "";
    getUserPushToken(webhookExtId).then((token) =>
      sendExpoPush(
        token,
        "💰 Rechargement réussi !",
        `${webhookAmount.toLocaleString("fr-FR")} FCFA ont bien été crédités sur votre solde${greeting}. Vous pouvez maintenant passer vos commandes.`,
        { screen: "wallet" },
        "wallet"
      )
    ).catch(() => {});

    res.json({ success: true, credited: webhookAmount });

  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const isQuota = errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("Quota exceeded");

    if (isQuota && webhookExtId && webhookAmount > 0) {
      enqueuePendingCredit({
        id:      `fapshi_${webhookTransId}`,
        userId:  webhookExtId,
        amount:  webhookAmount,
        method:  "Fapshi Mobile Money",
        transId: webhookTransId,
        phone:   webhookPhone,
      });
      console.warn(`[webhook/fapshi] ⚠️ Quota Firestore — ${webhookAmount} FCFA mis en file pour ${webhookExtId}`);
      res.json({ success: true, queued: true });
    } else {
      console.error("[webhook/fapshi] Erreur:", errMsg);
      res.status(500).json({ success: false, error: errMsg });
    }
  }
});

router.post("/wallet/transfer", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  const { target } = req.body;
  if (target !== "main" && target !== "withdrawal") {
    res.status(400).json({ success: false, error: "Cible invalide (main ou withdrawal)" });
    return;
  }

  try {
    getFirebaseAdmin();
    const db = getFirestore();
    const userRef = db.doc(`users/${req.uid}`);

    let refBal = 0;
    let newBalance = 0;
    let newWithdrawalBalance = 0;
    let label = "";

    await db.runTransaction(async (t: Transaction) => {
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) throw Object.assign(new Error("Utilisateur non trouvé"), { code: 404 });

      refBal = asNumber(userDoc.data()?.referralBalance);
      if (refBal <= 0) throw Object.assign(new Error("Aucun solde parrainage à transférer"), { code: 400 });

      const currentBalance = asNumber(userDoc.data()?.balance);
      const currentWithdrawal = asNumber(userDoc.data()?.withdrawalBalance);

      if (target === "main") {
        newBalance = currentBalance + refBal;
        newWithdrawalBalance = currentWithdrawal;
        label = "Transfert parrainage → solde principal";
        t.update(userRef, { referralBalance: 0, balance: FieldValue.increment(refBal) });
      } else {
        newBalance = currentBalance;
        newWithdrawalBalance = currentWithdrawal + refBal;
        label = "Transfert parrainage → solde retrait";
        t.update(userRef, { referralBalance: 0, withdrawalBalance: FieldValue.increment(refBal) });
      }
    });

    invalidateWalletCache(req.uid!);
    await logActivity(req.uid!, req.idToken!, "transfert", label, refBal, "completed", { target });

    res.json({
      success: true,
      amount: refBal,
      target,
      newReferralBalance: 0,
      newBalance,
      newWithdrawalBalance,
    });
  } catch (e: any) {
    const code = e?.code ?? 500;
    res.status(typeof code === "number" && code < 600 ? code : 500).json({ success: false, error: e?.message ?? "Erreur interne" });
  }
});

const WITHDRAWAL_FEE = 455;
const WITHDRAWAL_FEE_THRESHOLD = 10000;

router.post("/wallet/withdraw", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  const { amount, phone, country, method, countryName, feeSource } = req.body ?? {};
  const MIN_WITHDRAW = 1500;
  const amt = Number(amount ?? 0);

  if (!amt || amt < MIN_WITHDRAW) {
    res.status(400).json({ success: false, error: `Le retrait minimum est de ${MIN_WITHDRAW.toLocaleString()} FCFA.` });
    return;
  }
  if (!phone?.trim()) {
    res.status(400).json({ success: false, error: "Numéro de téléphone requis." });
    return;
  }

  const fee = amt < WITHDRAWAL_FEE_THRESHOLD ? WITHDRAWAL_FEE : 0;

  try {
    const user = await firestoreGet(`users/${req.uid}`, req.idToken!);
    if (!user) {
      res.status(404).json({ success: false, error: "Utilisateur introuvable." });
      return;
    }

    const withdrawalBal = asNumber(user.withdrawalBalance);
    const mainBal       = asNumber(user.balance);

    if (withdrawalBal < amt) {
      res.status(400).json({
        success: false,
        error: `Solde retrait insuffisant (${withdrawalBal.toLocaleString()} FCFA disponibles).`,
      });
      return;
    }

    if (fee > 0) {
      if (feeSource === "main") {
        if (mainBal < fee) {
          res.status(400).json({
            success: false,
            error: `Solde principal insuffisant pour les frais (besoin de ${fee} FCFA, vous avez ${mainBal.toLocaleString()} FCFA).`,
          });
          return;
        }
      } else if (feeSource === "withdrawal") {
        if (withdrawalBal < amt + fee) {
          res.status(400).json({
            success: false,
            error: `Solde retrait insuffisant pour inclure les frais (besoin de ${(amt + fee).toLocaleString()} FCFA, vous avez ${withdrawalBal.toLocaleString()} FCFA).`,
          });
          return;
        }
      } else {
        res.status(400).json({
          success: false,
          fee,
          error: `Des frais de ${fee} FCFA sont requis. Précisez feeSource: "main" ou "withdrawal".`,
        });
        return;
      }
    }

    const fb = getFirebaseAdmin();
    const db = fb.firestore();
    const { FieldValue } = await import("firebase-admin/firestore");

    const wdDeduct = (fee > 0 && feeSource === "withdrawal") ? -(amt + fee) : -amt;
    const updates: Record<string, unknown> = {
      withdrawalBalance: FieldValue.increment(wdDeduct),
    };
    if (fee > 0 && feeSource === "main") {
      updates.balance = FieldValue.increment(-fee);
    }

    await db.doc(`users/${req.uid}`).update(updates);

    await logActivity(
      req.uid!,
      req.idToken!,
      "retrait",
      `Retrait ${method ?? "Mobile Money"} — ${phone} (${countryName ?? country ?? ""})`,
      amt,
      "pending",
      { phone, country, method, fee, feeSource }
    );

    if (fee > 0) {
      const feeLabel = feeSource === "main" ? "solde principal" : "solde retrait";
      await logActivity(
        req.uid!,
        req.idToken!,
        "retrait",
        `Frais de retrait débités du ${feeLabel}`,
        fee,
        "confirmed",
        { feeForAmount: amt }
      );
    }

    const swychrPayload = {
      amount: amt,
      phone: phone.trim(),
      country: (country ?? "CM").toUpperCase(),
      currency: "XAF",
      userId: req.uid,
      method: method ?? "Mobile Money",
    };
    fetch(`${INTL_PAYMENT_BACKEND}/payout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(swychrPayload),
      signal: AbortSignal.timeout(20000),
    }).catch((e) => console.warn("[withdraw] payout error:", e));

    const feeInfo = fee > 0 ? `\n💳 Frais: ${fee} FCFA (depuis ${feeSource === "main" ? "solde principal" : "solde retrait"})` : "";
    const adminMsg =
      `🏧 *Nouvelle demande de retrait* 🏧\n\n` +
      `👤 Nom: ${asString(user.name) || "—"}\n` +
      `📧 Email: ${asString(user.email) || "—"}\n` +
      `🆔 ID: ${req.uid}\n` +
      `💰 Montant: ${amt.toLocaleString()} FCFA${feeInfo}\n` +
      `📱 Téléphone: ${phone}\n` +
      `🌍 Pays: ${countryName ?? country ?? "—"}\n` +
      `🏦 Méthode: ${method ?? "Mobile Money"}\n` +
      `🕐 Date: ${new Date().toLocaleString("fr-FR")}`;

    sendTwilioWhatsApp(adminMsg).catch(() => {});

    const withdrawEmail = asString(user.email);
    const withdrawName  = asString(user.name) || asString(user.username) || "Utilisateur";
    if (withdrawEmail) {
      sendWithdrawalEmail(withdrawEmail, withdrawName, amt, phone, method ?? "Mobile Money", fee).catch(() => {});
    }

    res.json({
      success: true,
      message: "Demande de retrait soumise. Traitement sous 24h ouvrables.",
      fee,
      newWithdrawalBalance: withdrawalBal - amt - (fee > 0 && feeSource === "withdrawal" ? fee : 0),
    });
  } catch (e: any) {
    console.error("[withdraw] error:", e);
    res.status(500).json({ success: false, error: e?.message ?? "Erreur interne" });
  }
});

// ═══════════════════════════════════════════════════════════════
// CORRECTIF : /wallet/record-pending-recharge
// ─────────────────────────────────────────────────────────────
// AVANT : catch {} + res.json({ success: true }) → masquait toute
//         erreur d'écriture Firestore, la recharge n'était pas
//         réellement enregistrée mais le client pensait que oui.
// APRÈS :  toute erreur remonte au client avec status 500.
//         Idempotent (si le doc existe déjà, on ne le recrée pas).
// ═══════════════════════════════════════════════════════════════
router.post("/wallet/record-pending-recharge", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  const { transId, amount, method, phone } = req.body ?? {};
  if (!amount || Number(amount) < 1) {
    res.status(400).json({ success: false, error: "amount requis" });
    return;
  }
  const tid = String(transId ?? "").trim();
  if (!tid) {
    res.status(400).json({ success: false, error: "transId requis" });
    return;
  }

  try {
    getFirebaseAdmin();
    const db = getFirestore();
    const userDoc = await db.doc(`users/${req.uid!}`).get();
    if (!userDoc.exists) {
      res.status(404).json({ success: false, error: "Utilisateur introuvable" });
      return;
    }
    const balanceBefore = Number(userDoc.data()?.balance ?? 0);

    // Idempotent : si le doc existe déjà (même transId), on ne le recrée pas.
    const rechargeRef = db.collection("rechargements").doc(`swychr_${tid}`);
    const existing = await rechargeRef.get();
    if (existing.exists) {
      res.json({ success: true, alreadyExists: true });
      return;
    }

    await rechargeRef.set({
      amount: Number(amount),
      method: method ?? "Mobile Money International",
      phone: phone ?? "",
      transId: tid,
      transactionId: tid,
      status: "pending",
      provider: "swychr",
      userId: req.uid!,
      balanceBefore,
      createdAt: new Date().toISOString(),
      referralProcessed: false,
      depositNotifSent: false,
    });

    await logActivity(
      req.uid!,
      req.idToken!,
      "depot",
      `Dépôt ${method ?? "Mobile Money"} en cours`,
      Number(amount),
      "pending",
      { transId: tid, phone: phone ?? "" }
    );

    res.json({ success: true });
  } catch (e: any) {
    console.error("[record-pending-recharge] erreur:", e);
    // On ne masque PLUS l'erreur : le client doit savoir.
    res.status(500).json({ success: false, error: e?.message ?? "Erreur d'enregistrement" });
  }
});

// ═══════════════════════════════════════════════════════════════
// CORRECTIF : /webhook/swychr
// ─────────────────────────────────────────────────────────────
// AVANT : se fiait au delta de solde (balanceIncrease >= amount-1).
//         Aucune vérification auprès du prestataire, crédit non
//         idempotent (double crédit possible via retry).
// APRÈS :  vérifie le statut réel auprès d'AccountPe avant tout
//         crédit. Le crédit est fait dans une transaction Firestore
//         atomique + idempotente (flag processed).
//         En cas de doute (auth KO, HTTP KO), on répond "deferred"
//         et on ne crédite PAS.
// ═══════════════════════════════════════════════════════════════
const SWYCHR_SUCCESS = ["1", "success", "completed", "terminé", "succès", "reussi", "successful", "paid", "ok"];
const SWYCHR_FAILED  = ["-1", "2", "failed", "echec", "annulé", "cancelled", "rejected", "error"];

router.post("/webhook/swychr", async (req: Request, res: ExpressResponse) => {
  try {
    const { userId, amount: rawAmount, transId, phone, method, status: extStatus } = req.body ?? {};

    if (!transId) {
      res.status(400).json({ success: false, error: "transId requis" });
      return;
    }
    const tid = String(transId);

    // 1) Vérification auprès d'AccountPe (source de vérité)
    const verify = await accountPeVerify(tid);
    if (!verify) {
      // Impossible de vérifier maintenant → on ne crédite pas.
      console.warn(`[webhook/swychr] Vérification AccountPe impossible pour ${tid}`);
      res.status(202).json({ success: true, deferred: true });
      return;
    }

    const providerStatus = verify.status;
    const providerTxId   = verify.transactionId;

    // 2) Contrôle transId renvoyé par le prestataire
    if (providerTxId && providerTxId !== tid) {
      console.error(`[webhook/swychr] Mismatch transId: reçu=${tid} prestataire=${providerTxId}`);
      res.status(400).json({ success: false, error: "transaction_id mismatch" });
      return;
    }

    getFirebaseAdmin();
    const db = getFirestore();
    const rechargeRef = db.collection("rechargements").doc(`swychr_${tid}`);

    // 3) Statut non-succès : on marque "failed" éventuellement, jamais on crédite
    if (!SWYCHR_SUCCESS.includes(providerStatus)) {
      if (SWYCHR_FAILED.includes(providerStatus)) {
        const snap = await rechargeRef.get();
        if (snap.exists && snap.data()?.status === "pending") {
          await rechargeRef.update({
            status: "failed",
            failureReason: providerStatus,
            updatedAt: new Date().toISOString(),
          });
        }
      }
      // Statut "pending" ou inconnu : on répond sans créditer
      res.json({ success: true, status: providerStatus, credited: false });
      return;
    }

    // 4) Succès confirmé : crédit idempotent en transaction
    let alreadyCredited = false;
    let creditedAmount = 0;
    let newBalance = 0;
    let firstName = "";
    let finalUserId = String(userId ?? "");

    // Contrôle montant : on croit ce qui est STOCKÉ, pas ce qui est reçu
    await db.runTransaction(async (t: Transaction) => {
      const rechargeDoc = await t.get(rechargeRef);
      if (!rechargeDoc.exists) {
        throw Object.assign(new Error("Recharge inconnue"), { code: 404 });
      }
      const rdata = rechargeDoc.data() ?? {};

      if (rdata.status === "confirmed" || rdata.processed === true) {
        alreadyCredited = true;
        creditedAmount = Number(rdata.amount ?? 0);
        return;
      }

      // On utilise le userId stocké côté serveur (source de vérité)
      finalUserId = String(rdata.userId ?? finalUserId ?? "");
      if (!finalUserId) throw new Error("userId manquant dans la recharge");

      // Contrôle montant : le montant déclaré par le webhook doit correspondre
      const declaredAmount = Number(rawAmount ?? 0);
      const storedAmount   = Number(rdata.amount ?? 0);
      if (declaredAmount > 0 && storedAmount > 0 && Math.abs(declaredAmount - storedAmount) > 1) {
        throw new Error(`Montant incohérent (webhook=${declaredAmount}, stocké=${storedAmount})`);
      }

      const realUserRef = db.doc(`users/${finalUserId}`);
      const userDoc = await t.get(realUserRef);
      if (!userDoc.exists) throw new Error("Utilisateur introuvable");
      const udata = userDoc.data() ?? {};
      firstName = String(udata.name ?? "").split(" ")[0] || "";
      const currentBal = Number(udata.balance ?? 0);
      creditedAmount = storedAmount;
      if (creditedAmount <= 0) throw new Error("Montant invalide");
      newBalance = currentBal + creditedAmount;

      t.update(realUserRef, { balance: newBalance });
      t.update(rechargeRef, {
        status: "confirmed",
        processed: true,
        processedAt: new Date().toISOString(),
        depositNotifSent: true,
      });
    });

    if (alreadyCredited) {
      res.json({ success: true, alreadyConfirmed: true });
      return;
    }

    // 5) Activités + push
    try {
      await db.collection("activites").add({
        userId: finalUserId,
        type: "depot",
        label: "Dépôt international confirmé",
        amount: creditedAmount,
        status: "confirmed",
        transId: tid,
        createdAt: new Date().toISOString(),
      });

      const greeting = firstName ? `, ${firstName}` : "";
      const pushToken = await getUserPushToken(finalUserId);
      await sendExpoPush(
        pushToken,
        "💰 Rechargement confirmé !",
        `${creditedAmount.toLocaleString("fr-FR")} FCFA ont bien été crédités sur votre solde${greeting}.`,
        { screen: "wallet" },
        "wallet"
      );
    } catch (e: any) {
      console.warn("[webhook/swychr] post-credit:", e?.message);
    }

    invalidateWalletCache(finalUserId);

    console.log(`[webhook/swychr] ✅ ${tid} confirmé (+${creditedAmount} FCFA pour ${finalUserId})`);
    res.json({ success: true, credited: creditedAmount });
  } catch (e: any) {
    console.error("[webhook/swychr] erreur:", e);
    res.status(500).json({ success: false, error: e?.message ?? "Erreur interne" });
  }
});

export default router;