import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import StarBackground from "@/components/StarBackground";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useOrders } from "@/context/OrdersContext";
import { COUNTRIES, formatCurrency } from "@/lib/countries";
import { BASE_URL } from "@/services/api";
import { getFreshToken } from "@/services/tokenStore";

// ─── AsyncStorage (fallback silencieux si absent) ───
let AsyncStorageModule: any = null;
try {
  AsyncStorageModule = require("@react-native-async-storage/async-storage").default;
} catch {
  AsyncStorageModule = null;
}

// ═══════════════════════════════════════════════════════════════
//  CHARTE
// ═══════════════════════════════════════════════════════════════
const NAVY        = "#0A1C3A";
const NAVY_LIGHT  = "#152E54";
const GOLD        = "#D4AF37";
const GOLD_SOFT   = "#C6A15B";
const GOLD_BG     = "rgba(212,175,55,0.10)";
const GOLD_BORDER = "rgba(212,175,55,0.32)";

const LIGHT_BG        = "#F7F5F0";
const LIGHT_SURFACE   = "#FFFFFF";
const LIGHT_TEXT      = "#1A202C";
const LIGHT_TEXT_2    = "#718096";
const LIGHT_BORDER    = "rgba(10,28,58,0.08)";
const LIGHT_INPUT_BG  = "#F5F6F8";
const LIGHT_ICON_BG   = "rgba(10,28,58,0.05)";
const LIGHT_ICON_BORD = "rgba(10,28,58,0.08)";

const DARK_BG         = "#0B132B";
const DARK_SURFACE    = "#1C2541";
const DARK_SURFACE_2  = "#232F52";
const DARK_TEXT       = "#F8F9FA";
const DARK_TEXT_2     = "#A0AEC0";
const DARK_BORDER     = "rgba(255,255,255,0.08)";
const DARK_INPUT_BG   = "rgba(255,255,255,0.04)";
const DARK_ICON_BG    = "rgba(212,175,55,0.12)";
const DARK_ICON_BORD  = "rgba(212,175,55,0.26)";

const SUCCESS = "#10B981";
const WARNING = "#F59E0B";
const INFO    = "#3B82F6";
const DANGER  = "#EF4444";

// ═══════════════════════════════════════════════════════════════
//  AsyncStorage helpers
// ═══════════════════════════════════════════════════════════════
const STORAGE_KEYS = {
  favorites: "@sbh/order/favorites",
  recentServices: "@sbh/order/recentServices",
  platformHistory: "@sbh/order/platformHistory",
} as const;

async function storageGet<T>(key: string, fallback: T): Promise<T> {
  if (!AsyncStorageModule) return fallback;
  try {
    const raw = await AsyncStorageModule.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
async function storageSet<T>(key: string, value: T): Promise<void> {
  if (!AsyncStorageModule) return;
  try {
    await AsyncStorageModule.setItem(key, JSON.stringify(value));
  } catch {}
}

// ═══════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════
interface ExoService {
  id: string | number;
  name: string;
  category?: string;
  priceXAF: number;
  originalPriceXAF?: number;
  min: number;
  max: number;
  averageTime?: string;
  isPackage?: boolean;
  isPerOne?: boolean;
  isCustomComments?: boolean;
  type?: string;
  _rawCategory?: string;
  _provider?: string;
}

interface PlatformData {
  key: string;
  label: string;
  iconUrl: string;
  color: string;
  services: ExoService[];
}

interface FavoriteEntry {
  service: ExoService;
  platformKey: string;
  platformLabel: string;
  platformIconUrl: string;
  platformColor: string;
  orderTypeKey: string;
  addedAt: number;
}

interface RecentEntry {
  service: ExoService;
  platformKey: string;
  platformLabel: string;
  platformIconUrl: string;
  platformColor: string;
  orderTypeKey: string;
  lastOrderedAt: number;
  count: number;
}

interface PlatformHistory {
  [platformKey: string]: { count: number; lastUsedAt: number };
}

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════
function isCustomCommentsService(svc: ExoService): boolean {
  if (svc.isCustomComments) return true;
  const n = svc.name.toLowerCase();
  const t = (svc.type ?? "").toLowerCase();
  if (n.includes("| random |")) return false;
  return (
    n.includes("| custom |") ||
    n.includes("custom comment") ||
    n.includes("commentaires personnalisés") ||
    n.includes("your comments") ||
    t === "custom comments"
  );
}

function isAccountSaleService(svc: ExoService): boolean {
  const n = svc.name.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "'");
  const t = (svc.type ?? "").toLowerCase();
  const keywords = [
    "chatgpt", "deepseek", "openai", "canva premium", "canva pro",
    "paypal", "github pro", "github copilot",
    "tiktok account", "compte tiktok",
    "compte partage", "compte partag\u00e9",
    "acces premium", "acc\u00e8s premium",
    "netflix account", "netflix partage",
    "spotify account", "spotify premium",
    "adobe premium", "adobe account",
    "duolingo", "grammarly", "nordvpn", "expressvpn",
    "midjourney", "notion premium",
  ];
  if (keywords.some((kw) => n.includes(kw))) return true;
  if (t === "account" || t === "accounts" || t === "comptes") return true;
  if ((n.includes("compte") || n.includes("account") || n.includes("acc\u00e8s")) &&
      (n.includes("partag") || n.includes("premium") || n.includes("pro") || n.includes("plus"))) return true;
  if (svc.min === 1 && svc.max === 1) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════════
//  Traduction FR — dictionnaire des termes SMM courants
// ═══════════════════════════════════════════════════════════════
const TRANSLATION_MAP: Array<[RegExp, string]> = [
  [/\bFollowers?\b/gi, "Abonnés"],
  [/\bSubscribers?\b/gi, "Abonnés"],
  [/\bMembers?\b/gi, "Membres"],
  [/\bLikes?\b/gi, "J'aime"],
  [/\bViews?\b/gi, "Vues"],
  [/\bComments?\b/gi, "Commentaires"],
  [/\bShares?\b/gi, "Partages"],
  [/\bSaves?\b/gi, "Sauvegardes"],
  [/\bRetweets?\b/gi, "Retweets"],
  [/\bReposts?\b/gi, "Reposts"],
  [/\bStory Views?\b/gi, "Vues story"],
  [/\bStory\b/gi, "Story"],
  [/\bReels?\b/gi, "Reels"],
  [/\bShorts?\b/gi, "Shorts"],
  [/\bPosts?\b/gi, "Publications"],
  [/\bVideos?\b/gi, "Vidéos"],
  [/\bLive\b/gi, "En direct"],
  [/\bLive Stream\b/gi, "Live stream"],
  [/\bViewers?\b/gi, "Téléspectateurs"],
  [/\bPlays?\b/gi, "Lectures"],
  [/\bStreams?\b/gi, "Streams"],
  [/\bInstant\b/gi, "Instantané"],
  [/\bAutomatic\b/gi, "Automatique"],
  [/\bAuto\b/gi, "Automatique"],
  [/\bManual\b/gi, "Manuel"],
  [/\bFast\b/gi, "Rapide"],
  [/\bSlow\b/gi, "Lent"],
  [/\bSpeed\b/gi, "Vitesse"],
  [/\bHigh Quality\b/gi, "Haute qualité"],
  [/\bHQ\b/g, "HQ"],
  [/\bPremium\b/gi, "Premium"],
  [/\bQuality\b/gi, "Qualité"],
  [/\bReal\b/gi, "Réels"],
  [/\bActive\b/gi, "Actifs"],
  [/\bGuaranteed?\b/gi, "Garanti"],
  [/\bRefill\b/gi, "Recharge"],
  [/\bDrip[-\s]?Feed\b/gi, "Progressif"],
  [/\bNon[-\s]?Drop\b/gi, "Non-drop"],
  [/\bCustom Comments?\b/gi, "Commentaires personnalisés"],
  [/\bRandom Comments?\b/gi, "Commentaires aléatoires"],
  [/\bWorldwide\b/gi, "Mondial"],
  [/\bGlobal\b/gi, "Global"],
  [/\bCountry Target\b/gi, "Ciblage pays"],
  [/\bTarget\b/gi, "Ciblage"],
  [/\bProfile\b/gi, "Profil"],
  [/\bAccount\b/gi, "Compte"],
  [/\bCheap\b/gi, "Économique"],
  [/\bBest\b/gi, "Meilleur"],
  [/\bTop\b/gi, "Top"],
  [/\bUltra\b/gi, "Ultra"],
  [/\bSuper\b/gi, "Super"],
  [/\bMax\b/gi, "Max"],
  [/\bMin\b/gi, "Min"],
  [/\bUSA\b/g, "USA"],
  [/\bUK\b/g, "UK"],
  [/\bArab\b/gi, "Arabes"],
  [/\bAsia\b/gi, "Asie"],
  [/\bAfrican?\b/gi, "Africain"],
  [/\bEurope\b/gi, "Europe"],
  [/\bFrance\b/gi, "France"],
  [/\bIndia\b/gi, "Inde"],
  [/\bBrazil\b/gi, "Brésil"],
  [/\bDaily\b/gi, "Quotidien"],
  [/\bWeekly\b/gi, "Hebdomadaire"],
  [/\bMonthly\b/gi, "Mensuel"],
  [/\bLifetime\b/gi, "À vie"],
  [/\bBest Price\b/gi, "Meilleur prix"],
  [/\bSplit\b/gi, "Répartition"],
  [/\bOld Post\b/gi, "Ancienne publication"],
  [/\bNew Post\b/gi, "Nouvelle publication"],
  [/\bCheapest\b/gi, "Moins cher"],
  [/\bWorking\b/gi, "Fonctionnel"],
  [/\bWorking Guaranteed\b/gi, "Garanti fonctionnel"],
];

function translateServiceName(name: string): string {
  let result = name;
  for (const [regex, replacement] of TRANSLATION_MAP) {
    result = result.replace(regex, replacement);
  }
  return result;
}

function hasEnglishTerms(name: string): boolean {
  const l = name.toLowerCase();
  const englishWords = ["followers", "likes", "views", "comments", "shares", "subscribers", "premium", "instant", "fast", "quality", "guaranteed", "refill", "automatic", "accounts", "daily", "worldwide", "cheapest"];
  return englishWords.some((w) => l.includes(w));
}

// ═══════════════════════════════════════════════════════════════
//  Order types — NOUVEAU : descriptions corrigées & badges neutralisés
// ═══════════════════════════════════════════════════════════════
const ORDER_TYPES = [
  {
    key: "standard",
    label: "Commande Standard",
    shortLabel: "Standard",
    icon: "shopping-cart" as const,
    description:
      "Une sélection de services choisis pour leur fiabilité. Tous les services de cette catégorie fonctionnent parfaitement et couvrent les besoins les plus courants.",
    color: "#1E90FF",
    gradient: ["#1E90FF", "#0066CC"] as [string, string],
    tagline: "Sélection fiable · Les plus utilisés",
  },
  {
    key: "automatique",
    label: "Commande Automatique",
    shortLabel: "Automatique",
    icon: "zap" as const,
    description:
      "Plus de 12 000 services disponibles. Un choix immense : vous trouverez forcément le service exact qu'il vous faut.",
    color: "#00C853",
    gradient: ["#00C853", "#009624"] as [string, string],
    tagline: "Plus de 12 000 services au choix",
  },
  {
    key: "revendeur",
    label: "Espace Revendeur",
    shortLabel: "Revendeur",
    icon: "award" as const,
    description:
      "Les mêmes services que la catégorie Standard, mais avec une réduction sur chaque commande. Pensé pour ceux qui revendent à leurs propres clients.",
    color: "#D4AF37",
    gradient: ["#FFD700", "#D4AF37"] as [string, string],
    tagline: "Mêmes services · Prix réduits",
  },
  {
    key: "avancee",
    label: "Commande Avancée",
    shortLabel: "Avancées",
    icon: "star" as const,
    description:
      "Un ensemble de services davantage orientés Afrique et services originaux, plus ciblés. Ce nom ne signifie pas que les services sont meilleurs que ceux des autres catégories.",
    color: "#FF6B35",
    gradient: ["#FF6B35", "#CC4A1A"] as [string, string],
    tagline: "Services ciblés · Focus Afrique",
  },
];

const RESELLER_LEVELS = [
  { name: "Starter",  discount: 3,  orders: 0,    maxOrders: 9,    color: "#78909C", icon: "trending-up" as const },
  { name: "Bronze",   discount: 5,  orders: 10,   maxOrders: 49,   color: "#CD7F32", icon: "award" as const },
  { name: "Argent",   discount: 10, orders: 50,   maxOrders: 199,  color: "#9E9E9E", icon: "award" as const },
  { name: "Or",       discount: 15, orders: 200,  maxOrders: 499,  color: "#FFC107", icon: "star" as const },
  { name: "Platine",  discount: 20, orders: 500,  maxOrders: 999,  color: "#00BCD4", icon: "star" as const },
  { name: "Diamant",  discount: 25, orders: 1000, maxOrders: Infinity, color: "#E91E63", icon: "hexagon" as const },
];

function generateServiceDescription(svcName: string, platform: string): {
  what: string; desc: string; linkType: string; howItWorks: string; warning?: string; quality: string[];
} {
  const n = svcName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['']/g, "'");
  const plt = platform || "la plateforme";
  const isLive = n.includes("live") || n.includes("en direct");
  const isStory = n.includes("story") || n.includes("stories");
  const isReel = n.includes("reel");
  const isShort = n.includes("short");
  const isVideo = n.includes("video") || n.includes("clip");
  const isPost = n.includes("post") || n.includes("publication");
  const quality: string[] = [];
  if (n.includes("premium")) quality.push("Premium");
  if (n.includes("hq") || n.includes("high quality") || n.includes("haute")) quality.push("Haute qualité");
  if (n.includes("reel") && n.includes("non") && n.includes("drop")) quality.push("Non-drop");
  if (n.includes("instant")) quality.push("Livraison instantanée");
  if (n.includes("garanti") || n.includes("guarantee")) quality.push("Garanti");
  const target = isStory ? "story" : isReel ? "reel" : isShort ? "Short" : isVideo ? "vidéo" : isPost ? "publication" : "contenu";

  if (isLive && (n.includes("viewer") || n.includes("spectateur"))) {
    return { what: "Téléspectateurs en direct", desc: `Envoie des téléspectateurs sur votre live ${plt}, augmentant votre compteur visible en temps réel. Plus votre live semble populaire, plus il est suggéré.`, linkType: "Lien de votre LIVE en cours (pas une vidéo déjà publiée)", howItWorks: "Lancez votre live AVANT de passer la commande, puis collez le lien direct de la diffusion.", warning: "Ne fonctionne QUE sur un live actif. Vérifiez que votre live est bien démarré avant de commander.", quality };
  }
  if (n.includes("follower") || n.includes("abonn") || n.includes("subscriber") || n.includes("fans") || n.includes("membre") || n.includes("watch")) {
    return { what: "Abonnés / Followers", desc: `Ajoute des abonnés ${plt} sur votre compte, améliorant votre crédibilité et votre visibilité.`, linkType: `URL de votre profil ${plt} (assurez-vous qu'il est PUBLIC)`, howItWorks: "Rendez votre compte public avant de commander, puis collez le lien de votre profil.", warning: "Compte PRIVÉ non supporté. Rendez votre profil public avant de passer la commande.", quality };
  }
  if (n.includes("like") || n.includes("j'aime") || n.includes("jaime") || n.includes("heart") || n.includes("coeur")) {
    return { what: `Likes / J'aime sur votre ${target}`, desc: `Augmente le nombre de likes sur votre ${target} ${plt}. Plus de likes = meilleure visibilité dans l'algorithme.`, linkType: `URL directe de votre ${target} ${plt}`, howItWorks: `Copiez le lien direct de votre ${target} et collez-le ici. Les likes arrivent progressivement.`, quality };
  }
  if (n.includes("view") || n.includes("vue") || n.includes("visionnage") || n.includes("impression")) {
    return { what: `Vues / Visionnages`, desc: `Augmente le compteur de vues de votre ${target} ${plt}. Plus de vues booste votre contenu dans les recommandations.`, linkType: `URL directe de votre ${target}`, howItWorks: "Collez le lien direct de votre contenu. Le compteur augmente progressivement.", quality };
  }
  if (n.includes("commentaire") || n.includes("comment")) {
    const isCustom = n.includes("personnalis") || n.includes("custom");
    return { what: isCustom ? "Commentaires personnalisés" : "Commentaires", desc: isCustom ? `Publie vos propres commentaires sur votre ${target} ${plt}. Chaque ligne = un commentaire unique.` : `Ajoute des commentaires sur votre ${target} ${plt} pour booster l'engagement.`, linkType: `URL directe de votre ${target}`, howItWorks: isCustom ? "Entrez chaque commentaire sur une ligne séparée. Minimum 10 commentaires." : "Les commentaires sont postés progressivement sur votre contenu.", quality };
  }
  if (n.includes("partage") || n.includes("share") || n.includes("retweet") || n.includes("repost")) {
    return { what: "Partages / Retweets", desc: `Génère des partages de votre ${target} ${plt}, augmentant sa portée à de nouvelles audiences.`, linkType: `URL directe de votre ${target}`, howItWorks: "Votre contenu sera partagé progressivement, attirant de nouveaux spectateurs.", quality };
  }
  if (n.includes("save") || n.includes("enregistr") || n.includes("bookmark")) {
    return { what: "Enregistrements / Sauvegardes", desc: `Ajoute des sauvegardes à votre ${target} ${plt}. Signal puissant pour l'algorithme.`, linkType: `URL directe de votre ${target}`, howItWorks: "Collez le lien de votre contenu.", quality };
  }
  if (n.includes("play") || n.includes("ecoute") || n.includes("stream") || n.includes("lecture")) {
    return { what: "Lectures / Streams", desc: `Augmente le nombre de lectures/streams de votre contenu sur ${plt}.`, linkType: "URL directe de votre morceau/podcast/contenu", howItWorks: "Collez le lien direct de votre contenu audio/vidéo.", quality };
  }
  return { what: "Service de promotion", desc: `Service SMM pour booster votre présence sur ${plt}.`, linkType: "URL de votre page ou contenu", howItWorks: "Fournissez le lien direct de votre contenu et passez la commande.", quality };
}

const PLATFORM_META: Record<string, { label: string; iconUrl: string; color: string }> = {
  instagram:   { label: "Instagram",    iconUrl: "https://img.icons8.com/color/96/instagram-new.png",            color: "#E1306C" },
  tiktok:      { label: "TikTok",       iconUrl: "https://img.icons8.com/color/96/tiktok.png",                   color: "#69C9D0" },
  youtube:     { label: "YouTube",      iconUrl: "https://img.icons8.com/color/96/youtube-play.png",             color: "#FF0000" },
  facebook:    { label: "Facebook",     iconUrl: "https://img.icons8.com/color/96/facebook-new.png",             color: "#1877F2" },
  twitter:     { label: "Twitter / X",  iconUrl: "https://img.icons8.com/color/96/twitter--v1.png",              color: "#1DA1F2" },
  telegram:    { label: "Telegram",     iconUrl: "https://img.icons8.com/color/96/telegram-app.png",             color: "#0088CC" },
  whatsapp:    { label: "WhatsApp",     iconUrl: "https://img.icons8.com/color/96/whatsapp--v1.png",             color: "#25D366" },
  threads:     { label: "Threads",      iconUrl: "https://img.icons8.com/ios-filled/96/threads.png",             color: "#878787" },
  snapchat:    { label: "Snapchat",     iconUrl: "https://img.icons8.com/color/96/snapchat.png",                 color: "#FFFC00" },
  linkedin:    { label: "LinkedIn",     iconUrl: "https://img.icons8.com/color/96/linkedin.png",                 color: "#0A66C2" },
  pinterest:   { label: "Pinterest",    iconUrl: "https://img.icons8.com/color/96/pinterest.png",                color: "#E60023" },
  reddit:      { label: "Reddit",       iconUrl: "https://img.icons8.com/color/96/reddit.png",                   color: "#FF4500" },
  tumblr:      { label: "Tumblr",       iconUrl: "https://img.icons8.com/color/96/tumblr--v1.png",               color: "#35465C" },
  quora:       { label: "Quora",        iconUrl: "https://img.icons8.com/color/96/quora.png",                    color: "#B92B27" },
  discord:     { label: "Discord",      iconUrl: "https://img.icons8.com/color/96/discord-logo.png",             color: "#5865F2" },
  clubhouse:   { label: "Clubhouse",    iconUrl: "https://img.icons8.com/color/96/clubhouse.png",                color: "#F1EFE0" },
  vimeo:       { label: "Vimeo",        iconUrl: "https://img.icons8.com/color/96/vimeo.png",                    color: "#19B7EA" },
  spotify:     { label: "Spotify",      iconUrl: "https://img.icons8.com/color/96/spotify--v1.png",              color: "#1DB954" },
  soundcloud:  { label: "SoundCloud",   iconUrl: "https://img.icons8.com/color/96/soundcloud.png",               color: "#FF5500" },
  deezer:      { label: "Deezer",       iconUrl: "https://img.icons8.com/color/96/deezer.png",                   color: "#FF0092" },
  applemusic:  { label: "Apple Music",  iconUrl: "https://img.icons8.com/color/96/apple-music.png",              color: "#FB2D48" },
  shazam:      { label: "Shazam",       iconUrl: "https://img.icons8.com/color/96/shazam.png",                   color: "#2A8AFF" },
  twitch:      { label: "Twitch",       iconUrl: "https://img.icons8.com/color/96/twitch.png",                   color: "#9146FF" },
  kick:        { label: "Kick",         iconUrl: "https://img.icons8.com/color/96/streaming.png",                color: "#53FC18" },
  netflix:     { label: "Netflix",      iconUrl: "https://img.icons8.com/color/96/netflix.png",                  color: "#E50914" },
  amazon:      { label: "Amazon",       iconUrl: "https://img.icons8.com/color/96/amazon.png",                   color: "#FF9900" },
  gmail:       { label: "Gmail",        iconUrl: "https://img.icons8.com/color/96/gmail.png",                    color: "#EA4335" },
  outlook:     { label: "Outlook",      iconUrl: "https://img.icons8.com/color/96/microsoft-outlook-2019.png",   color: "#0078D4" },
  github:      { label: "GitHub",       iconUrl: "https://img.icons8.com/color/96/github--v1.png",               color: "#8957E5" },
  google:      { label: "Google",       iconUrl: "https://img.icons8.com/color/96/google-logo.png",              color: "#4285F4" },
  googleplay:  { label: "Google Play",  iconUrl: "https://img.icons8.com/color/96/google-play.png",              color: "#01875F" },
  appstore:    { label: "App Store",    iconUrl: "https://img.icons8.com/color/96/apple-app-store--v3.png",      color: "#0D96F6" },
  steam:       { label: "Steam",        iconUrl: "https://img.icons8.com/color/96/steam.png",                    color: "#66C0F4" },
  xbox:        { label: "Xbox",         iconUrl: "https://img.icons8.com/color/96/xbox.png",                     color: "#107C10" },
  ubisoft:     { label: "Ubisoft",      iconUrl: "https://img.icons8.com/color/96/controller.png",               color: "#0070CC" },
  freefire:    { label: "Free Fire",    iconUrl: "https://img.icons8.com/color/96/fire-element.png",             color: "#FF5722" },
  chatgpt:     { label: "ChatGPT",      iconUrl: "https://img.icons8.com/color/96/chatgpt.png",                  color: "#10A37F" },
  deepseek:    { label: "DeepSeek",     iconUrl: "https://img.icons8.com/color/96/artificial-intelligence.png",  color: "#4D6BFE" },
  canva:       { label: "Canva",        iconUrl: "https://img.icons8.com/color/96/canva.png",                    color: "#00C4CC" },
  envato:      { label: "Envato",       iconUrl: "https://img.icons8.com/color/96/envato.png",                   color: "#81B441" },
  flaticon:    { label: "Flaticon",     iconUrl: "https://img.icons8.com/color/96/star--v1.png",                 color: "#FF5733" },
};

const CATEGORY_META: Record<string, { label: string; icon: string; color: string; shortLabel: string }> = {
  followers:      { label: "Abonnés / Followers",      shortLabel: "Abonnés",     icon: "users",         color: "#1E90FF" },
  views:          { label: "Vues",                      shortLabel: "Vues",        icon: "eye",           color: "#9C27B0" },
  live_views:     { label: "Téléspectateurs en direct", shortLabel: "Live views",  icon: "radio",         color: "#F44336" },
  likes:          { label: "Likes / J'aime",            shortLabel: "Likes",       icon: "heart",         color: "#E91E63" },
  live_likes:     { label: "Likes en direct",           shortLabel: "Live likes",  icon: "activity",      color: "#FF4081" },
  comments:       { label: "Commentaires",              shortLabel: "Commentaires",icon: "message-circle",color: "#FF9800" },
  shares:         { label: "Partages / Retweets",       shortLabel: "Partages",    icon: "share-2",       color: "#00BCD4" },
  saves:          { label: "Enregistrements",           shortLabel: "Saves",       icon: "bookmark",      color: "#795548" },
  reactions:      { label: "Réactions",                 shortLabel: "Réactions",   icon: "thumbs-up",     color: "#FF5722" },
  impressions:    { label: "Impressions",               shortLabel: "Impressions", icon: "bar-chart-2",   color: "#607D8B" },
  plays:          { label: "Lectures / Écoutes",        shortLabel: "Lectures",    icon: "play-circle",   color: "#4CAF50" },
  reposts:        { label: "Reposts",                   shortLabel: "Reposts",     icon: "repeat",        color: "#26C6DA" },
  mentions:       { label: "Mentions",                  shortLabel: "Mentions",    icon: "at-sign",       color: "#AB47BC" },
  poll_votes:     { label: "Votes sondage",             shortLabel: "Votes",       icon: "check-square",  color: "#42A5F5" },
  story_views:    { label: "Vues story",                shortLabel: "Story",       icon: "eye",           color: "#EC407A" },
  profile_visits: { label: "Visites profil",            shortLabel: "Visites",     icon: "user-check",    color: "#26A69A" },
  custom_comments:{ label: "Commentaires personnalisés",shortLabel: "Custom",      icon: "edit-2",        color: "#FFA726" },
  other:          { label: "Autres services",           shortLabel: "Autres",      icon: "star",          color: "#D4AF37" },
};

const RECOMMENDATIONS: Record<string, string[]> = {
  views:     ["likes", "comments", "shares"],
  likes:     ["views", "comments", "shares"],
  followers: ["likes", "views", "comments"],
  comments:  ["likes", "views"],
  shares:    ["likes", "views"],
  saves:     ["likes", "views"],
  plays:     ["likes", "shares"],
  story_views: ["followers", "likes"],
  live_views: ["live_likes", "comments"],
};

function normalizeCategory(raw: string): string | null {
  const r = raw.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "'");
  if (!r) return null;
  if (r === "followers" || r === "abonnes" || r === "subscribers" || r === "members" || r === "fans") return "followers";
  if (r === "likes" || r === "j'aime" || r === "jaime") return "likes";
  if (r === "views" || r === "vues" || r === "visualisations") return "views";
  if (r === "comments" || r === "commentaires") return "comments";
  if (r === "shares" || r === "partages" || r === "retweets") return "shares";
  if (r === "saves" || r === "enregistrements") return "saves";
  if (r === "reactions" || r === "reactions") return "reactions";
  if (r === "live views" || r === "live viewers" || r === "spectateurs live") return "live_views";
  if (r === "story views" || r === "vues stories") return "story_views";
  if (r === "plays" || r === "lectures" || r === "streams") return "plays";
  return null;
}

