import { Router } from "express";
import type { Request, Response as ExpressResponse } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getFirebaseAdmin } from "../lib/firebase-admin.js";
import { getFirestore } from "firebase-admin/firestore";
import mcKnowledge from "../knowledge/mc-knowledge.fr.md";
import { invalidateProfileCache } from "./me.js";
import { invalidateWalletCache } from "./wallet.js";
import { calculateProviderPriceXAF, getProviderPricingMode, type ProviderPricingMode } from "../lib/providerPricing.js";

const router: ReturnType<typeof Router> = Router();


// MC_BILLING_V1 — facturation et quota quotidien côté serveur.
// Le solde réel reste en XAF; le prix USD est un affichage approximatif uniquement.
const MC_USD_XAF_RATE = 585.5;
type McBillingReservation = {
  uid: string; requestId: string; dayKey: string; isFree: boolean;
  baseXAF: number; reservedXAF: number; startedAtMs: number; active: boolean;
};
function getMcDayKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return pick("year") + "-" + pick("month") + "-" + pick("day");
}
function estimateMcPrice(messageText: string, isComparison: boolean, hasServiceContext: boolean): { baseXAF: number; reserveXAF: number } {
  const text = String(messageText ?? "").trim();
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let baseXAF = 50;
  if (isComparison) baseXAF = 100;
  else if (hasServiceContext || /conseil|conseille|strategie|pourquoi|baisse|perte|garantie|refill|reappro|optimis|amelior|plan|explique|comprendre|information|condition/.test(normalized)) baseXAF = 75;
  if (text.length > 220) baseXAF = Math.max(baseXAF, 100);
  if (text.length > 500) baseXAF = Math.max(baseXAF, 125);
  if (text.length > 1000) baseXAF = 150;
  baseXAF = Math.max(50, Math.min(150, Math.round(baseXAF)));
  return { baseXAF, reserveXAF: Math.min(150, baseXAF + (baseXAF >= 100 ? 50 : 25)) };
}
function finalMcPrice(baseXAF: number, reserveXAF: number, durationMs: number): number {
  const timeSurcharge = durationMs < 2500 ? 0 : durationMs < 7000 ? 10 : durationMs < 15000 ? 25 : 50;
  return Math.max(50, Math.min(150, reserveXAF, baseXAF + timeSurcharge));
}
async function rollbackMcReservation(reservation: McBillingReservation): Promise<void> {
  if (!reservation.active) return;
  const db = getFirestore();
  const userRef = db.doc("users/" + reservation.uid);
  const dailyRef = userRef.collection("mcDailyUsage").doc(reservation.dayKey);
  const requestRef = userRef.collection("mcRequests").doc(reservation.requestId);
  await db.runTransaction(async (tx) => {
    const [userSnap, dailySnap, requestSnap] = await Promise.all([tx.get(userRef), tx.get(dailyRef), tx.get(requestRef)]);
    if (!requestSnap.exists) return;
    const requestData = requestSnap.data() ?? {};
    if (requestData.status !== "processing") return;
    const daily = dailySnap.data() ?? {};
    if (requestData.free === true) {
      if (daily.freeRequestId === reservation.requestId) tx.set(dailyRef, { freeUsed: false, freeRequestId: null, totalRequests: Math.max(0, (Number(daily.totalRequests) || 0) - 1), updatedAt: new Date().toISOString() }, { merge: true });
    } else if (userSnap.exists) {
      const balance = Math.max(0, Number(userSnap.data()?.balance ?? 0) || 0);
      const reserved = Math.max(0, Number(requestData.reservedXAF ?? reservation.reservedXAF) || 0);
      tx.update(userRef, { balance: balance + reserved });
      tx.set(dailyRef, {
        paidRequests: Math.max(0, (Number(daily.paidRequests) || 0) - 1),
        totalRequests: Math.max(0, (Number(daily.totalRequests) || 0) - 1), updatedAt: new Date().toISOString(),
      }, { merge: true });
    }
    tx.update(requestRef, { status: "failed_refunded", reservedXAF: 0, chargedXAF: 0, failedAt: new Date().toISOString() });
  });
  reservation.active = false;
  invalidateProfileCache(reservation.uid);
  invalidateWalletCache(reservation.uid);
}
async function settleMcReservation(reservation: McBillingReservation, durationMs: number): Promise<{
  chargedXAF: number; balanceXAF: number; freeRequestsRemaining: number; paidRequestsToday: number;
}> {
  const chargedXAF = reservation.isFree ? 0 : finalMcPrice(reservation.baseXAF, reservation.reservedXAF, durationMs);
  const db = getFirestore();
  const userRef = db.doc("users/" + reservation.uid);
  const dailyRef = userRef.collection("mcDailyUsage").doc(reservation.dayKey);
  const requestRef = userRef.collection("mcRequests").doc(reservation.requestId);
  const activityRef = db.collection("activites").doc("mc-" + reservation.uid + "-" + reservation.requestId);
  const result = await db.runTransaction(async (tx) => {
    const [userSnap, dailySnap, requestSnap] = await Promise.all([tx.get(userRef), tx.get(dailyRef), tx.get(requestRef)]);
    if (!userSnap.exists || !requestSnap.exists || requestSnap.data()?.status !== "processing") throw new Error("État de facturation Mč incohérent.");
    const daily = dailySnap.data() ?? {};
    const balance = Math.max(0, Number(userSnap.data()?.balance ?? 0) || 0);
    const refund = Math.max(0, reservation.reservedXAF - chargedXAF);
    const settledBalance = balance + refund;
    if (refund > 0) tx.update(userRef, { balance: settledBalance });
    tx.update(requestRef, { status: "completed", reservedXAF: 0, chargedXAF, durationMs, completedAt: new Date().toISOString(), pricingVersion: 1 });
    tx.set(dailyRef, { totalChargedXAF: Math.max(0, Number(daily.totalChargedXAF) || 0) + chargedXAF, updatedAt: new Date().toISOString() }, { merge: true });
    if (chargedXAF > 0) tx.set(activityRef, {
      userId: reservation.uid, type: "commande", label: "Demande à Mč", amount: chargedXAF,
      status: "completed", createdAt: new Date().toISOString(), source: "mc", mcRequestId: reservation.requestId, durationMs,
    });
    return { balanceXAF: settledBalance, freeRequestsRemaining: 0, paidRequestsToday: Math.max(0, Number(daily.paidRequests) || 0) };
  });
  reservation.active = false;
  invalidateProfileCache(reservation.uid);
  invalidateWalletCache(reservation.uid);
  return { chargedXAF, ...result };
}


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
const SMMWIZ_KEY = process.env.SMMWIZ_API_KEY             ?? "";
const SMMGEN_KEY = process.env.SMMGEN_API_KEY             ?? "";
const AFB_KEY    = process.env.ADVANCED_PROVIDER_API_KEY  ?? "";
const FAPSHI_USER   = process.env.FAPSHI_API_USER         ?? "";
const FAPSHI_SECRET = process.env.FAPSHI_SECRET_KEY       ?? "";

const EXO_BASE    = "https://exosupplier.com/api/v2";
const MTP_BASE    = "https://morethanpanel.com/api/v2";
const SMMWIZ_BASE = "https://smmwiz.com/api/v2";
const SMMGEN_BASE = "https://smmgen.com/api/v2";
const AFB_BASE    = "https://afriqueboost.com/api/v2";
const FAPSHI_BASE = "https://live.fapshi.com";

// Compatibilité temporaire : prix historique réservé aux anciennes versions mobiles.
const LEGACY_EXO_RATE_XAF = 1230;
const LEGACY_AUTO_RATE_XAF = 1845;
const LEGACY_AFB_RATE_XAF = 1;

// ═══════════════════════════════════════════════════════════════
//  IDEMPOTENCE — Cache en mémoire (TTL 10 min)
// ═══════════════════════════════════════════════════════════════
const idempotencyCache = new Map<string, { orderId: string; ts: number }>();
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

function checkIdempotency(uid: string, clientOrderId: string | undefined | null): string | null {
  if (!clientOrderId || typeof clientOrderId !== "string") return null;
  const key = `${uid}:${clientOrderId}`;
  const entry = idempotencyCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > IDEMPOTENCY_TTL_MS) {
    idempotencyCache.delete(key);
    return null;
  }
  return entry.orderId;
}

