import { getFirebaseAdmin } from "../lib/firebase-admin.js";
import { saveNotifAndSendPush } from "../lib/push.js";
import {
  getFirestore,
  FieldValue,
  Transaction,
  QueryDocumentSnapshot,
  QuerySnapshot,
} from "firebase-admin/firestore";
import { invalidateOrdersCache } from "../routes/orders.js";
import { invalidateWalletCache } from "../routes/wallet.js";
import { invalidateNotifCache } from "../routes/notifications.js";
import { sendOrderStatusEmail } from "../lib/email.js";

const EXO_KEY    = process.env.EXOSUPPLIER_API_KEY       ?? "";
const MTP_KEY    = process.env.MORETHANPANEL_API_KEY      ?? "";
const SMMWIZ_KEY = process.env.SMMWIZ_API_KEY             ?? "";
const SMMGEN_KEY = process.env.SMMGEN_API_KEY             ?? ""; // legacy — historique seulement
const AFB_KEY    = process.env.ADVANCED_PROVIDER_API_KEY  ?? "";
const EXO_BASE    = "https://exosupplier.com/api/v2";
const MTP_BASE    = "https://morethanpanel.com/api/v2";
const SMMWIZ_BASE = "https://smmwiz.com/api/v2";
const SMMGEN_BASE = "https://smmgen.com/api/v2"; // legacy
const AFB_BASE    = "https://afriqueboost.com/api/v2";

const POLL_INTERVAL_MS   = 8 * 60_000;
const MAX_ORDERS_PER_RUN = 50;

const PROVIDER_STATUS_MAP: Record<string, string> = {
  pending:     "En attente",
  waiting:     "En attente",
  in_progress: "en cours",
  inprogress:  "en cours",
  processing:  "en cours",
  running:     "en cours",
  active:      "en cours",
  completed:   "succès",
  complete:    "succès",
  success:     "succès",
  done:        "succès",
  canceled:    "annulée",
  cancelled:   "annulée",
  refunded:    "remboursé",
  partial:     "partiel",
};

function mapStatus(raw: string): string {
  const key = (raw ?? "").toLowerCase().replace(/\s+/g, "_");
  return PROVIDER_STATUS_MAP[key] ?? "En attente";
}

interface OrderDetails {
  status: string;
  remains: number;
  charge: number;
}

type HttpRes = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

async function fetchOrderDetails(
  base: string,
  key: string,
  orderId: string
): Promise<OrderDetails | null> {
  if (!key || !orderId) return null;
  try {
    const params = new URLSearchParams({ key, action: "status", order: orderId });
    const r = (await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: params.toString(),
      signal: AbortSignal.timeout(12000),
    })) as unknown as HttpRes;
    const ct = r.headers.get("content-type") ?? "";
    let data: Record<string, unknown> = {};
    try { data = ct.includes("json") ? (await r.json()) as Record<string, unknown> : JSON.parse(await r.text()); } catch { /**/ }
    if (!r.ok || data.error) return null;
    return {
      status:  String(data.status ?? "Pending"),
      remains: Number(data.remains ?? 0),
      charge:  Number(data.charge ?? 0),
    };
  } catch {
    return null;
  }
}

const userInfoCache = new Map<string, { firstName: string; email: string; fetchedAt: number }>();
const USER_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

async function getCachedUserInfo(db: ReturnType<typeof getFirestore>, uid: string): Promise<{ firstName: string; email: string }> {
  if (!uid) return { firstName: "", email: "" };
  const cached = userInfoCache.get(uid);
  if (cached && Date.now() - cached.fetchedAt < USER_CACHE_TTL_MS) return { firstName: cached.firstName, email: cached.email };
  try {
    const doc = await db.doc(`users/${uid}`).get();
    const d = doc.data() ?? {};
    const firstName = String(d.name ?? "").split(" ")[0] || "";
    const email     = String(d.email ?? "");
    userInfoCache.set(uid, { firstName, email, fetchedAt: Date.now() });
    return { firstName, email };
  } catch { return { firstName: "", email: "" }; }
}