function extractCategory(name: string): string {
  const n = name.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "'");

  if ((n.includes("en direct") || n.includes("live") || n.includes("stream")) && (n.includes("vue") || n.includes("view") || n.includes("spectateur") || n.includes("viewer"))) return "live_views";
  if ((n.includes("en direct") || n.includes("live")) && (n.includes("like") || n.includes("j'aime") || n.includes("jaime"))) return "live_likes";
  if (n.includes("story") && (n.includes("vue") || n.includes("view"))) return "story_views";
  if (n.includes("profil") && (n.includes("visite") || n.includes("visit"))) return "profile_visits";
  if (n.includes("commentaire") && (n.includes("personnalis") || n.includes("custom"))) return "custom_comments";
  if (n.includes("sondage") || n.includes("poll") || n.includes("vote")) return "poll_votes";
  if (n.includes("mention")) return "mentions";
  if (n.includes("abonn") || n.includes("follower") || n.includes("subscriber") || n.includes("membre") || n.includes("fan") || n.includes("watch")) return "followers";
  if (n.includes("vue") || n.includes("view") || n.includes("regard") || n.includes("impression")) return "views";
  if (n.includes("like") || n.includes("j'aime") || n.includes("jaime") || n.includes("reaction") || n.includes("réaction")) return "likes";
  if (n.includes("commentaire") || n.includes("comment")) return "comments";
  if (n.includes("partage") || n.includes("share") || n.includes("retweet") || n.includes("repost") || n.includes("republication")) return "shares";
  if (n.includes("save") || n.includes("enregistr")) return "saves";
  if (n.includes("impression")) return "impressions";
  if (n.includes("play") || n.includes("ecoute") || n.includes("lecture") || n.includes("stream")) return "plays";
  if (n.includes("repost")) return "reposts";
  return "other";
}

// Filtre & tri puissants
function normalizeSearch(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function filterAndSortServices(
  services: ExoService[],
  query: string,
  sortAsc: boolean
): ExoService[] {
  let filtered = services;
  const q = normalizeSearch(query.trim());
  if (q.length > 0) {
    const startsWith: ExoService[] = [];
    const contains: ExoService[] = [];
    for (const s of services) {
      const n = normalizeSearch(s.name);
      if (n.startsWith(q)) startsWith.push(s);
      else if (n.includes(q)) contains.push(s);
    }
    filtered = [...startsWith, ...contains];
  }
  return [...filtered].sort((a, b) =>
    sortAsc ? a.priceXAF - b.priceXAF : b.priceXAF - a.priceXAF
  );
}

// ═══════════════════════════════════════════════════════════════
//  Animated helpers
// ═══════════════════════════════════════════════════════════════
function usePressSpring(to = 0.97) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = useCallback(() => {
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  }, []);
  const onPressOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 6 }).start();
  }, []);
  return { scale, onPressIn, onPressOut };
}

function useEntry(delay = 0, duration = 420) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1, duration, delay, useNativeDriver: true, easing: Easing.out(Easing.cubic),
    }).start();
  }, []);
  return anim;
}

// ═══════════════════════════════════════════════════════════════
//  Composant : Skeleton loader élégant
// ═══════════════════════════════════════════════════════════════
function ServiceSkeleton({ C, isDark, rows = 5 }: { C: any; isDark: boolean; rows?: number }) {
  const shimmer = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 0.85, duration: 800, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.35, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const bg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,28,58,0.06)";
  const bg2 = isDark ? "rgba(255,255,255,0.10)" : "rgba(10,28,58,0.10)";

  return (
    <View style={{ paddingTop: 8, gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Animated.View
          key={i}
          style={{
            opacity: shimmer,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            borderWidth: 1,
            borderRadius: 12,
            borderColor: C.border,
            backgroundColor: C.inputBg,
            padding: 12,
          }}
        >
          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: bg }} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ height: 12, borderRadius: 4, backgroundColor: bg, width: "85%" }} />
            <View style={{ height: 10, borderRadius: 4, backgroundColor: bg2, width: "55%" }} />
          </View>
          <View style={{ width: 60, height: 14, borderRadius: 4, backgroundColor: bg }} />
        </Animated.View>
      ))}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Composant : Loader plein écran avec messages rotatifs
// ═══════════════════════════════════════════════════════════════
const LOADING_MESSAGES = [
  "Chargement de nos meilleurs services pour vous…",
  "Nous préparons la liste complète…",
  "Encore un instant, nous rassemblons tout pour vous…",
  "Sélection des services les plus fiables…",
  "Un peu de patience, ça arrive…",
  "Optimisation de l'affichage pour votre confort…",
  "Nous vérifions la disponibilité…",
  "Ça y est presque…",
];

function FullScreenLoader({
  visible,
  C,
  isDark,
  count,
  platform,
}: {
  visible: boolean;
  C: any;
  isDark: boolean;
  count?: number;
  platform?: string;
}) {
  const [msgIdx, setMsgIdx] = useState(0);
  const rotate = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    if (!visible) return;
    setMsgIdx(0);
    const msgTimer = setInterval(() => {
      setMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 2600);
    const rotateLoop = Animated.loop(
      Animated.timing(rotate, { toValue: 1, duration: 2400, useNativeDriver: true, easing: Easing.linear })
    );
    rotateLoop.start();
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.85, duration: 900, useNativeDriver: true }),
      ])
    );
    pulseLoop.start();
    return () => {
      clearInterval(msgTimer);
      rotateLoop.stop();
      pulseLoop.stop();
      rotate.setValue(0);
    };
  }, [visible]);

  if (!visible) return null;

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent>
      <View style={loaderStyles.overlay}>
        <View style={[loaderStyles.card, { backgroundColor: isDark ? "#0F1B33" : "#FFFFFF", borderColor: GOLD + "30" }]}>
          <Animated.View style={[loaderStyles.iconWrap, { backgroundColor: GOLD + "18", transform: [{ scale: pulse }] }]}>
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <Feather name="loader" size={34} color={GOLD} />
            </Animated.View>
          </Animated.View>

          <Text style={[loaderStyles.title, { color: isDark ? "#fff" : NAVY }]}>
            {platform ? `Chargement ${platform}` : "Chargement en cours"}
          </Text>

          <Animated.Text
            key={msgIdx}
            style={[loaderStyles.msg, { color: isDark ? "rgba(255,255,255,0.65)" : LIGHT_TEXT_2 }]}
          >
            {LOADING_MESSAGES[msgIdx]}
          </Animated.Text>

          {count && count > 0 ? (
            <View style={[loaderStyles.countPill, { backgroundColor: GOLD + "15", borderColor: GOLD + "35" }]}>
              <Feather name="package" size={12} color={GOLD} />
              <Text style={[loaderStyles.countText, { color: GOLD }]}>
                {count.toLocaleString()} services
              </Text>
            </View>
          ) : null}

          <View style={loaderStyles.dots}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[loaderStyles.dot, { backgroundColor: GOLD, opacity: 0.4 + i * 0.25 }]} />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const loaderStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(4,10,22,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 24,
    padding: 26,
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: -0.2,
    textAlign: "center",
  },
  msg: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    minHeight: 38,
  },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  countText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 0.2,
  },
  dots: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

