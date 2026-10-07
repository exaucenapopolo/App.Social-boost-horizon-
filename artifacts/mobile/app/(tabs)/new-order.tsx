import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
}

interface PlatformData {
  key: string;
  label: string;
  iconUrl: string;
  color: string;
  services: ExoService[];
}

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
  // MTP provider: detect "compte" + service name patterns
  if ((n.includes("compte") || n.includes("account") || n.includes("acc\u00e8s")) &&
      (n.includes("partag") || n.includes("premium") || n.includes("pro") || n.includes("plus"))) return true;
  // min=1 && max=1 strong signal
  if (svc.min === 1 && svc.max === 1) return true;
  return false;
}

const ORDER_TYPES = [
  {
    key: "standard",
    label: "Commande Standard",
    shortLabel: "Standard",
    icon: "shopping-cart" as const,
    description: "Services de base, simple, facile à commander, efficace",
    color: "#1E90FF",
    gradient: ["#1E90FF", "#0066CC"] as [string, string],
    badge: "Populaire",
  },
  {
    key: "automatique",
    label: "Commande Automatique",
    shortLabel: "Automatique",
    icon: "zap" as const,
    description: "Livraison plus rapide, plus de services que les autres",
    color: "#00C853",
    gradient: ["#00C853", "#009624"] as [string, string],
    badge: "24h/24",
  },
  {
    key: "revendeur",
    label: "Espace Revendeur",
    shortLabel: "Revendeur",
    icon: "star" as const,
    description: "Pour gagner des bénéfices, revendre à ses clients",
    color: "#FFD700",
    gradient: ["#FFD700", "#D4AF37"] as [string, string],
    badge: "Remise",
  },
  {
    key: "avancee",
    label: "Commande Avancée",
    shortLabel: "Avancées",
    icon: "settings" as const,
    description: "Service sensible, haute qualité, résultats premium",
    color: "#FF6B35",
    gradient: ["#FF6B35", "#CC4A1A"] as [string, string],
    badge: "Premium",
  },
];

const RESELLER_LEVELS = [
  { name: "Starter",        discount: 3,  orders: 0,    maxOrders: 9,    color: "#78909C", icon: "🥉" },
  { name: "Bronze",         discount: 5,  orders: 10,   maxOrders: 49,   color: "#CD7F32", icon: "🥉" },
  { name: "Argent",         discount: 10, orders: 50,   maxOrders: 199,  color: "#9E9E9E", icon: "🥈" },
  { name: "Or",             discount: 15, orders: 200,  maxOrders: 499,  color: "#FFC107", icon: "🥇" },
  { name: "Platine",        discount: 20, orders: 500,  maxOrders: 999,  color: "#00BCD4", icon: "💎" },
  { name: "Diamant",        discount: 25, orders: 1000, maxOrders: Infinity, color: "#E91E63", icon: "💎💎" },
];

function generateServiceDescription(svcName: string, platform: string): {
  what: string; desc: string; linkType: string; howItWorks: string; warning?: string; quality: string[];
} {
  const n = svcName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/'/g, "'");
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
  // ─── Réseaux sociaux ──────────────────────────────────────────────────────
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
  // ─── Musique / Audio ──────────────────────────────────────────────────────
  spotify:     { label: "Spotify",      iconUrl: "https://img.icons8.com/color/96/spotify--v1.png",              color: "#1DB954" },
  soundcloud:  { label: "SoundCloud",   iconUrl: "https://img.icons8.com/color/96/soundcloud.png",               color: "#FF5500" },
  deezer:      { label: "Deezer",       iconUrl: "https://img.icons8.com/color/96/deezer.png",                   color: "#FF0092" },
  applemusic:  { label: "Apple Music",  iconUrl: "https://img.icons8.com/color/96/apple-music.png",              color: "#FB2D48" },
  shazam:      { label: "Shazam",       iconUrl: "https://img.icons8.com/color/96/shazam.png",                   color: "#2A8AFF" },
  twitch:      { label: "Twitch",       iconUrl: "https://img.icons8.com/color/96/twitch.png",                   color: "#9146FF" },
  kick:        { label: "Kick",         iconUrl: "https://img.icons8.com/color/96/streaming.png",                color: "#53FC18" },
  // ─── Streaming / Entertainment ────────────────────────────────────────────
  netflix:     { label: "Netflix",      iconUrl: "https://img.icons8.com/color/96/netflix.png",                  color: "#E50914" },
  amazon:      { label: "Amazon",       iconUrl: "https://img.icons8.com/color/96/amazon.png",                   color: "#FF9900" },
  // ─── E-mail / Productivité ────────────────────────────────────────────────
  gmail:       { label: "Gmail",        iconUrl: "https://img.icons8.com/color/96/gmail.png",                    color: "#EA4335" },
  outlook:     { label: "Outlook",      iconUrl: "https://img.icons8.com/color/96/microsoft-outlook-2019.png",   color: "#0078D4" },
  // ─── Tech / Dev ───────────────────────────────────────────────────────────
  github:      { label: "GitHub",       iconUrl: "https://img.icons8.com/color/96/github--v1.png",               color: "#8957E5" },
  google:      { label: "Google",       iconUrl: "https://img.icons8.com/color/96/google-logo.png",              color: "#4285F4" },
  googleplay:  { label: "Google Play",  iconUrl: "https://img.icons8.com/color/96/google-play.png",              color: "#01875F" },
  appstore:    { label: "App Store",    iconUrl: "https://img.icons8.com/color/96/apple-app-store--v3.png",      color: "#0D96F6" },
  // ─── Jeux vidéo ───────────────────────────────────────────────────────────
  steam:       { label: "Steam",        iconUrl: "https://img.icons8.com/color/96/steam.png",                    color: "#66C0F4" },
  xbox:        { label: "Xbox",         iconUrl: "https://img.icons8.com/color/96/xbox.png",                     color: "#107C10" },
  ubisoft:     { label: "Ubisoft",      iconUrl: "https://img.icons8.com/color/96/controller.png",               color: "#0070CC" },
  freefire:    { label: "Free Fire",    iconUrl: "https://img.icons8.com/color/96/fire-element.png",             color: "#FF5722" },
  // ─── IA / Créatif ─────────────────────────────────────────────────────────
  chatgpt:     { label: "ChatGPT",      iconUrl: "https://img.icons8.com/color/96/chatgpt.png",                  color: "#10A37F" },
  deepseek:    { label: "DeepSeek",     iconUrl: "https://img.icons8.com/color/96/artificial-intelligence.png",  color: "#4D6BFE" },
  canva:       { label: "Canva",        iconUrl: "https://img.icons8.com/color/96/canva.png",                    color: "#00C4CC" },
  // ─── Design / Assets ──────────────────────────────────────────────────────
  envato:      { label: "Envato",       iconUrl: "https://img.icons8.com/color/96/envato.png",                   color: "#81B441" },
  flaticon:    { label: "Flaticon",     iconUrl: "https://img.icons8.com/color/96/star--v1.png",                 color: "#FF5733" },
};