function storeIdempotency(uid: string, clientOrderId: string | undefined | null, orderId: string): void {
  if (!clientOrderId || typeof clientOrderId !== "string") return;
  idempotencyCache.set(`${uid}:${clientOrderId}`, { orderId, ts: Date.now() });
  if (idempotencyCache.size > 5000) {
    const now = Date.now();
    for (const [k, v] of idempotencyCache) {
      if (now - v.ts > IDEMPOTENCY_TTL_MS) idempotencyCache.delete(k);
    }
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of idempotencyCache) {
    if (now - v.ts > IDEMPOTENCY_TTL_MS) idempotencyCache.delete(k);
  }
}, 5 * 60 * 1000);

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
  salePriceXAF: number;
  pricingMode: ProviderPricingMode;
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
  _isTraffic?: boolean;
};

// ═══════════════════════════════════════════════════════════════
//  detectPlatform — 200+ plateformes, ordre strict, priorité traffic
// ═══════════════════════════════════════════════════════════════
function detectPlatform(svc: RawSvc): string {
  const raw = ((svc.name ?? "") + " " + (svc.category ?? "") + " " + (svc.network ?? ""))
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // ── TRAFFIC / SEO / Website en priorité ──
  const trafficKeywords = [
    "website traffic", "web traffic", "traffic from", "organic traffic",
    "google traffic", "seo traffic", "direct traffic", "referral traffic",
    "backlink", "seo service", "website visit", "web hit", "web impression",
    "keyword traffic", "search traffic", "social traffic", "adult traffic",
    "country traffic", "geo traffic", "mobile traffic", "desktop traffic",
    "web visitors", "website visitors", "hits from", "traffic package",
  ];
  if (trafficKeywords.some(kw => raw.includes(kw))) return "traffic";

  // ── Plateformes majeures ──
  if (raw.includes("instagram") || raw.includes("insta")) return "instagram";
  if (raw.includes("tiktok") || raw.includes("tik tok") || raw.includes("douyin")) return "tiktok";
  if (raw.includes("youtube") || raw.includes("youtu.be")) return "youtube";
  if (raw.includes("facebook") || raw.includes("fb.com") || raw.includes("fb watch") || raw.includes("fb page")) return "facebook";
  if (raw.includes("twitter") || raw.includes("x.com") || raw.includes("x/twitter") || raw.includes("tweet")) return "twitter";
  if (raw.includes("telegram") || raw.includes("t.me") || raw.includes("telegram.org")) return "telegram";
  if (raw.includes("whatsapp") || raw.includes("wa.me") || raw.includes("chat.whatsapp") || raw.includes("wa business")) return "whatsapp";

  // ── Réseaux sociaux secondaires ──
  if (raw.includes("threads")) return "threads";
  if (raw.includes("snapchat")) return "snapchat";
  if (raw.includes("linkedin")) return "linkedin";
  if (raw.includes("pinterest") || raw.includes("pin.it")) return "pinterest";
  if (raw.includes("reddit") || raw.includes("redd.it")) return "reddit";
  if (raw.includes("tumblr")) return "tumblr";
  if (raw.includes("quora")) return "quora";
  if (raw.includes("discord")) return "discord";
  if (raw.includes("clubhouse")) return "clubhouse";
  if (raw.includes("mastodon")) return "mastodon";
  if (raw.includes("bluesky") || raw.includes("bsky")) return "bluesky";
  if (raw.includes("truth social") || raw.includes("truthsocial")) return "truthsocial";
  if (raw.includes("vk") || raw.includes("vkontakte")) return "vk";
  if (raw.includes("ok.ru") || raw.includes("odnoklassniki")) return "okru";
  if (raw.includes("likee")) return "likee";
  if (raw.includes("kwai")) return "kwai";
  if (raw.includes("snack video") || raw.includes("snackvideo")) return "snackvideo";
  if (raw.includes("triller")) return "triller";

  // ── Streaming musical ──
  if (raw.includes("spotify")) return "spotify";
  if (raw.includes("soundcloud")) return "soundcloud";
  if (raw.includes("audiomack")) return "audiomack";
  if (raw.includes("boomplay")) return "boomplay";
  if (raw.includes("deezer")) return "deezer";
  if (raw.includes("apple music") || raw.includes("applemusic") || raw.includes("itunes")) return "applemusic";
  if (raw.includes("mixcloud")) return "mixcloud";
  if (raw.includes("shazam")) return "shazam";
  if (raw.includes("napster")) return "napster";
  if (raw.includes("tidal")) return "tidal";
  if (raw.includes("anghami")) return "anghami";
  if (raw.includes("jiosaavn")) return "jiosaavn";
  if (raw.includes("resso")) return "resso";
  if (raw.includes("gaana")) return "gaana";
  if (raw.includes("wynk")) return "wynk";

  // ── Streaming vidéo / Live ──
  if (raw.includes("twitch")) return "twitch";
  if (raw.includes("kick.com")) return "kick";
  if (raw.includes("trovo")) return "trovo";
  if (raw.includes("rumble")) return "rumble";
  if (raw.includes("odysee")) return "odysee";
  if (raw.includes("bitchute")) return "bitchute";
  if (raw.includes("dailymotion")) return "dailymotion";
  if (raw.includes("vimeo")) return "vimeo";
  if (raw.includes("rutube")) return "rutube";

  // ── Messagerie ──
  if (raw.includes("viber")) return "viber";
  if (raw.includes("line.me") || raw.includes("line app")) return "line";
  if (raw.includes("wechat") || raw.includes("weixin")) return "wechat";
  if (raw.includes("kakaotalk") || raw.includes("kakao")) return "kakaotalk";
  if (raw.includes("zalo")) return "zalo";
  if (raw.includes("signal")) return "signal";
  if (raw.includes("skype")) return "skype";

  // ── Rencontres ──
  if (raw.includes("tinder")) return "tinder";
  if (raw.includes("bumble")) return "bumble";
  if (raw.includes("badoo")) return "badoo";
  if (raw.includes("grindr")) return "grindr";
  if (raw.includes("hinge")) return "hinge";
  if (raw.includes("okcupid")) return "okcupid";
  if (raw.includes("plenty of fish") || raw.includes("pof ")) return "pof";
  if (raw.includes("tagged")) return "tagged";
  if (raw.includes("mamba")) return "mamba";

  // ── Gaming ──
  if (raw.includes("roblox") || raw.includes("robux")) return "roblox";
  if (raw.includes("pubg")) return "pubg";
  if (raw.includes("free fire") || raw.includes("freefire") || raw.includes("garena")) return "freefire";
  if (raw.includes("call of duty") || raw.includes("cod mobile")) return "callofduty";
  if (raw.includes("fortnite")) return "fortnite";
  if (raw.includes("minecraft")) return "minecraft";
  if (raw.includes("genshin")) return "genshin";
  if (raw.includes("honkai")) return "honkai";
  if (raw.includes("valorant")) return "valorant";
  if (raw.includes("league of legends")) return "leagueoflegends";
  if (raw.includes("dota")) return "dota";
  if (raw.includes("csgo") || raw.includes("cs2") || raw.includes("counter strike")) return "csgo";
  if (raw.includes("apex legends") || raw.includes("apex")) return "apexlegends";
  if (raw.includes("overwatch")) return "overwatch";
  if (raw.includes("rocket league")) return "rocketleague";
  if (raw.includes("clash of clans")) return "clashofclans";
  if (raw.includes("clash royale")) return "clashroyale";
  if (raw.includes("brawl stars")) return "brawlstars";
  if (raw.includes("hay day")) return "hayday";
  if (raw.includes("mobile legends") || raw.includes("mlbb")) return "mobilelegends";
  if (raw.includes("arena of valor")) return "arenaofvalor";
  if (raw.includes("wild rift")) return "wildrift";
  if (raw.includes("steam")) return "steam";
  if (raw.includes("xbox")) return "xbox";
  if (raw.includes("playstation") || raw.includes("psn") || raw.includes("ps4") || raw.includes("ps5")) return "playstation";
  if (raw.includes("nintendo") || raw.includes("switch")) return "nintendo";
  if (raw.includes("ubisoft")) return "ubisoft";
  if (raw.includes("epic games") || raw.includes("epicgames")) return "epicgames";
  if (raw.includes("riot games") || raw.includes("riot")) return "riotgames";
  if (raw.includes("battle.net") || raw.includes("blizzard")) return "blizzard";
  if (raw.includes("pokemon") || raw.includes("pokémon")) return "pokemon";
  if (raw.includes("fifa")) return "fifa";
  if (raw.includes("nba 2k") || raw.includes("nba2k")) return "nba2k";
  if (raw.includes("gta") || raw.includes("grand theft auto")) return "gta";
  if (raw.includes("among us") || raw.includes("amongus")) return "amongus";
  if (raw.includes("fall guys")) return "fallguys";

  // ── Streaming TV / Films ──
  if (raw.includes("netflix")) return "netflix";
  if (raw.includes("disney")) return "disneyplus";
  if (raw.includes("hulu")) return "hulu";
  if (raw.includes("prime video") || raw.includes("amazon prime")) return "primevideo";
  if (raw.includes("hbo")) return "hbo";
  if (raw.includes("apple tv") || raw.includes("appletv")) return "appletv";
  if (raw.includes("paramount")) return "paramount";
  if (raw.includes("peacock")) return "peacock";
  if (raw.includes("crunchyroll")) return "crunchyroll";
  if (raw.includes("funimation")) return "funimation";
  if (raw.includes("canal+") || raw.includes("canal plus")) return "canalplus";
  if (raw.includes("bein")) return "bein";
  if (raw.includes("dazn")) return "dazn";
  if (raw.includes("espn")) return "espn";
  if (raw.includes("sky sports")) return "skysports";
  if (raw.includes("fubotv") || raw.includes("fubo")) return "fubotv";
  if (raw.includes("youtube tv")) return "youtubetv";
  if (raw.includes("sling")) return "sling";
  if (raw.includes("philo")) return "philo";
  if (raw.includes("tubi")) return "tubi";
  if (raw.includes("pluto")) return "pluto";
  if (raw.includes("roku")) return "roku";
  if (raw.includes("plex")) return "plex";
  if (raw.includes("kodi")) return "kodi";

  // ── E-commerce ──
  if (raw.includes("amazon")) return "amazon";
  if (raw.includes("ebay")) return "ebay";
  if (raw.includes("etsy")) return "etsy";
  if (raw.includes("shopify")) return "shopify";
  if (raw.includes("aliexpress")) return "aliexpress";
  if (raw.includes("alibaba")) return "alibaba";
  if (raw.includes("wish")) return "wish";
  if (raw.includes("shopee")) return "shopee";
  if (raw.includes("lazada")) return "lazada";
  if (raw.includes("tokopedia")) return "tokopedia";
  if (raw.includes("mercado libre") || raw.includes("mercadolibre")) return "mercadolibre";
  if (raw.includes("flipkart")) return "flipkart";
  if (raw.includes("jumia")) return "jumia";
  if (raw.includes("avito")) return "avito";
  if (raw.includes("olx")) return "olx";
  if (raw.includes("wildberries")) return "wildberries";
  if (raw.includes("ozon")) return "ozon";

  // ── Cloud / Stockage ──
  if (raw.includes("dropbox")) return "dropbox";
  if (raw.includes("google drive") || raw.includes("gdrive")) return "googledrive";
  if (raw.includes("onedrive")) return "onedrive";
  if (raw.includes("mega.nz")) return "mega";
  if (raw.includes("turbobit")) return "turbobit";
  if (raw.includes("mediafire")) return "mediafire";
  if (raw.includes("1fichier")) return "1fichier";
  if (raw.includes("zippyshare")) return "zippyshare";

  // ── IA / Productivité ──
  if (raw.includes("chatgpt") || raw.includes("openai")) return "chatgpt";
  if (raw.includes("deepseek")) return "deepseek";
  if (raw.includes("claude") || raw.includes("anthropic")) return "claude";
  if (raw.includes("gemini") || raw.includes("bard")) return "gemini";
  if (raw.includes("canva")) return "canva";
  if (raw.includes("notion")) return "notion";
  if (raw.includes("grammarly")) return "grammarly";
  if (raw.includes("quillbot")) return "quillbot";
  if (raw.includes("midjourney")) return "midjourney";
  if (raw.includes("dall-e") || raw.includes("dalle")) return "dalle";
  if (raw.includes("stable diffusion")) return "stablediffusion";
  if (raw.includes("figma")) return "figma";
  if (raw.includes("adobe")) return "adobe";
  if (raw.includes("envato")) return "envato";
  if (raw.includes("flaticon")) return "flaticon";
  if (raw.includes("shutterstock")) return "shutterstock";
  if (raw.includes("freepik")) return "freepik";
  if (raw.includes("unsplash")) return "unsplash";
  if (raw.includes("pexels")) return "pexels";

  // ── Éducation ──
  if (raw.includes("duolingo")) return "duolingo";
  if (raw.includes("coursera")) return "coursera";
  if (raw.includes("udemy")) return "udemy";
  if (raw.includes("skillshare")) return "skillshare";
  if (raw.includes("masterclass")) return "masterclass";
  if (raw.includes("khan academy")) return "khanacademy";
  if (raw.includes("brilliant")) return "brilliant";
  if (raw.includes("codecademy")) return "codecademy";
  if (raw.includes("domestika")) return "domestika";

  // ── SaaS / Business ──
  if (raw.includes("microsoft") || raw.includes("windows") || raw.includes("office 365") || raw.includes("ms office")) return "microsoft";
  if (raw.includes("google workspace") || raw.includes("g suite")) return "googleworkspace";
  if (raw.includes("slack")) return "slack";
  if (raw.includes("zoom")) return "zoom";
  if (raw.includes("microsoft teams") || raw.includes("teams")) return "msteams";
  if (raw.includes("trello")) return "trello";
  if (raw.includes("asana")) return "asana";
  if (raw.includes("monday.com") || raw.includes("monday")) return "monday";
  if (raw.includes("clickup")) return "clickup";
  if (raw.includes("airtable")) return "airtable";
  if (raw.includes("zapier")) return "zapier";
  if (raw.includes("hubspot")) return "hubspot";
  if (raw.includes("salesforce")) return "salesforce";
  if (raw.includes("mailchimp")) return "mailchimp";
  if (raw.includes("brevo") || raw.includes("sendinblue")) return "brevo";
  if (raw.includes("convertkit")) return "convertkit";
  if (raw.includes("activecampaign")) return "activecampaign";

  // ── VPN / Sécurité ──
  if (raw.includes("nordvpn")) return "nordvpn";
  if (raw.includes("expressvpn")) return "expressvpn";
  if (raw.includes("surfshark")) return "surfshark";
  if (raw.includes("cyberghost")) return "cyberghost";
  if (raw.includes("private internet access") || raw.includes("pia vpn")) return "pia";
  if (raw.includes("protonvpn")) return "protonvpn";
  if (raw.includes("mullvad")) return "mullvad";
  if (raw.includes("kaspersky")) return "kaspersky";
  if (raw.includes("norton")) return "norton";
  if (raw.includes("mcafee")) return "mcafee";
  if (raw.includes("bitdefender")) return "bitdefender";
  if (raw.includes("avast")) return "avast";
  if (raw.includes("avg ")) return "avg";
  if (raw.includes("eset")) return "eset";
  if (raw.includes("malwarebytes")) return "malwarebytes";

  // ── Finance / Crypto ──
  if (raw.includes("binance")) return "binance";
  if (raw.includes("coinbase")) return "coinbase";
  if (raw.includes("kraken")) return "kraken";
  if (raw.includes("kucoin")) return "kucoin";
  if (raw.includes("bybit")) return "bybit";
  if (raw.includes("okx")) return "okx";
  if (raw.includes("bitget")) return "bitget";
  if (raw.includes("gate.io") || raw.includes("gateio")) return "gateio";
  if (raw.includes("huobi") || raw.includes("htx")) return "htx";
  if (raw.includes("crypto.com") || raw.includes("cryptocom")) return "cryptocom";
  if (raw.includes("metamask")) return "metamask";
  if (raw.includes("trust wallet") || raw.includes("trustwallet")) return "trustwallet";
  if (raw.includes("paypal")) return "paypal";
  if (raw.includes("stripe")) return "stripe";
  if (raw.includes("wise") || raw.includes("transferwise")) return "wise";
  if (raw.includes("revolut")) return "revolut";
  if (raw.includes("venmo")) return "venmo";
  if (raw.includes("cash app") || raw.includes("cashapp")) return "cashapp";
  if (raw.includes("zelle")) return "zelle";
  if (raw.includes("skrill")) return "skrill";
  if (raw.includes("neteller")) return "neteller";
  if (raw.includes("payoneer")) return "payoneer";
  if (raw.includes("paystack")) return "paystack";
  if (raw.includes("flutterwave")) return "flutterwave";
  if (raw.includes("mtn momo") || raw.includes("mtn mobile money")) return "mtnmomo";
  if (raw.includes("orange money")) return "orangemoney";
  if (raw.includes("wave")) return "wave";
  if (raw.includes("moov")) return "moov";

  // ── Emails ──
  if (raw.includes("gmail")) return "gmail";
  if (raw.includes("outlook") || raw.includes("hotmail")) return "outlook";
  if (raw.includes("yahoo")) return "yahoo";
  if (raw.includes("protonmail") || raw.includes("proton mail")) return "protonmail";
  if (raw.includes("zoho")) return "zoho";
  if (raw.includes("yandex")) return "yandex";
  if (raw.includes("gmx")) return "gmx";
  if (raw.includes("aol")) return "aol";

  // ── Développement ──
  if (raw.includes("github")) return "github";
  if (raw.includes("gitlab")) return "gitlab";
  if (raw.includes("bitbucket")) return "bitbucket";
  if (raw.includes("stackoverflow") || raw.includes("stack overflow")) return "stackoverflow";
  if (raw.includes("npm")) return "npm";
  if (raw.includes("docker")) return "docker";
  if (raw.includes("vercel")) return "vercel";
  if (raw.includes("netlify")) return "netlify";
  if (raw.includes("heroku")) return "heroku";
  if (raw.includes("aws") || raw.includes("amazon web services")) return "aws";
  if (raw.includes("azure")) return "azure";
  if (raw.includes("google cloud") || raw.includes("gcp")) return "googlecloud";

  // ── Avis / Freelance ──
  if (raw.includes("trustpilot")) return "trustpilot";
  if (raw.includes("sitejabber")) return "sitejabber";
  if (raw.includes("glassdoor")) return "glassdoor";
  if (raw.includes("indeed")) return "indeed";
  if (raw.includes("upwork")) return "upwork";
  if (raw.includes("fiverr")) return "fiverr";
  if (raw.includes("freelancer")) return "freelancer";
  if (raw.includes("toptal")) return "toptal";

  // ── Divers ──
  if (raw.includes("pandalive") || raw.includes("panda tv")) return "pandalive";
  if (raw.includes("liveme")) return "liveme";
  if (raw.includes("bigo")) return "bigo";
  if (raw.includes("kuaishou")) return "kuaishou";
  if (raw.includes("flipboard")) return "flipboard";
  if (raw.includes("9gag")) return "9gag";
  if (raw.includes("imgur")) return "imgur";
  if (raw.includes("ifunny")) return "ifunny";
  if (raw.includes("onlyfans")) return "onlyfans";
  if (raw.includes("fansly")) return "fansly";
  if (raw.includes("patreon")) return "patreon";
  if (raw.includes("ko-fi") || raw.includes("kofi")) return "kofi";
  if (raw.includes("buymeacoffee") || raw.includes("buy me a coffee")) return "buymeacoffee";
  if (raw.includes("depop")) return "depop";
  if (raw.includes("poshmark")) return "poshmark";
  if (raw.includes("vinted")) return "vinted";
  if (raw.includes("grailed")) return "grailed";
  if (raw.includes("stockx")) return "stockx";
  if (raw.includes("goat")) return "goat";

  return "other";
}