// ═══════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ═══════════════════════════════════════════════════════════════
export default function NewOrderScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, deductBalance, refreshUser } = useAuth();
  const { createOrder } = useOrders();
  const { isDark: ctxIsDark, toggleTheme } = useTheme();
  const isDark = ctxIsDark === true;

  const C = useMemo(() => ({
    bg:            isDark ? DARK_BG         : LIGHT_BG,
    surface:       isDark ? DARK_SURFACE    : LIGHT_SURFACE,
    surface2:      isDark ? DARK_SURFACE_2  : LIGHT_SURFACE,
    border:        isDark ? DARK_BORDER     : LIGHT_BORDER,
    separator:     isDark ? DARK_BORDER     : LIGHT_BORDER,
    text:          isDark ? DARK_TEXT       : LIGHT_TEXT,
    textMuted:     isDark ? DARK_TEXT_2     : LIGHT_TEXT_2,
    textSecondary: isDark ? DARK_TEXT_2     : LIGHT_TEXT_2,
    inputBg:       isDark ? DARK_INPUT_BG   : LIGHT_INPUT_BG,
    inputBorder:   isDark ? DARK_BORDER     : LIGHT_BORDER,
    iconBg:        isDark ? DARK_ICON_BG    : LIGHT_ICON_BG,
    iconBorder:    isDark ? DARK_ICON_BORD  : LIGHT_ICON_BORD,
    accent:        isDark ? GOLD            : NAVY,
    accentIcon:    isDark ? GOLD            : NAVY,
    error:         DANGER,
    success:       SUCCESS,
  }), [isDark]);

  const userCountry = user?.country
    ? COUNTRIES.find((c) => c.code === user.country?.toLowerCase()) ?? null
    : null;
  const serviceCountry = userCountry && userCountry.serviceXafRate
    ? { ...userCountry, xafRate: userCountry.serviceXafRate }
    : userCountry;
  const fmt = (amount: number) =>
    serviceCountry && serviceCountry.xafRate !== 1
      ? formatCurrency(amount, serviceCountry)
      : `${amount.toLocaleString("fr-FR")} FCFA`;

  const [selectedOrderType, setSelectedOrderType] = useState<string | null>(null);
  const [showBoostInfo, setShowBoostInfo] = useState(false);
  const [showCategoriesHelp, setShowCategoriesHelp] = useState(false);
  const [showResellerInfo, setShowResellerInfo] = useState(false);
  const [showResellerSpace, setShowResellerSpace] = useState(false);
  const [showInsufficientBalance, setShowInsufficientBalance] = useState(false);
  const [missingAmount, setMissingAmount] = useState(0);

  const [platforms, setPlatforms] = useState<PlatformData[]>([]);
  const [totalServices, setTotalServices] = useState(0);
  const [loadingServices, setLoadingServices] = useState(false);
  const [servicesError, setServicesError] = useState("");

  const [selectedPlatform, setSelectedPlatform] = useState<PlatformData | null>(null);
  const [categorized, setCategorized] = useState<Record<string, ExoService[]>>({});
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryServices, setCategoryServices] = useState<ExoService[]>([]);
  const [selectedService, setSelectedService] = useState<ExoService | null>(null);
  const [showServiceModal, setShowServiceModal] = useState(false);

  const [link, setLink] = useState("");
  const [quantity, setQuantity] = useState("");
  const [customComments, setCustomComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<{
    orderId: string;
    price: number;
    balance: number;
    serviceName: string;
    type: string;
    recommendations: ExoService[];
  } | null>(null);

  // ─── Favoris & historique ───
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [recentServices, setRecentServices] = useState<RecentEntry[]>([]);
  const [platformHistory, setPlatformHistory] = useState<PlatformHistory>({});

  // ─── Loader modal plein écran ───
  const [fullLoader, setFullLoader] = useState<{
    visible: boolean;
    count?: number;
    platform?: string;
  }>({ visible: false });

  const topPad = Platform.OS === "web" ? insets.top + 64 : insets.top;

  // ═══════════════════════════════════════════════════════════════
  //  CHARGEMENT FAVORIS / HISTORIQUE AU DÉMARRAGE
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [favs, recents, history] = await Promise.all([
        storageGet<FavoriteEntry[]>(STORAGE_KEYS.favorites, []),
        storageGet<RecentEntry[]>(STORAGE_KEYS.recentServices, []),
        storageGet<PlatformHistory>(STORAGE_KEYS.platformHistory, {}),
      ]);
      if (cancelled) return;
      setFavorites(favs);
      setRecentServices(recents);
      setPlatformHistory(history);
    })();
    return () => { cancelled = true; };
  }, []);

  const persistFavorites = useCallback(async (list: FavoriteEntry[]) => {
    setFavorites(list);
    await storageSet(STORAGE_KEYS.favorites, list);
  }, []);

  const persistRecentServices = useCallback(async (list: RecentEntry[]) => {
    setRecentServices(list);
    await storageSet(STORAGE_KEYS.recentServices, list);
  }, []);

  const persistPlatformHistory = useCallback(async (map: PlatformHistory) => {
    setPlatformHistory(map);
    await storageSet(STORAGE_KEYS.platformHistory, map);
  }, []);

  function isFavorite(serviceId: string | number): boolean {
    return favorites.some((f) => String(f.service.id) === String(serviceId));
  }

  async function toggleFavorite(svc: ExoService) {
    if (!selectedPlatform) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const exists = favorites.some((f) => String(f.service.id) === String(svc.id));
    if (exists) {
      const next = favorites.filter((f) => String(f.service.id) !== String(svc.id));
      await persistFavorites(next);
    } else {
      const entry: FavoriteEntry = {
        service: svc,
        platformKey: selectedPlatform.key,
        platformLabel: selectedPlatform.label,
        platformIconUrl: selectedPlatform.iconUrl,
        platformColor: selectedPlatform.color,
        orderTypeKey: selectedOrderType ?? "standard",
        addedAt: Date.now(),
      };
      const next = [entry, ...favorites].slice(0, 30);
      await persistFavorites(next);
    }
  }

  async function recordOrderedService(svc: ExoService, platform: PlatformData) {
    // Mise à jour des services récents
    const key = String(svc.id);
    const existing = recentServices.find((r) => String(r.service.id) === key);
    let next: RecentEntry[];
    if (existing) {
      next = recentServices.map((r) =>
        String(r.service.id) === key
          ? { ...r, lastOrderedAt: Date.now(), count: r.count + 1 }
          : r
      );
    } else {
      next = [
        {
          service: svc,
          platformKey: platform.key,
          platformLabel: platform.label,
          platformIconUrl: platform.iconUrl,
          platformColor: platform.color,
          orderTypeKey: selectedOrderType ?? "standard",
          lastOrderedAt: Date.now(),
          count: 1,
        },
        ...recentServices,
      ];
    }
    next.sort((a, b) => b.count - a.count || b.lastOrderedAt - a.lastOrderedAt);
    next = next.slice(0, 20);
    await persistRecentServices(next);

    // Mise à jour du compteur de plateforme
    const hist = { ...platformHistory };
    const ph = hist[platform.key] ?? { count: 0, lastUsedAt: 0 };
    hist[platform.key] = { count: ph.count + 1, lastUsedAt: Date.now() };
    await persistPlatformHistory(hist);
  }

  // ═══════════════════════════════════════════════════════════════
  //  TRI DES PLATEFORMES PAR FRÉQUENCE D'USAGE
  // ═══════════════════════════════════════════════════════════════
  function sortPlatformsByUsage(list: PlatformData[]): PlatformData[] {
    return [...list].sort((a, b) => {
      const ha = platformHistory[a.key];
      const hb = platformHistory[b.key];
      const ca = ha?.count ?? 0;
      const cb = hb?.count ?? 0;
      if (cb !== ca) return cb - ca;
      return b.services.length - a.services.length;
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  CHARGEMENT SERVICES
  // ═══════════════════════════════════════════════════════════════
  function getServiceEndpoint(typeKey: string): string {
    switch (typeKey) {
      case "automatique": return `${BASE_URL}api/services/auto`;
      case "avancee":     return `${BASE_URL}api/afriqueboost/services`;
      default:            return `${BASE_URL}api/exo-services`;
    }
  }

  function getResellerDiscount(): number {
    const orders = user?.totalOrders ?? 0;
    if (orders >= 1000) return 0.25;
    if (orders >= 500)  return 0.20;
    if (orders >= 200)  return 0.15;
    if (orders >= 50)   return 0.10;
    if (orders >= 10)   return 0.05;
    return 0.03;
  }

  function getCurrentResellerLevel() {
    const orders = user?.totalOrders ?? 0;
    return [...RESELLER_LEVELS].reverse().find((l) => orders >= l.orders) ?? RESELLER_LEVELS[0];
  }

  function getNextResellerLevel() {
    const orders = user?.totalOrders ?? 0;
    return RESELLER_LEVELS.find((l) => orders < l.orders);
  }

  function extractPlatformFromService(svc: ExoService): string {
    const n = (svc.name + " " + (svc.category ?? "")).toLowerCase();
    if (n.includes("instagram") || n.includes("insta"))                             return "instagram";
    if (n.includes("tiktok"))                                                        return "tiktok";
    if (n.includes("youtube") || n.includes("yt "))                                  return "youtube";
    if (n.includes("facebook") || n.includes("fb "))                                return "facebook";
    if (n.includes("twitter") || n.includes("tweet") || n.includes("x/twitter"))   return "twitter";
    if (n.includes("telegram"))                                                      return "telegram";
    if (n.includes("whatsapp"))                                                      return "whatsapp";
    if (n.includes("threads"))                                                       return "threads";
    if (n.includes("snapchat"))                                                      return "snapchat";
    if (n.includes("linkedin"))                                                      return "linkedin";
    if (n.includes("pinterest"))                                                     return "pinterest";
    if (n.includes("reddit"))                                                        return "reddit";
    if (n.includes("tumblr"))                                                        return "tumblr";
    if (n.includes("quora"))                                                         return "quora";
    if (n.includes("discord"))                                                       return "discord";
    if (n.includes("clubhouse"))                                                     return "clubhouse";
    if (n.includes("vimeo"))                                                         return "vimeo";
    if (n.includes("spotify"))                                                       return "spotify";
    if (n.includes("soundcloud"))                                                    return "soundcloud";
    if (n.includes("deezer"))                                                        return "deezer";
    if (n.includes("apple music") || n.includes("applemusic") || n.includes("itunes")) return "applemusic";
    if (n.includes("shazam"))                                                        return "shazam";
    if (n.includes("twitch"))                                                        return "twitch";
    if (n.includes("kick"))                                                          return "kick";
    if (n.includes("netflix"))                                                       return "netflix";
    if (n.includes("amazon") || n.includes("prime video"))                          return "amazon";
    if (n.includes("gmail"))                                                         return "gmail";
    if (n.includes("outlook"))                                                       return "outlook";
    if (n.includes("github"))                                                        return "github";
    if (n.includes("google play") || n.includes("googleplay"))                      return "googleplay";
    if (n.includes("app store") || n.includes("appstore"))                          return "appstore";
    if (n.includes("google"))                                                        return "google";
    if (n.includes("steam"))                                                         return "steam";
    if (n.includes("xbox"))                                                          return "xbox";
    if (n.includes("ubisoft"))                                                       return "ubisoft";
    if (n.includes("free fire") || n.includes("freefire") || n.includes("garena"))  return "freefire";
    if (n.includes("chatgpt") || n.includes("openai"))                              return "chatgpt";
    if (n.includes("deepseek"))                                                      return "deepseek";
    if (n.includes("canva"))                                                         return "canva";
    if (n.includes("envato"))                                                        return "envato";
    if (n.includes("flaticon"))                                                      return "flaticon";
    return "other";
  }

  const loadServices = useCallback(async (typeKey: string) => {
    setFullLoader({ visible: true });
    setLoadingServices(true);
    setServicesError("");
    setPlatforms([]);
    setTotalServices(0);

    // On garde le loader visible au moins 600ms pour éviter le flash
    const startedAt = Date.now();
    try {
      const endpoint = getServiceEndpoint(typeKey);
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error("Erreur réseau");
      const data = await res.json();

      let platformsData: Record<string, ExoService[]> = {};
      if (data.platforms) {
        platformsData = data.platforms as Record<string, ExoService[]>;
      } else if (Array.isArray(data.services)) {
        data.services.forEach((svc: ExoService) => {
          const plat = (svc as any).platform ?? extractPlatformFromService(svc);
          if (!platformsData[plat]) platformsData[plat] = [];
          platformsData[plat].push(svc);
        });
      } else {
        throw new Error("Format invalide");
      }

      const discount = typeKey === "revendeur" ? getResellerDiscount() : 0;
      let total = 0;
      const list: PlatformData[] = [];
      Object.entries(platformsData).forEach(([key, svcs]) => {
        if (!Array.isArray(svcs) || svcs.length === 0) return;
        const processed = svcs.map((s) => ({
          ...s,
          originalPriceXAF: discount > 0 ? s.priceXAF : undefined,
          priceXAF: discount > 0 ? Math.round(s.priceXAF * (1 - discount)) : s.priceXAF,
        }));
        total += processed.length;
        const keyLow = key.toLowerCase();
        const meta = PLATFORM_META[keyLow] ?? {
          label: keyLow.charAt(0).toUpperCase() + keyLow.slice(1),
          iconUrl: `https://img.icons8.com/color/96/${keyLow}.png`,
          color: "#1E90FF",
        };
        list.push({ key: keyLow, label: meta.label, iconUrl: meta.iconUrl, color: meta.color, services: processed });
      });
      setPlatforms(list);
      setTotalServices(total);

      // Update loader count info
      setFullLoader({ visible: true, count: total });
    } catch {
      setServicesError("Impossible de charger les services. Vérifiez votre connexion.");
    } finally {
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, 600 - elapsed);
      setTimeout(() => {
        setFullLoader({ visible: false });
        setLoadingServices(false);
      }, wait);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.totalOrders]);

  // ═══════════════════════════════════════════════════════════════
  //  HANDLERS
  // ═══════════════════════════════════════════════════════════════
  const handleSelectOrderType = (typeKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedOrderType(typeKey);
    setSelectedPlatform(null);
    setSelectedCategory(null);
    setSelectedService(null);
    setCategoryServices([]);
    setLink("");
    setQuantity("");
    loadServices(typeKey);
  };

  const handleSelectPlatform = (p: PlatformData) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPlatform(p);
    setSelectedCategory(null);
    setSelectedService(null);
    setCategoryServices([]);
    const cat: Record<string, ExoService[]> = {};
    p.services.forEach((svc) => {
      const rawCat = svc.category ?? "";
      const normalized = normalizeCategory(rawCat) ?? extractCategory(svc.name);
      if (!cat[normalized]) cat[normalized] = [];
      cat[normalized].push({ ...svc, _rawCategory: rawCat } as any);
    });
    const sorted: Record<string, ExoService[]> = {};
    const order = ["followers","likes","views","live_views","live_likes","comments","shares","saves","plays","story_views","impressions","reactions","reposts","poll_votes","mentions","profile_visits","custom_comments","other"];
    order.forEach((k) => { if (cat[k]) sorted[k] = cat[k]; });
    Object.keys(cat).forEach((k) => { if (!sorted[k]) sorted[k] = cat[k]; });
    setCategorized(sorted);

    // Track platform usage (en mémoire, pas persisté tant que pas de commande)
    const hist = { ...platformHistory };
    if (!hist[p.key]) hist[p.key] = { count: 0, lastUsedAt: Date.now() };
    hist[p.key] = { ...hist[p.key], lastUsedAt: Date.now() };
    persistPlatformHistory(hist);
  };

  const handleSelectCategory = (cat: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCategory(cat);
    setSelectedService(null);
    const svcs = categorized[cat] ?? [];
    setCategoryServices(svcs);
    // Affiche un loader si la catégorie est grande (>200 services)
    if (svcs.length > 200) {
      setFullLoader({ visible: true, count: svcs.length, platform: selectedPlatform?.label });
      setTimeout(() => {
        setShowServiceModal(true);
        setTimeout(() => setFullLoader({ visible: false }), 300);
      }, 700);
    } else {
      setShowServiceModal(true);
    }
  };

  const currentOrderType = ORDER_TYPES.find((t) => t.key === selectedOrderType);
  const catMeta = selectedCategory ? (CATEGORY_META[selectedCategory] ?? CATEGORY_META.other) : null;

  const currentLevel = getCurrentResellerLevel();
  const nextLevel = getNextResellerLevel();
  const resellerOrdersCount = user?.totalOrders ?? 0;

  function computeActualPrice(svc: ExoService, qty: number, orderType?: string | null): number {
    if (!svc || qty <= 0) return 0;
    const perUnit = svc.isPerOne || svc.isPackage;
    const base = perUnit ? svc.priceXAF : svc.priceXAF / 1000;
    const margin = orderType === "automatique" ? 1.0 : 1.15;
    return Math.ceil(base * qty * margin);
  }

  function getOrderEndpoint(typeKey: string, provider?: string): string {
    if (typeKey === "avancee") return `${BASE_URL}api/afriqueboost/order`;
    if (typeKey === "automatique") {
      return provider === "smmgen" ? `${BASE_URL}api/smmgen/order` : `${BASE_URL}api/mtp/order`;
    }
    return `${BASE_URL}api/order-exo`;
  }

  function getRecommendations(): ExoService[] {
    if (!selectedPlatform || !selectedService) return [];
    const cat = extractCategory(selectedService.name);
    const wanted = RECOMMENDATIONS[cat] ?? [];
    if (wanted.length === 0) return [];
    const services = selectedPlatform.services;
    const result: ExoService[] = [];
    wanted.forEach((w) => {
      const match = services.find((s) => extractCategory(s.name) === w && s.id !== selectedService.id);
      if (match) result.push(match);
    });
    return result.slice(0, 3);
  }

  const handleSubmit = async () => {
    if (!selectedService) { Alert.alert("Service requis", "Sélectionnez un service."); return; }
    if (!link.trim()) { Alert.alert("Lien requis", "Entrez le lien de votre page/post."); return; }

    const isCustom = isCustomCommentsService(selectedService);
    const isAccountSale = isAccountSaleService(selectedService);
    let qty: number;
    let comments: string | undefined;

    if (isCustom) {
      const lines = customComments.trim().split("\n").filter((l) => l.trim().length > 0);
      qty = lines.length;
      comments = lines.join("\n");
      if (qty === 0) { Alert.alert("Commentaires requis", "Entrez vos commentaires personnalisés."); return; }
      if (qty < 10) {
        Alert.alert("Minimum requis", `Vous devez saisir au moins 10 commentaires (un par ligne).\n\nActuellement: ${qty} commentaire${qty > 1 ? "s" : ""}`);
        return;
      }
    } else if (isAccountSale) {
      qty = 1;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(link.trim())) {
        Alert.alert("Email requis", "Entrez une adresse email valide pour recevoir vos identifiants d'accès."); return;
      }
    } else {
      qty = parseInt(quantity);
      if (!qty || qty < selectedService.min || qty > selectedService.max) {
        Alert.alert("Quantité invalide", `Entre ${selectedService.min} et ${selectedService.max}`); return;
      }
    }

    const basePrice = computeActualPrice(selectedService, qty, selectedOrderType);
    const hasReferralDiscount = !!(user?.referredBy && (user?.referralOrdersUsed ?? 0) < 5);
    const actualPrice = hasReferralDiscount ? Math.ceil(basePrice * 0.9) : basePrice;

    if (actualPrice > (user?.balance ?? 0)) {
      setMissingAmount(actualPrice - (user?.balance ?? 0));
      setShowInsufficientBalance(true);
      return;
    }
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const provider = (selectedService as any)._provider as string | undefined;
      const orderEndpoint = getOrderEndpoint(selectedOrderType ?? "standard", provider);

      const idToken = await getFreshToken();
      const payload: Record<string, unknown> = {
        serviceId: selectedService.id,
        link: link.trim(),
        quantity: qty,
      };
      if (comments) payload.comments = comments;

      let providerOrderId: string | undefined;
      let providerError: string | undefined;
      let providerData: any = null;

      try {
        const abortCtrl = new AbortController();
        const abortTimer = setTimeout(() => abortCtrl.abort(), 25000);
        const providerRes = await fetch(orderEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify(payload),
          signal: abortCtrl.signal,
        });
        clearTimeout(abortTimer);
        providerData = await providerRes.json().catch(() => null);
        if (!providerRes.ok || providerData?.success === false) {
          providerError = providerData?.error ?? `Erreur fournisseur (${providerRes.status})`;
        } else {
          providerOrderId = providerData?.orderId ? String(providerData.orderId) : undefined;
        }
      } catch (provErr: any) {
        providerError = provErr?.message ?? "Fournisseur inaccessible";
      }

      if (providerError) {
        const providerDataCode = (providerData as any)?.code ?? "";
        const isAccountIssue = providerDataCode === "ACCOUNT_BLOCKED" || providerDataCode === "FROZEN_DEBT" || providerDataCode === "INSUFFICIENT_BALANCE";
        Alert.alert(
          isAccountIssue ? "Commande refusée" : "Échec de la commande",
          isAccountIssue
            ? providerError
            : `Le fournisseur a refusé la commande :\n${providerError}\n\nVotre solde n'a pas été débité.`
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      const ok = await deductBalance(actualPrice);
      if (!ok) { Alert.alert("Erreur", "Solde insuffisant"); return; }

      const newBalance = Math.max(0, (user?.balance ?? 0) - actualPrice);

      await createOrder({
        serviceId: String(selectedService.id),
        serviceName: selectedService.name,
        platform: selectedPlatform?.label ?? "Service",
        platformColor: selectedPlatform?.color ?? "#1E90FF",
        type: selectedOrderType ?? "standard",
        quantity: qty,
        price: actualPrice,
        link: link.trim(),
        userId: user!.id,
        ...(comments ? { comments } : {}),
        ...(providerOrderId ? { orderId: providerOrderId } : {}),
        ...(provider ? { provider } : {}),
        ...(hasReferralDiscount ? { referralDiscountApplied: true } : {}),
      });

      refreshUser().catch(() => {});

      // Enregistrer pour le système de recommandations
      if (selectedPlatform) {
        recordOrderedService(selectedService, selectedPlatform).catch(() => {});
      }

      const recos = getRecommendations();

      setSuccessData({
        orderId: providerOrderId ?? `SBH-${Date.now()}`,
        price: actualPrice,
        balance: newBalance,
        serviceName: selectedService.name,
        type: selectedOrderType ?? "standard",
        recommendations: recos,
      });

      setLink(""); setQuantity(""); setCustomComments(""); setSelectedService(null);
      setSelectedCategory(null); setSelectedPlatform(null); setSelectedOrderType(null);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Erreur", e?.message ?? "Une erreur est survenue");
    } finally {
      setSubmitting(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <StarBackground dark={isDark} />

      {/* ═══ HEADER ═══ */}
      <LinearGradient
        colors={isDark ? ["#132C57", "#0A1C3A"] : ["#FFFFFF", "#FBF8F1"]}
        style={[styles.header, { paddingTop: topPad + 14 }]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      >
        {!isDark && <View style={styles.headerGoldLine} />}

        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: isDark ? "#FFFFFF" : NAVY }]}>
            Commander
          </Text>
          <Text style={[styles.headerSub, { color: isDark ? "rgba(255,255,255,0.7)" : LIGHT_TEXT_2 }]}>
            {selectedOrderType
              ? currentOrderType?.label ?? "Choisissez votre plateforme"
              : totalServices > 0
              ? `${totalServices.toLocaleString()} services disponibles`
              : "Choisissez votre type de commande"}
          </Text>
        </View>

        <View style={styles.headerRight}>
          <Pressable
            onPress={() => setShowBoostInfo(true)}
            style={[
              styles.headerBtn,
              isDark && { backgroundColor: "rgba(255,255,255,0.10)" },
              !isDark && { backgroundColor: "rgba(10,28,58,0.05)", borderWidth: 1, borderColor: LIGHT_BORDER },
            ]}
          >
            <Feather name="info" size={17} color={isDark ? "#FFFFFF" : NAVY} />
          </Pressable>
          <Pressable
            onPress={() => { Haptics.selectionAsync(); toggleTheme(); }}
            style={[
              styles.headerBtn,
              isDark && { backgroundColor: "rgba(255,255,255,0.10)" },
              !isDark && { backgroundColor: "rgba(10,28,58,0.05)", borderWidth: 1, borderColor: LIGHT_BORDER },
            ]}
          >
            <Feather name={isDark ? "sun" : "moon"} size={17} color={isDark ? GOLD : NAVY} />
          </Pressable>
        </View>

        <View
          style={[
            styles.balancePill,
            isDark && { backgroundColor: "rgba(212,175,55,0.15)", borderColor: GOLD_BORDER },
            !isDark && { backgroundColor: "rgba(212,175,55,0.14)", borderColor: "rgba(212,175,55,0.32)" },
          ]}
        >
          <Feather name="dollar-sign" size={11} color={isDark ? GOLD : GOLD_SOFT} />
          <Text style={[styles.balanceText, { color: isDark ? GOLD : NAVY }]} numberOfLines={1}>
            {fmt(user?.balance ?? 0)}
          </Text>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ═══ STEP 1 — Order types + Favoris + Récents ═══ */}
          {!selectedOrderType && (
            <>
              {/* Favoris de l'utilisateur */}
              {favorites.length > 0 && (
                <FavoritesSection
                  favorites={favorites}
                  onSelect={(fav) => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const typeKey = fav.orderTypeKey;
                    setSelectedOrderType(typeKey);
                    setSelectedService(fav.service);
                    setSelectedCategory(null);
                    setCategoryServices([]);
                    setLink("");
                    setQuantity("");
                    setCustomComments("");
                    // Charger les plateformes pour retrouver la plateforme
                    loadServices(typeKey);
                  }}
                  onRemove={async (favId) => {
                    const next = favorites.filter((f) => String(f.service.id) !== String(favId));
                    await persistFavorites(next);
                  }}
                  C={C}
                  isDark={isDark}
                  fmt={fmt}
                />
              )}

              {/* Services récemment commandés */}
              {recentServices.length > 0 && (
                <RecentServicesSection
                  recents={recentServices.slice(0, 5)}
                  onSelect={(r) => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedOrderType(r.orderTypeKey);
                    setSelectedService(r.service);
                    setSelectedCategory(null);
                    setCategoryServices([]);
                    setLink("");
                    setQuantity("");
                    setCustomComments("");
                    loadServices(r.orderTypeKey);
                  }}
                  C={C}
                  isDark={isDark}
                  fmt={fmt}
                />
              )}

              <OrderTypeSelector
                loading={loadingServices}
                onSelect={handleSelectOrderType}
                onOpenHelp={() => setShowCategoriesHelp(true)}
                C={C}
                isDark={isDark}
              />
            </>
          )}

          {/* ═══ Back button ═══ */}
          {selectedOrderType && (
            <Pressable
              style={[styles.backTypeBtn, { backgroundColor: C.surface, borderColor: C.border }]}
              onPress={() => {
                setSelectedOrderType(null); setSelectedPlatform(null);
                setSelectedCategory(null); setSelectedService(null);
              }}
            >
              <LinearGradient
                colors={currentOrderType?.gradient ?? ["#1E90FF", "#0066CC"]}
                style={styles.backTypeBtnIcon}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              >
                <Feather name={currentOrderType?.icon ?? "shopping-cart"} size={16} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={[styles.backTypeBtnLabel, { color: C.text }]}>
                  {currentOrderType?.label}
                </Text>
                <Text style={[styles.backTypeBtnSub, { color: C.textMuted }]}>
                  Appuyez pour changer de type
                </Text>
              </View>
              <Feather name="x" size={16} color={C.textMuted} />
            </Pressable>
          )}

          {/* ═══ Reseller panel ═══ */}
          {selectedOrderType === "revendeur" && (
            <ResellerPanel
              currentLevel={currentLevel}
              nextLevel={nextLevel}
              resellerOrdersCount={resellerOrdersCount}
              showResellerInfo={showResellerInfo}
              setShowResellerInfo={setShowResellerInfo}
              setShowResellerSpace={setShowResellerSpace}
              C={C}
              isDark={isDark}
            />
          )}

          {/* ═══ STEP 2 — Platforms ═══ */}
          {selectedOrderType && (
            <PlatformSection
              platforms={sortPlatformsByUsage(platforms)}
              selectedPlatform={selectedPlatform}
              onSelect={handleSelectPlatform}
              loading={loadingServices}
              error={servicesError}
              onRetry={() => selectedOrderType && loadServices(selectedOrderType)}
              orderType={selectedOrderType}
              C={C}
              isDark={isDark}
            />
          )}

          {/* ═══ STEP 3 — Categories ═══ */}
          {selectedPlatform && Object.keys(categorized).length > 0 && (
            <CategorySection
              categorized={categorized}
              selectedCategory={selectedCategory}
              onSelect={handleSelectCategory}
              platformLabel={selectedPlatform.label}
              C={C}
              isDark={isDark}
            />
          )}

          {/* ═══ STEP 4 — Selected service + form ═══ */}
          {selectedService && (
            <SelectedServiceForm
              selectedService={selectedService}
              selectedPlatform={selectedPlatform}
              selectedOrderType={selectedOrderType}
              catMeta={catMeta}
              link={link} setLink={setLink}
              quantity={quantity} setQuantity={setQuantity}
              customComments={customComments} setCustomComments={setCustomComments}
              userBalance={user?.balance ?? 0}
              hasReferral={!!(user?.referredBy && (user?.referralOrdersUsed ?? 0) < 5)}
              referralOrdersUsed={user?.referralOrdersUsed ?? 0}
              fmt={fmt}
              onOpenServiceModal={() => setShowServiceModal(true)}
              onSubmit={handleSubmit}
              submitting={submitting}
              isFavorite={isFavorite(selectedService.id)}
              onToggleFavorite={() => toggleFavorite(selectedService)}
              C={C}
              isDark={isDark}
            />
          )}

          {/* Hints */}
          {selectedPlatform && !selectedService && !loadingServices && (
            <View style={[styles.hintCard, { backgroundColor: C.surface, borderColor: C.border }]}>
              <View style={[styles.hintIconBox, { backgroundColor: C.iconBg, borderColor: C.iconBorder }]}>
                <Feather name="arrow-up" size={18} color={C.accentIcon} />
              </View>
              <Text style={[styles.hintText, { color: C.textMuted }]}>
                Sélectionnez une catégorie ci-dessus pour voir les services disponibles.
              </Text>
            </View>
          )}

          {selectedOrderType && !selectedPlatform && !loadingServices && platforms.length > 0 && (
            <View style={[styles.hintCard, { backgroundColor: C.surface, borderColor: C.border }]}>
              <View style={[styles.hintIconBox, { backgroundColor: C.iconBg, borderColor: C.iconBorder }]}>
                <Feather name="arrow-up" size={18} color={C.accentIcon} />
              </View>
              <Text style={[styles.hintText, { color: C.textMuted }]}>
                Sélectionnez une plateforme ci-dessus pour voir les catégories disponibles.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ═══ Service Modal (grid/list + recherche + tri + favoris + traduction) ═══ */}
      <ServiceModal
        visible={showServiceModal}
        onClose={() => setShowServiceModal(false)}
        services={categoryServices}
        selectedService={selectedService}
        onSelect={(svc) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setSelectedService(svc);
          setShowServiceModal(false);
        }}
        orderType={selectedOrderType}
        catMeta={catMeta}
        fmt={fmt}
        C={C}
        isDark={isDark}
        platform={selectedPlatform}
        isFavorite={isFavorite}
        onToggleFavorite={toggleFavorite}
      />

      {/* ═══ Insufficient balance ═══ */}
      <InsufficientBalanceModal
        visible={showInsufficientBalance}
        onClose={() => setShowInsufficientBalance(false)}
        missingAmount={missingAmount}
        balance={user?.balance ?? 0}
        fmt={fmt}
        onRecharge={() => {
          setShowInsufficientBalance(false);
          router.push("/(tabs)/wallet" as any);
        }}
        C={C}
      />

      {/* ═══ Reseller space ═══ */}
      <ResellerSpaceModal
        visible={showResellerSpace}
        onClose={() => setShowResellerSpace(false)}
        currentLevel={currentLevel}
        nextLevel={nextLevel}
        resellerOrdersCount={resellerOrdersCount}
        C={C}
        isDark={isDark}
      />

      {/* ═══ Success Modal with recommendations ═══ */}
      <SuccessOrderModal
        data={successData}
        onClose={() => setSuccessData(null)}
        onViewOrders={() => { setSuccessData(null); router.push("/(tabs)/orders"); }}
        onOrderRecommended={(svc) => {
          setSuccessData(null);
          if (selectedPlatform) {
            setSelectedService(svc);
          }
        }}
        fmt={fmt}
        isDark={isDark}
      />

      {/* ═══ Boost Info Modal ═══ */}
      <BoostInfoModal
        visible={showBoostInfo}
        onClose={() => setShowBoostInfo(false)}
        onReclamation={() => {
          setShowBoostInfo(false);
          router.push("/reclamation" as any);
        }}
        C={C}
        isDark={isDark}
      />

      {/* ═══ Categories Help Modal ═══ */}
      <CategoriesHelpModal
        visible={showCategoriesHelp}
        onClose={() => setShowCategoriesHelp(false)}
        C={C}
        isDark={isDark}
      />

      {/* ═══ Full screen loader ═══ */}
      <FullScreenLoader
        visible={fullLoader.visible}
        C={C}
        isDark={isDark}
        count={fullLoader.count}
        platform={fullLoader.platform}
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