async function processOrder(
  db: ReturnType<typeof getFirestore>,
  doc: QueryDocumentSnapshot,
  now: number
): Promise<void> {
  const order = doc.data();
  const providerOrderId = String(order.providerOrderId ?? "");
  if (!providerOrderId) return;

  const type     = String(order.type ?? "").toLowerCase();
  const provider = String(order.provider ?? "").toLowerCase();

  let details: OrderDetails | null = null;

  if (type === "avancée" || type === "avancee") {
    details = await fetchOrderDetails(AFB_BASE, AFB_KEY, providerOrderId);
  } else if (type === "automatique") {
    // ── Routage strict : un seul fournisseur interrogé, pas de fallback ──
    if (provider === "smmwiz") {
      details = await fetchOrderDetails(SMMWIZ_BASE, SMMWIZ_KEY, providerOrderId);
    } else if (provider === "mtp") {
      details = await fetchOrderDetails(MTP_BASE, MTP_KEY, providerOrderId);
    } else if (provider === "smmgen") {
      // Commande historique — on utilise SMMGen uniquement si sa clé existe encore
      if (SMMGEN_KEY) {
        details = await fetchOrderDetails(SMMGEN_BASE, SMMGEN_KEY, providerOrderId);
      } else {
        console.warn(`[poller] ⚠️ Commande ${doc.id} : SMMGen legacy sans clé — statut non vérifiable`);
        return;
      }
    } else {
      console.warn(`[poller] ⚠️ Commande ${doc.id} : fournisseur automatique inconnu "${provider}" — ignorée`);
      return;
    }
  } else {
    details = await fetchOrderDetails(EXO_BASE, EXO_KEY, providerOrderId);
  }

  if (!details) return;

  const mapped     = mapStatus(details.status);
  const prevStatus = String(order.status ?? "");

  if (mapped === prevStatus) return;

  await doc.ref.update({
    status:        mapped,
    lastRefreshed: new Date(now).toISOString(),
    ...(details.remains > 0 ? { remains: details.remains } : {}),
  }).catch(() => {});

  const uid         = String(order.userId ?? "");
  const serviceName = String(order.serviceName ?? "Service");
  const platform    = String(order.platform ?? "");
  const qty         = Number(order.quantity ?? 0);
  const price       = Number(order.price ?? order.amount ?? 0);

  const platformLabel = platform ? ` sur ${platform.charAt(0).toUpperCase() + platform.slice(1)}` : "";
  const qtyLabel      = qty > 0 ? ` (${qty.toLocaleString("fr-FR")} unités)` : "";

  const userInfo      = await getCachedUserInfo(db, uid);
  const userFirstName = userInfo.firstName;
  const userEmail     = userInfo.email;
  const greeting      = userFirstName ? `, ${userFirstName}` : "";
  const orderIdLabel  = String(order.orderId ?? doc.id);

  if (mapped === "succès" && prevStatus !== "succès") {
    await saveNotifAndSendPush(
      uid,
      "order_done",
      "✅ Commande livrée !",
      `Bonne nouvelle${greeting} ! Votre commande ${serviceName}${platformLabel}${qtyLabel} a été livrée avec succès. Merci pour votre confiance.`,
      { screen: "notifications", orderId: orderIdLabel },
      "orders",
      { serviceName, platform, quantity: qty, orderId: orderIdLabel }
    );
    if (userEmail) {
      sendOrderStatusEmail(userEmail, userFirstName, "succès", serviceName, platform, qty, price, orderIdLabel).catch(() => {});
    }
    console.log(`[poller] ✅ ${doc.id} → succès — notif + email envoyés à ${uid}`);
    invalidateOrdersCache(uid);
    invalidateNotifCache(uid);

  } else if (mapped === "partiel" && prevStatus !== "partiel" && !order.refundProcessed) {
    const remains     = details.remains > 0 ? details.remains : 0;
    const refundRatio = qty > 0 && remains > 0 ? remains / qty : 0;
    const refundAmt   = Math.round(refundRatio * price);

    if (refundAmt > 0 && uid) {
      try {
        await db.runTransaction(async (t: Transaction) => {
          const orderRef = db.doc(`commandes/${doc.id}`);
          const snap = await t.get(orderRef);
          if (snap.data()?.refundProcessed) return;
          t.update(orderRef, { refundProcessed: true, refundAmount: refundAmt });
          t.update(db.doc(`users/${uid}`), { balance: FieldValue.increment(refundAmt) });
        });
        console.log(`[poller] 🔄 ${doc.id} → partiel — remboursement ${refundAmt} FCFA à ${uid}`);
        invalidateWalletCache(uid);
      } catch (e) {
        console.error("[poller] Erreur remboursement partiel:", e);
      }
    }
    invalidateOrdersCache(uid);
    invalidateNotifCache(uid);

    const refundLabel = refundAmt > 0
      ? `\n💰 ${refundAmt.toLocaleString("fr-FR")} FCFA ont été remboursés sur votre solde.`
      : "";
    await saveNotifAndSendPush(
      uid,
      "order_partial",
      "⚠️ Commande partiellement livrée",
      `Votre commande ${serviceName}${platformLabel} a été partiellement livrée${greeting}. ${remains} unités n'ont pas pu être livrées.${refundLabel}\n\nVérifiez votre lien et relancez la commande si besoin.`,
      { screen: "notifications", orderId: orderIdLabel },
      "orders",
      { serviceName, platform, quantity: qty, remains, refundAmount: refundAmt, orderId: orderIdLabel }
    );
    if (userEmail) {
      sendOrderStatusEmail(userEmail, userFirstName, "partiel", serviceName, platform, qty, price, orderIdLabel, refundAmt > 0 ? refundAmt : undefined).catch(() => {});
    }

  } else if ((mapped === "annulée" || mapped === "remboursé") &&
             prevStatus !== "annulée" && prevStatus !== "remboursé" &&
             !order.refundProcessed) {
    if (price > 0 && uid) {
      try {
        await db.runTransaction(async (t: Transaction) => {
          const orderRef = db.doc(`commandes/${doc.id}`);
          const snap = await t.get(orderRef);
          if (snap.data()?.refundProcessed) return;
          t.update(orderRef, { refundProcessed: true, refundAmount: price });
          t.update(db.doc(`users/${uid}`), { balance: FieldValue.increment(price) });
        });
        console.log(`[poller] ❌ ${doc.id} → annulée — remboursement ${price} FCFA à ${uid}`);
        invalidateWalletCache(uid);
      } catch (e) {
        console.error("[poller] Erreur remboursement annulation:", e);
      }
    }
    invalidateOrdersCache(uid);
    invalidateNotifCache(uid);

    const refundLabel = price > 0
      ? ` ${price.toLocaleString("fr-FR")} FCFA ont été remboursés sur votre solde.`
      : "";
    await saveNotifAndSendPush(
      uid,
      "order_cancelled",
      "❌ Commande annulée",
      `Votre commande ${serviceName}${platformLabel}${greeting} a été annulée par le prestataire.${refundLabel}\n\nVérifiez la confidentialité de votre lien avant de relancer.`,
      { screen: "notifications", orderId: orderIdLabel },
      "orders",
      { serviceName, platform, quantity: qty, refundAmount: price, orderId: orderIdLabel }
    );
    if (userEmail) {
      const emailStatus = mapped === "remboursé" ? "remboursé" : "annulée";
      sendOrderStatusEmail(userEmail, userFirstName, emailStatus, serviceName, platform, qty, price, orderIdLabel, price > 0 ? price : undefined).catch(() => {});
    }
  }
}