function formatService(raw: RawSvc, provider = "exo"): FormattedSvc {
  const rate    = parseFloat(String(raw.rate ?? "0")) || 0;
  const providerKey = provider;
  const pricingMode = getProviderPricingMode(providerKey, raw.type ?? "", raw.name ?? "");
  const legacyRateXAF = providerKey === "exo" ? LEGACY_EXO_RATE_XAF : providerKey === "afriqueboost" ? LEGACY_AFB_RATE_XAF : LEGACY_AUTO_RATE_XAF;
  const priceXAF = Math.round(rate * legacyRateXAF);
  const salePriceXAF = calculateProviderPriceXAF(rate, providerKey);
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

  const platform = detectPlatform(raw);
  const isTraffic = platform === "traffic";

  return {
    id:              raw.service,
    name:            raw.name ?? "",
    category:        raw.category ?? "",
    type:            raw.type ?? "Default",
    priceXAF,
    salePriceXAF,
    pricingMode,
    min,
    max,
    refill:          raw.refill ?? false,
    cancel:          raw.cancel ?? true,
    isPackage,
    isPerOne,
    isCustomComments,
    averageTime,
    description:     String(raw.description ?? ""),
    platform,
    _isTraffic:      isTraffic,
    _provider: providerKey,
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
  res?: ExpressResponse,
  extraParams?: Record<string, string>
): Promise<{ ok: boolean; orderId?: string; error?: string }> {
  try {
    const params: Record<string, string> = {
      key: apiKey,
      action: "add",
      service: String(serviceId),
      link,
      quantity: String(quantity),
      ...(extraParams ?? {}),
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
      data = ct.includes("json") ? await r.json() : JSON.parse(await r.text());
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
//  Mč — Assistant IA conversationnel (Groq)
//  La version mobile actuelle envoie uniquement quelques candidats précis.
//  catalogSummary reste accepté temporairement pour les anciennes versions.
// ═══════════════════════════════════════════════════════════════
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";

// MC_PROMPT_OPT_V2 — plafonds de contexte, cache opportuniste et sélection de connaissance.
const MC_CONTEXT_MAX_CHARS = 2200;
const MC_CACHE_TTL_MS = 30 * 60 * 1000;
const MC_CACHE_MAX_ENTRIES = 120;
const mcAnswerCache = new Map<string, { reply: string; expiresAt: number }>();

function normalizeMcCacheText(value: string): string {
  return String(value ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function selectRelevantMcKnowledge(question: string, maxChars = MC_CONTEXT_MAX_CHARS): string {
  const source = String(mcKnowledge ?? "");
  const sections = source.split(/(?=^##\s)/m).map((section) => section.trim()).filter(Boolean);
  if (!sections.length) return source.slice(0, maxChars);

  const stopWords = new Set(["avec", "dans", "pour", "comment", "pourquoi", "quelle", "quelles", "quel", "quels", "estce", "etre", "avoir", "faire", "plus", "moins", "cela", "cette", "celui", "client", "service", "services", "social", "boost", "horizon", "moi", "mon", "mes", "notre", "votre", "vous", "nous", "leurs", "elles", "eux", "sur", "que", "qui", "quoi", "quand", "donc", "alors", "aussi", "tres", "bien", "peut", "peux", "veux", "veut", "sont", "comme", "mais", "sans", "une", "des", "les", "aux", "par", "pas", "est", "son", "ses", "the", "and", "how", "what", "when", "with"]);
  const queryTerms = [...new Set(normalizeMcCacheText(question).split(" ").filter((word) => word.length >= 4 && !stopWords.has(word)))].slice(0, 24);

  const ranked = sections.map((section, index) => {
    const heading = (section.match(/^##+[^\n]*/m)?.[0] ?? "").toLowerCase();
    const normalizedSection = normalizeMcCacheText(section);
    let score = 0;
    for (const term of queryTerms) {
      if (heading.includes(term)) score += 5;
      const occurrences = normalizedSection.split(term).length - 1;
      score += Math.min(occurrences, 3);
    }
    // Fondations courtes, utiles même si la question emploie peu de mots métier.
    if (/^##\s*1[. ]/.test(heading)) score += 2;
    if (/^##\s*3[. ]/.test(heading)) score += 2;
    if (/^##\s*13[. ]/.test(heading)) score += 1;
    return { section, index, score };
  }).sort((a, b) => b.score - a.score || a.index - b.index);

  const chosen: string[] = [];
  let used = 0;
  for (const item of ranked) {
    if (chosen.length >= 4 || used >= maxChars) break;
    if (chosen.length > 0 && item.score === 0) continue;
    const remaining = maxChars - used;
    if (remaining < 180) break;
    const piece = item.section.length <= remaining ? item.section : item.section.slice(0, remaining).replace(/\s+\S*$/, "") + " …";
    if (piece.trim()) {
      chosen.push(piece);
      used += piece.length;
    }
  }
  if (!chosen.length) return source.slice(0, maxChars);
  return chosen.join("\n\n[... extrait pertinent ...]\n\n").slice(0, maxChars);
}

function getMcCachedAnswer(key: string | null): string | null {
  if (!key) return null;
  const entry = mcAnswerCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    mcAnswerCache.delete(key);
    return null;
  }
  // L'entrée est replacée en fin de Map pour appliquer une éviction LRU simple.
  mcAnswerCache.delete(key);
  mcAnswerCache.set(key, entry);
  return entry.reply;
}

function setMcCachedAnswer(key: string | null, reply: string): void {
  if (!key || !reply.trim()) return;
  mcAnswerCache.set(key, { reply, expiresAt: Date.now() + MC_CACHE_TTL_MS });
  while (mcAnswerCache.size > MC_CACHE_MAX_ENTRIES) {
    const oldestKey = mcAnswerCache.keys().next().value;
    if (oldestKey === undefined) break;
    mcAnswerCache.delete(oldestKey);
  }
}

function makeMcCacheKey(question: string): string | null {
  const normalized = normalizeMcCacheText(question);
  if (normalized.length < 12 || normalized.length > 220) return null;
  return "mc-prompt-opt-v2:" + normalized;
}

router.get("/mc/usage", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  try {
    getFirebaseAdmin();
    const db = getFirestore();
    const uid = req.uid!;
    const dayKey = getMcDayKey();
    const userRef = db.doc("users/" + uid);
    const dailyRef = userRef.collection("mcDailyUsage").doc(dayKey);
    const [userSnap, dailySnap] = await Promise.all([userRef.get(), dailyRef.get()]);
    if (!userSnap.exists) { res.status(404).json({ success: false, error: "Profil utilisateur introuvable." }); return; }
    const daily = dailySnap.data() ?? {};
    const user = userSnap.data() ?? {};
    res.json({ success: true, data: {
      dateKey: dayKey,
      freeRequestsRemaining: daily.freeUsed === true ? 0 : 1,
      paidRequestsToday: Math.max(0, Number(daily.paidRequests) || 0),
      balanceXAF: Math.max(0, Number(user.balance) || 0),
      usdXafRate: MC_USD_XAF_RATE,
    }});
  } catch (error) {
    console.error("[mc/usage] Erreur:", error);
    res.status(500).json({ success: false, error: "Impossible de vérifier le quota Mč." });
  }
});

router.post("/mc/chat", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  let mcBillingReservation: McBillingReservation | null = null;
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        success: false,
        error: "GROQ_API_KEY non configurée. Contactez l'administrateur.",
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const displayName = typeof body.displayName === "string" ? body.displayName.trim().split(/\s+/)[0].slice(0, 40) : "";
    const rawMessages = body.messages;
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      res.status(400).json({ success: false, error: "messages requis" });
      return;
    }

    const messages = rawMessages
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-4)
      .map((m: any) => ({ role: m.role as "user" | "assistant", content: String(m.content).trim().slice(0, 900) }))
      .filter((m: { role: string; content: string }) => m.content.length > 0);

    if (!messages.some((m: { role: string }) => m.role === "user")) {
      res.status(400).json({ success: false, error: "Un message utilisateur est requis." });
      return;
    }

    const boundedNumber = (value: unknown): number | null => {
      if (value === null || value === undefined || value === "") return null;
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    const boundedText = (value: unknown, max = 160): string =>
      typeof value === "string" ? value.trim().slice(0, max) : "";
    const boolOrNull = (value: unknown): boolean | null =>
      typeof value === "boolean" ? value : null;
    const hideMcSupplierNames = (value: string): string => value
      .replace(/\b(?:smm\s*wiz|smmwiz|mtp|exo|afrique\s*boost|afriqueboost|africa\s*boost|africaboost)\b/gi, "")
      .replace(/[|·:—–-]{2,}/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+([,.;:!?])/g, "$1")
      .trim();

    const sanitizeService = (value: unknown) => {
      if (!value || typeof value !== "object") return null;
      const s = value as Record<string, unknown>;
      const key = boundedText(s.key, 100).replace(/[^a-zA-Z0-9:_-]/g, "");
      const id = boundedText(s.id, 60);
      const name = boundedText(s.name, 180);
      if (!key || !name) return null;
      return {
        key,
        id,
        name: hideMcSupplierNames(name) || "Service du catalogue",
        platform: boundedText(s.platform, 80),
        category: boundedText(s.category, 80),
        type: boundedText(s.type, 60),
        priceXAF: boundedNumber(s.priceXAF),
        min: boundedNumber(s.min),
        max: boundedNumber(s.max),
        refill: boolOrNull(s.refill),
        cancel: boolOrNull(s.cancel),
        isPackage: boolOrNull(s.isPackage),
        isPerOne: boolOrNull(s.isPerOne),
        averageTime: boundedText(s.averageTime, 80),
        description: hideMcSupplierNames(boundedText(s.description, 260)),
      };
    };

    const rawCandidates = Array.isArray(body.candidateServices) ? body.candidateServices.slice(0, 6) : [];
    const candidateServices = rawCandidates.map(sanitizeService).filter(Boolean) as Array<NonNullable<ReturnType<typeof sanitizeService>>>;
    const serviceContext = sanitizeService(body.serviceContext);
    if (serviceContext && !candidateServices.some((s) => s.key === serviceContext.key)) {
      candidateServices.unshift(serviceContext);
    }
    const safeCandidates = candidateServices.slice(0, 6);

    // Utilisé uniquement par les anciennes versions mobiles pendant la transition.
    const legacyCatalog = typeof body.catalogSummary === "string" ? hideMcSupplierNames(body.catalogSummary.slice(0, 2200)) : "";
    const promptCandidates = safeCandidates.map((s, index) => ({
      ref: `candidate_${index + 1}`,
      id: s.id,
      name: s.name,
      platform: s.platform,
      category: s.category,
      type: s.type,
      priceXAF: s.priceXAF,
      min: s.min,
      max: s.max,
      refill: s.refill,
      cancel: s.cancel,
      isPackage: s.isPackage,
      isPerOne: s.isPerOne,
      description: s.description,
    }));
    const candidateJson = promptCandidates.length
      ? JSON.stringify(promptCandidates)
      : "Aucun candidat structuré envoyé par cette version de l'application.";
    const comparisonRefsInput = body.comparisonRefs;
    const requestedComparisonRefs: string[] = Array.isArray(comparisonRefsInput)
      ? [...new Set(comparisonRefsInput.filter((ref: unknown): ref is string =>
          typeof ref === "string" && promptCandidates.some((candidate) => candidate.ref === ref)))].slice(0, 2)
      : [];
    const comparisonCandidates = promptCandidates.filter((candidate) => requestedComparisonRefs.includes(candidate.ref));
    const comparisonJson = comparisonCandidates.length === 2
      ? JSON.stringify(comparisonCandidates)
      : "Aucune comparaison explicite de deux offres.";
    const serviceContextJson = serviceContext ? JSON.stringify({
      key: serviceContext.key, id: serviceContext.id, name: serviceContext.name,
      platform: serviceContext.platform, category: serviceContext.category, type: serviceContext.type,
      priceXAF: serviceContext.priceXAF, min: serviceContext.min, max: serviceContext.max,
      refill: serviceContext.refill, cancel: serviceContext.cancel, isPackage: serviceContext.isPackage,
      isPerOne: serviceContext.isPerOne, averageTime: serviceContext.averageTime, description: serviceContext.description,
    }) : "Aucun service unique n’a été explicitement sélectionné.";

    // Ce message reste strictement stable : Groq peut réutiliser son préfixe via le prompt caching automatique.
    const systemPrompt = `Tu es Mč, l’assistant de Social Boost Horizon (SBH). Réponds en français naturel, directement à la personne en la tutoyant. Tu es un conseiller compétent, humain, calme et précis, jamais un rapport technique. Réponds d’abord à la question réelle. Fais des paragraphes courts ; généralement 2 à 5 suffisent. Ne salue pas à chaque tour, ne répète pas le prénom et ne termine pas systématiquement par une question.

PÉRIMÈTRE ET FIABILITÉ
Tu aides à comprendre les services, les prix, les conditions, les commandes et les problèmes liés à Social Boost Horizon. Si une question sort du périmètre, précise brièvement ta spécialité mais aide quand même si une explication générale est utile et sûre. N’invente jamais de prix, de délai, de garantie, de qualité certifiée, de compatibilité ou de résultat. Une baisse d’interactions peut dépendre de la plateforme ; ne garantis jamais l’absence de baisse. Un badge de réapprovisionnement indique une possibilité soumise aux conditions et à la période prévues, pas une garantie absolue.

SERVICES ET RECOMMANDATIONS
Les fiches de services dans le contexte sont prioritaires sur tes connaissances générales. Lorsqu’un service est sélectionné, explique celui-là directement sans demander son nom ou son identifiant. Lorsqu’exactement deux offres sont fournies pour comparaison, compare uniquement ces deux offres dans l’ordre A puis B, explique la différence pratique et donne un conseil concret. Les références candidate_1, candidate_2, les identifiants numériques et toutes les clés techniques sont strictement internes : ne les affiche jamais. Ne montre une carte de service que si une offre est recherchée, recommandée ou réellement utile. Une demande d’explication, de définition, de dépannage ou de conseil ne déclenche pas automatiquement une liste d’offres. N’invente pas de ratio universel entre vues, likes et commentaires.

CONFIDENTIALITÉ COMMERCIALE
Ne révèle jamais les noms, abréviations, identifiants ni systèmes internes des fournisseurs. Parle uniquement des offres SBH. Traduis les termes de catalogue en conséquences simples pour le client ; signale une interprétation comme telle si le nom seul ne permet pas de l’affirmer.

FORMAT TECHNIQUE OBLIGATOIRE
À la fin, écris RECOMMENDATION_KEYS_JSON avec un tableau JSON de références candidate exactes, ou [] si aucune recommandation ne se justifie. Si seuls des éléments de catalogue hérités sont fournis sans candidats structurés, utilise RECOMMENDATIONS: [identifiants numériques exacts] uniquement lorsqu’une recommandation est réellement demandée. Écris également SUGGESTIONS_JSON avec 0 à 4 choix courts et utiles ; sinon []. Ces lignes sont internes et ne doivent jamais être présentées comme du texte visible. N’ajoute aucun commentaire après ces lignes.`;

    // Toutes les données variables sont après les consignes stables pour favoriser les préfixes de cache.
    const latestQuestion = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
    const selectedKnowledge = selectRelevantMcKnowledge(latestQuestion, MC_CONTEXT_MAX_CHARS);
    const dynamicPromptContext = `CONTEXTE VARIABLE POUR CETTE DEMANDE
PERSONNE À AIDER
${displayName ? "Prénom affiché : " + displayName + ". Utilise-le seulement si cela rend la réponse naturelle." : "Aucun prénom fourni."}

SERVICE EXPLICITEMENT SÉLECTIONNÉ
${serviceContextJson}

LES DEUX OFFRES À COMPARER
${comparisonJson}

CANDIDATS STRUCTURÉS DU CATALOGUE
Les clés candidate_1, candidate_2, etc. sont uniquement des références internes.
${candidateJson}

ANCIEN RÉSUMÉ DE CATALOGUE (compatibilité uniquement)
${legacyCatalog || "Aucun résumé transmis."}
N’utilise ce résumé que s’il apporte des éléments absents des candidats structurés, sans mélanger leurs identifiants.

EXTRAIT PERTINENT DE LA BASE MÉTIER SBH
${selectedKnowledge}`;



    // Identité et quota contrôlés exclusivement côté serveur.
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    if (!/^[A-Za-z0-9_-]{12,100}$/.test(requestId)) { res.status(400).json({ success: false, error: "Identifiant de demande invalide." }); return; }
    getFirebaseAdmin();
    const billingDb = getFirestore();
    const uid = req.uid!;
    const dayKey = getMcDayKey();
    const userRef = billingDb.doc("users/" + uid);
    const dailyRef = userRef.collection("mcDailyUsage").doc(dayKey);
    const requestRef = userRef.collection("mcRequests").doc(requestId);
    const lastUserText = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
    const isComparisonRequest = comparisonCandidates.length === 2 || requestedComparisonRefs.length === 2 || /compare|comparaison|difference|différence|comparer/i.test(lastUserText);
    const pricePlan = estimateMcPrice(lastUserText, isComparisonRequest, Boolean(serviceContext));
    const reservationResult: any = await billingDb.runTransaction(async (tx) => {
      const [userSnap, dailySnap, requestSnap] = await Promise.all([tx.get(userRef), tx.get(dailyRef), tx.get(requestRef)]);
      if (!userSnap.exists) return { kind: "missing_user" };
      if (requestSnap.exists) return { kind: "duplicate_request" };
      const user = userSnap.data() ?? {};
      const daily = dailySnap.data() ?? {};
      const balanceXAF = Math.max(0, Number(user.balance) || 0);
      const isFree = daily.freeUsed !== true;
      const reservedXAF = isFree ? 0 : pricePlan.reserveXAF;
      if (!isFree && balanceXAF < reservedXAF) return { kind: "insufficient_balance", balanceXAF };
      if (!isFree) tx.update(userRef, { balance: balanceXAF - reservedXAF });
      tx.set(dailyRef, {
        dateKey: dayKey, freeUsed: true, freeRequestId: isFree ? requestId : (daily.freeRequestId ?? null),
        paidRequests: (Number(daily.paidRequests) || 0) + (isFree ? 0 : 1),
        totalRequests: (Number(daily.totalRequests) || 0) + 1, updatedAt: new Date().toISOString(),
      }, { merge: true });
      tx.create(requestRef, {
        requestId, userId: uid, dateKey: dayKey, status: "processing", free: isFree,
        baseXAF: isFree ? 0 : pricePlan.baseXAF, reservedXAF, chargedXAF: 0, createdAt: new Date().toISOString(),
      });
      return { kind: "reserved", isFree, baseXAF: isFree ? 0 : pricePlan.baseXAF, reservedXAF };
    });
    if (reservationResult.kind === "missing_user") { res.status(404).json({ success: false, error: "Profil utilisateur introuvable." }); return; }
    if (reservationResult.kind === "duplicate_request") { res.status(409).json({ success: false, error: "Cette demande a déjà été traitée; elle ne sera pas débitée une seconde fois." }); return; }
    if (reservationResult.kind === "insufficient_balance") {
      res.status(402).json({ success: false, code: "MC_INSUFFICIENT_BALANCE", error: "Ton solde ne suffit pas pour cette demande. Aucune somme n'a été débitée. Recharge ton solde puis réessaie.", balanceXAF: reservationResult.balanceXAF });
      return;
    }
    mcBillingReservation = {
      uid, requestId, dayKey, isFree: reservationResult.isFree, baseXAF: reservationResult.baseXAF,
      reservedXAF: reservationResult.reservedXAF, startedAtMs: Date.now(), active: true,
    };
    if (!mcBillingReservation.isFree) { invalidateProfileCache(uid); invalidateWalletCache(uid); }

    // Cache de réponse très prudent : uniquement question isolée, sans service/catalogue/personnalisation.
    // Il est opportuniste (mémoire du processus) ; le prompt caching Groq reste automatique côté fournisseur.
    const cacheAllowed = messages.length === 1 && !displayName && !serviceContext && safeCandidates.length === 0
      && !legacyCatalog && requestedComparisonRefs.length === 0 && latestQuestion.length <= 220;
    const answerCacheKey = cacheAllowed ? makeMcCacheKey(latestQuestion) : null;
    const cachedReply = getMcCachedAnswer(answerCacheKey);
    let rawReply = "";
    let groqData: any = null;

    if (cachedReply) {
      rawReply = cachedReply;
      console.info("[mc/chat] Réponse servie depuis le cache mémoire.");
    } else {
      const groqMessages = [
        { role: "system" as const, content: systemPrompt },
        { role: "system" as const, content: dynamicPromptContext },
        ...messages,
      ];
      const groqPayload = {
        model: GROQ_MODEL,
        messages: groqMessages,
        temperature: 0.25,
        reasoning_effort: "low",
        include_reasoning: false,
        max_tokens: 500,
      };
      const serializedPayload = JSON.stringify(groqPayload);
      const payloadBytes = Buffer.byteLength(serializedPayload, "utf8");
      console.info("[mc/chat] prompt-size", JSON.stringify({ payloadBytes, contextChars: dynamicPromptContext.length, historyMessages: messages.length, maxOutputTokens: 500 }));
      if (payloadBytes > 28000) {
        throw new Error("Le contexte de Mč dépasse la taille de sécurité. Réduisez les données de catalogue envoyées.");
      }

      const groqRes = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: serializedPayload,
        signal: AbortSignal.timeout(20000),
      });

      if (!groqRes.ok) {
        const errText = await groqRes.text().catch(() => "");
        console.error("[mc/chat] Groq error:", groqRes.status, errText.slice(0, 500));
        if (groqRes.status === 413) throw new Error("La demande envoyée à Mč est trop volumineuse. Elle a été annulée sans frais ; réessaie avec une question plus courte.");
        if (groqRes.status === 429) throw new Error("Le service d’intelligence artificielle est temporairement très sollicité. Réessaie dans quelques instants.");
        throw new Error("Mč est temporairement indisponible.");
      }

      groqData = await groqRes.json() as any;
      rawReply = String(groqData?.choices?.[0]?.message?.content ?? "").trim();
      const usage = groqData?.usage;
      console.info("[mc/chat] token-usage", JSON.stringify({
        model: GROQ_MODEL,
        promptTokens: Number(usage?.prompt_tokens) || 0,
        cachedPromptTokens: Number(usage?.prompt_tokens_details?.cached_tokens) || 0,
        completionTokens: Number(usage?.completion_tokens) || 0,
        totalTokens: Number(usage?.total_tokens) || 0,
        payloadBytes,
      }));
      if (answerCacheKey && rawReply) setMcCachedAnswer(answerCacheKey, rawReply);
    }

    const allowedRefs = new Set(promptCandidates.map((s) => s.ref));
    const keyMatch = rawReply.match(/RECOMMENDATION_KEYS_JSON:\s*(\[[\s\S]*?\])/i);
    let recommendationRefs: string[] = [];
    if (keyMatch) {
      try {
        const parsed = JSON.parse(keyMatch[1]);
        if (Array.isArray(parsed)) {
          recommendationRefs = [...new Set(parsed
            .filter((v: unknown): v is string => typeof v === "string")
            .filter((ref: string) => allowedRefs.has(ref)))]
            .slice(0, 6);
        }
      } catch {
        recommendationRefs = [];
      }
    }
    // Les clés originales sont renvoyées pour compatibilité avec les anciennes OTA déjà installées.
    const recommendationKeys = recommendationRefs
      .map((ref) => promptCandidates.find((candidate) => candidate.ref === ref))
      .map((candidate) => candidate ? safeCandidates[promptCandidates.indexOf(candidate)]?.key : "")
      .filter((key): key is string => Boolean(key));

    const legacyMatch = rawReply.match(/RECOMMENDATIONS:\s*\[([^\]]*)\]/i);
    let legacyIds: number[] = [];
    if (legacyMatch) {
      legacyIds = legacyMatch[1]
        .split(",")
        .map((part: string) => Number.parseInt(part.trim(), 10))
        .filter((n: number) => Number.isSafeInteger(n) && n >= 0)
        .slice(0, 6);
    }

    const suggestionsMatch = rawReply.match(/SUGGESTIONS_JSON:\s*(\[[\s\S]*?\])/i);
    let suggestions: string[] = [];
    if (suggestionsMatch) {
      try {
        const parsedSuggestions = JSON.parse(suggestionsMatch[1]);
        if (Array.isArray(parsedSuggestions)) {
          suggestions = [...new Set(parsedSuggestions
            .filter((value: unknown): value is string => typeof value === "string")
            .map((value: string) => hideMcSupplierNames(value).slice(0, 90))
            .filter((value: string) => value.length > 0))].slice(0, 4);
        }
      } catch { suggestions = []; }
    }

    const cleanReply = hideMcSupplierNames(rawReply
      .replace(/RECOMMENDATION_KEYS_JSON:\s*\[[\s\S]*?\]/gi, "")
      .replace(/RECOMMENDATIONS:\s*\[[^\]]*\]/gi, "")
      .replace(/SUGGESTIONS_JSON:\s*\[[\s\S]*?\]/gi, "")
      .trim());

    if (!mcBillingReservation) throw new Error("Réservation de facturation manquante.");
    const mcDurationMs = Math.max(0, Date.now() - mcBillingReservation.startedAtMs);
    const mcChargedXAF = mcBillingReservation.isFree ? 0 : finalMcPrice(mcBillingReservation.baseXAF, mcBillingReservation.reservedXAF, mcDurationMs);
    const mcSettlement = await settleMcReservation(mcBillingReservation, mcDurationMs);
    mcBillingReservation.active = false;
    const mcBilling = {
      isFree: mcBillingReservation.isFree,
      chargedXAF: mcChargedXAF,
      chargedUSD: Number((mcChargedXAF / MC_USD_XAF_RATE).toFixed(2)),
      balanceXAF: mcSettlement.balanceXAF,
      freeRequestsRemaining: mcSettlement.freeRequestsRemaining,
      paidRequestsToday: mcSettlement.paidRequestsToday,
      durationMs: mcDurationMs,
      usdXafRate: MC_USD_XAF_RATE,
    };

    const idsFromKeys = recommendationKeys
      .map((key) => safeCandidates.find((s) => s.key === key)?.id ?? "")
      .map((id) => Number(id))
      .filter((id) => Number.isSafeInteger(id) && id >= 0);

    res.json({
      success: true,
      reply: cleanReply || "J'ai vérifié les informations disponibles, mais je n'ai pas assez d'éléments pour conclure davantage.",
      recommendationKeys,
      recommendationRefs: typeof recommendationRefs !== "undefined" ? recommendationRefs : [],
      suggestions,
      // Champ numérique conservé pour ne pas casser les anciennes versions mobiles.
      recommendations: legacyIds.length ? legacyIds : idsFromKeys,
      billing: mcBilling,
    });
  } catch (e: any) {
    if (mcBillingReservation?.active) {
      try { await rollbackMcReservation(mcBillingReservation); }
      catch (refundError) { console.error("[mc/chat] Remboursement de sécurité impossible:", refundError); }
    }
    console.error("[mc/chat] Erreur:", e?.message);
    const wasReserved = Boolean(mcBillingReservation);
    const errorText = String(e?.message ?? "");
    const isPayloadError = /trop volumineuse|taille de sécurité/i.test(errorText);
    const isRateLimitError = /temporairement très sollicité/i.test(errorText);
    const statusCode = wasReserved ? (isPayloadError ? 413 : isRateLimitError ? 429 : 502) : 500;
    res.status(statusCode).json({
      success: false,
      error: wasReserved && (isPayloadError || isRateLimitError)
        ? errorText + " Aucun frais n’est conservé pour cette tentative."
        : wasReserved
          ? "Mč est temporairement indisponible. La réservation a été annulée lorsque cela a été possible; vérifie ton solde avant de réessayer."
          : "Une erreur est survenue pendant la préparation de la demande Mč.",
    });
  }
});

// ═══════════════════════════════════════════════════════════════
//  SMM PANELS — Exo / MTP / SMMWiz / AfriqueBoost
// ═══════════════════════════════════════════════════════════════

router.get("/exo-services", async (_req: Request, res: ExpressResponse) => {
  try {
    const raw = await fetchServices(`${EXO_BASE}?key=${encodeURIComponent(EXO_KEY)}&action=services`);
    const svcs = raw.map((s) => formatService(s, "exo"));
    res.json({ success: true, platforms: groupByPlatform(svcs), services: svcs });
  } catch (e: any) {
    res.status(502).json({ success: false, error: "Fournisseur Exo inaccessible: " + e?.message });
  }
});

router.post("/order-exo", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  const { serviceId, link, quantity, comments, clientOrderId } = req.body ?? {};
  const uid = req.uid!;

  const cachedOrderId = checkIdempotency(uid, clientOrderId);
  if (cachedOrderId) {
    console.log(`[order-exo] Idempotent retry: user=${uid} clientId=${clientOrderId} → orderId=${cachedOrderId}`);
    res.json({ success: true, orderId: cachedOrderId, idempotent: true });
    return;
  }

  if (!serviceId || !link || !quantity) {
    res.status(400).json({ success: false, error: "serviceId, link et quantity sont requis" });
    return;
  }
  const check = await checkUserCanOrder(req.uid!);
  if (!check.allowed) {
    res.status(403).json({ success: false, error: check.errorMsg, code: check.errorCode });
    return;
  }
  const result = await smmPanelOrder(EXO_BASE, EXO_KEY, String(serviceId), String(link), Number(quantity), comments, undefined);
  if (result.ok && result.orderId) {
    storeIdempotency(uid, clientOrderId, result.orderId);
    res.json({ success: true, orderId: result.orderId });
  } else {
    res.status(400).json({ success: false, error: result.error || "Erreur inconnue" });
  }
});

router.get("/mtp/services", async (_req: Request, res: ExpressResponse) => {
  try {
    const raw = await fetchServices(`${MTP_BASE}?key=${encodeURIComponent(MTP_KEY)}&action=services`);
    const svcs = raw.map((s) => formatService(s, "mtp"));
    res.json({ success: true, platforms: groupByPlatform(svcs), services: svcs });
  } catch (e: any) {
    res.status(502).json({ success: false, error: "Fournisseur MTP inaccessible: " + e?.message });
  }
});

router.post("/mtp/order", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  const { serviceId, link, quantity, comments, clientOrderId } = req.body ?? {};
  const uid = req.uid!;

  const cachedOrderId = checkIdempotency(uid, clientOrderId);
  if (cachedOrderId) {
    console.log(`[mtp/order] Idempotent retry: user=${uid} clientId=${clientOrderId} → orderId=${cachedOrderId}`);
    res.json({ success: true, orderId: cachedOrderId, idempotent: true });
    return;
  }

  if (!serviceId || !link || !quantity) {
    res.status(400).json({ success: false, error: "serviceId, link et quantity sont requis" });
    return;
  }
  const check = await checkUserCanOrder(req.uid!);
  if (!check.allowed) {
    res.status(403).json({ success: false, error: check.errorMsg, code: check.errorCode });
    return;
  }
  const result = await smmPanelOrder(MTP_BASE, MTP_KEY, String(serviceId), String(link), Number(quantity), comments, undefined);
  if (result.ok && result.orderId) {
    storeIdempotency(uid, clientOrderId, result.orderId);
    res.json({ success: true, orderId: result.orderId });
  } else {
    res.status(400).json({ success: false, error: result.error || "Erreur inconnue" });
  }
});

router.get("/smmwiz/services", async (_req: Request, res: ExpressResponse) => {
  try {
    const raw = await fetchServices(`${SMMWIZ_BASE}?key=${encodeURIComponent(SMMWIZ_KEY)}&action=services`);
    const svcs = raw.map((s) => formatService(s, "smmwiz"));
    res.json({ success: true, platforms: groupByPlatform(svcs), services: svcs });
  } catch (e: any) {
    res.status(502).json({ success: false, error: "Fournisseur SMMWiz inaccessible: " + e?.message });
  }
});

router.post("/smmwiz/order", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  const { serviceId, link, quantity, comments, clientOrderId } = req.body ?? {};
  const uid = req.uid!;

  const cachedOrderId = checkIdempotency(uid, clientOrderId);
  if (cachedOrderId) {
    console.log(`[smmwiz/order] Idempotent retry: user=${uid} clientId=${clientOrderId} → orderId=${cachedOrderId}`);
    res.json({ success: true, orderId: cachedOrderId, idempotent: true });
    return;
  }

  if (!serviceId || !link || !quantity) {
    res.status(400).json({ success: false, error: "serviceId, link et quantity sont requis" });
    return;
  }
  const check = await checkUserCanOrder(req.uid!);
  if (!check.allowed) {
    res.status(403).json({ success: false, error: check.errorMsg, code: check.errorCode });
    return;
  }
  const result = await smmPanelOrder(SMMWIZ_BASE, SMMWIZ_KEY, String(serviceId), String(link), Number(quantity), comments, undefined);
  if (result.ok && result.orderId) {
    storeIdempotency(uid, clientOrderId, result.orderId);
    res.json({ success: true, orderId: result.orderId });
  } else {
    res.status(400).json({ success: false, error: result.error || "Erreur inconnue" });
  }
});

router.get("/afriqueboost/services", async (_req: Request, res: ExpressResponse) => {
  try {
    const raw = await fetchServices(`${AFB_BASE}?key=${encodeURIComponent(AFB_KEY)}&action=services`);
    const svcs = raw.map((s) => formatService(s, "afriqueboost"));
    res.json({ success: true, platforms: groupByPlatform(svcs), services: svcs });
  } catch (e: any) {
    res.status(502).json({ success: false, error: "Fournisseur Afriqueboost inaccessible: " + e?.message });
  }
});

router.post("/afriqueboost/order", requireAuth, async (req: AuthRequest, res: ExpressResponse) => {
  const { serviceId, link, quantity, comments, clientOrderId } = req.body ?? {};
  const uid = req.uid!;

  const cachedOrderId = checkIdempotency(uid, clientOrderId);
  if (cachedOrderId) {
    console.log(`[afriqueboost/order] Idempotent retry: user=${uid} clientId=${clientOrderId} → orderId=${cachedOrderId}`);
    res.json({ success: true, orderId: cachedOrderId, idempotent: true });
    return;
  }

  if (!serviceId || !link || !quantity) {
    res.status(400).json({ success: false, error: "serviceId, link et quantity sont requis" });
    return;
  }
  const check = await checkUserCanOrder(req.uid!);
  if (!check.allowed) {
    res.status(403).json({ success: false, error: check.errorMsg, code: check.errorCode });
    return;
  }
  const result = await smmPanelOrder(AFB_BASE, AFB_KEY, String(serviceId), String(link), Number(quantity), comments, undefined);
  if (result.ok && result.orderId) {
    storeIdempotency(uid, clientOrderId, result.orderId);
    res.json({ success: true, orderId: result.orderId });
  } else {
    res.status(400).json({ success: false, error: result.error || "Erreur inconnue" });
  }
});

// ── Catalogue automatique fusionné : MTP + SMMWiz ──
router.get("/services/auto", async (_req: Request, res: ExpressResponse) => {
  try {
    const [mtpRes, smmwizRes] = await Promise.allSettled([
      fetchServices(`${MTP_BASE}?key=${encodeURIComponent(MTP_KEY)}&action=services`),
      fetchServices(`${SMMWIZ_BASE}?key=${encodeURIComponent(SMMWIZ_KEY)}&action=services`),
    ]);

    let allServices: FormattedSvc[] = [];
    const providers: string[] = [];

    if (mtpRes.status === "fulfilled") {
      allServices = allServices.concat(mtpRes.value.map((s) => formatService(s, "mtp")));
      if (mtpRes.value.length > 0) providers.push("MTP");
    }
    if (smmwizRes.status === "fulfilled") {
      allServices = allServices.concat(smmwizRes.value.map((s) => formatService(s, "smmwiz")));
      if (smmwizRes.value.length > 0) providers.push("SMMWiz");
    }

    if (allServices.length === 0) {
      const raw = await fetchServices(`${EXO_BASE}?key=${encodeURIComponent(EXO_KEY)}&action=services`);
      const svcs = raw.map((s) => formatService(s, "exo"));
      res.json({ success: true, platforms: groupByPlatform(svcs), services: svcs, providers: ["Exo"] });
      return;
    }

    res.json({ success: true, platforms: groupByPlatform(allServices), services: allServices, providers });
  } catch (e: any) {
    res.status(502).json({ success: false, error: "Fournisseur inaccessible: " + e?.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  ROUTES DE COMPATIBILITÉ LEGACY
// ═══════════════════════════════════════════════════════════════

router.get("/smmgen/services", async (_req: Request, res: ExpressResponse) => {
  try {
    const raw = await fetchServices(`${SMMWIZ_BASE}?key=${encodeURIComponent(SMMWIZ_KEY)}&action=services`);
    const svcs = raw.map((s) => formatService(s, "smmwiz"));
    res.json({ success: true, platforms: groupByPlatform(svcs), services: svcs });
  } catch (e: any) {
    res.status(502).json({ success: false, error: "Catalogue indisponible: " + e?.message });
  }
});

router.post("/smmgen/order", requireAuth, async (_req: AuthRequest, res: ExpressResponse) => {
  res.status(410).json({
    success: false,
    error: "SMMGen n'est plus un fournisseur actif. Veuillez mettre à jour l'application.",
  });
});

// ═══════════════════════════════════════════════════════════════
//  FAPSHI — Paiement Mobile Money Cameroun
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
//  ACCOUNTPE / SWYCHR — Mobile Money international
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

    const host = (req.headers["x-forwarded-host"] as string) || (req.headers.host as string) || "";
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
//  NELSIUSPAY — Paiement carte bancaire Visa/Mastercard
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