const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  followers:      { label: "Abonnés / Followers",      icon: "users",        color: "#1E90FF" },
  views:          { label: "Vues",                      icon: "eye",          color: "#9C27B0" },
  live_views:     { label: "Téléspectateurs en direct", icon: "radio",        color: "#F44336" },
  likes:          { label: "Likes / J'aime",            icon: "heart",        color: "#E91E63" },
  live_likes:     { label: "Likes en direct",           icon: "activity",     color: "#FF4081" },
  comments:       { label: "Commentaires",              icon: "message-circle",color: "#FF9800" },
  shares:         { label: "Partages / Retweets",       icon: "share-2",      color: "#00BCD4" },
  saves:          { label: "Enregistrements",           icon: "bookmark",     color: "#795548" },
  reactions:      { label: "Réactions",                 icon: "thumbs-up",    color: "#FF5722" },
  impressions:    { label: "Impressions",               icon: "bar-chart-2",  color: "#607D8B" },
  plays:          { label: "Lectures / Écoutes",        icon: "play-circle",  color: "#4CAF50" },
  reposts:        { label: "Reposts",                   icon: "repeat",       color: "#26C6DA" },
  mentions:       { label: "Mentions",                  icon: "at-sign",      color: "#AB47BC" },
  poll_votes:     { label: "Votes sondage",             icon: "check-square", color: "#42A5F5" },
  story_views:    { label: "Vues story",                icon: "eye",          color: "#EC407A" },
  profile_visits: { label: "Visites profil",            icon: "user-check",   color: "#26A69A" },
  custom_comments:{ label: "Commentaires personnalisés",icon: "edit-2",       color: "#FFA726" },
  other:          { label: "Autres services",           icon: "star",         color: "#FFD700" },
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

