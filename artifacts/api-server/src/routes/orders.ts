import { Router } from "express";
import type { Response } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { sendExpoPush, getUserPushToken } from "../lib/push.js";
import {
  firestoreQuery,
  firestoreCreate,
  firestoreUpdate,
  firestoreGet,
  firestoreGetMany,
  asNumber,
  asString,
  asIsoDate,
  getFirebaseAdmin,
  firestoreTransactionIncrement,
  appendToUserArray,
} from "../lib/firebase-admin.js";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const router = Router();

const ADMIN_WHATSAPP_CANCEL = process.env.MY_PHONE_NUMBER ?? "+237699853665";

// ── Cache commandes par utilisateur — 3 min TTL ────────────────────────────
// Évite de relire toutes les commandes Firestore à chaque ouverture de l'onglet.
const ordersCache = new Map<string, { data: unknown[]; ts: number }>();
const ORDERS_CACHE_MS = 5 * 60_000; // 5 minutes (invalidé sur nouvelle commande + poller)

export function invalidateOrdersCache(uid: string): void {
  ordersCache.delete(uid);
}

// Purge périodique (toutes les 10 min)
setInterval(() => {
  const now = Date.now();
  for (const [uid, entry] of ordersCache) {
    if (now - entry.ts > ORDERS_CACHE_MS) ordersCache.delete(uid);
  }
}, 10 * 60_000);