function FavoritesSection({
  favorites, onSelect, onRemove, C, isDark, fmt,
}: {
  favorites: FavoriteEntry[];
  onSelect: (fav: FavoriteEntry) => void;
  onRemove: (id: string | number) => void;
  C: any;
  isDark: boolean;
  fmt: (n: number) => string;
}) {
  const entry = useEntry(60);
  return (
    <Animated.View
      style={{
        opacity: entry,
        transform: [{ translateY: entry.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        gap: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: GOLD }} />
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: C.text }}>
          Vos favoris
        </Text>
        <View style={{ backgroundColor: GOLD + "22", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: GOLD }}>
            {favorites.length}
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingRight: 4 }}
      >
        {favorites.map((fav) => (
          <Pressable
            key={String(fav.service.id)}
            onPress={() => onSelect(fav)}
            style={({ pressed }) => [
              {
                width: 220,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: GOLD + "35",
                backgroundColor: isDark ? "rgba(212,175,55,0.06)" : "rgba(212,175,55,0.05)",
                padding: 12,
                gap: 8,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Image
                source={{ uri: fav.platformIconUrl }}
                style={{ width: 28, height: 28, borderRadius: 8 }}
                contentFit="contain"
              />
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: fav.platformColor }} numberOfLines={1}>
                {fav.platformLabel}
              </Text>
              <Pressable
                onPress={() => onRemove(fav.service.id)}
                hitSlop={8}
                style={{ marginLeft: "auto" }}
              >
                <Feather name="star" size={14} color={GOLD} />
              </Pressable>
            </View>
            <Text
              style={{ fontFamily: "Inter_600SemiBold", fontSize: 12.5, color: C.text, lineHeight: 17, minHeight: 34 }}
              numberOfLines={2}
            >
              {fav.service.name}
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: SUCCESS }}>
                {fmt(fav.service.priceXAF)}
              </Text>
              <View style={{ backgroundColor: C.inputBg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: C.textMuted }}>
                  Min {fav.service.min.toLocaleString()}
                </Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

function RecentServicesSection({
  recents, onSelect, C, isDark, fmt,
}: {
  recents: RecentEntry[];
  onSelect: (r: RecentEntry) => void;
  C: any;
  isDark: boolean;
  fmt: (n: number) => string;
}) {
  const entry = useEntry(100);
  return (
    <Animated.View
      style={{
        opacity: entry,
        transform: [{ translateY: entry.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        gap: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: INFO }} />
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: C.text }}>
          Commandés récemment
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingRight: 4 }}
      >
        {recents.map((r) => (
          <Pressable
            key={String(r.service.id)}
            onPress={() => onSelect(r)}
            style={({ pressed }) => [
              {
                width: 200,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: C.border,
                backgroundColor: C.surface,
                padding: 12,
                gap: 8,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Image
                source={{ uri: r.platformIconUrl }}
                style={{ width: 24, height: 24, borderRadius: 6 }}
                contentFit="contain"
              />
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10.5, color: r.platformColor }} numberOfLines={1}>
                {r.platformLabel}
              </Text>
              {r.count > 1 && (
                <View style={{ marginLeft: "auto", backgroundColor: INFO + "20", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: INFO }}>
                    x{r.count}
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: C.text, lineHeight: 16, minHeight: 32 }}
              numberOfLines={2}
            >
              {r.service.name}
            </Text>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12.5, color: SUCCESS }}>
              {fmt(r.service.priceXAF)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

function OrderTypeSelector({
  loading, onSelect, onOpenHelp, C, isDark,
}: {
  loading: boolean;
  onSelect: (key: string) => void;
  onOpenHelp: () => void;
  C: any;
  isDark: boolean;
}) {
  const entry = useEntry(80);
  return (
    <Animated.View
      style={{
        opacity: entry,
        transform: [{ translateY: entry.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        gap: 16,
      }}
    >
      <View style={styles.intro}>
        <Text style={[styles.introTitle, { color: C.text }]}>
          Que souhaitez-vous booster aujourd'hui ?
        </Text>
        <Text style={[styles.introSub, { color: C.textMuted }]}>
          Choisissez une catégorie pour commencer
        </Text>
      </View>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={C.accent} />
          <Text style={[styles.loadingText, { color: C.textSecondary }]}>
            Chargement des services...
          </Text>
        </View>
      )}

      <View style={{ gap: 12 }}>
        {ORDER_TYPES.map((ot, i) => (
          <OrderTypeRow key={ot.key} ot={ot} onPress={() => onSelect(ot.key)} C={C} isDark={isDark} index={i} />
        ))}
      </View>

      {/* Carte d'aide pour choisir */}
      <Pressable
        onPress={onOpenHelp}
        style={({ pressed }) => [
          {
            borderRadius: 16,
            borderWidth: 1,
            borderColor: GOLD + "35",
            backgroundColor: isDark ? "rgba(212,175,55,0.06)" : "rgba(212,175,55,0.05)",
            padding: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          },
          pressed && { opacity: 0.88 },
        ]}
      >
        <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: GOLD + "20", alignItems: "center", justifyContent: "center" }}>
          <Feather name="help-circle" size={20} color={GOLD} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13.5, color: isDark ? GOLD : NAVY }}>
            Vous hésitez entre les catégories ?
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11.5, color: C.textMuted, marginTop: 3, lineHeight: 16 }}>
            Comprenez en quelques secondes ce que chacune propose avant de choisir.
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={GOLD} />
      </Pressable>
    </Animated.View>
  );
}

