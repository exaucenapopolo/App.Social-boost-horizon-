import { Router } from "express";
import type { Request, Response as ExpressResponse } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getFirebaseAdmin } from "../lib/firebase-admin.js";

const router: ReturnType<typeof Router> = Router();

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

const EXO_KEY    = process.env.EXOSUPPLIER_API_KEY    ?? "";
const MTP_KEY    = process.env.MORETHANPANEL_API_KEY   ?? "";
const SMMGEN_KEY = process.env.SMMGEN_API_KEY          ?? "";
const AFB_KEY    = process.env.ADVANCED_PROVIDER_API_KEY ?? "";
const FAPSHI_USER   = process.env.FAPSHI_API_USER      ?? "";
const FAPSHI_SECRET = process.env.FAPSHI_SECRET_KEY    ?? "";

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

const INTL_PAYMENT_BACKEND = "https://api-server-gilt-pi.vercel.app/";

router.post("/create-payment", async (req: Request, res: ExpressResponse) => {
  try {
    const { amount, amountXAF, currency, email, userId, username, phone, country, message } = req.body ?? {};

    const finalAmount = amountXAF ? Number(amountXAF) : Number(amount);
    if (!finalAmount || finalAmount < 100) {
      res.status(400).json({ success: false, error: "Montant minimum : 100 FCFA" });
      return;
    }
    if (!email && !userId) {
      res.status(400).json({ success: false, error: "Email ou userId requis" });
      return;
    }

    const API_BASE = (process.env.API_BASE_URL ?? "https://api-server-gilt-pi.vercel.app/").replace(/\/$/, "");
    const payload: Record<string, unknown> = {
      amount: finalAmount,
      email: email ?? `${userId}@sbh.local`,
      userId: String(userId ?? ""),
      username: username ?? email?.split("@")[0] ?? "user",
      country: (country ?? "CM").toUpperCase(),
      phone: phone ?? "",
      currency: currency ?? "XAF",
      message: message ?? "Rechargement Social Boost Horizon",
      callbackUrl: `${API_BASE}/api/webhook/swychr`,
    };

    const r: any = await fetch(`${INTL_PAYMENT_BACKEND}/create-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000),
    });

    const data = await r.json().catch(() => ({})) as Record<string, unknown>;

    if (!r.ok || data?.success === false) {
      res.status(r.ok ? 400 : r.status).json({
        success: false,
        error: String(data?.error ?? data?.message ?? "Erreur paiement international"),
      });
      return;
    }

    res.json({
      success: true,
      checkoutUrl: data.checkoutUrl ?? data.link,
      transId: data.transactionId ?? data.transId,
      transactionId: data.transactionId ?? data.transId,
      amount: data.amount ?? finalAmount,
      currency,
      country,
      phone,
    });
  } catch (e: any) {
    res.status(502).json({ success: false, error: "Paiement international inaccessible: " + (e?.message ?? "timeout") });
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

export default router;