async function pollOnce(): Promise<void> {
  getFirebaseAdmin();
  const db  = getFirestore();
  const now = Date.now();

  let snap: QuerySnapshot | null = null;
  try {
    snap = await db.collection("commandes")
      .where("status", "in", ["En attente", "en cours", "en attente", "En cours", "pending", "in_progress"])
      .limit(MAX_ORDERS_PER_RUN)
      .get();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[poller] ❌ Erreur requête Firestore: ${msg}`);
    try {
      snap = await db.collection("commandes")
        .where("status", "in", ["En attente", "en cours"])
        .limit(MAX_ORDERS_PER_RUN)
        .get();
      console.log("[poller] ⚡ Repli sur requête simplifiée");
    } catch (err2: unknown) {
      console.error("[poller] ❌ Repli aussi échoué:", err2 instanceof Error ? err2.message : String(err2));
      return;
    }
  }

  if (!snap || snap.empty) {
    console.log("[poller] ℹ️ Aucune commande active trouvée ce cycle");
    return;
  }

  console.log(`[poller] 🔍 ${snap.size} commande(s) active(s) à vérifier`);

  const CONCURRENCY = 10;
  for (let i = 0; i < snap.docs.length; i += CONCURRENCY) {
    const batch = snap.docs.slice(i, i + CONCURRENCY);
    await Promise.allSettled(batch.map((doc) => processOrder(db, doc, now)));
  }
}

let pollerTimer: ReturnType<typeof setInterval> | null = null;

export function startOrderPoller(): void {
  if (pollerTimer) return;

  console.log(`[poller] ✅ Démarrage — cycle de ${POLL_INTERVAL_MS / 60_000} min, max ${MAX_ORDERS_PER_RUN} commandes/cycle`);

  setTimeout(() => {
    pollOnce().catch((e) => console.error("[poller] error:", e));
  }, 15_000);

  pollerTimer = setInterval(() => {
    pollOnce().catch((e) => console.error("[poller] error:", e));
  }, POLL_INTERVAL_MS);
}

export function stopOrderPoller(): void {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
    console.log("[poller] Stopped.");
  }
}