function OrderTypeRow({
  ot, onPress, C, isDark, index,
}: {
  ot: typeof ORDER_TYPES[0];
  onPress: () => void;
  C: any;
  isDark: boolean;
  index: number;
}) {
  const { scale, onPressIn, onPressOut } = usePressSpring(0.98);
  const entry = useEntry(120 + index * 70);

  return (
    <Animated.View
      style={{
        opacity: entry,
        transform: [
          { scale },
          { translateY: entry.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
        ],
      }}
    >
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[
          styles.orderTypeRow,
          {
            backgroundColor: C.surface,
            borderColor: C.border,
            shadowColor: isDark ? "#000" : NAVY,
            shadowOpacity: isDark ? 0.30 : 0.06,
          },
        ]}
      >
        <LinearGradient
          colors={ot.gradient}
          style={styles.orderTypeIconLarge}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        >
          <Feather name={ot.icon} size={22} color="#fff" />
        </LinearGradient>

        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.orderTypeTitle, { color: C.text }]}>{ot.shortLabel}</Text>
          <Text style={[styles.orderTypeDesc, { color: C.textMuted }]} numberOfLines={3}>
            {ot.description}
          </Text>
          <Text style={[styles.orderTypeTagline, { color: ot.color }]} numberOfLines={1}>
            {ot.tagline}
          </Text>
        </View>

        <View
          style={[
            styles.orderTypeChevron,
            { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(10,28,58,0.04)", borderColor: ot.color + "40" },
          ]}
        >
          <Feather name="chevron-right" size={18} color={ot.color} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

function ResellerPanel({
  currentLevel, nextLevel, resellerOrdersCount,
  showResellerInfo, setShowResellerInfo, setShowResellerSpace, C, isDark,
}: any) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: C.surface, borderColor: "rgba(212,175,55,0.35)" },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 48, height: 48, borderRadius: 14,
            backgroundColor: "rgba(212,175,55,0.12)",
            alignItems: "center", justifyContent: "center",
            borderWidth: 1, borderColor: "rgba(212,175,55,0.35)",
          }}
        >
          <Feather name={currentLevel.icon} size={22} color={GOLD} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: isDark ? GOLD : NAVY }}>
            Niveau {currentLevel.name} · -{currentLevel.discount}%
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11.5, color: C.textMuted, marginTop: 3 }}>
            {resellerOrdersCount} commande{resellerOrdersCount !== 1 ? "s" : ""}
            {nextLevel
              ? ` · Prochain : ${nextLevel.name} (${Math.max(0, nextLevel.orders - resellerOrdersCount)} restantes)`
              : " · Niveau maximum !"}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={() => setShowResellerSpace(true)}
          style={{
            flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
            gap: 6, backgroundColor: "rgba(212,175,55,0.15)", borderRadius: 11,
            paddingVertical: 11, borderWidth: 1, borderColor: "rgba(212,175,55,0.35)",
          }}
        >
          <Feather name="award" size={14} color={GOLD} />
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: isDark ? GOLD : NAVY }}>
            Mon espace revendeur
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setShowResellerInfo(!showResellerInfo)}
          style={{
            flexDirection: "row", alignItems: "center", gap: 4,
            backgroundColor: C.inputBg, borderRadius: 11,
            paddingHorizontal: 14, paddingVertical: 11,
            borderWidth: 1, borderColor: C.border,
          }}
        >
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: C.textMuted }}>
            {showResellerInfo ? "Masquer" : "Niveaux"}
          </Text>
          <Feather name={showResellerInfo ? "chevron-up" : "chevron-down"} size={12} color={C.textMuted} />
        </Pressable>
      </View>

      {showResellerInfo && (
        <View style={{ gap: 8 }}>
          {RESELLER_LEVELS.map((lvl) => {
            const isActive = currentLevel.name === lvl.name;
            const isPast = resellerOrdersCount >= lvl.orders;
            return (
              <View
                key={lvl.name}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 10,
                  padding: 11, borderRadius: 11,
                  backgroundColor: isActive ? lvl.color + "18" : C.inputBg,
                  borderWidth: isActive ? 1.5 : 1,
                  borderColor: isActive ? lvl.color : C.border,
                }}
              >
                <Feather name={lvl.icon} size={16} color={isActive ? lvl.color : C.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontFamily: "Inter_600SemiBold", fontSize: 13,
                    color: isActive ? lvl.color : isPast ? C.text : C.textMuted,
                  }}>
                    {lvl.name}
                  </Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10.5, color: C.textMuted }}>
                    {lvl.orders === 0 ? "Dès la 1ère commande" : `≥ ${lvl.orders} commandes`}
                  </Text>
                </View>
                <View style={{ backgroundColor: lvl.color + "22", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: lvl.color }}>-{lvl.discount}%</Text>
                </View>
                {isActive && <Feather name="check-circle" size={14} color={lvl.color} />}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function PlatformSection({
  platforms, selectedPlatform, onSelect, loading, error, onRetry, orderType, C, isDark,
}: any) {
  const accent = ORDER_TYPES.find((o) => o.key === orderType)?.color ?? "#1E90FF";
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={styles.sectionHeaderRow}>
        <View style={[styles.accentBar, { backgroundColor: accent }]} />
        <Text style={[styles.sectionLabel, { color: C.text }]}>Choisissez une plateforme</Text>
      </View>

      {error ? (
        <View style={styles.errorRow}>
          <Feather name="alert-circle" size={14} color={C.error} />
          <Text style={[styles.errorText, { color: C.error }]}>{error}</Text>
          <Pressable onPress={onRetry} style={[styles.retryBtn, { backgroundColor: C.accent + "22", borderColor: C.accent }]}>
            <Text style={[styles.retryText, { color: C.accent }]}>Réessayer</Text>
          </Pressable>
        </View>
      ) : null}

      {platforms.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.platformScroll}>
          {platforms.map((p: PlatformData) => {
            const isActive = selectedPlatform?.key === p.key;
            return (
              <Pressable
                key={p.key}
                onPress={() => onSelect(p)}
                style={({ pressed }) => [
                  styles.platformBtn,
                  {
                    borderColor: isActive ? p.color : C.border,
                    backgroundColor: isActive ? p.color + "22" : C.inputBg,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Image source={{ uri: p.iconUrl }} style={styles.platformIcon} contentFit="contain" />
                <Text style={[styles.platformLabel, { color: isActive ? p.color : C.textSecondary }]} numberOfLines={1}>
                  {p.label}
                </Text>
                <View style={[styles.platformCountPill, { backgroundColor: isActive ? p.color + "22" : C.border }]}>
                  <Text style={[styles.platformCountText, { color: isActive ? p.color : C.textMuted }]}>
                    {p.services.length}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={C.accent} size="small" />
          <Text style={[styles.loadingText, { color: C.textSecondary }]}>Chargement...</Text>
        </View>
      )}
    </View>
  );
}

function CategorySection({
  categorized, selectedCategory, onSelect, platformLabel, C, isDark,
}: any) {
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={styles.sectionHeaderRow}>
        <View style={[styles.accentBar, { backgroundColor: GOLD }]} />
        <Text style={[styles.sectionLabel, { color: C.text }]}>
          Catégorie — {platformLabel}
        </Text>
      </View>
      <View style={styles.categoryGrid}>
        {Object.entries(categorized).map(([cat, svcs]: any) => {
          const knownMeta = CATEGORY_META[cat];
          const meta = knownMeta ?? CATEGORY_META.other;
          const isOther = !knownMeta;
          const displayLabel = isOther
            ? ((svcs[0] as any)?._rawCategory || cat).replace(/_/g, " ")
            : meta.shortLabel;
          const isActive = selectedCategory === cat;
          return (
            <Pressable
              key={cat}
              onPress={() => onSelect(cat)}
              style={({ pressed }) => [
                styles.categoryBtn,
                {
                  borderColor: isActive ? meta.color : C.border,
                  backgroundColor: isActive ? meta.color + "22" : C.inputBg,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={[styles.categoryIcon, { backgroundColor: meta.color + "20" }]}>
                <Feather name={meta.icon as any} size={14} color={meta.color} />
              </View>
              <Text style={[styles.categoryLabel, { color: isActive ? meta.color : C.text }]} numberOfLines={1}>
                {displayLabel}
              </Text>
              <View style={[styles.countBadge, { backgroundColor: meta.color + "22" }]}>
                <Text style={[styles.countBadgeText, { color: meta.color }]}>{svcs.length}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SelectedServiceForm({
  selectedService, selectedPlatform, selectedOrderType, catMeta,
  link, setLink, quantity, setQuantity, customComments, setCustomComments,
  userBalance, hasReferral, referralOrdersUsed,
  fmt, onOpenServiceModal, onSubmit, submitting,
  isFavorite, onToggleFavorite,
  C, isDark,
}: any) {
  const isCustom = isCustomCommentsService(selectedService);
  const isAccountSale = isAccountSaleService(selectedService);
  const svcDesc = generateServiceDescription(selectedService.name, selectedPlatform?.label ?? "");
  const commentLines = customComments.trim().split("\n").filter((l: string) => l.trim().length > 0);
  const commentCount = commentLines.length;
  const qty = isCustom ? commentCount : isAccountSale ? 1 : (parseInt(quantity) || 0);
  const pricePerUnit = selectedService.isPerOne || selectedService.isPackage;
  const unitPrice = pricePerUnit ? selectedService.priceXAF : selectedService.priceXAF / 1000;
  const autoMargin = selectedOrderType === "automatique" ? 1.0 : 1.15;
  const baseComputedPrice = qty > 0 ? Math.ceil(unitPrice * qty * autoMargin) : 0;
  const liveComputedPrice = (hasReferral && qty > 0) ? Math.ceil(baseComputedPrice * 0.9) : baseComputedPrice;
  const isReseller = selectedOrderType === "revendeur";
  const origPrice = selectedService.originalPriceXAF;
  const origComputedPrice = origPrice && qty > 0 ? Math.ceil((pricePerUnit ? origPrice : origPrice / 1000) * qty * autoMargin) : 0;
  const savings = origComputedPrice > 0 && liveComputedPrice > 0 ? origComputedPrice - liveComputedPrice : 0;

  const entry1 = useEntry(60);
  const entry2 = useEntry(140);
  const submitPress = usePressSpring(0.98);

  return (
    <>
      <Animated.View
        style={[
          styles.serviceInfoCard,
          {
            backgroundColor: C.surface,
            borderColor: (selectedPlatform?.color ?? "#1E90FF") + "40",
            opacity: entry1,
            transform: [{ translateY: entry1.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          },
        ]}
      >
        <View style={styles.serviceInfoTop}>
          {selectedPlatform && (
            <View style={[styles.serviceInfoIconBox, { backgroundColor: (selectedPlatform?.color ?? "#1E90FF") + "15" }]}>
              <Image source={{ uri: selectedPlatform.iconUrl }} style={styles.serviceInfoIcon} contentFit="contain" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.serviceInfoName, { color: C.text }]} numberOfLines={2}>
              {selectedService.name}
            </Text>
            {catMeta && (
              <View style={[styles.categoryTag, { backgroundColor: catMeta.color + "22" }]}>
                <Feather name={catMeta.icon as any} size={10} color={catMeta.color} />
                <Text style={[styles.categoryTagText, { color: catMeta.color }]}>{catMeta.shortLabel}</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Pressable
              style={[styles.changeBtn, { borderColor: GOLD, backgroundColor: GOLD + "15", paddingHorizontal: 8 }]}
              onPress={onToggleFavorite}
              hitSlop={4}
            >
              <Feather name="star" size={14} color={GOLD} fill={isFavorite ? GOLD : "transparent"} />
            </Pressable>
            <Pressable
              style={[styles.changeBtn, { borderColor: C.accent, backgroundColor: C.accent + "15" }]}
              onPress={onOpenServiceModal}
            >
              <Text style={[styles.changeBtnText, { color: C.accent }]}>Changer</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.serviceInfoGrid}>
          {[
            { label: "Prix", value: `${fmt(selectedService.priceXAF)}/${pricePerUnit ? "u" : "1k"}`, color: SUCCESS },
            { label: "Min",  value: isCustom ? "10" : selectedService.min.toLocaleString(), color: C.text },
            { label: "Max",  value: isCustom ? "∞" : selectedService.max.toLocaleString(), color: C.text },
            { label: "Délai", value: selectedService.averageTime ?? "Rapide", color: C.text },
          ].map((info, i) => (
            <View key={i} style={[styles.serviceInfoCell, { borderColor: C.border, backgroundColor: C.inputBg }]}>
              <Text style={[styles.serviceInfoLabel, { color: C.textMuted }]}>{info.label}</Text>
              <Text style={[styles.serviceInfoValue, { color: info.color }]} numberOfLines={1}>{info.value}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.descBox, { backgroundColor: C.inputBg, borderColor: C.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name="info" size={12} color={C.accentIcon} />
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: C.accentIcon }}>
              {svcDesc.what}
            </Text>
          </View>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: C.textSecondary, lineHeight: 18, marginTop: 4 }}>
            {svcDesc.desc}
          </Text>
          {svcDesc.quality.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
              {svcDesc.quality.map((q, i) => (
                <View key={i} style={{ backgroundColor: SUCCESS + "22", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: SUCCESS }}>✓ {q}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 6, backgroundColor: C.surface, borderRadius: 8, padding: 8, marginTop: 8 }}>
            <Feather name="link" size={12} color={C.textMuted} style={{ marginTop: 2 }} />
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted, flex: 1, lineHeight: 16 }}>
              {svcDesc.linkType}
            </Text>
          </View>
          {svcDesc.warning && (
            <View style={{ flexDirection: "row", gap: 6, backgroundColor: WARNING + "15", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: WARNING + "30", marginTop: 8 }}>
              <Feather name="alert-triangle" size={12} color={WARNING} style={{ marginTop: 2 }} />
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: WARNING, flex: 1, lineHeight: 16 }}>
                {svcDesc.warning}
              </Text>
            </View>
          )}
        </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: C.surface,
            borderColor: C.border,
            opacity: entry2,
            transform: [{ translateY: entry2.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          },
        ]}
      >
        <View style={styles.sectionHeaderRow}>
          <View style={[styles.accentBar, { backgroundColor: GOLD }]} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>Complétez votre commande</Text>
        </View>

        {isAccountSale && (
          <View style={{ backgroundColor: WARNING + "15", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: WARNING + "30", flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <Feather name="key" size={14} color={WARNING} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: WARNING }}>
                Service de vente de compte
              </Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: WARNING, lineHeight: 16, opacity: 0.85 }}>
                Quantité fixée à 1 · Compte exclusif · Livraison par email (instantané si en stock, sinon &lt;24h). Entrez votre adresse email ci-dessous.
              </Text>
            </View>
          </View>
        )}

        <View style={{ gap: 6 }}>
          <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
            {isAccountSale ? "Votre adresse email *" : "Lien (URL de votre page ou post) *"}
          </Text>
          <View style={[styles.inputRow, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
            <Feather name={isAccountSale ? "mail" : "link-2"} size={16} color={C.textMuted} />
            <TextInput
              style={[styles.input, { color: C.text }]}
              placeholder={isAccountSale ? "exemple@email.com" : "https://..."}
              placeholderTextColor={C.textMuted}
              value={link} onChangeText={setLink}
              keyboardType={isAccountSale ? "email-address" : "url"}
              autoCapitalize="none" autoCorrect={false}
            />
          </View>
        </View>

        {!isCustom && (
          <View style={{ gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Quantité *</Text>
            {isAccountSale ? (
              <View style={[styles.inputRow, { backgroundColor: SUCCESS + "12", borderColor: SUCCESS + "50" }]}>
                <Feather name="hash" size={16} color={SUCCESS} />
                <Text style={[styles.input, { color: SUCCESS, fontFamily: "Inter_700Bold" }]}>
                  1 (fixe — compte exclusif)
                </Text>
              </View>
            ) : (
              <>
                <View style={[styles.inputRow, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                  <Feather name="hash" size={16} color={C.textMuted} />
                  <TextInput
                    style={[styles.input, { color: C.text }]}
                    placeholder={`Entre ${selectedService.min} et ${selectedService.max}`}
                    placeholderTextColor={C.textMuted}
                    value={quantity} onChangeText={setQuantity}
                    keyboardType="number-pad"
                  />
                </View>
                {quantity && (
                  <Text style={[styles.quantityHint, {
                    color: parseInt(quantity) < selectedService.min || parseInt(quantity) > selectedService.max
                      ? C.error : C.success,
                  }]}>
                    {parseInt(quantity) < selectedService.min
                      ? `Minimum: ${selectedService.min}`
                      : parseInt(quantity) > selectedService.max
                      ? `Maximum: ${selectedService.max}`
                      : "Quantité valide"}
                  </Text>
                )}
              </>
            )}
          </View>
        )}

        {isCustom && (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Commentaires personnalisés *</Text>
              <View style={{ backgroundColor: commentCount >= 10 ? SUCCESS + "22" : C.inputBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: commentCount >= 10 ? SUCCESS : C.textMuted }}>
                  {commentCount}/10
                </Text>
              </View>
            </View>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11.5, color: C.textMuted }}>
              Un commentaire par ligne · Minimum 10 requis
            </Text>
            <View style={[styles.inputRow, {
              backgroundColor: C.inputBg,
              borderColor: commentCount > 0 && commentCount < 10 ? C.error : commentCount >= 10 ? SUCCESS + "60" : C.inputBorder,
              height: 150, alignItems: "flex-start", paddingTop: 10,
            }]}>
              <TextInput
                style={[styles.input, { color: C.text, height: 130, textAlignVertical: "top" }]}
                placeholder={"Super photo !\nJ'adore ce contenu\nTrès inspirant, continue !"}
                placeholderTextColor={C.textMuted}
                value={customComments}
                onChangeText={setCustomComments}
                multiline
                numberOfLines={6}
              />
            </View>
            {commentCount > 0 && commentCount < 10 && (
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: C.error }}>
                {commentCount} commentaire{commentCount > 1 ? "s" : ""} — il en manque encore {10 - commentCount}
              </Text>
            )}
            {commentCount >= 10 && (
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: SUCCESS }}>
                {commentCount} commentaires saisis — Quantité : {commentCount}
              </Text>
            )}
          </View>
        )}

        {liveComputedPrice > 0 && (
          <View style={[styles.priceSummary, { backgroundColor: C.inputBg, borderColor: C.border }]}>
            {hasReferral && qty > 0 && (
              <View style={{ backgroundColor: "#E91E6315", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "#E91E6340", flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name="gift" size={14} color="#E91E63" />
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#E91E63", flex: 1 }}>
                  Réduction filleul -10% ({referralOrdersUsed + 1}/5 commandes)
                </Text>
              </View>
            )}
            {isReseller && origComputedPrice > 0 && (
              <View style={styles.priceSummaryRow}>
                <Text style={[styles.priceSummaryLabel, { color: C.textMuted }]}>Prix public</Text>
                <Text style={[styles.priceSummaryValue, { color: C.textMuted, textDecorationLine: "line-through", fontSize: 13 }]}>
                  {fmt(origComputedPrice)}
                </Text>
              </View>
            )}
            {hasReferral && qty > 0 && (
              <View style={styles.priceSummaryRow}>
                <Text style={[styles.priceSummaryLabel, { color: C.textMuted }]}>Avant réduction</Text>
                <Text style={[styles.priceSummaryValue, { color: C.textMuted, textDecorationLine: "line-through", fontSize: 13 }]}>
                  {fmt(baseComputedPrice)}
                </Text>
              </View>
            )}
            <View style={styles.priceSummaryRow}>
              <Text style={[styles.priceSummaryLabel, { color: C.textSecondary }]}>
                {isReseller ? "Votre prix revendeur" : hasReferral ? "Votre prix (-10%)" : "Prix estimé"}
              </Text>
              <Text style={[styles.priceSummaryValue, { color: SUCCESS, fontSize: 17 }]}>{fmt(liveComputedPrice)}</Text>
            </View>
            {isReseller && savings > 0 && (
              <View style={[styles.priceSummaryRow, { backgroundColor: "rgba(212,175,55,0.12)", borderRadius: 8, padding: 8 }]}>
                <Text style={[styles.priceSummaryLabel, { color: isDark ? GOLD : NAVY }]}>Votre économie</Text>
                <Text style={[styles.priceSummaryValue, { color: isDark ? GOLD : NAVY }]}>-{fmt(savings)}</Text>
              </View>
            )}
            <View style={[styles.priceSummaryRow, { borderTopWidth: 1, borderTopColor: C.separator, paddingTop: 8 }]}>
              <Text style={[styles.priceSummaryLabel, { color: C.textSecondary }]}>Votre solde</Text>
              <Text style={[styles.priceSummaryValue, { color: userBalance < liveComputedPrice ? C.error : C.text }]}>
                {fmt(userBalance)}
              </Text>
            </View>
            {userBalance < liveComputedPrice && (
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: C.error }}>
                Il vous manque {fmt(liveComputedPrice - userBalance)}
              </Text>
            )}
          </View>
        )}

        <Animated.View style={{ transform: [{ scale: submitPress.scale }] }}>
          <Pressable
            onPressIn={submitPress.onPressIn}
            onPressOut={submitPress.onPressOut}
            onPress={onSubmit}
            disabled={submitting}
            style={styles.submitBtn}
          >
            <LinearGradient
              colors={isDark ? [NAVY_LIGHT, NAVY] : [NAVY, "#071229"]}
              style={styles.submitGradient}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Feather name="send" size={18} color={GOLD} />
                  <Text style={styles.submitText}>Passer la commande</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Service Modal — version upgradée :
//  • Barre de recherche temps réel
//  • Tri par prix (asc par défaut)
//  • Traduction FR toggle
//  • Favoris par service
//  • Skeleton loader
// ═══════════════════════════════════════════════════════════════
function ServiceModal({
  visible, onClose, services, selectedService, onSelect,
  orderType, catMeta, fmt, C, isDark, platform,
  isFavorite, onToggleFavorite,
}: any) {
  const isAutomatic = orderType === "automatique";
  const isAdvanced = orderType === "avancee";
  const isReseller = orderType === "revendeur";

  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [translateFR, setTranslateFR] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);

  // Reset à l'ouverture + skeleton pour grosses listes
  useEffect(() => {
    if (visible) {
      setSearch("");
      if (services.length > 150) {
        setShowSkeleton(true);
        const t = setTimeout(() => setShowSkeleton(false), 500);
        return () => clearTimeout(t);
      }
    }
  }, [visible, services.length]);

  const filteredSorted = useMemo(
    () => filterAndSortServices(services, search, sortAsc),
    [services, search, sortAsc]
  );

  const displayed = filteredSorted.slice(0, 500);
  const totalFiltered = filteredSorted.length;

  const displayName = useCallback(
    (name: string) => (translateFR ? translateServiceName(name) : name),
    [translateFR]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: C.surface }]}>
          <View style={styles.modalGrabber} />
          <View style={[styles.modalHeader, { borderBottomColor: C.separator }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: C.text }]}>
                {catMeta?.label ?? "Services"}
              </Text>
              <Text style={[styles.modalSub, { color: C.textMuted }]}>
                {totalFiltered === services.length
                  ? `${services.length} service${services.length > 1 ? "s" : ""} disponible${services.length > 1 ? "s" : ""}`
                  : `${totalFiltered} résultat${totalFiltered > 1 ? "s" : ""} sur ${services.length}`}
              </Text>
            </View>
            <Pressable style={[styles.modalClose, { backgroundColor: C.inputBg }]} onPress={onClose}>
              <Feather name="x" size={18} color={C.textMuted} />
            </Pressable>
          </View>

          {/* Barre de recherche */}
          <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                borderWidth: 1,
                borderRadius: 12,
                backgroundColor: C.inputBg,
                borderColor: C.inputBorder,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Feather name="search" size={16} color={C.textMuted} />
              <TextInput
                style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: C.text }}
                placeholder="Rechercher un service..."
                placeholderTextColor={C.textMuted}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch("")} hitSlop={8}>
                  <Feather name="x-circle" size={16} color={C.textMuted} />
                </Pressable>
              )}
            </View>

            {/* Tri + Traduction */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setSortAsc(!sortAsc); }}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: C.border,
                  backgroundColor: C.inputBg,
                  paddingVertical: 9,
                }}
              >
                <Feather name={sortAsc ? "arrow-up" : "arrow-down"} size={12} color={C.textMuted} />
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: C.textSecondary }}>
                  Prix {sortAsc ? "croissant" : "décroissant"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setTranslateFR(!translateFR); }}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: translateFR ? INFO : C.border,
                  backgroundColor: translateFR ? INFO + "18" : C.inputBg,
                  paddingVertical: 9,
                }}
              >
                <Feather name="type" size={12} color={translateFR ? INFO : C.textMuted} />
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: translateFR ? INFO : C.textSecondary }}>
                  {translateFR ? "Français ✓" : "Traduire en FR"}
                </Text>
              </Pressable>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24, paddingTop: 12, paddingHorizontal: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            {showSkeleton ? (
              <ServiceSkeleton C={C} isDark={isDark} rows={6} />
            ) : displayed.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}>
                <Feather name="search" size={32} color={C.textMuted} />
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.text, textAlign: "center" }}>
                  Aucun service trouvé
                </Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12.5, color: C.textMuted, textAlign: "center", paddingHorizontal: 20 }}>
                  Essayez un autre mot-clé (ex: « abonnés », « likes », « vues »)
                </Text>
              </View>
            ) : (
              <>
                {totalFiltered > 500 && (
                  <View style={{ marginBottom: 10, padding: 10, borderRadius: 10, backgroundColor: INFO + "12", borderWidth: 1, borderColor: INFO + "30" }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11.5, color: INFO, textAlign: "center" }}>
                      Affichage des 500 premiers résultats — affinez votre recherche pour voir d'autres services.
                    </Text>
                  </View>
                )}

                {isAutomatic ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {displayed.map((svc: ExoService) => {
                      const isSelected = selectedService?.id === svc.id;
                      const fav = isFavorite(svc.id);
                      const displayN = displayName(svc.name);
                      const isTranslated = translateFR && displayN !== svc.name;
                      return (
                        <Pressable
                          key={svc.id}
                          onPress={() => onSelect(svc)}
                          style={({ pressed }) => [
                            {
                              width: "48.5%",
                              borderRadius: 12,
                              borderWidth: 1.5,
                              padding: 12,
                              gap: 6,
                              backgroundColor: isSelected ? SUCCESS + "15" : C.inputBg,
                              borderColor: isSelected ? SUCCESS : C.border,
                            },
                            pressed && { opacity: 0.85 },
                          ]}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: SUCCESS + "20", alignItems: "center", justifyContent: "center" }}>
                              <Feather name="zap" size={11} color={SUCCESS} />
                            </View>
                            {svc.averageTime && (
                              <View style={{ backgroundColor: SUCCESS + "22", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: SUCCESS }}>
                                  {svc.averageTime}
                                </Text>
                              </View>
                            )}
                            <Pressable onPress={() => onToggleFavorite(svc)} hitSlop={6} style={{ marginLeft: "auto" }}>
                              <Feather name="star" size={13} color={GOLD} fill={fav ? GOLD : "transparent"} />
                            </Pressable>
                          </View>
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12.5, color: C.text, lineHeight: 17 }} numberOfLines={3}>
                            {displayN}
                          </Text>
                          {isTranslated && (
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9.5, color: INFO, fontStyle: "italic" }}>
                              Traduit du service original
                            </Text>
                          )}
                          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10.5, color: C.textMuted }} numberOfLines={1}>
                            Min {svc.min.toLocaleString()} · Max {svc.max.toLocaleString()}
                          </Text>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: SUCCESS }}>
                              {fmt(svc.priceXAF)}
                            </Text>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: C.textMuted }}>
                              {svc.isPerOne || svc.isPackage ? "/u" : "/1k"}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : isAdvanced ? (
                  <View style={{ gap: 10 }}>
                    {displayed.map((svc: ExoService) => {
                      const isSelected = selectedService?.id === svc.id;
                      const fav = isFavorite(svc.id);
                      const displayN = displayName(svc.name);
                      return (
                        <Pressable
                          key={svc.id}
                          onPress={() => onSelect(svc)}
                          style={({ pressed }) => [
                            {
                              borderRadius: 14,
                              borderWidth: 1.5,
                              padding: 14,
                              gap: 8,
                              backgroundColor: isSelected ? "#FF6B35" + "15" : C.inputBg,
                              borderColor: isSelected ? "#FF6B35" : C.border,
                            },
                            pressed && { opacity: 0.85 },
                          ]}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FF6B3522", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                              <Feather name="star" size={10} color="#FF6B35" />
                              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9.5, color: "#FF6B35", letterSpacing: 0.3 }}>
                                AVANCÉ
                              </Text>
                            </View>
                            {svc.averageTime && (
                              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted }}>
                                {svc.averageTime}
                              </Text>
                            )}
                            <Pressable onPress={() => onToggleFavorite(svc)} hitSlop={6} style={{ marginLeft: "auto" }}>
                              <Feather name="star" size={15} color={GOLD} fill={fav ? GOLD : "transparent"} />
                            </Pressable>
                          </View>
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.text, lineHeight: 19 }} numberOfLines={3}>
                            {displayN}
                          </Text>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                            <View style={{ flexDirection: "row", gap: 10 }}>
                              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted }}>
                                Min {svc.min.toLocaleString()}
                              </Text>
                              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted }}>
                                Max {svc.max.toLocaleString()}
                              </Text>
                            </View>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#FF6B35" }}>
                              {fmt(svc.priceXAF)}
                              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: C.textMuted }}>
                                {" "}{svc.isPerOne || svc.isPackage ? "/u" : "/1k"}
                              </Text>
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <View>
                    {displayed.map((svc: ExoService) => {
                      const isSelected = selectedService?.id === svc.id;
                      const fav = isFavorite(svc.id);
                      const accentColor = isReseller ? GOLD : NAVY;
                      const displayN = displayName(svc.name);
                      return (
                        <Pressable
                          key={svc.id}
                          onPress={() => onSelect(svc)}
                          style={({ pressed }) => [
                            {
                              flexDirection: "row",
                              alignItems: "center",
                              borderWidth: 1,
                              borderRadius: 12,
                              padding: 12,
                              marginBottom: 8,
                              backgroundColor: isSelected ? accentColor + "15" : C.inputBg,
                              borderColor: isSelected ? accentColor : C.border,
                              gap: 10,
                            },
                            pressed && { opacity: 0.85 },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 18, color: C.text }} numberOfLines={3}>
                              {displayN}
                            </Text>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 3, color: C.textMuted }}>
                              Min {svc.min.toLocaleString()} · Max {svc.max.toLocaleString()}
                              {svc.averageTime ? ` · ${svc.averageTime}` : ""}
                            </Text>
                          </View>
                          <View style={{ alignItems: "flex-end", gap: 3 }}>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: SUCCESS }}>
                              {fmt(svc.priceXAF)}
                            </Text>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: C.textMuted }}>
                              {svc.isPerOne || svc.isPackage ? "/unité" : "/1000"}
                            </Text>
                          </View>
                          <Pressable onPress={() => onToggleFavorite(svc)} hitSlop={6}>
                            <Feather name="star" size={16} color={GOLD} fill={fav ? GOLD : "transparent"} />
                          </Pressable>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function InsufficientBalanceModal({
  visible, onClose, missingAmount, balance, fmt, onRecharge, C,
}: any) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={[styles.modalOverlay, { justifyContent: "center", paddingHorizontal: 24 }]}>
        <View style={{ backgroundColor: C.surface, borderRadius: 22, padding: 24, gap: 16 }}>
          <View style={{ alignItems: "center", gap: 10 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: DANGER + "20", alignItems: "center", justifyContent: "center" }}>
              <Feather name="alert-circle" size={32} color={DANGER} />
            </View>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: C.text, textAlign: "center" }}>
              Solde insuffisant
            </Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: C.textSecondary, textAlign: "center", lineHeight: 20 }}>
              Votre solde est insuffisant pour passer cette commande.
            </Text>
          </View>
          <View style={{ backgroundColor: C.inputBg, borderRadius: 14, padding: 16, gap: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: C.textMuted }}>Solde actuel</Text>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: C.text }}>{fmt(balance)}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: C.textMuted }}>Montant manquant</Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: DANGER }}>{fmt(missingAmount)}</Text>
            </View>
          </View>
          <Pressable style={{ borderRadius: 14, overflow: "hidden" }} onPress={onRecharge}>
            <LinearGradient
              colors={[NAVY_LIGHT, NAVY]}
              style={{ paddingVertical: 15, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              <Feather name="plus-circle" size={16} color={GOLD} />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" }}>Recharger mon solde</Text>
            </LinearGradient>
          </Pressable>
          <Pressable style={{ alignItems: "center", paddingVertical: 8 }} onPress={onClose}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: C.textMuted }}>Fermer</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ResellerSpaceModal({
  visible, onClose, currentLevel, nextLevel, resellerOrdersCount, C, isDark,
}: any) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: C.surface, maxHeight: "88%" }]}>
          <View style={styles.modalGrabber} />
          <View style={[styles.modalHeader, { borderBottomColor: C.separator }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: isDark ? GOLD : NAVY }]}>Mon Espace Revendeur</Text>
              <Text style={[styles.modalSub, { color: C.textMuted }]}>Statistiques et avantages</Text>
            </View>
            <Pressable style={[styles.modalClose, { backgroundColor: C.inputBg }]} onPress={onClose}>
              <Feather name="x" size={18} color={C.textMuted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} showsVerticalScrollIndicator={false}>
            <View style={{
              backgroundColor: currentLevel.color + "15",
              borderRadius: 18, padding: 16,
              borderWidth: 1.5, borderColor: currentLevel.color + "60", gap: 10,
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{
                  width: 56, height: 56, borderRadius: 16,
                  backgroundColor: currentLevel.color + "20",
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Feather name={currentLevel.icon} size={26} color={currentLevel.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11.5, color: C.textMuted, letterSpacing: 0.5, textTransform: "uppercase" }}>
                    Niveau actuel
                  </Text>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: currentLevel.color, letterSpacing: -0.3 }}>
                    {currentLevel.name}
                  </Text>
                </View>
                <View style={{ backgroundColor: currentLevel.color + "20", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: currentLevel.color }}>
                    -{currentLevel.discount}%
                  </Text>
                </View>
              </View>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: C.textSecondary }}>
                Vous bénéficiez de {currentLevel.discount}% de réduction sur tous vos achats revendeur.
              </Text>
              {nextLevel && (
                <View style={{ backgroundColor: C.inputBg, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Feather name="trending-up" size={14} color={nextLevel.color} />
                  <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: C.textSecondary, lineHeight: 17 }}>
                    Prochain : <Text style={{ fontFamily: "Inter_700Bold", color: nextLevel.color }}>{nextLevel.name} (-{nextLevel.discount}%)</Text>{" "}
                    à partir de {nextLevel.orders} commandes{" "}
                    ({Math.max(0, nextLevel.orders - resellerOrdersCount)} restantes)
                  </Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              {[
                { label: "Commandes", value: resellerOrdersCount.toLocaleString(), icon: "shopping-cart" as const, color: INFO },
                { label: "Remise", value: `-${currentLevel.discount}%`, icon: "tag" as const, color: SUCCESS },
              ].map((s, i) => (
                <View key={i} style={{
                  flex: 1, backgroundColor: s.color + "15", borderRadius: 16, padding: 16,
                  gap: 8, alignItems: "center", borderWidth: 1, borderColor: s.color + "30",
                }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: s.color + "20", alignItems: "center", justifyContent: "center" }}>
                    <Feather name={s.icon} size={18} color={s.color} />
                  </View>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: s.color }}>{s.value}</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted }}>{s.label}</Text>
                </View>
              ))}
            </View>

            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11.5, color: C.textMuted, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 4 }}>
              Tous les niveaux
            </Text>
            {RESELLER_LEVELS.map((lvl) => {
              const isActive = currentLevel.name === lvl.name;
              const isPast = resellerOrdersCount >= lvl.orders;
              return (
                <View key={lvl.name} style={{
                  flexDirection: "row", alignItems: "center", gap: 12, padding: 13,
                  borderRadius: 14, borderWidth: isActive ? 1.5 : 1,
                  borderColor: isActive ? lvl.color : C.border,
                  backgroundColor: isActive ? lvl.color + "15" : C.inputBg,
                }}>
                  <View style={{
                    width: 40, height: 40, borderRadius: 12,
                    backgroundColor: isActive ? lvl.color + "25" : C.border,
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <Feather name={lvl.icon} size={18} color={isActive ? lvl.color : C.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: isActive ? lvl.color : isPast ? C.text : C.textMuted }}>
                      {lvl.name}
                    </Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted }}>
                      {lvl.orders === 0 ? "Dès la 1ère commande" : `À partir de ${lvl.orders} commandes`}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: lvl.color + "20", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: lvl.color }}>-{lvl.discount}%</Text>
                  </View>
                  {isActive && <Feather name="check-circle" size={16} color={lvl.color} />}
                </View>
              );
            })}

            <View style={{ backgroundColor: C.accent + "10", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.accent + "25" }}>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: C.textSecondary, lineHeight: 18 }}>
                En tant que revendeur, vous achetez à prix réduit et revendez au prix plein à vos clients. Votre niveau augmente automatiquement avec le nombre de commandes.
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Categories Help Modal — Nouvelle explication honnête
// ═══════════════════════════════════════════════════════════════
function CategoriesHelpModal({ visible, onClose, C, isDark }: any) {
  const entry = useEntry(60);
  const CATEGORY_INFOS = [
    {
      key: "standard",
      title: "Commande Standard",
      icon: "shopping-cart" as const,
      color: "#1E90FF",
      points: [
        "Une sélection de services choisis pour leur fiabilité.",
        "Tous les services de cette catégorie fonctionnent parfaitement.",
        "Ce sont les commandes les plus utilisées au quotidien.",
        "Idéal pour la majorité des besoins sur les grandes plateformes.",
      ],
    },
    {
      key: "automatique",
      title: "Commande Automatique",
      icon: "zap" as const,
      color: "#00C853",
      points: [
        "Plus de 12 000 services au choix dans un seul endroit.",
        "« Automatique » veut dire : le traitement démarre tout seul dès la commande.",
        "Ce n'est pas la même chose qu'« instantané » (réservé à Telegram/WhatsApp).",
        "Si vous ne trouvez pas votre bonheur ailleurs, vous le trouverez ici.",
      ],
    },
    {
      key: "revendeur",
      title: "Espace Revendeur",
      icon: "award" as const,
      color: "#D4AF37",
      points: [
        "Ce sont exactement les mêmes services que la catégorie Standard.",
        "La seule différence : vous bénéficiez de réductions automatiques.",
        "Plus vous commandez, plus votre remise augmente.",
        "Pensé pour ceux qui revendent leurs services à leurs propres clients.",
      ],
    },
    {
      key: "avancee",
      title: "Commande Avancée",
      icon: "star" as const,
      color: "#FF6B35",
      points: [
        "Un ensemble de services ciblés, orientés Afrique et plus originaux.",
        "« Avancée » est simplement un nom, pas une promesse de supériorité.",
        "Ce ne sont pas des services « premium » au sens strict.",
        "Un choix complémentaire quand vous cherchez autre chose.",
      ],
    },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: C.surface, maxHeight: "92%" }]}>
          <View style={styles.modalGrabber} />
          <View style={[styles.modalHeader, { borderBottomColor: C.separator }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: C.text }]}>Guide des catégories</Text>
              <Text style={[styles.modalSub, { color: C.textMuted }]}>Pour mieux choisir selon votre besoin</Text>
            </View>
            <Pressable style={[styles.modalClose, { backgroundColor: C.inputBg }]} onPress={onClose}>
              <Feather name="x" size={18} color={C.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 24, gap: 12 }} showsVerticalScrollIndicator={false}>
            <View style={{ backgroundColor: WARNING + "12", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: WARNING + "30" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Feather name="alert-circle" size={14} color={WARNING} />
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12.5, color: WARNING }}>
                  Bon à savoir
                </Text>
              </View>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: C.textSecondary, lineHeight: 18 }}>
                Les noms « Standard », « Automatique », « Revendeur » et « Avancée » sont avant tout des
                façons d'appeler les choses. Ils n'indiquent pas une hiérarchie de qualité entre les catégories.
                Chaque catégorie répond à un besoin précis.
              </Text>
            </View>

            {CATEGORY_INFOS.map((cat, i) => (
              <View
                key={cat.key}
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: cat.color + "35",
                  backgroundColor: cat.color + "08",
                  padding: 14,
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: cat.color + "22", alignItems: "center", justifyContent: "center" }}>
                    <Feather name={cat.icon} size={18} color={cat.color} />
                  </View>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: C.text, flex: 1 }}>
                    {cat.title}
                  </Text>
                </View>
                {cat.points.map((p, j) => (
                  <View key={j} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: cat.color, marginTop: 7 }} />
                    <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 12.5, color: C.textSecondary, lineHeight: 18 }}>
                      {p}
                    </Text>
                  </View>
                ))}
              </View>
            ))}

            <View style={{ backgroundColor: C.inputBg, borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, borderColor: C.border }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name="zap" size={16} color={SUCCESS} />
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: C.text }}>
                  Automatique ≠ Instantané
                </Text>
              </View>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: C.textSecondary, lineHeight: 18 }}>
                « Automatique » désigne une commande qui démarre seule dès réception. « Instantané » est
                réservé aux services qui livrent en quelques secondes (par exemple certains services
                Telegram ou WhatsApp). Ce sont deux choses différentes.
              </Text>
            </View>

            <Pressable style={{ borderRadius: 14, overflow: "hidden", marginTop: 8 }} onPress={onClose}>
              <LinearGradient
                colors={[NAVY_LIGHT, NAVY]}
                style={{ paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14.5, color: "#fff" }}>
                  Compris, je choisis maintenant
                </Text>
                <Feather name="chevron-right" size={16} color={GOLD} />
              </LinearGradient>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SuccessOrderModal({
  data, onClose, onViewOrders, onOrderRecommended, fmt, isDark,
}: any) {
  const scale = useRef(new Animated.Value(0.5)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (data) {
      scale.setValue(0.85);
      opacity.setValue(0);
      checkScale.setValue(0);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }),
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
        Animated.sequence([
          Animated.delay(150),
          Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 12 }),
        ]),
      ]).start();
    }
  }, [data]);

  if (!data) return null;

  const recos = data.recommendations ?? [];

  return (
    <Modal visible={!!data} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.successOverlay}>
        <Animated.View
          style={[
            styles.successSheet,
            isDark
              ? { backgroundColor: DARK_SURFACE, borderColor: DARK_BORDER }
              : { backgroundColor: LIGHT_SURFACE, borderColor: LIGHT_BORDER },
            { transform: [{ scale }], opacity },
          ]}
        >
          <Animated.View
            style={[
              styles.successIconWrap,
              {
                backgroundColor: SUCCESS + "15",
                borderColor: SUCCESS + "30",
                transform: [{ scale: checkScale }],
              },
            ]}
          >
            <Feather name="check" size={38} color={SUCCESS} />
          </Animated.View>

          <Text style={[styles.successTitle, { color: isDark ? "#fff" : LIGHT_TEXT }]}>
            Commande lancée !
          </Text>
          <Text style={[styles.successSub, { color: isDark ? "rgba(255,255,255,0.65)" : LIGHT_TEXT_2 }]}>
            Vos résultats arrivent dans quelques instants.
          </Text>

          <View style={[styles.successSummary, {
            backgroundColor: isDark ? "rgba(255,255,255,0.05)" : LIGHT_INPUT_BG,
            borderColor: isDark ? DARK_BORDER : LIGHT_BORDER,
          }]}>
            <View style={styles.successRow}>
              <Text style={[styles.successRowLabel, { color: isDark ? "rgba(255,255,255,0.55)" : LIGHT_TEXT_2 }]}>
                Montant débité
              </Text>
              <Text style={[styles.successRowValue, { color: "#FF6B6B" }]}>
                -{fmt(data.price)}
              </Text>
            </View>
            <View style={[styles.successDivider, { backgroundColor: isDark ? DARK_BORDER : LIGHT_BORDER }]} />
            <View style={styles.successRow}>
              <Text style={[styles.successRowLabel, { color: isDark ? "rgba(255,255,255,0.55)" : LIGHT_TEXT_2 }]}>
                Solde restant
              </Text>
              <Text style={[styles.successRowValue, { color: isDark ? GOLD : NAVY }]}>
                {fmt(data.balance)}
              </Text>
            </View>
          </View>

          {recos.length > 0 && (
            <View style={[styles.recosBox, {
              backgroundColor: isDark ? "rgba(212,175,55,0.06)" : "rgba(212,175,55,0.08)",
              borderColor: GOLD + "40",
            }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: GOLD + "20", alignItems: "center", justifyContent: "center" }}>
                  <Feather name="zap" size={13} color={isDark ? GOLD : GOLD_SOFT} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12.5, color: isDark ? GOLD : NAVY }}>
                    Recommandé pour vous
                  </Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10.5, color: isDark ? "rgba(255,255,255,0.6)" : LIGHT_TEXT_2, marginTop: 2 }}>
                    Complétez votre commande pour un rendu plus naturel
                  </Text>
                </View>
              </View>

              {recos.map((svc: ExoService) => (
                <Pressable
                  key={svc.id}
                  onPress={() => onOrderRecommended?.(svc)}
                  style={({ pressed }) => [
                    styles.recoItem,
                    {
                      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#FFFFFF",
                      borderColor: isDark ? DARK_BORDER : LIGHT_BORDER,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12.5, color: isDark ? "#fff" : LIGHT_TEXT, lineHeight: 17 }} numberOfLines={2}>
                      {svc.name}
                    </Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10.5, color: isDark ? "rgba(255,255,255,0.5)" : LIGHT_TEXT_2, marginTop: 2 }}>
                      Dès {fmt(svc.priceXAF)} · Min {svc.min.toLocaleString()}
                    </Text>
                  </View>
                  <Feather name="arrow-up-right" size={16} color={isDark ? GOLD : GOLD_SOFT} />
                </Pressable>
              ))}
            </View>
          )}

          <Pressable style={styles.successBtnPrimary} onPress={onViewOrders}>
            <Feather name="list" size={16} color="#fff" />
            <Text style={styles.successBtnPrimaryText}>Voir mes commandes</Text>
          </Pressable>

          <Pressable
            style={[
              styles.successBtnSecondary,
              { borderColor: isDark ? "rgba(255,255,255,0.18)" : LIGHT_BORDER },
            ]}
            onPress={onClose}
          >
            <Text style={[styles.successBtnSecondaryText, { color: isDark ? "rgba(255,255,255,0.7)" : LIGHT_TEXT_2 }]}>
              Commander encore
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function BoostInfoModal({ visible, onClose, onReclamation, C, isDark }: any) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: C.surface, maxHeight: "92%" }]}>
          <View style={styles.modalGrabber} />
          <View style={[styles.modalHeader, { borderBottomColor: C.separator }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: C.text }]}>Guide des boosts</Text>
              <Text style={[styles.modalSub, { color: C.textMuted }]}>Tout ce qu'il faut savoir avant de commander</Text>
            </View>
            <Pressable style={[styles.modalClose, { backgroundColor: C.inputBg }]} onPress={onClose}>
              <Feather name="x" size={18} color={C.textMuted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24, gap: 14 }}>

            <View style={{ backgroundColor: "#10A37F12", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#10A37F35" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Feather name="info" size={18} color="#10A37F" />
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#10A37F" }}>
                  Variations normales après un boost
                </Text>
              </View>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: C.text, lineHeight: 20, marginBottom: 10 }}>
                Après chaque boost, il est tout à fait normal d'observer de légères variations. Toutes les grandes plateformes procèdent régulièrement à des nettoyages techniques automatiques — sain et naturel.
              </Text>
              {[
                { dot: GOLD, text: "Basique : stabilisation progressive" },
                { dot: SUCCESS, text: "Moyen : bonne rétention, variations légères" },
                { dot: INFO, text: "Élite : stabilité maximale" },
              ].map((r, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.dot }} />
                  <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: C.text }}>{r.text}</Text>
                </View>
              ))}
            </View>

            <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <Feather name="layers" size={18} color={INFO} />
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: C.text }}>
                  Code couleur qualité
                </Text>
              </View>
              {[
                { color: GOLD, label: "BASIQUE", badge: "Entrée de gamme", desc: "Services accessibles, livraison rapide. Idéal pour une première présence sociale. Résultats variables selon plateformes." },
                { color: SUCCESS, label: "MOYEN", badge: "Qualité & Fiabilité", desc: "Équilibre parfait rapidité/stabilité. Engagement réaliste, performances solides. Garantie incluse sur certains services." },
                { color: INFO, label: "ÉLITE", badge: "Haut de gamme", desc: "Notre meilleur niveau. Méthodes naturelles, performance stable et garantie. Engagement organique 100%." },
              ].map((q, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: i < 2 ? 14 : 0 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: q.color + "20", alignItems: "center", justifyContent: "center" }}>
                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: q.color }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: C.text }}>{q.label}</Text>
                      <View style={{ backgroundColor: q.color + "25", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: q.color }}>{q.badge}</Text>
                      </View>
                    </View>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: C.textMuted, lineHeight: 19 }}>{q.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={{ backgroundColor: "#10A37F12", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#10A37F35" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Feather name="zap" size={18} color="#10A37F" />
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#10A37F" }}>Booster intelligemment</Text>
              </View>

              <View style={{ backgroundColor: "#10A37F20", borderRadius: 10, padding: 10, marginBottom: 12, flexDirection: "row", gap: 8 }}>
                <Feather name="bar-chart-2" size={16} color="#10A37F" style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontFamily: "Inter_500Medium", fontSize: 12, color: C.text, lineHeight: 18 }}>
                  <Text style={{ fontFamily: "Inter_700Bold" }}>Règle des proportions : </Text>
                  Pour 1M de vues, minimum 500K likes + commentaires + partages. La moitié des vues en likes est le minimum naturel.
                </Text>
              </View>

              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: C.textMuted, marginBottom: 8, letterSpacing: 0.5 }}>
                À FAIRE
              </Text>
              {[
                { icon: "video" as const, tip: "LIVE : lancez la diffusion AVANT, puis copiez le lien du live en cours." },
                { icon: "trending-up" as const, tip: "Progressivité : commencez par 100K–200K vues, attendez, puis continuez." },
                { icon: "layers" as const, tip: "Variez les services : vues + likes (min 50% des vues) + commentaires + partages + abonnés." },
                { icon: "clock" as const, tip: "Attendez la livraison complète avant de passer une nouvelle commande." },
              ].map((c, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: "#10A37F20", alignItems: "center", justifyContent: "center" }}>
                    <Feather name={c.icon} size={13} color="#10A37F" />
                  </View>
                  <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: C.text, lineHeight: 19 }}>{c.tip}</Text>
                </View>
              ))}

              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: C.textMuted, marginTop: 4, marginBottom: 8, letterSpacing: 0.5 }}>
                À ÉVITER
              </Text>
              {[
                "Ne boostez pas en grande quantité d'un coup sur le même lien",
                "Ne dupliquez pas le même service sur le même lien simultanément",
                "N'achetez pas uniquement des vues sans likes/commentaires",
              ].map((tip, i, arr) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: i < arr.length - 1 ? 10 : 0 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: "#FF572218", alignItems: "center", justifyContent: "center" }}>
                    <Feather name="x-circle" size={13} color="#FF5722" />
                  </View>
                  <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: C.text, lineHeight: 19 }}>{tip}</Text>
                </View>
              ))}
            </View>

            <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Feather name="shield" size={18} color={INFO} />
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: C.text }}>Réclamations & garanties</Text>
              </View>
              {[
                "Service commandé en HQ / Premium / Non-drop",
                "Perte supérieure à 10% de la quantité livrée",
                "Réclamation dans les 30 jours après livraison",
                "Preuve requise : numéro de commande uniquement",
              ].map((cond, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: i < 3 ? 6 : 0 }}>
                  <Feather name="check-circle" size={14} color={INFO} style={{ marginTop: 2 }} />
                  <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: C.text, lineHeight: 18 }}>{cond}</Text>
                </View>
              ))}
            </View>

            <View style={{ backgroundColor: WARNING + "10", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: WARNING + "35" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Feather name="key" size={18} color={WARNING} />
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: WARNING }}>Comptes & Accès</Text>
              </View>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: C.text, lineHeight: 20, marginBottom: 12 }}>
                Certains services proposent des accès premium : ChatGPT Plus, DeepSeek Pro, Canva Premium, PayPal, GitHub Pro, comptes TikTok, etc.
              </Text>
              {[
                { n: 1, title: "Quantité = 1 uniquement", desc: "Ces services vendent 1 accès à la fois. Vous ne pouvez pas en commander plusieurs simultanément." },
                { n: 2, title: "Saisissez votre email dans le champ lien", desc: "Les identifiants vous seront envoyés à cette adresse." },
                { n: 3, title: "Votre compte, en exclusivité", desc: "Le compte vous appartient. Vous pouvez changer le mot de passe librement." },
                { n: 4, title: "Livraison instantanée si en stock", desc: "Sinon, jusqu'à 24h max." },
                { n: 5, title: "Remplacement garanti", desc: "Contactez le support sous 24h si l'accès ne fonctionne pas." },
              ].map((item, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: i < 4 ? 12 : 0 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: WARNING + "25", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: WARNING }}>{item.n}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: C.text, marginBottom: 3 }}>{item.title}</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: C.textMuted, lineHeight: 18 }}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Pressable style={{ borderRadius: 14, overflow: "hidden" }} onPress={onClose}>
              <LinearGradient
                colors={[NAVY_LIGHT, NAVY]}
                style={{ paddingVertical: 15, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" }}>
                  J'ai compris, allons-y
                </Text>
                <Feather name="chevron-right" size={16} color={GOLD} />
              </LinearGradient>
            </Pressable>

            <Pressable
              style={{ borderWidth: 1.5, borderColor: "#FF572250", borderRadius: 14, padding: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
              onPress={onReclamation}
            >
              <Feather name="refresh-cw" size={16} color="#FF5722" />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#FF5722" }}>
                Faire une réclamation
              </Text>
            </Pressable>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted, textAlign: "center", lineHeight: 16 }}>
              Réservé aux commandes Élite / HQ / Premium · Délai 30 jours
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    paddingHorizontal: 16, paddingBottom: 16,
    flexDirection: "row", alignItems: "center", gap: 10,
    flexWrap: "wrap",
  },
  headerGoldLine: {
    position: "absolute", top: 0, left: 20, right: 20, height: 2,
    backgroundColor: GOLD, opacity: 0.35,
    borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, letterSpacing: -0.3 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12.5, marginTop: 3 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerBtn: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  balancePill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8,
    borderWidth: 1,
  },
  balanceText: { fontFamily: "Inter_700Bold", fontSize: 12 },

  content: { paddingHorizontal: 14, paddingTop: 16, gap: 14 },

  intro: { gap: 4, paddingHorizontal: 4 },
  introTitle: { fontFamily: "Inter_700Bold", fontSize: 20, letterSpacing: -0.3 },
  introSub: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 2 },

  orderTypeRow: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 18, borderWidth: 1,
    padding: 14, gap: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12, elevation: 2,
  },
  orderTypeIconLarge: {
    width: 54, height: 54, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  orderTypeTitle: { fontFamily: "Inter_700Bold", fontSize: 16, letterSpacing: -0.15 },
  orderTypeDesc: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16 },
  orderTypeTagline: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.2, marginTop: 2 },
  orderTypeChevron: {
    width: 34, height: 34, borderRadius: 11,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },

  card: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 12 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  accentBar: { width: 3, height: 18, borderRadius: 2 },
  sectionLabel: { fontFamily: "Inter_700Bold", fontSize: 15, letterSpacing: -0.15 },

  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 13 },
  errorRow: { gap: 8 },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 12, flex: 1 },
  retryBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignSelf: "flex-start" },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },

  backTypeBtn: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 16, padding: 12 },
  backTypeBtnIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  backTypeBtnLabel: { fontFamily: "Inter_700Bold", fontSize: 14 },
  backTypeBtnSub: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },

  platformScroll: { paddingBottom: 4, gap: 10 },
  platformBtn: {
    alignItems: "center", gap: 6, borderWidth: 1.5,
    borderRadius: 14, padding: 10, width: 82,
  },
  platformIcon: { width: 40, height: 40, borderRadius: 12 },
  platformLabel: { fontFamily: "Inter_500Medium", fontSize: 10.5, textAlign: "center" },
  platformCountPill: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginTop: 2 },
  platformCountText: { fontFamily: "Inter_700Bold", fontSize: 9.5 },

  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 9,
    minWidth: "47%", flex: 1,
  },
  categoryIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  categoryLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, flex: 1 },
  countBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  countBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10 },

  serviceInfoCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 12 },
  serviceInfoTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  serviceInfoIconBox: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", padding: 8 },
  serviceInfoIcon: { width: "100%", height: "100%" },
  serviceInfoName: { fontFamily: "Inter_600SemiBold", fontSize: 14, lineHeight: 19, letterSpacing: -0.1 },
  categoryTag: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, alignSelf: "flex-start", marginTop: 5 },
  categoryTagText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  changeBtn: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 6 },
  changeBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  serviceInfoGrid: { flexDirection: "row", gap: 6 },
  serviceInfoCell: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 4, alignItems: "center" },
  serviceInfoLabel: { fontFamily: "Inter_500Medium", fontSize: 10, marginBottom: 3, letterSpacing: 0.2, textTransform: "uppercase" },
  serviceInfoValue: { fontFamily: "Inter_700Bold", fontSize: 11.5, textAlign: "center" },

  descBox: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },

  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 13, letterSpacing: 0.1 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
  input: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14 },
  quantityHint: { fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 2 },

  priceSummary: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  priceSummaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  priceSummaryLabel: { fontFamily: "Inter_400Regular", fontSize: 13 },
  priceSummaryValue: { fontFamily: "Inter_700Bold", fontSize: 15 },

  submitBtn: { borderRadius: 14, overflow: "hidden", marginTop: 4 },
  submitGradient: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  submitText: { fontFamily: "Inter_700Bold", fontSize: 15.5, color: "#fff", letterSpacing: 0.2 },

  hintCard: { borderWidth: 1, borderRadius: 18, padding: 20, alignItems: "center", gap: 12 },
  hintIconBox: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  hintText: { fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center", lineHeight: 20 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(10,28,58,0.55)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 16, maxHeight: "86%", paddingTop: 8 },
  modalGrabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(128,128,128,0.3)", marginTop: 4, marginBottom: 6 },
  modalHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1 },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 17, letterSpacing: -0.2 },
  modalSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  modalClose: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },

  successOverlay: {
    flex: 1, backgroundColor: "rgba(10,28,58,0.65)",
    justifyContent: "center", alignItems: "center", padding: 20,
  },
  successSheet: {
    borderRadius: 24, padding: 24, width: "100%",
    alignItems: "center", gap: 14, borderWidth: 1,
    shadowColor: "#000", shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.30, shadowRadius: 24, elevation: 14,
  },
  successIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: "center", justifyContent: "center", borderWidth: 2,
  },
  successTitle: { fontFamily: "Inter_700Bold", fontSize: 19, textAlign: "center", letterSpacing: -0.2 },
  successSub: { fontFamily: "Inter_400Regular", fontSize: 13.5, textAlign: "center", lineHeight: 19 },
  successSummary: {
    width: "100%", borderRadius: 14, padding: 14, gap: 10, borderWidth: 1,
  },
  successRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  successRowLabel: { fontFamily: "Inter_500Medium", fontSize: 12.5, letterSpacing: 0.1 },
  successRowValue: { fontFamily: "Inter_700Bold", fontSize: 15 },
  successDivider: { height: 1 },
  successBtnPrimary: {
    width: "100%", backgroundColor: "#1E90FF",
    borderRadius: 14, paddingVertical: 15,
    flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 10,
  },
  successBtnPrimaryText: { fontFamily: "Inter_700Bold", fontSize: 15.5, color: "#fff" },
  successBtnSecondary: {
    width: "100%", borderRadius: 14, paddingVertical: 13, alignItems: "center", borderWidth: 1,
  },
  successBtnSecondaryText: { fontFamily: "Inter_500Medium", fontSize: 14.5 },

  recosBox: {
    width: "100%", borderRadius: 14, padding: 12, gap: 10, borderWidth: 1,
  },
  recoItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 10, borderRadius: 10, borderWidth: 1,
  },
});