async function notifyAdminCancelRefund(
  orderData: Record<string, unknown>,
  docId: string,
  refundAmount: number,
  userName: string,
  userEmail: string,
  userPhone: string
): Promise<void> {
  const SID   = process.env.TWILIO_ACCOUNT_SID  ?? "";
  const TOKEN = process.env.TWILIO_AUTH_TOKEN    ?? "";
  const FROM  = process.env.TWILIO_PHONE_NUMBER  ?? "";
  if (!SID || !TOKEN || !FROM) return;

  const orderId   = asString(orderData.orderId ?? docId);
  const platform  = asString(orderData.platform, "Non précisé");
  const service   = asString(orderData.serviceName ?? orderData.service, "Non précisé");
  const qty       = Number(orderData.quantity ?? 0);
  const link      = asString(orderData.link, "Non précisé");
  const orderType = asString(orderData.type, "standard");
  const isRefund  = refundAmount > 0;

  const body =
    `${isRefund ? "💸 *COMMANDE ANNULÉE & REMBOURSÉE*" : "❌ *COMMANDE ANNULÉE*"} — Social Boost Horizon\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 *ID:* ${orderId}\n` +
    `📦 *Type:* ${orderType}\n` +
    `🕒 *Annulée le:* ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Douala" })}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *Client:* ${userName}\n` +
    `📧 *Email:* ${userEmail}\n` +
    `📱 *Tél:* ${userPhone}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📱 *Plateforme:* ${platform}\n` +
    `🔧 *Service:* ${service}\n` +
    `📊 *Quantité:* ${qty.toLocaleString("fr-FR")}\n` +
    `🔗 *Lien:* ${link}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    (isRefund
      ? `💰 *Remboursement:* ${refundAmount.toLocaleString("fr-FR")} FCFA crédités sur le solde\n`
      : `ℹ️ Aucun remboursement (montant nul)\n`);

  try {
    const params = new URLSearchParams({
      From: `whatsapp:${FROM}`,
      To:   `whatsapp:${ADMIN_WHATSAPP_CANCEL}`,
      Body: body,
    });
    const r = await fetch(
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
    if (!r.ok) console.error("[orders/cancel] WhatsApp erreur:", r.status);
    else console.log(`[orders/cancel] Admin notifié — commande ${orderId} annulée`);
  } catch (e) {
    console.error("[orders/cancel] WhatsApp exception:", e);
  }
}

// ── Provider constants (mirrors providers.ts) ──────────────────────────────
const EXO_KEY    = process.env.EXOSUPPLIER_API_KEY       ?? "";
const MTP_KEY    = process.env.MORETHANPANEL_API_KEY      ?? "";
const SMMGEN_KEY = process.env.SMMGEN_API_KEY             ?? "";
const AFB_KEY    = process.env.ADVANCED_PROVIDER_API_KEY  ?? "";
const EXO_BASE    = "https://exosupplier.com/api/v2";
const MTP_BASE    = "https://morethanpanel.com/api/v2";
const SMMGEN_BASE = "https://smmgen.com/api/v2";
const AFB_BASE    = "https://afriqueboost.com/api/v2";

// ── Provider status fetch ──────────────────────────────────────────────────
interface ProviderStatus {
  status: string;
  start_count?: number;
  remains?: number;
  charge?: number;
  currency?: string;
  error?: string;
}

async function fetchProviderStatus(
  base: string,
  apiKey: string,
  providerOrderId: string
): Promise<ProviderStatus | null> {
  if (!apiKey || !providerOrderId) return null;
  try {
    const params = new URLSearchParams({
      key: apiKey,
      action: "status",
      order: providerOrderId,
    });
    const r = await fetch(base, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(15000),
    });
    const ct = r.headers.get("content-type") ?? "";
    let data: Record<string, unknown> = {};
    try {
      data = ct.includes("json") ? await r.json() : JSON.parse(await r.text());
    } catch { /* ignore */ }

    if (!r.ok || data.error) return null;

    return {
      status:      String(data.status ?? "Pending"),
      start_count: data.start_count != null ? Number(data.start_count) : undefined,
      remains:     data.remains     != null ? Number(data.remains)     : undefined,
      charge:      data.charge      != null ? Number(data.charge)      : undefined,
      currency:    data.currency    != null ? String(data.currency)    : undefined,
    };
  } catch {
    return null;
  }
}

const PROVIDER_STATUS_MAP: Record<string, string> = {
  pending:      "En attente",
  waiting:      "En attente",
  in_progress:  "en cours",
  inprogress:   "en cours",
  processing:   "en cours",
  running:      "en cours",
  active:       "en cours",
  completed:    "succès",
  complete:     "succès",
  success:      "succès",
  done:         "succès",
  canceled:     "annulée",
  cancelled:    "annulée",
  refunded:     "remboursé",
  partial:      "partiel",
};

function mapProviderStatus(raw: string): string {
  const key = (raw ?? "").toLowerCase().replace(/\s+/g, "_");
  return PROVIDER_STATUS_MAP[key] ?? PROVIDER_STATUS_MAP[raw.toLowerCase()] ?? "En attente";
}

function calcProgress(ps: ProviderStatus, mappedStatus: string): number {
  if (mappedStatus === "succès")    return 100;
  if (mappedStatus === "annulée")   return 0;
  if (mappedStatus === "remboursé") return 0;

  const start   = ps.start_count ?? 0;
  const remains = ps.remains     ?? 0;
  if (start > 0 && remains >= 0) {
    const done = Math.max(start - remains, 0);
    return Math.min(Math.floor((done / start) * 100), 99);
  }
  if (mappedStatus === "en cours") return 20;
  if (mappedStatus === "partiel")  return 50;
  return 2;
}

// ── Activity logger ────────────────────────────────────────────────────────
async function logActivity(
  uid: string,
  idToken: string,
  type: "commande" | "remboursement" | "annulation",
  label: string,
  amount: number,
  status: string,
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
  // NOTE: appendToUserArray("recentActivities") supprimé — trop coûteux en quota Firestore.
}

// ── Order counter helpers ──────────────────────────────────────────────────
function getCounterKey(orderType: string): string {
  const t = (orderType ?? "").toLowerCase();
  if (t === "automatique") return "orders_automatique";
  if (t === "avancée" || t === "avancee" || t === "advanced") return "orders_avancee";
  return "orders_standard_revendeur";
}

function formatOrderId(orderType: string, num: number): string {
  const t = (orderType ?? "").toLowerCase();
  const padded = String(num).padStart(5, "0");
  if (t === "automatique") return `SBH-AUTO-${padded}`;
  if (t === "avancée" || t === "avancee" || t === "advanced") return `SBH-AVA-${padded}`;
  if (t === "revendeur") return `SBH-REV-${padded}`;
  return `SBH-STD-${padded}`;
}

const MIN_ORDER_NUMBER = 1700;
const memCounters = new Map<string, number>();

async function getNextOrderNumber(orderType: string, idToken: string): Promise<number> {
  const counterKey = getCounterKey(orderType);
  const docPath = `counters/${counterKey}`;

  try {
    const fb = getFirebaseAdmin();
    const db = fb.firestore();
    const counterRef = db.doc(docPath);
    const result = await db.runTransaction(async (tx) => {
      const doc = await tx.get(counterRef);
      const current = doc.exists ? (doc.data()?.count ?? MIN_ORDER_NUMBER - 1) : MIN_ORDER_NUMBER - 1;
      const next = Math.max(Number(current), MIN_ORDER_NUMBER - 1) + 1;
      tx.set(counterRef, { count: next }, { merge: true });
      return next;
    });
    console.log(`[counter] ${counterKey} (Admin SDK) → ${result}`);
    memCounters.set(counterKey, result as number);
    return result as number;
  } catch { /* try REST */ }

  const next = await firestoreTransactionIncrement(docPath, "count", MIN_ORDER_NUMBER, idToken);
  if (next !== null) {
    console.log(`[counter] ${counterKey} (REST tx) → ${next}`);
    memCounters.set(counterKey, next);
    return next;
  }

  const current = memCounters.get(counterKey) ?? MIN_ORDER_NUMBER - 1;
  const nextMem = Math.max(current, MIN_ORDER_NUMBER - 1) + 1;
  memCounters.set(counterKey, nextMem);
  console.warn(`[counter] ${counterKey} (in-memory) → ${nextMem}`);
  return nextMem;
}

async function incrementUserTotalOrders(uid: string, idToken: string): Promise<void> {
  try {
    const fb = getFirebaseAdmin();
    const db = fb.firestore();
    const { FieldValue } = await import("firebase-admin/firestore");
    await db.doc(`users/${uid}`).update({ totalOrders: FieldValue.increment(1) });
  } catch {
    const user = await firestoreGet(`users/${uid}`, idToken);
    const currentTotal = asNumber(user?.totalOrders);
    await firestoreUpdate(`users/${uid}`, { totalOrders: currentTotal + 1 }, idToken);
  }
}

// ── GET /api/orders ────────────────────────────────────────────────────────
// Merges Admin SDK query + orderRefs fallback to never miss any order.
router.get("/orders", requireAuth, async (req: AuthRequest, res: Response) => {
  const uid     = req.uid!;
  const idToken = req.idToken!;

  // Serve from cache if fresh (économise toutes les lectures Firestore commandes)
  const cached = ordersCache.get(uid);
  if (cached && Date.now() - cached.ts < ORDERS_CACHE_MS) {
    res.set("X-Cache", "HIT");
    res.json({ success: true, data: cached.data });
    return;
  }

  // Always run both paths in parallel, then merge + deduplicate
  const [queryOrders, user] = await Promise.all([
    firestoreQuery("commandes", [{ field: "userId", value: uid }], idToken),
    firestoreGet(`users/${uid}`, idToken),
  ]);

  // Build a map by document ID
  const orderMap = new Map<string, Record<string, unknown>>();
  for (const o of queryOrders) {
    if (o.id) orderMap.set(String(o.id), o);
  }

  // Supplement with orderRefs stored in user doc
  const refs = Array.isArray(user?.orderRefs)
    ? (user!.orderRefs as { id: string; createdAt: string }[])
    : [];

  const missingIds = refs
    .map((r) => r.id)
    .filter((id) => id && !orderMap.has(id))
    .slice(0, 100);

  if (missingIds.length > 0) {
    const extra = await firestoreGetMany("commandes", missingIds, idToken);
    for (const o of extra) {
      if (o.id) orderMap.set(String(o.id), o);
    }
  }

  // Normalise createdAt (Timestamp Firestore → ISO string) avant envoi au client
  const normalizeOrder = (o: Record<string, unknown>): Record<string, unknown> => ({
    ...o,
    createdAt: asIsoDate(o.createdAt) ?? new Date(0).toISOString(),
    updatedAt: asIsoDate(o.updatedAt) ?? undefined,
    cancelledAt: asIsoDate(o.cancelledAt) ?? undefined,
  });

  const orders = Array.from(orderMap.values())
    .map(normalizeOrder)
    .sort((a, b) => {
      const ta = new Date(a["createdAt"] as string).getTime();
      const tb = new Date(b["createdAt"] as string).getTime();
      return tb - ta;
    });

  // Mettre en cache pour les prochaines requêtes
  ordersCache.set(uid, { data: orders, ts: Date.now() });
  res.set("X-Cache", "MISS");
  res.json({ success: true, data: orders });
});

// ── POST /api/orders ───────────────────────────────────────────────────────
router.post("/orders", requireAuth, async (req: AuthRequest, res: Response) => {
  const {
    serviceId, serviceName, platform, platformColor, type, quantity,
    price, link, orderId: providerOrderId, comments, provider,
    referralDiscountApplied,
  } = req.body;

  if (!serviceId || !serviceName || !platform || !quantity || !price || !link) {
    res.status(400).json({ success: false, error: "Champs obligatoires manquants" });
    return;
  }

  const uid        = req.uid!;
  const idToken    = req.idToken!;
  const orderPrice = Number(price);

  // ── Vérification + déduction atomique du solde ──────────────────────────
  // Utilise une transaction Firestore pour éviter les race conditions.
  // C'est le seul endroit qui décide si une commande peut partir.
  //
  // ✅ FIX TS: la transaction RETOURNE l'erreur au lieu de l'assigner à une variable
  //    capturée dans la closure. TypeScript ne peut pas tracker les affectations
  //    faites à l'intérieur d'un callback → il réduisait `balanceCheckError` à `never`.
  let balanceCheckError: string | null = null;

  let orderUserEmail = "";
  let orderUserName  = "";

  try {
    const fb = getFirebaseAdmin();
    const db = fb.firestore();

    balanceCheckError = await db.runTransaction(async (tx): Promise<string | null> => {
      const userRef = db.doc(`users/${uid}`);
      const userDoc = await tx.get(userRef);
      const userData = userDoc.data() ?? {};
      orderUserEmail = String(userData.email ?? "");
      orderUserName  = String(userData.name ?? userData.username ?? "");

      // 1. Compte bloqué ?
      if (userData.blocked === true) {
        return "BLOCKED";
      }

      // 2. Dette non remboursée ?
      const frozenDebt = Number(userData.frozenDebt ?? 0);
      if (frozenDebt > 0) {
        return `DEBT:${frozenDebt}`;
      }

      // 3. Solde suffisant ?
      const currentBalance = Number(userData.balance ?? 0);
      if (currentBalance < orderPrice) {
        return `INSUFFICIENT:${currentBalance}`;
      }

      // 4. Tout OK → déduire atomiquement
      tx.update(userRef, { balance: FieldValue.increment(-orderPrice) });
      return null;
    });
  } catch (txErr) {
    console.error("[orders/create] Transaction erreur:", txErr);
    res.status(500).json({ success: false, error: "Erreur lors de la vérification du solde. Réessayez." });
    return;
  }

  if (balanceCheckError) {
    if (balanceCheckError === "BLOCKED") {
      res.status(403).json({ success: false, error: "Votre compte est suspendu. Contactez le support via le chat.", code: "ACCOUNT_BLOCKED" });
      return;
    }
    if (balanceCheckError.startsWith("DEBT:")) {
      const debt = Number(balanceCheckError.split(":")[1]);
      res.status(403).json({ success: false, error: `Votre compte a une dette de ${debt.toLocaleString("fr-FR")} FCFA. Rechargez pour apurer votre dette avant de passer des commandes.`, code: "FROZEN_DEBT", debt });
      return;
    }
    if (balanceCheckError.startsWith("INSUFFICIENT:")) {
      const bal = Number(balanceCheckError.split(":")[1]);
      res.status(402).json({ success: false, error: `Solde insuffisant (${bal.toLocaleString("fr-FR")} FCFA disponibles). Rechargez votre compte.`, code: "INSUFFICIENT_BALANCE", balance: bal });
      return;
    }
  }

  const orderNum = await getNextOrderNumber(type ?? "standard", idToken);
  const orderId  = formatOrderId(type ?? "standard", orderNum);

  const orderData: Record<string, unknown> = {
    serviceId,
    serviceName,
    service: serviceName,
    platform,
    platformColor: platformColor ?? "#1E90FF",
    type: type ?? "standard",
    quantity: Number(quantity),
    price: Number(price),
    link,
    userId: uid,
    status: "En attente",
    progress: 2,
    orderId,
    orderNum,
    providerOrderId: providerOrderId ?? "",
    provider: provider ?? "",
    comments: comments ?? "",
    referralDiscountApplied: referralDiscountApplied === true,
    createdAt: new Date().toISOString(),
  };

  const order = await firestoreCreate("commandes", orderData, idToken);
  if (!order) {
    res.status(500).json({ success: false, error: "Erreur lors de la création de la commande" });
    return;
  }

  // Invalider le cache orders de cet utilisateur — la nouvelle commande doit apparaître
  invalidateOrdersCache(uid);

  const orderRef = { id: order.id as string, createdAt: orderData.createdAt as string };
  appendToUserArray(uid, idToken, "orderRefs", orderRef, 200).catch(() => {});

  const postOrderTasks: Promise<unknown>[] = [
    incrementUserTotalOrders(uid, idToken),
    logActivity(uid, idToken, "commande",
      `Commande ${serviceName} (${platform})`,
      Number(price), "En attente",
      { orderId, serviceId, platform, quantity: Number(quantity) }
    ),
  ];

  // Increment referralOrdersUsed counter when filleul discount was applied
  if (referralDiscountApplied === true) {
    postOrderTasks.push(
      (async () => {
        try {
          const fb = getFirebaseAdmin();
          const db = fb.firestore();
          const { FieldValue } = await import("firebase-admin/firestore");
          await db.doc(`users/${uid}`).update({
            referralOrdersUsed: FieldValue.increment(1),
          });
          console.log(`[orders] referralOrdersUsed +1 for user ${uid}`);
        } catch (e) {
          console.error("[orders] referralOrdersUsed increment failed:", e);
        }
      })()
    );
  }

  await Promise.all(postOrderTasks);

  res.status(201).json({ success: true, data: order });
});

// ── GET /api/orders/:id/refresh-status ────────────────────────────────────
// Fetches real-time status from the provider API and updates Firestore.
router.get("/orders/:id/refresh-status", requireAuth, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const uid     = req.uid!;
  const idToken = req.idToken!;

  const order = await firestoreGet(`commandes/${id}`, idToken);
  if (!order || asString(order.userId) !== uid) {
    res.status(403).json({ success: false, error: "Commande introuvable" });
    return;
  }

  const providerOrderId = asString(order.providerOrderId);
  if (!providerOrderId) {
    // No provider order ID — return current order without error
    res.json({ success: true, data: order, noProviderId: true });
    return;
  }

  const type         = asString(order.type).toLowerCase();
  const storedProvider = asString(order.provider).toLowerCase();

  // Determine which provider(s) to query
  let providerStatus: ProviderStatus | null = null;
  let usedProvider = "";

  if (type === "avancée" || type === "avancee") {
    providerStatus = await fetchProviderStatus(AFB_BASE, AFB_KEY, providerOrderId);
    usedProvider   = "afriqueboost";
  } else if (type === "automatique") {
    // Try stored provider first, then MTP, then SMMGen
    if (storedProvider === "smmgen") {
      providerStatus = await fetchProviderStatus(SMMGEN_BASE, SMMGEN_KEY, providerOrderId);
      usedProvider   = "smmgen";
    } else {
      providerStatus = await fetchProviderStatus(MTP_BASE, MTP_KEY, providerOrderId);
      usedProvider   = "mtp";
    }
    if (!providerStatus) {
      providerStatus = await fetchProviderStatus(SMMGEN_BASE, SMMGEN_KEY, providerOrderId);
      usedProvider   = "smmgen";
    }
  } else {
    // standard / revendeur → Exo
    providerStatus = await fetchProviderStatus(EXO_BASE, EXO_KEY, providerOrderId);
    usedProvider   = "exo";
  }

  if (!providerStatus) {
    res.status(502).json({ success: false, error: "Impossible de récupérer le statut chez le fournisseur" });
    return;
  }

  const mappedStatus = mapProviderStatus(providerStatus.status);
  const progress     = calcProgress(providerStatus, mappedStatus);
  const prevStatus   = asString(order.status);

  const updates: Record<string, unknown> = {
    status:       mappedStatus,
    progress,
    lastRefreshed: new Date().toISOString(),
  };
  if (providerStatus.remains     != null) updates.remains    = providerStatus.remains;
  if (providerStatus.start_count != null) updates.startCount = providerStatus.start_count;

  // ── REMBOURSEMENT ATOMIQUE si annulée ou partiel ──────────────────────────
  // Le orderPoller ne retouchera plus cette commande une fois le statut changé.
  // On doit donc créditer ici, atomiquement, avec le même verrou refundProcessed.
  let refundCredited = 0;

  if (
    (mappedStatus === "annulée" || mappedStatus === "remboursé" || mappedStatus === "partiel") &&
    prevStatus !== "annulée" && prevStatus !== "remboursé" && prevStatus !== "partiel" &&
    !order.refundProcessed
  ) {
    const price    = asNumber(order.price ?? order.amount);
    const qty      = asNumber(order.quantity);
    const remains  = providerStatus.remains ?? 0;

    let refundAmt = 0;
    if (mappedStatus === "partiel") {
      const ratio = qty > 0 && remains > 0 ? remains / qty : 0;
      refundAmt = Math.round(ratio * price);
    } else {
      // annulée ou remboursé → remboursement total
      refundAmt = price;
    }

    if (refundAmt > 0) {
      try {
        const db = getFirestore();
        await db.runTransaction(async (t) => {
          const orderRef = db.doc(`commandes/${id}`);
          const snap = await t.get(orderRef);
          if (snap.data()?.refundProcessed) return; // déjà traité (race condition)
          t.update(orderRef, {
            ...updates,
            refundProcessed: true,
            refundAmount: refundAmt,
            cancelledAt: new Date().toISOString(),
          });
          t.update(db.doc(`users/${uid}`), { balance: FieldValue.increment(refundAmt) });
        });
        refundCredited = refundAmt;
        updates.refundProcessed = true;
        updates.refundAmount    = refundAmt;
        invalidateOrdersCache(uid);

        // Log remboursement
        logActivity(uid, idToken, "remboursement",
          `Remboursement ${mappedStatus} — ${asString(order.orderId)}`,
          refundAmt, "completed",
          { orderId: order.orderId }
        ).catch(() => {});

        // Push notification
        getUserPushToken(uid).then((token) =>
          sendExpoPush(
            token,
            mappedStatus === "partiel" ? "⚠️ Commande partiellement livrée" : "❌ Commande annulée",
            `${refundAmt.toLocaleString("fr-FR")} FCFA ont été remboursés sur votre solde.`,
            { screen: "orders", orderId: asString(order.orderId) },
            "wallet"
          )
        ).catch(() => {});

        console.log(`[orders/refresh] ✅ Remboursement ${refundAmt} FCFA → ${uid} (commande ${id} → ${mappedStatus})`);
      } catch (err) {
        console.error(`[orders/refresh] Erreur remboursement ${id}:`, err);
        // Mettre à jour quand même le statut sans refundProcessed pour que le poller le récupère
        await firestoreUpdate(`commandes/${id}`, updates, idToken).catch(() => {});
        res.json({ success: true, data: { ...order, ...updates }, providerStatus: { ...providerStatus, provider: usedProvider }, refundError: true });
        return;
      }
    } else {
      // Pas de remboursement (prix = 0) → juste mettre à jour le statut
      updates.refundProcessed = true;
      await firestoreUpdate(`commandes/${id}`, updates, idToken);
    }
  } else {
    // Autres statuts (succès, en cours, etc.) → mise à jour simple
    await firestoreUpdate(`commandes/${id}`, updates, idToken);
  }

  // ── COMMANDE LIVRÉE → notif ───────────────────────────────────────────────
  if (mappedStatus === "succès" && prevStatus !== "succès") {
    const serviceName = asString(order.serviceName);
    const platform   = asString(order.platform);
    const qty        = asNumber(order.quantity, 0);
    const platformLabel = platform ? ` sur ${platform.charAt(0).toUpperCase() + platform.slice(1)}` : "";
    const qtyLabel      = qty > 0 ? ` (${qty.toLocaleString("fr-FR")} unités)` : "";

    logActivity(uid, idToken, "commande",
      `Commande terminée : ${serviceName}`,
      asNumber(order.price), "succès",
      { orderId: order.orderId, serviceId: order.serviceId, platform: order.platform }
    ).catch(() => {});

    getUserPushToken(uid).then((token) =>
      sendExpoPush(
        token,
        "Commande livrée ✅",
        `${serviceName}${platformLabel}${qtyLabel} a été livrée avec succès.`,
        { screen: "orders", orderId: asString(order.orderId) },
        "orders"
      )
    ).catch(() => {});
  }

  res.json({
    success: true,
    data: { ...order, ...updates },
    providerStatus: { ...providerStatus, provider: usedProvider },
    ...(refundCredited > 0 ? { refundCredited } : {}),
  });
});

// ── POST /api/orders/:id/cancel ────────────────────────────────────────────
// ⚠️  TRANSACTION ATOMIQUE — impossible d'exécuter le remboursement 2 fois :
//   1. Vérifie que le statut est encore "En attente" ET que refundProcessed est absent
//   2. Met status="annulée" + refundProcessed=true + crédite le solde en UNE seule opération
//   Si la requête est envoyée 100 fois, seule la première passera ; les suivantes
//   recevront "déjà annulée".
router.post("/orders/:id/cancel", requireAuth, async (req: AuthRequest, res: Response) => {
  // ✅ FIX TS: req.params.id peut être typé `string | string[]` en Express 5.
  //    On garantit un `string` avant de le passer à notifyAdminCancelRefund.
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const uid     = req.uid!;
  const idToken = req.idToken!;

  getFirebaseAdmin();
  const db = getFirestore();

  let price     = 0;
  let existing: FirebaseFirestore.DocumentData | null = null;

  try {
    await db.runTransaction(async (t) => {
      const orderRef = db.doc(`commandes/${id}`);
      const orderSnap = await t.get(orderRef);

      if (!orderSnap.exists) throw Object.assign(new Error("Commande introuvable"), { code: 404 });

      const order = orderSnap.data()!;
      if (asString(order.userId) !== uid) throw Object.assign(new Error("Non autorisé"), { code: 403 });

      // ── Garde-fou idempotent : déjà annulée ou déjà remboursée ──
      const status = asString(order.status);
      const cancelableStatuses = ["En attente", "pending", "en attente"];
      if (!cancelableStatuses.includes(status) || order.refundProcessed === true) {
        throw Object.assign(new Error("Cette commande ne peut plus être annulée"), { code: 400 });
      }

      existing = order;
      price    = asNumber(order.price ?? order.amount);

      // ── Mise à jour atomique de la commande ──
      t.update(orderRef, {
        status:          "annulée",
        progress:        0,
        cancelledAt:     new Date().toISOString(),
        refundAmount:    price,
        refundProcessed: true,   // ← Verrou anti-double-remboursement
      });

      // ── Crédit atomique du solde (increment, jamais read-then-write) ──
      if (price > 0) {
        const userRef = db.doc(`users/${uid}`);
        t.update(userRef, { balance: FieldValue.increment(price) });
      }
    });
  } catch (e: unknown) {
    const err  = e as { code?: number; message?: string };
    const code = err.code ?? 500;
    const msg  = err.message ?? "Erreur interne";
    res.status(code).json({ success: false, error: msg });
    return;
  }

  if (!existing) {
    res.status(500).json({ success: false, error: "Transaction incomplète" });
    return;
  }

  const ord      = existing as FirebaseFirestore.DocumentData;
  const userName  = asString(ord.userName  ?? ord.name, "Inconnu");
  const userEmail = asString(ord.userEmail ?? ord.email, "Non renseigné");
  const userPhone = asString(ord.userPhone ?? ord.phone, "Non renseigné");

  // Activité de remboursement (asynchrone, ne bloque pas)
  if (price > 0) {
    logActivity(uid, idToken, "remboursement",
      `Remboursement commande ${asString(ord.orderId) || id}`,
      price, "completed",
      { orderId: ord.orderId, serviceId: ord.serviceId }
    ).catch(() => {});
  } else {
    logActivity(uid, idToken, "annulation",
      `Annulation commande ${asString(ord.orderId) || id}`,
      0, "completed",
      { orderId: ord.orderId }
    ).catch(() => {});
  }

  // ── Notification WhatsApp admin (asynchrone) ──
  notifyAdminCancelRefund(ord, id, price, userName, userEmail, userPhone).catch(() => {});

  // ── Push notification to user ──
  getUserPushToken(uid).then((token) =>
    sendExpoPush(
      token,
      price > 0 ? "Commande annulée & remboursée 💸" : "Commande annulée ❌",
      price > 0
        ? `${asString(ord.orderId) || "Votre commande"} a été annulée. ${price.toLocaleString("fr-FR")} FCFA remboursés sur votre solde.`
        : `${asString(ord.orderId) || "Votre commande"} a été annulée.`,
      { screen: "orders", orderId: asString(ord.orderId) },
      "wallet"
    )
  ).catch(() => {});

  res.json({ success: true, refundAmount: price });
});

export default router;