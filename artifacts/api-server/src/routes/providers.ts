import { Router } from "express";
import type { Request, Response as ExpressResponse } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getFirebaseAdmin } from "../lib/firebase-admin.js";
import { getFirestore } from "firebase-admin/firestore";

const router: ReturnType<typeof Router> = Router();

// ─────────────────────────────────────────────────────────────
// Helpers d'ordre utilisateur
// ─────────────────────────────────────────────────────────────
async function checkUserCanOrder(uid: string): Promise<{ allowed: boolean; errorCode?: string; errorMsg?: string; userEmail?: string; userName?: string }> {
  try {
    const fb = getFirebaseAdmin();
    const db = fb.firestore();
    const userDoc = await db.doc(`users/${uid}`).get();
    if (!userDoc.exists) return { allowed: false, errorCode: "NOT_FOUND", errorMsg: "Utilisateur introuvable." };
    const d = userDoc.data() ?? {};
    if (d.blocked === true) {
      return { allowed: false, errorCode: "ACCOUNT_BLOCKED", errorMsg: "Votre compte est suspendu. Contactez le support via le chat." };
    }
    const debt = Number(d.frozenDebt ?? 0);
    if (debt > 0) {
      return { allowed: false, errorCode: "FROZEN_DEBT", errorMsg: `Votre compte a une dette de ${debt.toLocaleString("fr-FR")} FCFA. Rechargez pour apurer votre dette avant de commander.` };
    }
    return { allowed: true, userEmail: String(d.email ?? ""), userName: String(d.name ?? d.username ?? "") };
  } catch (e) {
    console.error("[checkUserCanOrder] Firestore error:", e);
    return { allowed: true };
  }
}

// ─────────────────────────────────────────────────────────────
// Config panels SMM
// ─────────────────────────────────────────────────────────────
const EXO_KEY    = process.env.EXOSUPPLIER_API_KEY        ?? "";
const MTP_KEY    = process.env.MORETHANPANEL_API_KEY      ?? "";
const SMMGEN_KEY = process.env.SMMGEN_API_KEY             ?? "";
const AFB_KEY    = process.env.ADVANCED_PROVIDER_API_KEY  ?? "";
const FAPSHI_USER   = process.env.FAPSHI_API_USER         ?? "";
const FAPSHI_SECRET = process.env.FAPSHI_SECRET_KEY       ?? "";

const EXO_BASE    = "https://exosupplier.com/api/v2";
const MTP_BASE    = "https://morethanpanel.com/api/v2";
const SMMGEN_BASE = "https://smmgen.com/api/v2";
const AFB_BASE    = "https://afriqueboost.com/api/v2";
const FAPSHI_BASE = "https://live.fapshi.com";

const USD_TO_XAF      = 1230;
const USD_TO_XAF_AUTO = 1845;

type RawSvc = {
  service: number;
  name: string;
  type?: string;
  rate?: string | number;
  min?: number;
  max?: number;
  category?: string;
  network?: string;
  description?: string;
  dripfeed?: boolean;
  refill?: boolean;
  cancel?: boolean;
  [k: string]: unknown;
};

type FormattedSvc = {
  id: number;
  name: string;
  category: string;
  type: string;
  priceXAF: number;
  min: number;
  max: number;
  refill: boolean;
  cancel: boolean;
  isPackage: boolean;
  isPerOne: boolean;
  isCustomComments: boolean;
  averageTime: string;
  description: string;
  platform: string;
  _provider?: string;
};

function detectPlatform(svc: RawSvc): string {
  const t = ((svc.name ?? "") + " " + (svc.category ?? "") + " " + (svc.network ?? ""))
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (t.includes("instagram") || t.includes("insta"))                             return "instagram";
  if (t.includes("tiktok") || t.includes("tik tok"))                              return "tiktok";
  if (t.includes("youtube") || t.includes(" yt "))                                return "youtube";
  if (t.includes("facebook") || t.includes(" fb "))                               return "facebook";
  if (t.includes("twitter") || t.includes("x/twitter") || t.includes("tweet"))   return "twitter";
  if (t.includes("telegram"))                                                      return "telegram";
  if (t.includes("whatsapp"))                                                      return "whatsapp";
  if (t.includes("threads"))                                                       return "threads";
  if (t.includes("snapchat"))                                                      return "snapchat";
  if (t.includes("linkedin"))                                                      return "linkedin";
  if (t.includes("pinterest"))                                                     return "pinterest";
  if (t.includes("reddit"))                                                        return "reddit";
  if (t.includes("tumblr"))                                                        return "tumblr";
  if (t.includes("quora"))                                                         return "quora";
  if (t.includes("discord"))                                                       return "discord";
  if (t.includes("clubhouse"))                                                     return "clubhouse";
  if (t.includes("vimeo"))                                                         return "vimeo";
  if (t.includes("spotify"))                                                       return "spotify";
  if (t.includes("soundcloud"))                                                    return "soundcloud";
  if (t.includes("deezer"))                                                        return "deezer";
  if (t.includes("apple music") || t.includes("applemusic") || t.includes("itunes")) return "applemusic";
  if (t.includes("shazam"))                                                        return "shazam";
  if (t.includes("twitch"))                                                        return "twitch";
  if (t.includes("kick.com") || t.includes(" kick ") || t.includes("kick stream")) return "kick";
  if (t.includes("netflix"))                                                       return "netflix";
  if (t.includes("amazon") || t.includes("prime video"))                          return "amazon";
  if (t.includes("gmail"))                                                         return "gmail";
  if (t.includes("outlook"))                                                       return "outlook";
  if (t.includes("github"))                                                        return "github";
  if (t.includes("google play") || t.includes("googleplay") || t.includes("play store")) return "googleplay";
  if (t.includes("app store") || t.includes("appstore") || t.includes("apple store"))    return "appstore";
  if (t.includes("google"))                                                        return "google";
  if (t.includes("steam"))                                                         return "steam";
  if (t.includes("xbox"))                                                          return "xbox";
  if (t.includes("ubisoft"))                                                       return "ubisoft";
  if (t.includes("free fire") || t.includes("freefire") || t.includes("garena"))  return "freefire";
  if (t.includes("chatgpt") || t.includes("openai"))                              return "chatgpt";
  if (t.includes("deepseek"))                                                      return "deepseek";
  if (t.includes("canva"))                                                         return "canva";
  if (t.includes("envato"))                                                        return "envato";
  if (t.includes("flaticon"))                                                      return "flaticon";
  return "other";
}