export default function NewOrderScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, deductBalance, refreshUser } = useAuth();
  const { createOrder } = useOrders();
  const { colors, isDark, toggleTheme } = useTheme();

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
  } | null>(null);

  const topPad = Platform.OS === "web" ? insets.top + 64 : insets.top;

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

  const loadServices = useCallback(async (typeKey: string) => {
    setLoadingServices(true);
    setServicesError("");
    setPlatforms([]);
    setTotalServices(0);
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
      setPlatforms(list.sort((a, b) => b.services.length - a.services.length));
      setTotalServices(total);
    } catch {
      setServicesError("Impossible de charger les services. Vérifiez votre connexion.");
    } finally {
      setLoadingServices(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.totalOrders]);

  function extractPlatformFromService(svc: ExoService): string {
    const n = (svc.name + " " + (svc.category ?? "")).toLowerCase();
    // ─── Réseaux sociaux ──────────────────────────────────────────────────
    if (n.includes("instagram") || n.includes("insta"))                             return "instagram";
    if (n.includes("tiktok"))                                                        return "tiktok";
    if (n.includes("youtube") || n.includes("yt ") || n.includes("youtube"))        return "youtube";
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
    // ─── Musique / Audio ──────────────────────────────────────────────────
    if (n.includes("spotify"))                                                       return "spotify";
    if (n.includes("soundcloud"))                                                    return "soundcloud";
    if (n.includes("deezer"))                                                        return "deezer";
    if (n.includes("apple music") || n.includes("applemusic") || n.includes("itunes")) return "applemusic";
    if (n.includes("shazam"))                                                        return "shazam";
    if (n.includes("twitch"))                                                        return "twitch";
    if (n.includes("kick"))                                                          return "kick";
    // ─── Streaming / Entertainment ────────────────────────────────────────
    if (n.includes("netflix"))                                                       return "netflix";
    if (n.includes("amazon") || n.includes("prime video"))                          return "amazon";
    // ─── E-mail / Productivité ────────────────────────────────────────────
    if (n.includes("gmail"))                                                         return "gmail";
    if (n.includes("outlook"))                                                       return "outlook";
    // ─── Tech / Dev ───────────────────────────────────────────────────────
    if (n.includes("github"))                                                        return "github";
    if (n.includes("google play") || n.includes("googleplay"))                      return "googleplay";
    if (n.includes("app store") || n.includes("appstore"))                          return "appstore";
    if (n.includes("google"))                                                        return "google";
    // ─── Jeux vidéo ───────────────────────────────────────────────────────
    if (n.includes("steam"))                                                         return "steam";
    if (n.includes("xbox"))                                                          return "xbox";
    if (n.includes("ubisoft"))                                                       return "ubisoft";
    if (n.includes("free fire") || n.includes("freefire") || n.includes("garena"))  return "freefire";
    // ─── IA / Créatif ─────────────────────────────────────────────────────
    if (n.includes("chatgpt") || n.includes("openai"))                              return "chatgpt";
    if (n.includes("deepseek"))                                                      return "deepseek";
    if (n.includes("canva"))                                                         return "canva";
    // ─── Design / Assets ──────────────────────────────────────────────────
    if (n.includes("envato"))                                                        return "envato";
    if (n.includes("flaticon"))                                                      return "flaticon";
    return "other";
  }

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
  };

  const handleSelectCategory = (cat: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCategory(cat);
    setSelectedService(null);
    setCategoryServices(categorized[cat] ?? []);
    setShowServiceModal(true);
  };

  const currentOrderType = ORDER_TYPES.find((t) => t.key === selectedOrderType);
  const catMeta = selectedCategory ? (CATEGORY_META[selectedCategory] ?? CATEGORY_META.other) : null;

  const currentLevel = getCurrentResellerLevel();
  const nextLevel = getNextResellerLevel();
  const resellerOrdersCount = user?.totalOrders ?? 0;
  const totalSavedByReseller = 0;

  function computeActualPrice(svc: ExoService, qty: number, orderType?: string | null): number {
    if (!svc || qty <= 0) return 0;
    const perUnit = svc.isPerOne || svc.isPackage;
    const base = perUnit ? svc.priceXAF : svc.priceXAF / 1000;
    // Automatique (MTP/SMMGen): markup already baked into priceXAF (USD_TO_XAF_AUTO = 1845)
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
      // For account-sale, link field = email — basic email validation
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
    // Filleul discount: 10% off for first 5 orders if user was referred
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

      // Refresh user to get updated referralOrdersUsed / balance
      refreshUser().catch(() => {});

      setLink(""); setQuantity(""); setCustomComments(""); setSelectedService(null);
      setSelectedCategory(null); setSelectedPlatform(null); setSelectedOrderType(null);

      setSuccessData({
        orderId: providerOrderId ?? `SBH-${Date.now()}`,
        price: actualPrice,
        balance: newBalance,
        serviceName: selectedService.name,
        type: selectedOrderType ?? "standard",
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Erreur", e?.message ?? "Une erreur est survenue");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StarBackground />

      {/* Header */}
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={[styles.header, { paddingTop: topPad + 12 }]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Commander</Text>
          <Text style={styles.headerSub}>
            {selectedOrderType
              ? currentOrderType?.label ?? "Choisissez votre plateforme"
              : totalServices > 0
              ? `${totalServices.toLocaleString()} services disponibles`
              : "Choisissez votre type de commande"}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable onPress={() => setShowBoostInfo(true)} style={[styles.themeBtn, { marginRight: 4 }]}>
            <Feather name="info" size={18} color="#fff" />
          </Pressable>
          <Pressable onPress={toggleTheme} style={styles.themeBtn}>
            <Feather name={isDark ? "sun" : "moon"} size={18} color="#fff" />
          </Pressable>
          <View style={styles.balancePill}>
            <Feather name="dollar-sign" size={12} color="#FFD700" />
            <Text style={styles.balanceText}>{fmt(user?.balance ?? 0)}</Text>
          </View>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* STEP 1 — Order type selection */}
          {!selectedOrderType && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>
                Choisissez votre type de commande
              </Text>
              <Text style={[styles.sectionSub, { color: colors.textMuted }]}>
                Sélectionnez la catégorie correspondant à vos besoins
              </Text>

              {loadingServices && (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Chargement des services...</Text>
                </View>
              )}

              <View style={styles.orderTypeGrid}>
                {ORDER_TYPES.map((ot) => (
                  <Pressable
                    key={ot.key}
                    style={({ pressed }) => [
                      styles.orderTypeCard,
                      { borderColor: ot.color + "50", backgroundColor: colors.inputBg },
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={() => handleSelectOrderType(ot.key)}
                  >
                    <LinearGradient
                      colors={ot.gradient}
                      style={styles.orderTypeIconBg}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    >
                      <Feather name={ot.icon} size={22} color="#fff" />
                    </LinearGradient>
                    <Text style={[styles.orderTypeLabel, { color: colors.text }]}>{ot.shortLabel}</Text>
                    <Text style={[styles.orderTypeDesc, { color: colors.textMuted }]} numberOfLines={2}>
                      {ot.description}
                    </Text>
                    <View style={[styles.orderTypeBadge, { backgroundColor: ot.color + "18" }]}>
                      <Text style={[styles.orderTypeBadgeText, { color: ot.color }]}>
                        {ot.badge}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={14} color={ot.color} style={{ position: "absolute", top: 12, right: 12 }} />
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Back button when type selected */}
          {selectedOrderType && (
            <Pressable
              style={[styles.backTypeBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              onPress={() => {
                setSelectedOrderType(null); setSelectedPlatform(null);
                setSelectedCategory(null); setSelectedService(null);
              }}
            >
              <LinearGradient
                colors={currentOrderType?.gradient ?? [colors.gradientStart, colors.gradientEnd]}
                style={styles.backTypeBtnIcon}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              >
                <Feather name={currentOrderType?.icon ?? "shopping-cart"} size={16} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={[styles.backTypeBtnLabel, { color: colors.text }]}>{currentOrderType?.label}</Text>
                <Text style={[styles.backTypeBtnSub, { color: colors.textMuted }]}>Appuyez pour changer de type</Text>
              </View>
              <Feather name="x" size={16} color={colors.textMuted} />
            </Pressable>
          )}

          {/* Revendeur info panel */}
          {selectedOrderType === "revendeur" && (
            <View style={[styles.card, { backgroundColor: "#FFD70008", borderColor: "#FFD70040" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ fontSize: 26 }}>{currentLevel.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#FFD700" }}>
                    Niveau {currentLevel.name} · -{currentLevel.discount}%
                  </Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textMuted }}>
                    {resellerOrdersCount} commande{resellerOrdersCount !== 1 ? "s" : ""}
                    {nextLevel ? ` · Prochain niveau: ${nextLevel.name} (${Math.max(0, nextLevel.orders - resellerOrdersCount)} restantes)` : " · Niveau maximum atteint!"}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => setShowResellerSpace(true)}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#FFD70020", borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: "#FFD70040" }}
                >
                  <Feather name="award" size={14} color="#FFD700" />
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#FFD700" }}>Mon espace revendeur</Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowResellerInfo(!showResellerInfo)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.inputBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.cardBorder }}
                >
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textMuted }}>
                    {showResellerInfo ? "Masquer" : "Niveaux"}
                  </Text>
                  <Feather name={showResellerInfo ? "chevron-up" : "chevron-down"} size={12} color={colors.textMuted} />
                </Pressable>
              </View>
              {showResellerInfo && (
                <View style={{ gap: 8 }}>
                  {RESELLER_LEVELS.map((lvl) => {
                    const isActive = currentLevel.name === lvl.name;
                    const isPast = resellerOrdersCount >= lvl.orders;
                    return (
                      <View key={lvl.name} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, backgroundColor: isActive ? lvl.color + "18" : colors.inputBg, borderWidth: isActive ? 1.5 : 1, borderColor: isActive ? lvl.color : colors.cardBorder }}>
                        <Text style={{ fontSize: 18 }}>{lvl.icon}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: isActive ? lvl.color : isPast ? colors.text : colors.textMuted }}>{lvl.name}</Text>
                          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.textMuted }}>
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
          )}

          {/* STEP 2 — Platform selection */}
          {selectedOrderType && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>
                Choisissez une plateforme
              </Text>

              {servicesError ? (
                <View style={styles.errorRow}>
                  <Feather name="alert-circle" size={14} color={colors.error} />
                  <Text style={[styles.errorText, { color: colors.error }]}>{servicesError}</Text>
                  <Pressable onPress={() => selectedOrderType && loadServices(selectedOrderType)} style={[styles.retryBtn, { backgroundColor: colors.accent + "22", borderColor: colors.accent }]}>
                    <Text style={[styles.retryText, { color: colors.accent }]}>Réessayer</Text>
                  </Pressable>
                </View>
              ) : null}

              {platforms.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.platformScroll}>
                  {platforms.map((p) => {
                    const isActive = selectedPlatform?.key === p.key;
                    return (
                      <Pressable
                        key={p.key}
                        style={[
                          styles.platformBtn,
                          { borderColor: isActive ? p.color : colors.cardBorder, backgroundColor: isActive ? p.color + "22" : colors.inputBg },
                        ]}
                        onPress={() => handleSelectPlatform(p)}
                      >
                        <Image source={{ uri: p.iconUrl }} style={styles.platformIcon} contentFit="contain" />
                        <Text style={[styles.platformLabel, { color: isActive ? p.color : colors.textSecondary }]}>
                          {p.label}
                        </Text>
                        <Text style={[styles.platformCount, { color: colors.textMuted }]}>
                          {p.services.length}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              {loadingServices && (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.accent} size="small" />
                  <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Chargement...</Text>
                </View>
              )}
            </View>
          )}

          {/* STEP 3 — Categories */}
          {selectedPlatform && Object.keys(categorized).length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>
                Choisissez une catégorie — {selectedPlatform.label}
              </Text>
              <View style={styles.categoryGrid}>
                {Object.entries(categorized).map(([cat, svcs]) => {
                  const knownMeta = CATEGORY_META[cat];
                  const meta = knownMeta ?? CATEGORY_META.other;
                  const isOther = !knownMeta;
                  const displayLabel = isOther
                    ? ((svcs[0] as any)?._rawCategory || cat).replace(/_/g, " ")
                    : meta.label;
                  const isActive = selectedCategory === cat;
                  return (
                    <Pressable
                      key={cat}
                      style={[
                        styles.categoryBtn,
                        {
                          borderColor: isActive ? meta.color : colors.cardBorder,
                          backgroundColor: isActive ? meta.color + "22" : colors.inputBg,
                        },
                      ]}
                      onPress={() => handleSelectCategory(cat)}
                    >
                      <Feather name={meta.icon as any} size={16} color={isActive ? meta.color : colors.textMuted} />
                      <Text style={[styles.categoryLabel, { color: isActive ? meta.color : colors.text }]} numberOfLines={1}>
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
          )}

          {/* Selected service display */}
          {selectedService && (() => {
            const isCustom = isCustomCommentsService(selectedService);
            const isAccountSale = isAccountSaleService(selectedService);
            const svcDesc = generateServiceDescription(selectedService.name, selectedPlatform?.label ?? "");
            const commentLines = customComments.trim().split("\n").filter(l => l.trim().length > 0);
            const commentCount = commentLines.length;
            const qty = isCustom ? commentCount : isAccountSale ? 1 : (parseInt(quantity) || 0);
            const pricePerUnit = selectedService.isPerOne || selectedService.isPackage;
            const unitPrice = pricePerUnit ? selectedService.priceXAF : selectedService.priceXAF / 1000;
            const autoMargin = selectedOrderType === "automatique" ? 1.0 : 1.15;
            const baseComputedPrice = qty > 0 ? Math.ceil(unitPrice * qty * autoMargin) : 0;
            const hasReferralBadge = !!(user?.referredBy && (user?.referralOrdersUsed ?? 0) < 5);
            const liveComputedPrice = (hasReferralBadge && qty > 0) ? Math.ceil(baseComputedPrice * 0.9) : baseComputedPrice;
            const isReseller = selectedOrderType === "revendeur";
            const origPrice = selectedService.originalPriceXAF;
            const origComputedPrice = origPrice && qty > 0 ? Math.ceil((pricePerUnit ? origPrice : origPrice / 1000) * qty * autoMargin) : 0;
            const savings = origComputedPrice > 0 && liveComputedPrice > 0 ? origComputedPrice - liveComputedPrice : 0;
            return (
            <>
              <View style={[styles.serviceInfoCard, { backgroundColor: colors.card, borderColor: (selectedPlatform?.color ?? "#1E90FF") + "40" }]}>
                <View style={styles.serviceInfoTop}>
                  {selectedPlatform && (
                    <Image source={{ uri: selectedPlatform.iconUrl }} style={styles.serviceInfoIcon} contentFit="contain" />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.serviceInfoName, { color: colors.text }]} numberOfLines={2}>
                      {selectedService.name}
                    </Text>
                    {catMeta && (
                      <View style={[styles.categoryTag, { backgroundColor: catMeta.color + "22" }]}>
                        <Feather name={catMeta.icon as any} size={11} color={catMeta.color} />
                        <Text style={[styles.categoryTagText, { color: catMeta.color }]}>{catMeta.label}</Text>
                      </View>
                    )}
                  </View>
                  <Pressable
                    style={[styles.changeBtn, { borderColor: colors.accent, backgroundColor: colors.accent + "15" }]}
                    onPress={() => setShowServiceModal(true)}
                  >
                    <Text style={[styles.changeBtnText, { color: colors.accent }]}>Changer</Text>
                  </Pressable>
                </View>
                <View style={styles.serviceInfoGrid}>
                  {[
                    { label: "Prix", value: `${fmt(selectedService.priceXAF)}/${pricePerUnit ? "unité" : "1000"}`, color: "#4CAF50" },
                    { label: "Min",  value: isCustom ? "10 com." : selectedService.min.toLocaleString() },
                    { label: "Max",  value: isCustom ? "∞" : selectedService.max.toLocaleString() },
                    { label: "Délai",value: selectedService.averageTime ?? "Rapide" },
                  ].map((info, i) => (
                    <View key={i} style={[styles.serviceInfoCell, { borderColor: colors.cardBorder }]}>
                      <Text style={[styles.serviceInfoLabel, { color: colors.textMuted }]}>{info.label}</Text>
                      <Text style={[styles.serviceInfoValue, { color: info.color ?? colors.text }]}>{info.value}</Text>
                    </View>
                  ))}
                </View>

                {/* Service description */}
                <View style={{ borderTopWidth: 1, borderTopColor: colors.separator, paddingTop: 10, gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Feather name="info" size={13} color={colors.accent} />
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.accent }}>{svcDesc.what}</Text>
                  </View>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, lineHeight: 18 }}>{svcDesc.desc}</Text>
                  {svcDesc.quality.length > 0 && (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
                      {svcDesc.quality.map((q, i) => (
                        <View key={i} style={{ backgroundColor: "#4CAF5022", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: "#4CAF50" }}>✓ {q}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <View style={{ flexDirection: "row", gap: 6, backgroundColor: colors.inputBg, borderRadius: 8, padding: 8 }}>
                    <Feather name="link" size={12} color={colors.textMuted} style={{ marginTop: 2 }} />
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textMuted, flex: 1, lineHeight: 16 }}>{svcDesc.linkType}</Text>
                  </View>
                  {svcDesc.warning && (
                    <View style={{ flexDirection: "row", gap: 6, backgroundColor: "#FF980015", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "#FF980030" }}>
                      <Feather name="alert-triangle" size={12} color="#FF9800" style={{ marginTop: 2 }} />
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "#FF9800", flex: 1, lineHeight: 16 }}>{svcDesc.warning}</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <Text style={[styles.sectionLabel, { color: colors.text }]}>Complétez votre commande</Text>

                {/* Bandeau compte partagé */}
                {isAccountSale && (
                  <View style={{ backgroundColor: "#FF980015", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#FF980030", marginBottom: 6, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Feather name="key" size={14} color="#FF9800" style={{ marginTop: 2 }} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#FF9800" }}>Service de vente de compte</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,152,0,0.85)", lineHeight: 16 }}>
                        Quantité fixée à 1 · Compte exclusif · Livraison par email (instantané si en stock, sinon &lt;24h). Entrez votre adresse email dans le champ ci-dessous.
                      </Text>
                    </View>
                  </View>
                )}

                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  {isAccountSale ? "Votre adresse email (pour recevoir l'accès) *" : "Lien (URL de votre page ou post) *"}
                </Text>
                <View style={[styles.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                  <Feather name={isAccountSale ? "mail" : "link-2"} size={16} color={colors.textMuted} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder={isAccountSale ? "exemple@email.com" : "https://..."}
                    placeholderTextColor={colors.textMuted}
                    value={link} onChangeText={setLink}
                    keyboardType={isAccountSale ? "email-address" : "url"}
                    autoCapitalize="none" autoCorrect={false}
                  />
                </View>

                {!isCustom && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Quantité *</Text>
                    {isAccountSale ? (
                      <View style={[styles.inputRow, { backgroundColor: colors.inputBg, borderColor: "#4CAF5060" }]}>
                        <Feather name="hash" size={16} color="#4CAF50" />
                        <Text style={[styles.input, { color: "#4CAF50", fontFamily: "Inter_700Bold" }]}>1 (fixe — compte exclusif)</Text>
                      </View>
                    ) : (
                      <>
                        <View style={[styles.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                          <Feather name="hash" size={16} color={colors.textMuted} />
                          <TextInput
                            style={[styles.input, { color: colors.text }]}
                            placeholder={`Entre ${selectedService.min} et ${selectedService.max}`}
                            placeholderTextColor={colors.textMuted}
                            value={quantity} onChangeText={setQuantity}
                            keyboardType="number-pad"
                          />
                        </View>
                        {quantity && (
                          <Text style={[styles.quantityHint, {
                            color: parseInt(quantity) < selectedService.min || parseInt(quantity) > selectedService.max
                              ? colors.error : colors.success
                          }]}>
                            {parseInt(quantity) < selectedService.min
                              ? `⚠️ Minimum: ${selectedService.min}`
                              : parseInt(quantity) > selectedService.max
                              ? `⚠️ Maximum: ${selectedService.max}`
                              : `✓ Quantité valide`}
                          </Text>
                        )}
                      </>
                    )}
                  </>
                )}

                {isCustom && (
                  <>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Commentaires personnalisés *</Text>
                      <View style={{ backgroundColor: commentCount >= 10 ? "#4CAF5022" : colors.inputBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: commentCount >= 10 ? "#4CAF50" : colors.textMuted }}>
                          {commentCount}/10 min
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textMuted, marginBottom: 4, marginTop: -4 }}>
                      Un commentaire par ligne · Minimum 10 commentaires requis
                    </Text>
                    <View style={[styles.inputRow, { backgroundColor: colors.inputBg, borderColor: commentCount > 0 && commentCount < 10 ? colors.error : commentCount >= 10 ? "#4CAF5060" : colors.inputBorder, height: 150, alignItems: "flex-start", paddingTop: 10 }]}>
                      <TextInput
                        style={[styles.input, { color: colors.text, height: 130, textAlignVertical: "top" }]}
                        placeholder={"Super photo !\nJ'adore ce contenu 😍\nTrès inspirant, continue !\nIncroyable travail 🔥\n..."}
                        placeholderTextColor={colors.textMuted}
                        value={customComments}
                        onChangeText={setCustomComments}
                        multiline
                        numberOfLines={6}
                      />
                    </View>
                    {commentCount > 0 && commentCount < 10 && (
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.error, marginTop: 3 }}>
                        ⚠️ {commentCount} commentaire{commentCount > 1 ? "s" : ""} — il en manque encore {10 - commentCount}
                      </Text>
                    )}
                    {commentCount >= 10 && (
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#4CAF50", marginTop: 3 }}>
                        ✓ {commentCount} commentaires saisis — Quantité: {commentCount}
                      </Text>
                    )}
                  </>
                )}

                {liveComputedPrice > 0 && (
                  <View style={[styles.priceSummary, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder }]}>
                    {/* Referral discount badge */}
                    {hasReferralBadge && qty > 0 && (
                      <View style={{ backgroundColor: "#E91E6315", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "#E91E6340", flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <Feather name="gift" size={14} color="#E91E63" />
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#E91E63", flex: 1 }}>
                          Réduction filleul -10% ({(user?.referralOrdersUsed ?? 0) + 1}/5 commandes)
                        </Text>
                      </View>
                    )}
                    {isReseller && origComputedPrice > 0 && (
                      <View style={styles.priceSummaryRow}>
                        <Text style={[styles.priceSummaryLabel, { color: colors.textMuted }]}>Prix public</Text>
                        <Text style={[styles.priceSummaryValue, { color: colors.textMuted, textDecorationLine: "line-through", fontSize: 13 }]}>
                          {fmt(origComputedPrice)}
                        </Text>
                      </View>
                    )}
                    {hasReferralBadge && qty > 0 && (
                      <View style={styles.priceSummaryRow}>
                        <Text style={[styles.priceSummaryLabel, { color: colors.textMuted }]}>Prix avant réduction</Text>
                        <Text style={[styles.priceSummaryValue, { color: colors.textMuted, textDecorationLine: "line-through", fontSize: 13 }]}>
                          {fmt(baseComputedPrice)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.priceSummaryRow}>
                      <Text style={[styles.priceSummaryLabel, { color: colors.textSecondary }]}>
                        {isReseller ? "Votre prix revendeur" : hasReferralBadge ? "Votre prix (-10%)" : "Prix estimé"}
                      </Text>
                      <Text style={[styles.priceSummaryValue, { color: "#4CAF50" }]}>{fmt(liveComputedPrice)}</Text>
                    </View>
                    {isReseller && savings > 0 && (
                      <View style={[styles.priceSummaryRow, { backgroundColor: "#FFD70015", borderRadius: 8, padding: 8 }]}>
                        <Text style={[styles.priceSummaryLabel, { color: "#FFD700" }]}>Votre économie</Text>
                        <Text style={[styles.priceSummaryValue, { color: "#FFD700" }]}>-{fmt(savings)}</Text>
                      </View>
                    )}
                    <View style={[styles.priceSummaryRow, { borderTopWidth: 1, borderTopColor: colors.separator, paddingTop: 8 }]}>
                      <Text style={[styles.priceSummaryLabel, { color: colors.textSecondary }]}>Votre solde</Text>
                      <Text style={[styles.priceSummaryValue, {
                        color: (user?.balance ?? 0) < liveComputedPrice ? colors.error : colors.text
                      }]}>
                        {fmt(user?.balance ?? 0)}
                      </Text>
                    </View>
                    {(user?.balance ?? 0) < liveComputedPrice && (
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.error }}>
                        ⚠️ Il vous manque {fmt(liveComputedPrice - (user?.balance ?? 0))}
                      </Text>
                    )}
                  </View>
                )}

                <Pressable
                  style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.85 }]}
                  onPress={handleSubmit}
                  disabled={submitting}
                >
                  <LinearGradient
                    colors={[colors.gradientStart, colors.gradientEnd]}
                    style={styles.submitGradient}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Feather name="send" size={18} color="#fff" />
                        <Text style={styles.submitText}>Passer la commande</Text>
                      </>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>
            </>
            );
          })()}

          {selectedPlatform && !selectedService && !loadingServices && (
            <View style={[styles.hintCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Feather name="arrow-up" size={20} color={colors.textMuted} />
              <Text style={[styles.hintText, { color: colors.textMuted }]}>
                Sélectionnez une catégorie ci-dessus pour voir les services disponibles.
              </Text>
            </View>
          )}

          {selectedOrderType && !selectedPlatform && !loadingServices && platforms.length > 0 && (
            <View style={[styles.hintCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Feather name="arrow-up" size={20} color={colors.textMuted} />
              <Text style={[styles.hintText, { color: colors.textMuted }]}>
                Sélectionnez une plateforme ci-dessus pour voir les catégories disponibles.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Service Modal */}
      <Modal visible={showServiceModal} animationType="slide" transparent onRequestClose={() => setShowServiceModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {catMeta?.label ?? "Services"}
                </Text>
                <Text style={[styles.modalSub, { color: colors.textMuted }]}>
                  {categoryServices.length} service{categoryServices.length > 1 ? "s" : ""} disponible{categoryServices.length > 1 ? "s" : ""}
                </Text>
              </View>
              <Pressable style={[styles.modalClose, { backgroundColor: colors.inputBg }]} onPress={() => setShowServiceModal(false)}>
                <Feather name="x" size={18} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {categoryServices.map((svc) => {
                const isSelected = selectedService?.id === svc.id;
                return (
                  <Pressable
                    key={svc.id}
                    style={[
                      styles.serviceItem,
                      {
                        backgroundColor: isSelected ? colors.accent + "18" : colors.card,
                        borderColor: isSelected ? colors.accent : colors.cardBorder,
                      },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedService(svc);
                      setShowServiceModal(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.serviceItemName, { color: colors.text }]} numberOfLines={2}>
                        {svc.name}
                      </Text>
                      <Text style={[styles.serviceItemMeta, { color: colors.textMuted }]}>
                        Min: {svc.min.toLocaleString()} · Max: {svc.max.toLocaleString()}
                        {svc.averageTime ? ` · ${svc.averageTime}` : ""}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={[styles.serviceItemPrice, { color: "#4CAF50" }]}>
                        {fmt(svc.priceXAF)}
                      </Text>
                      <Text style={[styles.serviceItemPriceSub, { color: colors.textMuted }]}>
                        {svc.isPerOne || svc.isPackage ? "/unité" : "/1000"}
                      </Text>
                    </View>
                    {isSelected && <Feather name="check-circle" size={18} color={colors.accent} style={{ marginLeft: 8 }} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Insufficient Balance Modal */}
      <Modal visible={showInsufficientBalance} animationType="fade" transparent onRequestClose={() => setShowInsufficientBalance(false)}>
        <View style={[styles.modalOverlay, { justifyContent: "center", paddingHorizontal: 24 }]}>
          <View style={[{ backgroundColor: colors.surface, borderRadius: 20, padding: 24, gap: 16 }]}>
            <View style={{ alignItems: "center", gap: 10 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#FF000020", alignItems: "center", justifyContent: "center" }}>
                <Feather name="alert-circle" size={32} color={colors.error} />
              </View>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text, textAlign: "center" }}>Solde insuffisant</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20 }}>
                Votre solde est insuffisant pour passer cette commande.
              </Text>
            </View>
            <View style={{ backgroundColor: colors.inputBg, borderRadius: 12, padding: 16, gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textMuted }}>Solde actuel</Text>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.text }}>{fmt(user?.balance ?? 0)}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textMuted }}>Montant manquant</Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: colors.error }}>{fmt(missingAmount)}</Text>
              </View>
            </View>
            <Pressable
              style={{ backgroundColor: "#4CAF50", borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
              onPress={() => {
                setShowInsufficientBalance(false);
                router.push("/(tabs)/wallet" as any);
              }}
            >
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" }}>Recharger mon solde</Text>
            </Pressable>
            <Pressable
              style={{ alignItems: "center", paddingVertical: 8 }}
              onPress={() => setShowInsufficientBalance(false)}
            >
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.textMuted }}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Reseller Space Modal */}
      <Modal visible={showResellerSpace} animationType="slide" transparent onRequestClose={() => setShowResellerSpace(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, maxHeight: "88%" }]}>
            <View style={[styles.modalHeader, { borderBottomWidth: 1, borderBottomColor: colors.separator, paddingBottom: 12, marginBottom: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: "#FFD700" }]}>Mon Espace Revendeur</Text>
                <Text style={[styles.modalSub, { color: colors.textMuted }]}>Statistiques et avantages</Text>
              </View>
              <Pressable style={[styles.modalClose, { backgroundColor: colors.inputBg }]} onPress={() => setShowResellerSpace(false)}>
                <Feather name="x" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} showsVerticalScrollIndicator={false}>
              {/* Current level card */}
              <View style={{ backgroundColor: currentLevel.color + "18", borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: currentLevel.color + "60", gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text style={{ fontSize: 32 }}>{currentLevel.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textMuted }}>Niveau actuel</Text>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: currentLevel.color }}>{currentLevel.name}</Text>
                  </View>
                  <View style={{ backgroundColor: currentLevel.color + "22", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: currentLevel.color }}>-{currentLevel.discount}%</Text>
                  </View>
                </View>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary }}>
                  Vous bénéficiez de {currentLevel.discount}% de réduction sur tous vos achats revendeur.
                </Text>
                {nextLevel && (
                  <View style={{ backgroundColor: colors.inputBg, borderRadius: 10, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Feather name="trending-up" size={14} color={nextLevel.color} />
                    <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary }}>
                      Niveau suivant: <Text style={{ fontFamily: "Inter_700Bold", color: nextLevel.color }}>{nextLevel.name} (-{nextLevel.discount}%)</Text>{" "}
                      à partir de {nextLevel.orders} commandes{" "}
                      ({Math.max(0, nextLevel.orders - resellerOrdersCount)} commandes restantes)
                    </Text>
                  </View>
                )}
              </View>

              {/* Stats */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                {[
                  { label: "Commandes", value: resellerOrdersCount.toLocaleString(), icon: "shopping-cart" as const, color: "#1E90FF" },
                  { label: "Remise actuelle", value: `-${currentLevel.discount}%`, icon: "tag" as const, color: "#4CAF50" },
                ].map((s, i) => (
                  <View key={i} style={{ flex: 1, backgroundColor: s.color + "15", borderRadius: 14, padding: 14, gap: 6, alignItems: "center", borderWidth: 1, borderColor: s.color + "30" }}>
                    <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: s.color + "20", alignItems: "center", justifyContent: "center" }}>
                      <Feather name={s.icon} size={18} color={s.color} />
                    </View>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: s.color }}>{s.value}</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textMuted, textAlign: "center" }}>{s.label}</Text>
                  </View>
                ))}
              </View>

              {/* All levels */}
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.textMuted, letterSpacing: 0.8 }}>TOUS LES NIVEAUX</Text>
              {RESELLER_LEVELS.map((lvl) => {
                const isActive = currentLevel.name === lvl.name;
                const isPast = resellerOrdersCount >= lvl.orders;
                return (
                  <View key={lvl.name} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, borderWidth: isActive ? 1.5 : 1, borderColor: isActive ? lvl.color : colors.cardBorder, backgroundColor: isActive ? lvl.color + "18" : colors.card }}>
                    <Text style={{ fontSize: 22 }}>{lvl.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: isActive ? lvl.color : isPast ? colors.text : colors.textMuted }}>{lvl.name}</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textMuted }}>
                        {lvl.orders === 0 ? "Dès la 1ère commande" : `À partir de ${lvl.orders} commandes`}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: lvl.color + "22", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: lvl.color }}>-{lvl.discount}%</Text>
                    </View>
                    {isActive && <Feather name="check-circle" size={16} color={lvl.color} />}
                    {isPast && !isActive && <Feather name="check" size={14} color={colors.textMuted} />}
                  </View>
                );
              })}

              <View style={{ backgroundColor: colors.accent + "10", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.accent + "30" }}>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, lineHeight: 18 }}>
                  💡 En tant que revendeur, vous achetez à prix réduit et revendez au prix plein à vos clients. Votre niveau augmente automatiquement avec le nombre de commandes.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Success modal ── */}
      <Modal visible={!!successData} transparent animationType="fade" onRequestClose={() => setSuccessData(null)}>
        <View style={styles.successOverlay}>
          <View style={styles.successSheet}>
            {/* Check icon */}
            <View style={styles.successIconWrap}>
              <Feather name="check-circle" size={48} color="#4CAF50" />
            </View>

            <Text style={styles.successTitle}>Commande lancée avec succès !</Text>
            <Text style={styles.successSub}>
              Vous recevrez les résultats dans quelques instants.
            </Text>

            {/* Summary row */}
            <View style={styles.successSummary}>
              <View style={styles.successRow}>
                <Text style={styles.successRowLabel}>Montant débité</Text>
                <Text style={[styles.successRowValue, { color: "#FF6B6B" }]}>
                  -{fmt(successData?.price ?? 0)}
                </Text>
              </View>
              <View style={[styles.successDivider]} />
              <View style={styles.successRow}>
                <Text style={styles.successRowLabel}>Solde restant</Text>
                <Text style={[styles.successRowValue, { color: "#FFD700" }]}>
                  {fmt(successData?.balance ?? 0)}
                </Text>
              </View>
            </View>

            {/* Buttons */}
            <Pressable
              style={styles.successBtnPrimary}
              onPress={() => { setSuccessData(null); router.push("/(tabs)/orders"); }}
            >
              <Feather name="list" size={16} color="#fff" />
              <Text style={styles.successBtnPrimaryText}>Voir mes commandes</Text>
            </Pressable>

            <Pressable
              style={styles.successBtnSecondary}
              onPress={() => setSuccessData(null)}
            >
              <Text style={styles.successBtnSecondaryText}>Commander encore</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ─── Boost Info Modal ─────────────────────────────────────────────── */}
      <Modal visible={showBoostInfo} animationType="slide" transparent onRequestClose={() => setShowBoostInfo(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, maxHeight: "90%" }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Guide des boosts intelligents</Text>
                <Text style={[styles.modalSub, { color: colors.textMuted }]}>Ce que vous devez savoir avant de commander</Text>
              </View>
              <Pressable style={[styles.modalClose, { backgroundColor: colors.inputBg }]} onPress={() => setShowBoostInfo(false)}>
                <Feather name="x" size={18} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24, gap: 14 }}>

              {/* ── Section 1 : Variations naturelles (ton positif) ── */}
              <View style={{ backgroundColor: "#10A37F12", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#10A37F35" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <Feather name="info" size={18} color="#10A37F" />
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#10A37F" }}>Variations normales après un boost</Text>
                </View>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text, lineHeight: 20, marginBottom: 10 }}>
                  Après chaque boost, il est tout à fait normal d'observer de légères variations dans vos statistiques. Toutes les grandes plateformes (Instagram, TikTok, YouTube…) procèdent régulièrement à des nettoyages techniques automatiques. Ce phénomène est sain et naturel — il confirme que votre compte interagit avec des profils réels.
                </Text>
                <View style={{ backgroundColor: "#10A37F18", borderRadius: 10, padding: 10, gap: 6 }}>
                  {[
                    { dot: "#FFD700", text: "Basique : stabilisation progressive après livraison" },
                    { dot: "#4CAF50", text: "Moyen : bonne rétention, légères variations possibles" },
                    { dot: "#2196F3", text: "Élite : stabilité maximale, variations minimales" },
                  ].map((r, i) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.dot }} />
                      <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: colors.text, lineHeight: 17 }}>{r.text}</Text>
                    </View>
                  ))}
                </View>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: 8 }}>
                  💡 Ces variations sont communes à tous les services de boost dans le monde. Nos services Élite incluent une garantie de remplissage pour votre tranquillité.
                </Text>
              </View>

              {/* ── Section 2 : Niveaux de qualité — 3 niveaux officiels ── */}
              <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.cardBorder }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <Feather name="layers" size={18} color="#2196F3" />
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text }}>Notre code couleur qualité</Text>
                </View>
                {[
                  {
                    color: "#FFD700",
                    emoji: "🟡",
                    label: "BASIQUE",
                    badge: "Entrée de gamme",
                    desc: "Services accessibles, livraison rapide. Idéal pour créer une première présence sociale. Les résultats peuvent varier selon les plateformes — sans garantie de remplissage.",
                  },
                  {
                    color: "#4CAF50",
                    emoji: "🟢",
                    label: "MOYEN",
                    badge: "Qualité & Fiabilité",
                    desc: "L'équilibre parfait entre rapidité et stabilité. Engagement réaliste, performances solides. Certains services Moyen incluent une garantie de réapprovisionnement selon la source.",
                  },
                  {
                    color: "#2196F3",
                    emoji: "🔵",
                    label: "ÉLITE",
                    badge: "Haut de gamme",
                    desc: "Notre meilleur niveau. Méthodes naturelles, performance stable et garantie. Engagement organique à 100%, disponibilité continue. L'option la plus rentable pour des résultats durables.",
                  },
                ].map((q, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: i < 2 ? 14 : 0 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: q.color + "22", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Text style={{ fontSize: 20 }}>{q.emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text }}>{q.label}</Text>
                        <View style={{ backgroundColor: q.color + "25", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: q.color }}>{q.badge}</Text>
                        </View>
                      </View>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textMuted, lineHeight: 19 }}>{q.desc}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* ── Section 3 : Booster intelligemment ── */}
              <View style={{ backgroundColor: "#10A37F12", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#10A37F35" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Feather name="zap" size={18} color="#10A37F" />
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#10A37F" }}>Booster intelligemment</Text>
                </View>

                {/* Règle des proportions */}
                <View style={{ backgroundColor: "#10A37F20", borderRadius: 10, padding: 10, marginBottom: 12, flexDirection: "row", gap: 8 }}>
                  <Feather name="bar-chart-2" size={16} color="#10A37F" style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, fontFamily: "Inter_500Medium", fontSize: 12, color: colors.text, lineHeight: 18 }}>
                    <Text style={{ fontFamily: "Inter_700Bold" }}>Règle des proportions : </Text>
                    Pour 1 million de vues, vous devez avoir au minimum 500 000 likes, des commentaires, des partages et des abonnés. La moitié des vues en likes est le minimum pour paraître naturel.
                  </Text>
                </View>

                {/* À faire */}
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.textMuted, marginBottom: 8, letterSpacing: 0.5 }}>✅ À FAIRE</Text>
                {[
                  { icon: "video",      tip: "Pour un LIVE : lancez d'abord la diffusion, puis copiez le lien du live EN COURS (pas d'une vidéo publiée)." },
                  { icon: "trending-up",tip: "Progressivité : ne mettez pas tout d'un coup. Pour 1 million de vues, commencez par 100K–200K, attendez, puis continuez sur plusieurs jours." },
                  { icon: "layers",     tip: "Variez les services sur le même contenu : vues + likes (min 50% des vues) + commentaires + partages + abonnés. Les vraies interactions fonctionnent ainsi — faites pareil." },
                  { icon: "clock",      tip: "Attendez la livraison complète avant de passer une nouvelle commande sur le même lien. Ne superposez pas les commandes en cours." },
                  { icon: "shuffle",    tip: "Alternez les types d'engagement. Après les vues, achetez des likes, puis des commentaires, puis des partages — variez les actions comme le font les vrais utilisateurs." },
                ].map((c, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: "#10A37F20", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Feather name={c.icon as any} size={13} color="#10A37F" />
                    </View>
                    <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text, lineHeight: 19 }}>{c.tip}</Text>
                  </View>
                ))}

                {/* À éviter */}
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.textMuted, marginTop: 4, marginBottom: 8, letterSpacing: 0.5 }}>❌ À ÉVITER</Text>
                {[
                  { icon: "x-circle", tip: "Ne boostez PAS une grande quantité en peu de temps sur le même lien — espacez vos commandes d'au moins 24h sur le même contenu." },
                  { icon: "x-circle", tip: "Ne dupliquez PAS le même service sur le même lien en même temps (ex : 3 commandes de vues simultanées sur la même vidéo)." },
                  { icon: "x-circle", tip: "N'achetez PAS uniquement des vues sans likes, commentaires, partages — un contenu avec beaucoup de vues mais peu de likes est suspect et attire les suppressions." },
                ].map((c, i, arr) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: i < arr.length - 1 ? 10 : 0 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: "#FF572218", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Feather name={c.icon as any} size={13} color="#FF5722" />
                    </View>
                    <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text, lineHeight: 19 }}>{c.tip}</Text>
                  </View>
                ))}
              </View>

              {/* ── Section 4 : Exemple de stratégie ── */}
              <View style={{ backgroundColor: "#6C3AF510", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#6C3AF530" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Feather name="bar-chart-2" size={18} color="#6C3AF5" />
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#6C3AF5" }}>Exemple de stratégie (30 jours)</Text>
                </View>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textMuted, marginBottom: 12, lineHeight: 17 }}>
                  Objectif : atteindre 5 000 abonnés avec une bonne rétention et un engagement naturel
                </Text>
                {[
                  { week: "Semaine 1", actions: "1 500 abonnés HQ  •  15 000 vues  •  7 500 likes  •  200 commentaires  •  100 partages" },
                  { week: "Semaine 2", actions: "2 000 abonnés HQ  •  20 000 vues  •  10 000 likes  •  400 commentaires  •  200 partages" },
                  { week: "Semaine 3", actions: "1 500 abonnés HQ  •  18 000 vues  •  9 000 likes  •  300 commentaires  •  150 partages" },
                  { week: "Semaine 4", actions: "Consolidation  •  contenu quotidien  •  stories  •  petits boosts ciblés" },
                ].map((s, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: i < 3 ? 10 : 0 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#6C3AF5", marginTop: 5, flexShrink: 0 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text }}>{s.week}</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textMuted, lineHeight: 17 }}>{s.actions}</Text>
                    </View>
                  </View>
                ))}
                <View style={{ backgroundColor: "#6C3AF518", borderRadius: 10, padding: 10, marginTop: 12 }}>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.text, lineHeight: 17 }}>
                    💡 <Text style={{ fontFamily: "Inter_600SemiBold" }}>Clé du succès : </Text>les likes représentent toujours ~50% des vues, et les commentaires/partages complètent le tableau. C'est ainsi que fonctionnent les vrais profils — copiez ce modèle naturel.
                  </Text>
                </View>
              </View>

              {/* ── Section 5 : Réclamations ── */}
              <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.cardBorder }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <Feather name="shield" size={18} color="#2196F3" />
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text }}>Réclamations & garanties</Text>
                </View>
                {[
                  "Service commandé en haute qualité (HQ/Premium/Non-drop)",
                  "Perte supérieure à 10% de la quantité livrée",
                  "Réclamation faite dans les 30 jours après livraison",
                  "Preuves fournies : numéro de commande uniquement",
                ].map((cond, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: i < 3 ? 6 : 0 }}>
                    <Feather name="check-circle" size={14} color="#2196F3" style={{ marginTop: 2 }} />
                    <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: colors.text, lineHeight: 18 }}>{cond}</Text>
                  </View>
                ))}
              </View>

              {/* ── Section 6 : Services Vente de Comptes ── */}
              <View style={{ backgroundColor: "#FF980010", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#FF980035" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Feather name="key" size={18} color="#FF9800" />
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#FF9800" }}>Comptes & Accès (ChatGPT, Canva…)</Text>
                </View>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text, lineHeight: 20, marginBottom: 12 }}>
                  Certains services proposent des accès à des outils premium : ChatGPT Plus, DeepSeek Pro, Canva Premium, PayPal, GitHub Pro, comptes TikTok, etc. Voici tout ce que vous devez savoir :
                </Text>
                {[
                  { emoji: "1️⃣", title: "Quantité = 1 uniquement", desc: "Ces services vendent 1 accès à la fois. La quantité est fixée à 1 — vous ne pouvez pas en commander plusieurs à la fois." },
                  { emoji: "📧", title: "Saisissez votre email dans le champ lien", desc: "Pour les services de comptes, entrez votre adresse email dans le champ habituellement réservé au lien. C'est à cette adresse que les identifiants vous seront envoyés." },
                  { emoji: "🔐", title: "Votre compte, en exclusivité", desc: "Le compte vous appartient en exclusivité. Vous pouvez décider de le partager avec une autre personne si vous le souhaitez — c'est votre choix. Vous pouvez également changer le mot de passe librement. Notre responsabilité s'arrête dès que vous effectuez votre première connexion avec succès et que le compte fonctionne normalement." },
                  { emoji: "⚡", title: "Livraison instantanée si en stock", desc: "Si le compte est disponible en stock, vous recevrez les identifiants dans les minutes suivant votre commande. Sinon, la livraison peut prendre jusqu'à 24 heures." },
                  { emoji: "🔄", title: "Remplacement garanti", desc: "Si l'accès ne fonctionne pas à la réception, contactez le support dans les 24h pour un remplacement immédiat." },
                ].map((item, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: i < 4 ? 12 : 0 }}>
                    <Text style={{ fontSize: 18, marginTop: 1 }}>{item.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.text, marginBottom: 3 }}>{item.title}</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textMuted, lineHeight: 18 }}>{item.desc}</Text>
                    </View>
                  </View>
                ))}
                <View style={{ backgroundColor: "#4CAF5018", borderRadius: 10, padding: 10, marginTop: 8, flexDirection: "row", gap: 8 }}>
                  <Feather name="check-circle" size={14} color="#4CAF50" style={{ marginTop: 2 }} />
                  <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: colors.text, lineHeight: 17 }}>
                    Une fois que vous avez effectué votre première connexion avec succès, le compte est pleinement à vous. Vous êtes libre de faire ce que vous souhaitez avec.
                  </Text>
                </View>
              </View>

              {/* ── Disclaimer ── */}
              <View style={{ backgroundColor: colors.inputBg, borderRadius: 12, padding: 12, flexDirection: "row", gap: 10 }}>
                <Feather name="info" size={15} color={colors.textMuted} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textMuted, lineHeight: 18 }}>
                  Le boost est un accélérateur, pas une baguette magique. Il fonctionne mieux avec un contenu de qualité et une stratégie cohérente. Social Boost Horizon s'engage à traiter les réclamations justifiées selon les conditions ci-dessus.
                </Text>
              </View>

              <Pressable
                style={{ backgroundColor: colors.accent, borderRadius: 12, padding: 14, alignItems: "center" }}
                onPress={() => setShowBoostInfo(false)}
              >
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" }}>J'ai compris, allons-y !</Text>
              </Pressable>

              {/* ── Bouton Réclamation ── */}
              <Pressable
                style={{ borderWidth: 1.5, borderColor: "#FF572250", borderRadius: 12, padding: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
                onPress={() => {
                  setShowBoostInfo(false);
                  router.push("/reclamation" as any);
                }}
              >
                <Feather name="refresh-cw" size={16} color="#FF5722" />
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#FF5722" }}>Faire une réclamation</Text>
              </Pressable>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textMuted, textAlign: "center", lineHeight: 16 }}>
                Réservé aux commandes Élite / HQ / Premium · Délai 30 jours
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#fff" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  themeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  balancePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,215,0,0.15)", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  balanceText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#FFD700" },
  content: { paddingHorizontal: 12, paddingTop: 14, gap: 14 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 12 },
  sectionLabel: { fontFamily: "Inter_700Bold", fontSize: 15 },
  sectionSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: -6 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 13 },
  errorRow: { gap: 8 },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 12, flex: 1 },
  retryBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignSelf: "flex-start" },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },

  orderTypeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  orderTypeCard: {
    width: "47%", borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 8,
    position: "relative",
  },
  orderTypeIconBg: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  orderTypeLabel: { fontFamily: "Inter_700Bold", fontSize: 14 },
  orderTypeDesc: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
  orderTypeBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  orderTypeBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },

  backTypeBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, padding: 12 },
  backTypeBtnIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  backTypeBtnLabel: { fontFamily: "Inter_700Bold", fontSize: 14 },
  backTypeBtnSub: { fontFamily: "Inter_400Regular", fontSize: 11 },

  platformScroll: { paddingBottom: 4, gap: 10 },
  platformBtn: { alignItems: "center", gap: 5, borderWidth: 1.5, borderRadius: 12, padding: 10, width: 76 },
  platformIcon: { width: 40, height: 40, borderRadius: 10 },
  platformLabel: { fontFamily: "Inter_500Medium", fontSize: 10, textAlign: "center" },
  platformCount: { fontFamily: "Inter_400Regular", fontSize: 9, textAlign: "center" },

  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  categoryLabel: { fontFamily: "Inter_500Medium", fontSize: 12, flex: 1 },
  countBadge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  countBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10 },

  serviceInfoCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 },
  serviceInfoTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  serviceInfoIcon: { width: 40, height: 40, borderRadius: 10 },
  serviceInfoName: { fontFamily: "Inter_600SemiBold", fontSize: 14, lineHeight: 20 },
  categoryTag: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, alignSelf: "flex-start", marginTop: 5 },
  categoryTagText: { fontFamily: "Inter_500Medium", fontSize: 10 },
  changeBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  changeBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  serviceInfoGrid: { flexDirection: "row", gap: 6 },
  serviceInfoCell: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 8, alignItems: "center" },
  serviceInfoLabel: { fontFamily: "Inter_400Regular", fontSize: 10, marginBottom: 3 },
  serviceInfoValue: { fontFamily: "Inter_700Bold", fontSize: 11, textAlign: "center" },

  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 13, marginBottom: 4 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  input: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14 },
  quantityHint: { fontFamily: "Inter_400Regular", fontSize: 12 },

  priceSummary: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 },
  priceSummaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  priceSummaryLabel: { fontFamily: "Inter_400Regular", fontSize: 13 },
  priceSummaryValue: { fontFamily: "Inter_700Bold", fontSize: 15 },

  submitBtn: { borderRadius: 12, overflow: "hidden", marginTop: 4 },
  submitGradient: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  submitText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },

  hintCard: { borderWidth: 1, borderRadius: 14, padding: 20, alignItems: "center", gap: 10 },
  hintText: { fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center", lineHeight: 20 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, maxHeight: "80%" },
  modalHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 17 },
  modalSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  modalClose: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  serviceItem: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  serviceItemName: { fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 18 },
  serviceItemMeta: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 3 },
  serviceItemPrice: { fontFamily: "Inter_700Bold", fontSize: 14 },
  serviceItemPriceSub: { fontFamily: "Inter_400Regular", fontSize: 10 },

  successOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.80)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  successSheet: {
    backgroundColor: "#0D1F3C",
    borderRadius: 24,
    padding: 28,
    width: "100%",
    alignItems: "center",
    gap: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  successIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(76,175,80,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(76,175,80,0.3)",
  },
  successTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: "#fff",
    textAlign: "center",
  },
  successSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
    lineHeight: 20,
  },
  successSummary: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  successRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  successRowLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
  },
  successRowValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  successDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  successBtnPrimary: {
    width: "100%",
    backgroundColor: "#1E90FF",
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  successBtnPrimaryText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
  },
  successBtnSecondary: {
    width: "100%",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  successBtnSecondaryText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: "rgba(255,255,255,0.7)",
  },
});