function formatService(raw: RawSvc, provider?: string, xafRate: number = USD_TO_XAF): FormattedSvc {
  const rate    = parseFloat(String(raw.rate ?? "0")) || 0;
  const priceXAF = Math.round(rate * xafRate);
  const min     = Number(raw.min ?? 10);
  const max     = Number(raw.max ?? 100000);
  const nameL   = (raw.name ?? "").toLowerCase();
  const typeL   = (raw.type ?? "").toLowerCase();

  const isCustomComments =
    typeL === "custom comments" ||
    nameL.includes("custom comment") ||
    nameL.includes("commentaires personnalisés");

  const isPackage = min === max;
  const isPerOne  = !isPackage && (nameL.includes("package") && min <= 1);

  const averageTime = rate < 0.5 ? "Lent" : rate < 2 ? "Normal" : rate < 5 ? "Rapide" : "Très rapide";

  return {
    id:              raw.service,
    name:            raw.name ?? "",
    category:        raw.category ?? "",
    type:            raw.type ?? "Default",
    priceXAF,
    min,
    max,
    refill:          raw.refill ?? false,
    cancel:          raw.cancel ?? true,
    isPackage,
    isPerOne,
    isCustomComments,
    averageTime,
    description:     String(raw.description ?? ""),
    platform:        detectPlatform(raw),
    ...(provider ? { _provider: provider } : {}),
  };
}

async function fetchServices(url: string): Promise<RawSvc[]> {
  const r: any = await fetch(url, {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get("content-type") ?? "";
  let data: unknown;
  if (ct.includes("json")) {
    data = await r.json();
  } else {
    const text = await r.text();
    data = JSON.parse(text);
  }
  if (Array.isArray(data)) return data as RawSvc[];
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.data))     return d.data as RawSvc[];
  if (Array.isArray(d.services)) return d.services as RawSvc[];
  if (d.platforms && typeof d.platforms === "object") {
    return Object.values(d.platforms as Record<string, RawSvc[]>).flat();
  }
  throw new Error("Format de réponse inconnu");
}

function groupByPlatform(svcs: FormattedSvc[]): Record<string, FormattedSvc[]> {
  const map: Record<string, FormattedSvc[]> = {};
  for (const s of svcs) {
    if (!map[s.platform]) map[s.platform] = [];
    map[s.platform].push(s);
  }
  return map;
}

async function smmPanelOrder(
  base: string,
  apiKey: string,
  serviceId: string,
  link: string,
  quantity: number,
  comments?: string,
  res?: ExpressResponse
): Promise<{ ok: boolean; orderId?: string; error?: string }> {
  try {
    const params: Record<string, string> = {
      key: apiKey,
      action: "add",
      service: String(serviceId),
      link,
      quantity: String(quantity),
    };
    if (comments) params.comments = comments;

    const r: any = await fetch(base, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(20000),
    });

    const ct = r.headers.get("content-type") ?? "";
    let data: Record<string, unknown> = {};
    try {
      data = ct.includes("json")
        ? await r.json()
        : JSON.parse(await r.text());
    } catch { }

    if (!r.ok || data?.error) {
      const errMsg = String(data?.error ?? `Erreur fournisseur (HTTP ${r.status})`);
      if (res) res.status(r.ok ? 400 : r.status).json({ success: false, error: errMsg });
      return { ok: false, error: errMsg };
    }

    const orderId = data?.order ? String(data.order) : undefined;
    if (res) res.json({ success: true, orderId });
    return { ok: true, orderId };
  } catch (e: any) {
    const errMsg = "Fournisseur inaccessible: " + (e?.message ?? "timeout");
    if (res) res.status(502).json({ success: false, error: errMsg });
    return { ok: false, error: errMsg };
  }
}

// ═══════════════════════════════════════════════════════════════
// SMM PANELS — Exo / MTP / SMMGen / AfriqueBoost
// ═══════════════════════════════════════════════════════════════

router.get("/exo-services", async (_req: Request, res: ExpressResponse) => {
  try {
    const raw = await fetchServices(`${EXO_BASE}?key=${encodeURIComponent(EXO_KEY)}&action=services`);
    const svcs = raw.map((s) => formatService(s));
    res.json({ success: true, platforms: groupByPlatform(svcs), services: svcs });
  } catch (e: any) {
    res.status(502).json({ success: false, error: "Fournisseur Exo inaccessible: " + e?.message });
  }
});

router.post("/order-exo", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  const { serviceId, link, quantity, comments } = req.body ?? {};
  if (!serviceId || !link || !quantity) {
    res.status(400).json({ success: false, error: "serviceId, link et quantity sont requis" });
    return;
  }
  const check = await checkUserCanOrder(req.uid!);
  if (!check.allowed) {
    res.status(403).json({ success: false, error: check.errorMsg, code: check.errorCode });
    return;
  }
  await smmPanelOrder(EXO_BASE, EXO_KEY, String(serviceId), String(link), Number(quantity), comments, res);
});

router.get("/mtp/services", async (_req: Request, res: ExpressResponse) => {
  try {
    const raw = await fetchServices(`${MTP_BASE}?key=${encodeURIComponent(MTP_KEY)}&action=services`);
    const svcs = raw.map((s) => formatService(s, "mtp", USD_TO_XAF_AUTO));
    res.json({ success: true, platforms: groupByPlatform(svcs), services: svcs });
  } catch (e: any) {
    res.status(502).json({ success: false, error: "Fournisseur MTP inaccessible: " + e?.message });
  }
});

router.post("/mtp/order", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  const { serviceId, link, quantity, comments } = req.body ?? {};
  if (!serviceId || !link || !quantity) {
    res.status(400).json({ success: false, error: "serviceId, link et quantity sont requis" });
    return;
  }
  const check = await checkUserCanOrder(req.uid!);
  if (!check.allowed) {
    res.status(403).json({ success: false, error: check.errorMsg, code: check.errorCode });
    return;
  }
  await smmPanelOrder(MTP_BASE, MTP_KEY, String(serviceId), String(link), Number(quantity), comments, res);
});

router.get("/smmgen/services", async (_req: Request, res: ExpressResponse) => {
  try {
    const raw = await fetchServices(`${SMMGEN_BASE}?key=${encodeURIComponent(SMMGEN_KEY)}&action=services`);
    const svcs = raw.map((s) => formatService(s, "smmgen", USD_TO_XAF_AUTO));
    res.json({ success: true, platforms: groupByPlatform(svcs), services: svcs });
  } catch (e: any) {
    res.status(502).json({ success: false, error: "Fournisseur SMMGen inaccessible: " + e?.message });
  }
});

router.post("/smmgen/order", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  const { serviceId, link, quantity, comments } = req.body ?? {};
  if (!serviceId || !link || !quantity) {
    res.status(400).json({ success: false, error: "serviceId, link et quantity sont requis" });
    return;
  }
  const check = await checkUserCanOrder(req.uid!);
  if (!check.allowed) {
    res.status(403).json({ success: false, error: check.errorMsg, code: check.errorCode });
    return;
  }
  await smmPanelOrder(SMMGEN_BASE, SMMGEN_KEY, String(serviceId), String(link), Number(quantity), comments, res);
});

router.get("/afriqueboost/services", async (_req: Request, res: ExpressResponse) => {
  try {
    const raw = await fetchServices(`${AFB_BASE}?key=${encodeURIComponent(AFB_KEY)}&action=services`);
    const svcs = raw.map((s) => formatService(s, "afriqueboost", 1));
    res.json({ success: true, platforms: groupByPlatform(svcs), services: svcs });
  } catch (e: any) {
    res.status(502).json({ success: false, error: "Fournisseur Afriqueboost inaccessible: " + e?.message });
  }
});

router.post("/afriqueboost/order", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  const { serviceId, link, quantity, comments } = req.body ?? {};
  if (!serviceId || !link || !quantity) {
    res.status(400).json({ success: false, error: "serviceId, link et quantity sont requis" });
    return;
  }
  const check = await checkUserCanOrder(req.uid!);
  if (!check.allowed) {
    res.status(403).json({ success: false, error: check.errorMsg, code: check.errorCode });
    return;
  }
  await smmPanelOrder(AFB_BASE, AFB_KEY, String(serviceId), String(link), Number(quantity), comments, res);
});

router.get("/services/auto", async (_req: Request, res: ExpressResponse) => {
  try {
    const [mtpRes, smmRes] = await Promise.allSettled([
      fetchServices(`${MTP_BASE}?key=${encodeURIComponent(MTP_KEY)}&action=services`),
      fetchServices(`${SMMGEN_BASE}?key=${encodeURIComponent(SMMGEN_KEY)}&action=services`),
    ]);

    let allServices: FormattedSvc[] = [];
    const providers: string[] = [];

    if (mtpRes.status === "fulfilled") {
      allServices = allServices.concat(mtpRes.value.map((s) => formatService(s, "mtp", USD_TO_XAF_AUTO)));
      if (mtpRes.value.length > 0) providers.push("MTP");
    }
    if (smmRes.status === "fulfilled") {
      allServices = allServices.concat(smmRes.value.map((s) => formatService(s, "smmgen", USD_TO_XAF_AUTO)));
      if (smmRes.value.length > 0) providers.push("SMMGen");
    }

    if (allServices.length === 0) {
      const raw = await fetchServices(`${EXO_BASE}?key=${encodeURIComponent(EXO_KEY)}&action=services`);
      const svcs = raw.map((s) => formatService(s));
      res.json({ success: true, platforms: groupByPlatform(svcs), services: svcs, providers: ["Exo"] });
      return;
    }

    res.json({ success: true, platforms: groupByPlatform(allServices), services: allServices, providers });
  } catch (e: any) {
    res.status(502).json({ success: false, error: "Fournisseur inaccessible: " + e?.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// FAPSHI — Paiement Mobile Money Cameroun
// ═══════════════════════════════════════════════════════════════

router.post("/create-fapshi-checkout", async (req: Request, res: ExpressResponse) => {
  try {
    const { amount, description, message, redirectUrl, externalId } = req.body ?? {};
    if (!amount || Number(amount) < 100) {
      res.status(400).json({ success: false, error: "Montant minimum : 100 FCFA" });
      return;
    }

    const payload: Record<string, unknown> = {
      amount: Number(amount),
      message: description ?? message ?? "Rechargement Social Boost Horizon",
      redirectUrl: redirectUrl ?? "https://socialboosthorizon.com/payment-success.html",
    };
    if (externalId) payload.externalId = String(externalId);

    const r: any = await fetch(`${FAPSHI_BASE}/initiate-pay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "apiuser": FAPSHI_USER,
        "apikey": FAPSHI_SECRET,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });

    const data = await r.json().catch(() => ({})) as Record<string, unknown>;

    if (!r.ok || data?.statusCode === 400 || data?.statusCode === 401 || data?.statusCode === 403) {
      res.status(r.ok ? 400 : r.status).json({
        success: false,
        error: String(data?.message ?? "Erreur Fapshi"),
      });
      return;
    }

    res.json({
      success: true,
      checkoutUrl: data.link,
      transId: data.transId,
      message: data.message,
    });
  } catch (e: any) {
    res.status(502).json({ success: false, error: "Fapshi inaccessible: " + (e?.message ?? "timeout") });
  }
});

router.get("/fapshi/status/:transId", async (req: Request, res: ExpressResponse) => {
  try {
    const { transId } = req.params;
    const r: any = await fetch(`${FAPSHI_BASE}/payment-status/${transId}`, {
      headers: {
        "Accept": "application/json",
        "apiuser": FAPSHI_USER,
        "apikey": FAPSHI_SECRET,
      },
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch (e: any) {
    res.status(502).json({ success: false, error: "Fapshi inaccessible: " + e?.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ACCOUNTPE / SWYCHR — Mobile Money international (DIRECT)
// ═══════════════════════════════════════════════════════════════
const ACCOUNTPE_BASE = "https://api.accountpe.com/api/payin";

async function accountPeAuth(): Promise<string | null> {
  const email = process.env.ACCOUNTPE_USERNAME ?? "";
  const password = process.env.ACCOUNTPE_PASSWORD ?? "";
  if (!email || !password) {
    console.error("[accountpe] ACCOUNTPE_USERNAME / ACCOUNTPE_PASSWORD manquants");
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

async function generateIntlReference(): Promise<string> {
  getFirebaseAdmin();
  const db = getFirestore();
  const counterRef = db.collection("counters").doc("swychrTransactions");
  let next = 0;
  await db.runTransaction(async (t) => {
    const doc = await t.get(counterRef);
    const last = (doc.exists ? Number(doc.data()?.lastId ?? 0) : 0) || 0;
    next = last + 1;
    t.set(counterRef, { lastId: next, updatedAt: new Date().toISOString() }, { merge: true });
  });
  return `SBH-INT-${String(next).padStart(6, "0")}`;
}

/**
 * POST /create-payment
 * Crée un paiement Mobile Money international DIRECTEMENT chez AccountPe.
 * Le userId vient du token Firebase (req.uid), pas du body.
 */
router.post("/create-payment", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  try {
    const uid = req.uid!;
    const {
      amount, amountXAF, currency, phone, country,
      username: bodyUsername, email: bodyEmail,
    } = req.body ?? {};

    const localAmount = Number(amount ?? 0);
    const xafAmount   = Number(amountXAF ?? 0);
    const curr        = String(currency ?? "XAF").toUpperCase();
    const ctry        = String(country ?? "CM").toUpperCase();
    const cleanPhone  = String(phone ?? "").trim();

    if (!Number.isFinite(localAmount) || localAmount <= 0) {
      res.status(400).json({ success: false, error: "Montant invalide" });
      return;
    }
    if (!Number.isFinite(xafAmount) || xafAmount < 100) {
      res.status(400).json({ success: false, error: "Montant en FCFA invalide (minimum 100)" });
      return;
    }
    if (!cleanPhone) {
      res.status(400).json({ success: false, error: "Numéro de téléphone requis" });
      return;
    }

    getFirebaseAdmin();
    const db = getFirestore();

    const userSnap = await db.doc(`users/${uid}`).get();
    const userData = userSnap.data() ?? {};
    const userEmail = bodyEmail || String(userData.email ?? "");
    const userName  = bodyUsername
      || String(userData.name ?? userData.displayName ?? userData.username ?? "")
      || (userEmail ? userEmail.split("@")[0] : "Client");

    const token = await accountPeAuth();
    if (!token) {
      res.status(502).json({ success: false, error: "Service de paiement international indisponible" });
      return;
    }

    const reference = await generateIntlReference();

    const rechargeRef = db.collection("rechargements").doc(`swychr_${reference}`);
    await rechargeRef.set({
      amount: xafAmount,
      localAmount,
      currency: curr,
      method: `Mobile Money ${ctry}`,
      phone: cleanPhone,
      transId: reference,
      transactionId: reference,
      status: "pending",
      provider: "swychr",
      userId: uid,
      createdAt: new Date().toISOString(),
      referralProcessed: false,
      depositNotifSent: false,
    });

    const host = (req.headers["x-forwarded-host"] as string)
      || (req.headers.host as string)
      || "";
    const proto = (req.headers["x-forwarded-proto"] as string) || "https";
    const baseUrl = host ? `${proto}://${host}` : "";
    const callbackUrl = baseUrl ? `${baseUrl}/api/webhook/swychr` : undefined;

    const payload = {
      country_code: ctry,
      name: userName,
      email: userEmail,
      mobile: cleanPhone,
      amount: localAmount,
      currency: curr,
      transaction_id: reference,
      description: "Recharge Solde Social Boost Horizon",
      pass_digital_charge: true,
      callback_url: callbackUrl,
    };

    const r = await fetch(`${ACCOUNTPE_BASE}/create_payment_links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": reference,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000),
    });

    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    const statusCode = Number(data.status ?? 0);
    const inner = (data.data as Record<string, unknown> | undefined) ?? {};

    if (statusCode !== 200 && statusCode !== 201) {
      const errMsg = String(data.message ?? "Erreur AccountPe");
      await rechargeRef.update({ status: "failed", providerError: errMsg }).catch(() => {});
      res.status(502).json({ success: false, error: errMsg });
      return;
    }

    const checkoutUrl = String(inner.payment_link ?? inner.checkoutUrl ?? inner.url ?? "");
    if (!checkoutUrl) {
      await rechargeRef.update({ status: "failed", providerError: "checkoutUrl manquant" }).catch(() => {});
      res.status(502).json({ success: false, error: "Lien de paiement introuvable" });
      return;
    }

    try {
      await db.collection("activites").add({
        userId: uid,
        type: "depot",
        label: `Dépôt Mobile Money ${ctry} en cours`,
        amount: xafAmount,
        status: "pending",
        transId: reference,
        phone: cleanPhone,
        createdAt: new Date().toISOString(),
      });
    } catch (e: any) {
      console.warn("[create-payment] logActivity a échoué:", e?.message);
    }

    res.json({
      success: true,
      checkoutUrl,
      transId: reference,
      transactionId: reference,
      amount: localAmount,
      currency: curr,
    });
  } catch (e: any) {
    console.error("[create-payment] ❌", e?.message, e?.stack);
    res.status(502).json({ success: false, error: "Paiement international inaccessible : " + (e?.message ?? "timeout") });
  }
});

// ═══════════════════════════════════════════════════════════════
// NELSIUSPAY — Paiement carte bancaire Visa/Mastercard
// ═══════════════════════════════════════════════════════════════
const NELSIUSPAY_API_URL          = "https://api.nelsiuspay.com/api/v1";
const NELSIUSPAY_MIN_AMOUNT_XAF   = 1380;
const NELSIUSPAY_MAX_AMOUNT_XAF   = 10_000_000;
const NELSIUSPAY_FEE_BEARER       = "customer";
const NELSIUSPAY_MIN_PROVIDER_AMT = 100;

const SBH_CURRENCY_RATES: Record<string, number> = {
  XAF: 1, XOF: 1, USD: 590, EUR: 690, GBP: 771.60, CAD: 408.95, CHF: 703.08,
  JPY: 3.6921, CNY: 86.92, INR: 6.0616, AED: 158.68, SAR: 155.20, TRY: 11.86,
  RUB: 6.9466, ZAR: 35.01, MAD: 58.68, GHS: 49.67, NGN: 0.4346, KES: 4.4919,
  UGX: 0.1577, TZS: 0.2260, RWF: 0.4200, ZMW: 24.39, CDF: 0.2344, AOA: 0.6400,
  MZN: 9.1200, BRL: 103.50, MXN: 29.60, AUD: 375.40, NZD: 340.20, KRW: 0.4233,
  SGD: 432.10, THB: 16.90, MYR: 130.20, IDR: 0.0373, PHP: 10.35, VND: 0.0230,
  PLN: 147.80, SEK: 54.20, NOK: 52.80, DKK: 92.60, CZK: 25.10, HUF: 1.5900,
  RON: 138.70, BGN: 352.80, HRK: 91.50, UAH: 14.05, ILS: 158.30, EGP: 11.90,
  TND: 187.60, DZD: 4.3500, LYD: 120.50, QAR: 159.80, KWD: 1898.00, BHD: 1545.00,
  OMR: 1514.00, JOD: 822.00, LBP: 0.0065, PKR: 2.0800, BDT: 4.8300, LKR: 1.9800,
  NPR: 3.7800, MUR: 12.60, SCR: 42.30, MGA: 0.1300, MVR: 37.80, AFN: 7.8000,
  IRR: 0.0138, IQD: 0.4450, SYP: 0.0440, YER: 2.3800, ETB: 4.1500, GMD: 8.2000,
  GNF: 0.0670, LRD: 3.0200, SLL: 0.0270, SOS: 1.0100, SDG: 0.9700, SSP: 0.4500,
  DJF: 3.2800, KMF: 1.3800, CVE: 6.3100, STN: 28.20, BIF: 0.2000, ERN: 38.80,
  LSL: 35.10, SZL: 35.10, NAD: 35.10, BWP: 44.50, MWK: 0.3350, ZWG: 22.10,
  ZWL: 0.0020, ALL: 6.30, XCD: 215.80, AMD: 1.50, AZN: 347.00, BSD: 582.82,
  BBD: 291.41, BZD: 291.41, BTN: 6.06, BYN: 178.00, MMK: 0.28, BOB: 84.50,
  BAM: 352.80, BND: 432.10, KHR: 0.14, KPW: 0.65, CRC: 1.13, CUP: 24.28,
  ANG: 325.60, GIP: 771.60, GTQ: 75.10, GYD: 2.79, HTG: 4.42, HNL: 23.50,
  ISK: 4.20, JMD: 3.75, KZT: 1.20, KGS: 6.67, LAK: 0.027, MKD: 10.20,
  MDL: 32.80, MNT: 0.17, NIO: 16.00, XPF: 5.78, UZS: 0.046, PAB: 582.82,
  PGK: 155.00, PYG: 0.079, HKD: 74.60, RSD: 5.88, SRD: 16.50, TJS: 53.50,
  TWD: 18.30, TOP: 245.00, TTD: 86.00, TMT: 166.50, WST: 210.00, SBD: 71.00,
  MRU: 14.68, PEN: 155.00, CLP: 0.61, COP: 0.14, ARS: 1.40, UYU: 14.60,
  VES: 16.00, GEL: 216.00, FJD: 258.00, VUV: 4.90,
};

function nelsiusConvertToXAF(amount: number, currency: string): number {
  const rate = SBH_CURRENCY_RATES[currency.toUpperCase()];
  if (rate === undefined) throw new Error(`Devise non supportée : ${currency}`);
  if (rate <= 0) throw new Error(`Taux invalide pour ${currency}`);
  return Math.round(amount * rate);
}

async function nelsiusGenerateReference(): Promise<string> {
  getFirebaseAdmin();
  const db = getFirestore();
  const counterRef = db.collection("counters").doc("nelsiuspayReferences");
  let next = 0;
  await db.runTransaction(async (t) => {
    const doc = await t.get(counterRef);
    const last = (doc.exists ? Number(doc.data()?.lastId ?? 0) : 0) || 0;
    next = last + 1;
    t.set(counterRef, { lastId: next, updatedAt: new Date().toISOString() }, { merge: true });
  });
  return `SBH-CARD-${String(next).padStart(6, "0")}`;
}

async function callNelsiusPay(endpoint: string, method = "GET", body: unknown = null) {
  const apiKey = process.env.NELSIUSPAY_API_KEY;
  if (!apiKey) throw new Error("NELSIUSPAY_API_KEY non définie côté serveur");

  const url = `${NELSIUSPAY_API_URL}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Api-Key": apiKey,
    },
  };
  try {
    if (typeof (AbortSignal as any).timeout === "function") {
      options.signal = (AbortSignal as any).timeout(15000);
    }
  } catch { /* fallback silencieux */ }
  if (body) options.body = JSON.stringify(body);

  const r = await fetch(url, options);
  const rawText = await r.text();
  let data: any;
  try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }
  return { ok: r.ok, status: r.status, data };
}

function normalizeNelsiusStatus(providerStatus: string): "CONFIRMED" | "PENDING" | "FAILED" {
  const s = (providerStatus || "").toLowerCase();
  if (s === "completed" || s === "success" || s === "paid") return "CONFIRMED";
  if (s === "failed" || s === "cancelled" || s === "rejected") return "FAILED";
  return "PENDING";
}

async function creditNelsiusOnce(reference: string, uid: string): Promise<{ alreadyCredited: boolean; creditedAmount: number; newBalance: number }> {
  getFirebaseAdmin();
  const db = getFirestore();
  const rechargeRef = db.collection("rechargements").doc(`nelsius_${reference}`);
  const userRef = db.doc(`users/${uid}`);
  let already = false;
  let amount = 0;
  let newBalance = 0;

  await db.runTransaction(async (t) => {
    const rechargeDoc = await t.get(rechargeRef);
    if (!rechargeDoc.exists) throw new Error("Recharge NelsiusPay introuvable");
    const rdata = rechargeDoc.data() ?? {};
    if (rdata.status === "confirmed" || rdata.credited === true) {
      already = true;
      amount = Number(rdata.amount ?? 0);
      const u = await t.get(userRef);
      newBalance = Number(u.data()?.balance ?? 0);
      return;
    }
    const userDoc = await t.get(userRef);
    const udata = userDoc.data() ?? {};
    const currentBal = Number(udata.balance ?? 0);
    amount = Number(rdata.amount ?? 0);
    if (amount <= 0) throw new Error("Montant de recharge invalide");
    newBalance = currentBal + amount;
    t.update(userRef, { balance: newBalance });
    t.update(rechargeRef, {
      status: "confirmed",
      credited: true,
      creditedAt: new Date().toISOString(),
    });
  });

  if (!already) {
    try {
      await db.collection("activites").add({
        userId: uid,
        type: "depot",
        label: "Dépôt Carte bancaire confirmé",
        amount,
        status: "confirmed",
        transId: reference,
        createdAt: new Date().toISOString(),
      });
    } catch (e: any) {
      console.warn("[nelsiuspay] activité non enregistrée:", e?.message);
    }
    try {
      const uDoc = await db.doc(`users/${uid}`).get();
      const firstName = String(uDoc.data()?.name ?? "").split(" ")[0] || "";
      const greeting = firstName ? `, ${firstName}` : "";
      const { sendExpoPush, getUserPushToken } = await import("../lib/push.js");
      const pushToken = await getUserPushToken(uid);
      await sendExpoPush(
        pushToken,
        "💰 Rechargement par carte confirmé !",
        `${amount.toLocaleString("fr-FR")} FCFA ont été crédités sur votre solde${greeting}.`,
        { screen: "wallet" },
        "wallet"
      );
    } catch (e: any) {
      console.warn("[nelsiuspay] push non envoyé:", e?.message);
    }
  }

  return { alreadyCredited: already, creditedAmount: amount, newBalance };
}

// ── POST /nelsiuspay/checkout ────────────────────────────────
router.post("/nelsiuspay/checkout", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  try {
    const uid = req.uid!;
    const { amount, currency } = req.body ?? {};

    const requestedAmount = Number(amount ?? 0);
    const requestedCurrency = String(currency ?? "XAF").toUpperCase();

    if (!Number.isInteger(requestedAmount) || requestedAmount <= 0) {
      res.status(400).json({ success: false, error: "Montant invalide (entier positif requis)" });
      return;
    }
    if (!SBH_CURRENCY_RATES[requestedCurrency]) {
      res.status(400).json({ success: false, error: `Devise non supportée : ${requestedCurrency}` });
      return;
    }

    const creditedXAF = nelsiusConvertToXAF(requestedAmount, requestedCurrency);

    if (creditedXAF < NELSIUSPAY_MIN_AMOUNT_XAF) {
      res.status(400).json({ success: false, error: `Montant minimum : ${NELSIUSPAY_MIN_AMOUNT_XAF.toLocaleString("fr-FR")} FCFA` });
      return;
    }
    if (creditedXAF > NELSIUSPAY_MAX_AMOUNT_XAF) {
      res.status(400).json({ success: false, error: `Montant maximum : ${NELSIUSPAY_MAX_AMOUNT_XAF.toLocaleString("fr-FR")} FCFA` });
      return;
    }
    if (!process.env.NELSIUSPAY_API_KEY) {
      res.status(500).json({ success: false, error: "Configuration de paiement incomplète. Contactez le support." });
      return;
    }

    let providerAmount = requestedAmount;
    let providerCurrency = requestedCurrency;
    if (requestedAmount < NELSIUSPAY_MIN_PROVIDER_AMT) {
      providerAmount = creditedXAF;
      providerCurrency = "XAF";
    }

    getFirebaseAdmin();
    const db = getFirestore();

    const userSnap = await db.doc(`users/${uid}`).get();
    const uData = userSnap.data() ?? {};
    const customerEmail = String(uData.email ?? "");
    const customerName  = String(uData.name ?? uData.displayName ?? uData.username ?? "");
    const customerPhone = String(uData.phone ?? "");

    const reference = await nelsiusGenerateReference();

    const host = (req.headers["x-forwarded-host"] as string) || (req.headers.host as string) || "";
    const proto = (req.headers["x-forwarded-proto"] as string) || "https";
    const baseUrl = host ? `${proto}://${host}` : "";
    const returnUrl = baseUrl ? `${baseUrl}/payment-return.html?status=return&ref=${encodeURIComponent(reference)}` : undefined;
    const cancelUrl = baseUrl ? `${baseUrl}/payment-return.html?status=cancel&ref=${encodeURIComponent(reference)}` : undefined;

    const rechargeRef = db.collection("rechargements").doc(`nelsius_${reference}`);
    await rechargeRef.set({
      amount: creditedXAF,
      providerAmount,
      providerCurrency,
      requestedAmount,
      requestedCurrency,
      method: "Carte bancaire (Visa/Mastercard)",
      transId: reference,
      transactionId: reference,
      status: "pending",
      provider: "nelsiuspay",
      userId: uid,
      createdAt: new Date().toISOString(),
      referralProcessed: false,
      depositNotifSent: false,
    });

    const payload: Record<string, unknown> = {
      amount: providerAmount,
      currency: providerCurrency,
      customer_email: customerEmail || undefined,
      customer_name: customerName || undefined,
      customer_phone: customerPhone || undefined,
      reference,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      fee_bearer: NELSIUSPAY_FEE_BEARER,
      metadata: {
        product_name: "Recharge Social Boost Horizon",
        userId: uid,
        creditedAmountXAF: String(creditedXAF),
        originalAmount: String(requestedAmount),
        originalCurrency: requestedCurrency,
      },
    };
    Object.keys(payload).forEach((k) => { if (payload[k] === undefined) delete payload[k]; });

    const r = await callNelsiusPay("/checkout/initiate", "POST", payload);

    if (!r.ok) {
      const errMsg = String(r.data?.message ?? r.data?.error ?? `Erreur NelsiusPay (HTTP ${r.status})`);
      await rechargeRef.update({ status: "failed", providerError: errMsg }).catch(() => {});
      res.status(r.status >= 500 ? 502 : 400).json({ success: false, error: errMsg });
      return;
    }

    const d = r.data?.data ?? r.data;
    const checkoutUrl = d?.checkout_url ?? d?.url ?? r.data?.checkout_url ?? r.data?.url ?? null;

    if (!checkoutUrl) {
      await rechargeRef.update({ status: "failed", providerError: "URL manquante" }).catch(() => {});
      res.status(502).json({ success: false, error: "URL de paiement manquante dans la réponse du prestataire." });
      return;
    }

    res.json({
      success: true,
      checkoutUrl,
      reference,
      creditedAmountXAF: creditedXAF,
      requestedAmount,
      requestedCurrency,
    });
  } catch (e: any) {
    console.error("[nelsiuspay/checkout] ❌", e?.message, e?.stack);
    res.status(502).json({
      success: false,
      error: "Paiement par carte inaccessible : " + (e?.message ?? "timeout"),
    });
  }
});

// ── POST /nelsiuspay/status ──────────────────────────────────
router.post("/nelsiuspay/status", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  try {
    const uid = req.uid!;
    const reference = String(req.body?.reference ?? "").trim();
    if (!reference) {
      res.status(400).json({ success: false, error: "Référence requise" });
      return;
    }

    getFirebaseAdmin();
    const db = getFirestore();
    const rechargeRef = db.collection("rechargements").doc(`nelsius_${reference}`);
    const rechargeDoc = await rechargeRef.get();
    if (!rechargeDoc.exists) {
      res.status(404).json({ success: false, error: "Transaction introuvable" });
      return;
    }

    const data = rechargeDoc.data() ?? {};
    if (data.userId !== uid) {
      res.status(403).json({ success: false, error: "Accès refusé" });
      return;
    }

    if (data.status === "confirmed") {
      const userDoc = await db.doc(`users/${uid}`).get();
      res.json({
        success: true,
        status: "CONFIRMED",
        creditedAmountXAF: Number(data.amount ?? 0),
        newBalance: Number(userDoc.data()?.balance ?? 0),
      });
      return;
    }

    if (!process.env.NELSIUSPAY_API_KEY) {
      res.status(500).json({ success: false, error: "Configuration de paiement incomplète" });
      return;
    }

    const r = await callNelsiusPay(`/payments/${encodeURIComponent(reference)}`, "GET");
    if (!r.ok) {
      if (r.status === 404) {
        res.status(404).json({ success: false, error: "Transaction inconnue chez le prestataire" });
        return;
      }
      res.status(502).json({ success: false, error: "Impossible de vérifier le statut" });
      return;
    }

    const d = r.data?.data ?? r.data;
    const providerStatus = String(d?.status ?? "pending");
    const internal = normalizeNelsiusStatus(providerStatus);

    if (internal === "CONFIRMED") {
      const { creditedAmount, newBalance } = await creditNelsiusOnce(reference, uid);
      res.json({
        success: true,
        status: "CONFIRMED",
        creditedAmountXAF: creditedAmount,
        newBalance,
      });
      return;
    }
    if (internal === "FAILED") {
      await rechargeRef.update({ status: "failed" }).catch(() => {});
      res.json({ success: true, status: "FAILED" });
      return;
    }
    res.json({ success: true, status: "PENDING" });
  } catch (e: any) {
    console.error("[nelsiuspay/status] ❌", e?.message, e?.stack);
    res.status(502).json({ success: false, error: "Vérification indisponible : " + (e?.message ?? "timeout") });
  }
});

// ── POST /nelsiuspay/webhook ─────────────────────────────────
router.post("/nelsiuspay/webhook", async (req: Request, res: ExpressResponse) => {
  try {
    const event = String(req.body?.event ?? "");
    const data = req.body?.data ?? {};
    const reference = String(data?.reference ?? "").trim();

    if (!reference) { res.json({ received: true }); return; }

    getFirebaseAdmin();
    const db = getFirestore();
    const rechargeRef = db.collection("rechargements").doc(`nelsius_${reference}`);
    const rechargeDoc = await rechargeRef.get();
    if (!rechargeDoc.exists) { res.json({ received: true }); return; }

    if (rechargeDoc.data()?.status === "confirmed") {
      res.json({ received: true, alreadyConfirmed: true });
      return;
    }

    if (!process.env.NELSIUSPAY_API_KEY) {
      res.json({ received: true, deferred: true });
      return;
    }

    const r = await callNelsiusPay(`/payments/${encodeURIComponent(reference)}`, "GET");
    if (!r.ok) { res.json({ received: true, deferred: true }); return; }
    const d = r.data?.data ?? r.data;
    const providerStatus = String(d?.status ?? "pending");
    const internal = normalizeNelsiusStatus(providerStatus);

    if (internal !== "CONFIRMED") {
      res.json({ received: true, status: internal, event });
      return;
    }

    const uid = rechargeDoc.data()?.userId;
    if (uid) {
      await creditNelsiusOnce(reference, uid).catch(() => {});
    }
    res.json({ received: true, status: "CONFIRMED" });
  } catch (e: any) {
    console.error("[nelsiuspay/webhook] ❌", e?.message);
    res.status(200).json({ received: true, error: e?.message });
  }
});

export default router;