import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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

import { BASE_URL } from "@/services/api";

// ═══════════════════════════════════════════════════════════════
//  Constantes de style
// ═══════════════════════════════════════════════════════════════
const GOLD = "#D4AF37";
const GOLD_LIGHT = "#F5C04C";
const NAVY = "#0A1C3A";
const NAVY_LIGHT = "#152E54";
const SUCCESS = "#10B981";
const INFO = "#3B82F6";
const WARNING = "#F59E0B";
const DANGER = "#EF4444";
const PURPLE = "#8B5CF6";

// ═══════════════════════════════════════════════════════════════
//  SYNONYMES & MAPPINGS MÉTIER
//  Le cœur de l'intelligence locale : comprend ce que veut l'utilisateur
//  sans avoir besoin de l'IA pour les cas évidents.
// ═══════════════════════════════════════════════════════════════
const PLATFORM_SYNONYMS: Record<string, string[]> = {
  instagram: ["instagram", "insta", "ig", "insta reel", "reel insta", "story insta"],
  tiktok: ["tiktok", "tik tok", "tiktok live", "vt.tiktok", "douyin"],
  youtube: ["youtube", "yt", "youtu.be", "youtube shorts", "shorts"],
  facebook: ["facebook", "fb", "fb page", "facebook page", "fb ads"],
  twitter: ["twitter", "x", "x.com", "tweet", "retweet", "x twitter"],
  telegram: ["telegram", "tg", "telegram channel", "telegram group", "telegram members"],
  whatsapp: ["whatsapp", "wa", "whatsapp business", "whatsapp channel", "wa group"],
  spotify: ["spotify", "spoti", "spotify plays", "spotify music"],
  audiomack: ["audiomack", "audio mack"],
  boomplay: ["boomplay", "boom play"],
  soundcloud: ["soundcloud", "sound cloud"],
  applemusic: ["apple music", "applemusic", "itunes", "apple music plays"],
  deezer: ["deezer"],
  twitter_x: ["x", "x.com", "twitter x"],
  twitch: ["twitch", "twitch streamer"],
  kick: ["kick", "kick.com"],
  discord: ["discord", "discord server", "discord members"],
  linkedin: ["linkedin", "linked in"],
  pinterest: ["pinterest", "pin"],
  reddit: ["reddit"],
  snapchat: ["snapchat", "snap"],
  threads: ["threads", "thread meta"],
  quora: ["quora"],
  tumblr: ["tumblr"],
  netflix: ["netflix", "compte netflix"],
  roblox: ["roblox", "robux"],
  pubg: ["pubg", "pubg mobile"],
  freefire: ["free fire", "freefire", "garena free fire"],
  callofduty: ["call of duty", "cod", "cod mobile"],
  fortnite: ["fortnite"],
  minecraft: ["minecraft"],
  genshin: ["genshin", "genshin impact"],
  valorant: ["valorant"],
  leagueoflegends: ["league of legends", "lol", "league"],
  dota: ["dota", "dota 2"],
  csgo: ["csgo", "cs2", "counter strike"],
  apex: ["apex", "apex legends"],
  clashofclans: ["clash of clans", "coc"],
  clashroyale: ["clash royale"],
  brawlstars: ["brawl stars"],
  hayday: ["hay day", "hayday"],
  mobilelegends: ["mobile legends", "mlbb"],
  steam: ["steam", "steam account"],
  xbox: ["xbox", "xbox live"],
  playstation: ["playstation", "psn", "ps4", "ps5"],
  nintendo: ["nintendo", "switch"],
  chatgpt: ["chatgpt", "openai", "chat gpt", "gpt", "gpt plus"],
  deepseek: ["deepseek", "deep seek"],
  claude: ["claude", "anthropic"],
  gemini: ["gemini", "bard", "google gemini"],
  canva: ["canva", "canva pro", "canva premium"],
  notion: ["notion", "notion premium"],
  grammarly: ["grammarly"],
  midjourney: ["midjourney", "mj"],
  figma: ["figma"],
  adobe: ["adobe", "adobe creative", "photoshop"],
  tinder: ["tinder", "tinder boost"],
  bumble: ["bumble"],
  badoo: ["badoo"],
  netflix_account: ["compte netflix", "netflix account"],
  duolingo: ["duolingo"],
  coursera: ["coursera"],
  udemy: ["udemy"],
  skillshare: ["skillshare"],
  binance: ["binance"],
  coinbase: ["coinbase"],
  paypal: ["paypal"],
  stripe: ["stripe"],
  amazon: ["amazon", "amazon fba"],
  shopify: ["shopify"],
  aliexpress: ["aliexpress", "ali express"],
  shopee: ["shopee"],
  ebay: ["ebay"],
  etsy: ["etsy"],
  avito: ["avito"],
  olx: ["olx"],
  traffic: ["traffic", "seo", "backlink", "website traffic", "web traffic", "referencement"],
  google: ["google", "google play", "google business", "google review"],
  googleplay: ["google play", "play store", "app install"],
  appstore: ["app store", "apple store", "ios install"],
  gmail: ["gmail", "google mail"],
  outlook: ["outlook", "hotmail"],
  yahoo: ["yahoo"],
  gmx: ["gmx"],
  yandex: ["yandex"],
  trustpilot: ["trustpilot", "trust pilot"],
  glassdoor: ["glassdoor"],
  fiverr: ["fiverr"],
  upwork: ["upwork"],
  freelancer: ["freelancer"],
  patreon: ["patreon"],
  onlyfans: ["onlyfans", "only fans"],
  likee: ["likee"],
  kwai: ["kwai"],
  vk: ["vk", "vkontakte"],
  okru: ["ok.ru", "okru", "odnoklassniki"],
  rutube: ["rutube"],
  pandalive: ["panda tv", "pandalive"],
  bigo: ["bigo", "bigo live"],
  liveme: ["liveme", "live.me"],
  audio_streaming: ["audio", "musique", "music"],
};

// Synonymes pour les TYPES de services
const SERVICE_TYPE_SYNONYMS: Record<string, string[]> = {
  followers: [
    "abonnés", "abonnes", "abonné", "abonne", "followers", "follower", "subscribers",
    "subscriber", "subs", "fans", "abonnement", "s'abonner", "membres", "members",
    "audience", "communauté", "communaute",
  ],
  likes: [
    "likes", "like", "j'aime", "jaime", "j aime", "coeurs", "coeur", "heart", "hearts",
    "réactions", "reactions", "réaction", "reaction",
  ],
  views: [
    "vues", "vue", "views", "view", "visionnages", "visionnage", "regard", "regards",
    "impressions", "impression", "vues vidéo", "vues video", "vues story", "vues stories",
    "story views", "shorts views", "vues shorts",
  ],
  comments: [
    "commentaires", "commentaire", "comments", "comment", "commente",
    "commenter", "réponses", "reponses",
  ],
  shares: [
    "partages", "partage", "shares", "share", "retweets", "retweet",
    "repost", "reposts", "republication", "republications", "repartage",
  ],
  saves: [
    "saves", "save", "enregistrements", "enregistrement", "bookmarks",
    "bookmark", "sauvegardes", "sauvegarde",
  ],
  plays: [
    "écoutes", "ecoutes", "écoute", "ecoute", "plays", "play", "streams",
    "stream", "lectures", "lecture", "streaming",
  ],
  live_views: [
    "spectateurs live", "téléspectateurs", "telespectateurs", "live views",
    "live viewers", "vue live", "vues live",
  ],
  live_likes: [
    "likes live", "live likes", "réactions live", "reactions live",
  ],
  story_views: [
    "vues story", "vues stories", "story views", "vue story", "vue stories",
  ],
  profile_visits: [
    "visites profil", "visites profile", "visites de profil", "profile visits",
    "visites", "visite",
  ],
  reactions: [
    "réactions", "reactions", "reaction", "réaction", "thumbs up", "emojis",
  ],
  impressions: [
    "impressions", "impression", "portée", "portee", "reach",
  ],
  mentions: [
    "mentions", "mention", "@mentions", "tag", "tags",
  ],
  poll_votes: [
    "votes", "vote", "sondage", "sondages", "poll", "polls", "votes sondage",
  ],
  custom_comments: [
    "commentaires personnalisés", "commentaires personnalises", "custom comments",
    "commentaires perso", "commentaire personnalisé",
  ],
  traffic: [
    "trafic", "traffic", "seo", "referencement", "référencement", "backlinks",
    "backlink", "liens", "visiteurs", "website traffic",
  ],
};

// Secteurs d'activité → plateformes/services suggérés
const SECTOR_MAPPINGS: Record<string, { label: string; platforms: string[]; types: string[]; emoji: string }> = {
  musicien: {
    label: "Musicien / Artiste",
    platforms: ["spotify", "audiomack", "boomplay", "applemusic", "soundcloud", "youtube", "deezer", "tiktok", "instagram"],
    types: ["plays", "followers", "likes", "views"],
    emoji: "🎵",
  },
  artiste: {
    label: "Artiste / Musicien",
    platforms: ["spotify", "audiomack", "boomplay", "applemusic", "youtube", "tiktok", "instagram"],
    types: ["plays", "followers", "likes"],
    emoji: "🎤",
  },
  chanteur: {
    label: "Chanteur",
    platforms: ["spotify", "audiomack", "boomplay", "youtube", "tiktok"],
    types: ["plays", "followers"],
    emoji: "🎙️",
  },
  rappeur: {
    label: "Rappeur",
    platforms: ["spotify", "audiomack", "youtube", "tiktok"],
    types: ["plays", "followers", "views"],
    emoji: "🎤",
  },
  influenceur: {
    label: "Influenceur / Créateur",
    platforms: ["instagram", "tiktok", "youtube", "twitter", "threads"],
    types: ["followers", "likes", "views", "comments"],
    emoji: "✨",
  },
  influenceuse: {
    label: "Influenceur / Créateur",
    platforms: ["instagram", "tiktok", "youtube"],
    types: ["followers", "likes", "views"],
    emoji: "✨",
  },
  influence: {
    label: "Influenceur / Créateur",
    platforms: ["instagram", "tiktok", "youtube"],
    types: ["followers", "likes", "views"],
    emoji: "✨",
  },
  createur: {
    label: "Créateur de contenu",
    platforms: ["instagram", "tiktok", "youtube", "twitch"],
    types: ["followers", "views", "likes"],
    emoji: "🎬",
  },
  youtuber: {
    label: "YouTuber",
    platforms: ["youtube", "tiktok", "instagram"],
    types: ["followers", "views", "likes", "comments"],
    emoji: "▶️",
  },
  tiktokeur: {
    label: "TikTokeur",
    platforms: ["tiktok", "instagram", "youtube"],
    types: ["followers", "likes", "views"],
    emoji: "🎶",
  },
  instagrameur: {
    label: "Instagrameur",
    platforms: ["instagram", "tiktok"],
    types: ["followers", "likes", "views", "comments"],
    emoji: "📸",
  },
  gamer: {
    label: "Gamer / Streamer",
    platforms: ["twitch", "youtube", "tiktok", "kick", "discord"],
    types: ["followers", "live_views", "views"],
    emoji: "🎮",
  },
  streamer: {
    label: "Streamer",
    platforms: ["twitch", "youtube", "kick", "tiktok"],
    types: ["live_views", "followers", "views"],
    emoji: "🎮",
  },
  youtubeur_gaming: {
    label: "Gaming",
    platforms: ["youtube", "twitch", "tiktok"],
    types: ["views", "followers"],
    emoji: "🎮",
  },
  commercant: {
    label: "Commerçant / E-commerce",
    platforms: ["instagram", "tiktok", "facebook", "google", "trustpilot"],
    types: ["followers", "views", "likes", "profile_visits"],
    emoji: "🛍️",
  },
  commerce: {
    label: "E-commerce",
    platforms: ["instagram", "tiktok", "shopify", "amazon", "trustpilot"],
    types: ["followers", "views", "profile_visits"],
    emoji: "🛍️",
  },
  boutique: {
    label: "Boutique / E-commerce",
    platforms: ["instagram", "tiktok", "facebook", "google"],
    types: ["followers", "views", "likes"],
    emoji: "🛒",
  },
  ecommerce: {
    label: "E-commerce",
    platforms: ["instagram", "tiktok", "shopify", "amazon", "trustpilot"],
    types: ["followers", "profile_visits"],
    emoji: "🛍️",
  },
  restaurant: {
    label: "Restaurant / Food",
    platforms: ["instagram", "tiktok", "google", "trustpilot", "facebook"],
    types: ["followers", "views", "profile_visits"],
    emoji: "🍽️",
  },
  food: {
    label: "Food / Restaurant",
    platforms: ["instagram", "tiktok", "google", "trustpilot"],
    types: ["followers", "profile_visits"],
    emoji: "🍽️",
  },
  developpeur: {
    label: "Développeur",
    platforms: ["github", "linkedin", "stackoverflow", "twitter"],
    types: ["followers", "likes"],
    emoji: "💻",
  },
  developer: {
    label: "Développeur",
    platforms: ["github", "linkedin", "stackoverflow"],
    types: ["followers"],
    emoji: "💻",
  },
  photographe: {
    label: "Photographe",
    platforms: ["instagram", "pinterest", "tiktok", "flickr"],
    types: ["followers", "likes", "views"],
    emoji: "📷",
  },
  coach: {
    label: "Coach",
    platforms: ["instagram", "tiktok", "youtube", "linkedin"],
    types: ["followers", "views"],
    emoji: "🎯",
  },
  formateur: {
    label: "Formateur",
    platforms: ["youtube", "udemy", "instagram", "linkedin"],
    types: ["followers", "views"],
    emoji: "📚",
  },
  entrepreneur: {
    label: "Entrepreneur",
    platforms: ["linkedin", "instagram", "twitter", "youtube"],
    types: ["followers", "profile_visits"],
    emoji: "💼",
  },
  freelance: {
    label: "Freelance",
    platforms: ["linkedin", "fiverr", "upwork", "instagram"],
    types: ["followers", "profile_visits"],
    emoji: "🧑‍💻",
  },
  sportif: {
    label: "Sportif",
    platforms: ["instagram", "tiktok", "youtube"],
    types: ["followers", "views"],
    emoji: "🏃",
  },
  mannequin: {
    label: "Mannequin / Model",
    platforms: ["instagram", "tiktok"],
    types: ["followers", "likes"],
    emoji: "💃",
  },
  politique: {
    label: "Politique / Association",
    platforms: ["facebook", "twitter", "youtube", "instagram"],
    types: ["followers", "views", "reactions"],
    emoji: "🗳️",
  },
  asso: {
    label: "Association",
    platforms: ["facebook", "instagram", "youtube"],
    types: ["followers", "views"],
    emoji: "🤝",
  },
  eglise: {
    label: "Église / Communauté",
    platforms: ["facebook", "youtube", "instagram", "tiktok"],
    types: ["followers", "views", "live_views"],
    emoji: "⛪",
  },
  podcast: {
    label: "Podcast",
    platforms: ["spotify", "youtube", "applemusic", "audiomack"],
    types: ["plays", "followers", "views"],
    emoji: "🎧",
  },
  radio: {
    label: "Radio / Audio",
    platforms: ["spotify", "soundcloud", "audiomack", "mixcloud"],
    types: ["plays", "followers"],
    emoji: "📻",
  },
  site: {
    label: "Site web / SEO",
    platforms: ["traffic", "google"],
    types: ["traffic"],
    emoji: "🌐",
  },
  website: {
    label: "Site web / SEO",
    platforms: ["traffic", "google"],
    types: ["traffic"],
    emoji: "🌐",
  },
  seo: {
    label: "SEO / Référencement",
    platforms: ["traffic", "google"],
    types: ["traffic"],
    emoji: "📈",
  },
  automobile: {
    label: "Automobile / Voiture",
    platforms: ["instagram", "youtube", "tiktok", "facebook"],
    types: ["followers", "views"],
    emoji: "🚗",
  },
  mode: {
    label: "Mode / Fashion",
    platforms: ["instagram", "tiktok", "pinterest"],
    types: ["followers", "likes", "views"],
    emoji: "👗",
  },
  beauté: {
    label: "Beauté / Cosmétique",
    platforms: ["instagram", "tiktok", "youtube"],
    types: ["followers", "likes", "views"],
    emoji: "💄",
  },
  beaute: {
    label: "Beauté / Cosmétique",
    platforms: ["instagram", "tiktok", "youtube"],
    types: ["followers", "likes"],
    emoji: "💄",
  },
};

// ═══════════════════════════════════════════════════════════════
//  Utilitaires
// ═══════════════════════════════════════════════════════════════
function normalizeText(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "'");
}

function mcServiceKey(svc: any): string {
  const provider = String(svc?._provider ?? svc?.provider ?? svc?._providerKey ?? svc?._platformKey ?? svc?._platformLabel ?? "catalog")
    .trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40) || "catalog";
  const id = String(svc?.id ?? svc?.serviceId ?? svc?.name ?? "unknown")
    .trim().replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 50) || "unknown";
  return provider + ":" + id;
}

function mcPublicText(value: unknown): string {
  return String(value ?? "")
    .replace(/\b(?:smm\s*wiz|smmwiz|mtp|exo|afrique\s*boost|afriqueboost|africa\s*boost|africaboost)\b/gi, "")
    .replace(/[|·:—–-]{2,}/g, " ")
    .replace(/^\s*[|·:—–-]+|\s*[|·:—–-]+\s*$/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .trim();
}

function formatMcReply(value: unknown): string {
  return mcPublicText(value)
    .replace(/\r\n?/g, "\n")
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "• ")
    .replace(/^[ \t]*\d+[.)][ \t]+/gm, "• ")
    .replace(/^[ \t]*[|]{1,}[ \t]*$/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ═══════════════════════════════════════════════════════════════
//  Moteur de recherche intelligent LOCAL
//  Priorité absolue : trouve les services AVANT d'appeler l'IA
// ═══════════════════════════════════════════════════════════════
interface ScoredService {
  svc: any;
  score: number;
  reasons: string[];
}

function buildSearchIntent(query: string): {
  platforms: Set<string>;
  types: Set<string>;
  sectors: Set<string>;
  keywords: string[];
} {
  const q = normalizeText(query);
  const words = q.split(/\s+/).filter(w => w.length >= 2);

  const platforms = new Set<string>();
  const types = new Set<string>();
  const sectors = new Set<string>();

  // Détection plateforme
  for (const [key, synonyms] of Object.entries(PLATFORM_SYNONYMS)) {
    for (const syn of synonyms) {
      if (q.includes(normalizeText(syn))) {
        platforms.add(key);
        break;
      }
    }
  }

  // Détection type de service
  for (const [key, synonyms] of Object.entries(SERVICE_TYPE_SYNONYMS)) {
    for (const syn of synonyms) {
      if (q.includes(normalizeText(syn))) {
        types.add(key);
        break;
      }
    }
  }

  // Détection secteur
  for (const [key, data] of Object.entries(SECTOR_MAPPINGS)) {
    if (q.includes(normalizeText(key))) {
      sectors.add(key);
    }
  }

  return { platforms, types, sectors, keywords: words };
}

function searchServices(allServices: any[], query: string): {
  results: ScoredService[];
  intent: ReturnType<typeof buildSearchIntent>;
  confidence: "high" | "medium" | "low";
} {
  const intent = buildSearchIntent(query);
  const q = normalizeText(query);
  const words = intent.keywords;

  // Si aucune intention détectée, fallback sur mots-clés simples
  const hasIntent = intent.platforms.size > 0 || intent.types.size > 0 || intent.sectors.size > 0;

  const scored: ScoredService[] = allServices.map(svc => {
    const name = normalizeText(svc.name || "");
    const platform = normalizeText(svc._platformKey || "");
    const category = normalizeText(svc.category || "");
    const type = normalizeText(svc.type || "");

    let score = 0;
    const reasons: string[] = [];

    // 1. Correspondance plateforme (le signal le plus fort)
    if (intent.platforms.size > 0) {
      if (intent.platforms.has(platform)) {
        score += 50;
        reasons.push(`platform:${platform}`);
      } else {
        // Pénalité : si on cherche Instagram, ne pas montrer TikTok
        score -= 30;
      }
    }

    // 2. Correspondance secteur → boost sur les plateformes du secteur
    for (const sector of intent.sectors) {
      const sectorData = SECTOR_MAPPINGS[sector];
      if (sectorData?.platforms.includes(platform)) {
        score += 20;
        reasons.push(`sector-platform`);
      }
      if (sectorData?.types.some((t: string) => name.includes(t) || category.includes(t))) {
        score += 15;
        reasons.push(`sector-type`);
      }
    }

    // 3. Correspondance type de service (catégorie ou nom)
    if (intent.types.size > 0) {
      const typeSynonyms = Object.entries(SERVICE_TYPE_SYNONYMS);
      for (const [typeKey, synonyms] of typeSynonyms) {
        if (!intent.types.has(typeKey)) continue;
        for (const syn of synonyms) {
          const synN = normalizeText(syn);
          if (name.includes(synN) || category.includes(synN)) {
            score += 25;
            reasons.push(`type:${typeKey}`);
            break;
          }
        }
      }
    }

    // 4. Correspondance directe par mots-clés (fallback)
    if (!hasIntent && words.length > 0) {
      for (const w of words) {
        if (name.includes(w)) score += 15;
        if (category.includes(w)) score += 8;
        if (platform.includes(w)) score += 10;
      }
    }

    // 5. Petit bonus qualité : éviter les services "test" ou "free"
    if (name.includes("test") || name.includes("free trial")) score -= 20;
    if (name.includes("premium") || name.includes("real") || name.includes("quality")) score += 5;

    // 6. Bonus légèrement les services avec refill (plus fiables)
    if (svc.refill) score += 3;

    // 7. Bonus pour des prix accessibles (permet de montrer les entrées de gamme)
    if (svc.min <= 100) score += 2;

    return { svc, score, reasons };
  });

  // Filtrer les scores positifs et trier
  const positive = scored.filter(x => x.score > 0);

  // Dédupliquer : ne garder que le meilleur service par (plateforme + catégorie)
  // pour avoir de la variété dans les suggestions
  const seen = new Set<string>();
  const deduped: ScoredService[] = [];
  for (const item of positive.sort((a, b) => b.score - a.score)) {
    const key = `${item.svc._platformKey || ""}|${item.svc.category || ""}|${item.svc.type || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= 30) break;
  }

  // Confiance
  let confidence: "high" | "medium" | "low" = "low";
  if (intent.platforms.size > 0 && intent.types.size > 0) confidence = "high";
  else if (intent.platforms.size > 0 || intent.types.size > 0 || intent.sectors.size > 0) confidence = "medium";
  else if (deduped.length > 3) confidence = "medium";

  return { results: deduped, intent, confidence };
}

// ═══════════════════════════════════════════════════════════════
//  Génération d'une réponse LOCALE intelligente (sans IA)
//  Utilisé quand l'IA est indisponible OU quand la confiance est élevée
// ═══════════════════════════════════════════════════════════════
function buildLocalResponse(
  query: string,
  searchResult: ReturnType<typeof searchServices>,
  userName: string
): string {
  const { results, intent, confidence } = searchResult;
  const firstName = userName.split(" ")[0] || "";

  if (results.length === 0) {
    return `Hmm, je n'ai pas trouvé de service qui correspond à "${query}" ${firstName ? firstName : ""}. 🤔\n\nEssaie avec des mots plus simples : **la plateforme + l'action** que tu veux booster.\n\nExemples :\n• "abonnés Instagram"\n• "vues TikTok"\n• "écoutes Spotify"\n• "trafic SEO"`;
  }

  const platforms = Array.from(intent.platforms);
  const types = Array.from(intent.types);
  const sectors = Array.from(intent.sectors);

  const platformLabel = platforms.length > 0 ? platforms.map(p => capitalize(p)).join(", ") : "";
  const sectorData = sectors.length > 0 ? SECTOR_MAPPINGS[sectors[0]] : null;
  const sectorLabel = sectorData ? `${sectorData.emoji} ${sectorData.label}` : "";

  if (confidence === "high") {
    return `${sectorLabel ? sectorLabel + " — " : ""}voilà ce que je te propose : 👇\n\n**${results.length} service${results.length > 1 ? "s" : ""}** sélectionné${results.length > 1 ? "s" : ""} pour toi :`;
  }

  if (confidence === "medium") {
    return `J'ai trouvé **${results.length} service${results.length > 1 ? "s" : ""}** qui pourrait t'intéresser 👇\n\nRegarde les suggestions et clique sur celle qui te convient le mieux.`;
  }

  return `Voici ce que j'ai trouvé :\n\n${results.length} résultat${results.length > 1 ? "s" : ""} 👇`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ═══════════════════════════════════════════════════════════════
//  SUGGESTIONS RAPIDES DE DÉMARRAGE (tap pour lancer directement)
// ═══════════════════════════════════════════════════════════════
const QUICK_STARTERS = [
  { emoji: "📸", label: "Abonnés Instagram", query: "abonnés Instagram" },
  { emoji: "🎵", label: "Écoutes Spotify", query: "écoutes Spotify music" },
  { emoji: "🎶", label: "Likes TikTok", query: "likes TikTok" },
  { emoji: "▶️", label: "Vues YouTube", query: "vues YouTube" },
  { emoji: "🎮", label: "Followers Twitch", query: "followers Twitch" },
  { emoji: "🌐", label: "Trafic SEO site web", query: "traffic SEO website" },
  { emoji: "✈️", label: "Membres Telegram", query: "membres Telegram" },
  { emoji: "💬", label: "Commentaires Instagram", query: "commentaires Instagram" },
  { emoji: "🎤", label: "Boomplay plays", query: "écoutes Boomplay" },
  { emoji: "💼", label: "Followers LinkedIn", query: "followers LinkedIn" },
];

const MC_LOADING_STAGES = [
  "Je comprends ta demande…",
  "Je vérifie les informations utiles…",
  "Je compare les éléments pertinents…",
  "Je prépare une réponse claire…",
];

// ═══════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════
interface McMessage {
  role: "user" | "assistant";
  content: string;
  recommendations?: any[];
  suggestions?: string[];
  isGreeting?: boolean;
}

interface McSearchProps {
  visible: boolean;
  onClose: () => void;
  allServices: any[];
  userName: string;
  onSelectService: (svc: any) => void;
  C: any;
  isDark: boolean;
  fmt: (n: number) => string;
  initialPrompt?: string;
  initialService?: any;
  initialServices?: any[];
}

// ═══════════════════════════════════════════════════════════════
//  COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function McSearch({
  visible,
  onClose,
  allServices,
  userName,
  onSelectService,
  C,
  isDark,
  fmt,
  initialPrompt,
  initialService,
  initialServices,
}: McSearchProps) {
  const [messages, setMessages] = useState<McMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [searchMode, setSearchMode] = useState<"ia" | "text">("ia");
  const [showStarters, setShowStarters] = useState(true);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  const firstName = (userName || "").split(" ")[0] || "";

  useEffect(() => {
    if (!loading) { setLoadingStage(0); return; }
    const loadingStageTimer = setInterval(() => {
      setLoadingStage((current) => (current + 1) % MC_LOADING_STAGES.length);
    }, 1450);
    return () => clearInterval(loadingStageTimer);
  }, [loading]);

  // ═══════════════════════════════════════════════════════════════
  //  Message d'accueil — 1 seule fois, avec suggestions cliquables
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (visible && messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content:
            `Bonjour ${firstName || "à toi"} ! Je suis **Mč**, l’assistant de Social Boost Horizon.\n\n` +
            `Je peux expliquer un service, clarifier ses conditions, comparer deux offres sélectionnées et t’aider à choisir. Je réponds d’abord à ta question ; je ne propose des services que lorsque c’est utile.\n\n` +
            `Tu peux demander, par exemple : *"Que signifie cette option ?"*, *"Quelles sont les limites de ce service ?"* ou *"Compare ces deux offres"*.`,
          isGreeting: true,
        },
      ]);
    }
  }, [visible]);

  const lastAppliedInitialPromptRef = useRef<string | null>(null);
  useEffect(() => {
    if (!visible) {
      if (!initialPrompt) lastAppliedInitialPromptRef.current = null;
      return;
    }
    if (initialPrompt && lastAppliedInitialPromptRef.current !== initialPrompt) {
      lastAppliedInitialPromptRef.current = initialPrompt;
      setMessages([]);
      setInput(initialPrompt);
      setSearchMode("ia");
      setShowStarters(false);
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [visible, initialPrompt]);

  // ═══════════════════════════════════════════════════════════════
  //  Mč : contexte exact, candidats limités et recommandations pertinentes
  // ═══════════════════════════════════════════════════════════════
  const callAI = useCallback(
    async (userMessages: McMessage[], lastUserQuery: string): Promise<{ reply: string; recommendations: any[]; suggestions?: string[] }> => {
      const localResult = searchServices(allServices, lastUserQuery);
      const normalizedQuery = normalizeText(lastUserQuery);
      const suppliedServices = Array.isArray(initialServices) && initialServices.length > 0
        ? initialServices.slice(0, 2)
        : (initialService ? [initialService] : []);
      const isCompareContext = suppliedServices.length >= 2;
      const asksForCatalog = /\b(cherche|chercher|trouve|trouver|recherche|rechercher|propose|proposer|liste|catalogue|offre|offres|alternative|alternatives|prix|tarif|combien|abonne|abonnes|followers|likes|vue|vues|views|commentaire|commentaires|ecoute|ecoutes|plays|traffic|trafic|membre|membres|partage|partages|comparer|compare|comparaison)\b/i.test(normalizedQuery);
      const asksForExplanation = /\b(explique|expliquer|information|informations|details|detail|fonctionne|fonctionnement|condition|conditions|limite|limites|garantie|garanties|qualite|difference|differences|avantage|avantages|risque|risques|comment|pourquoi|signifie|sert|utiliser|utilisation|definition|signification|parle|cest|quoi|pourrait|astuce|astuces|conseil|conseils|baisse|baisses|chute|chutes|perdu|perte|retention|drop|refill|recharge|organique|ratio|equilibre|engagement|vote|votes|sondage|option|ameliore|ameliorer|amelioration|pourquoi|bug|disparait|disparaisse)\b/i.test(normalizedQuery);
      const asksForAlternatives = /\b(compare|comparer|comparaison|alternative|alternatives|autres offres|autres options|recommande|recommander|meilleur|meilleure|lequel|laquelle)\b/i.test(normalizedQuery);

      // Recherche simple : répondre localement, sans appel IA. N'afficher des cartes
      // que si le client cherche réellement des services/offres.
      if (!suppliedServices.length && !asksForExplanation && localResult.confidence === "high" && localResult.results.length >= 3) {
        return {
          reply: mcPublicText(buildLocalResponse(lastUserQuery, localResult, userName)),
          recommendations: asksForCatalog ? localResult.results.slice(0, 6).map((r) => r.svc) : [],
        };
      }

      const localCandidates = localResult.results.slice(0, 8).map((r) => r.svc);
      const shortlist: any[] = [];
      for (const svc of [...suppliedServices, ...localCandidates]) {
        const key = mcServiceKey(svc);
        if (!shortlist.some((existing) => mcServiceKey(existing) === key)) shortlist.push(svc);
        if (shortlist.length >= 6) break;
      }

      // Les références envoyées au modèle sont opaques (candidate_1, candidate_2).
      // Les identifiants du service sont conservés, mais le nom du fournisseur ne lui est pas transmis.
      const candidateServices = shortlist.map((svc: any, index: number) => ({
        key: `candidate_${index + 1}`,
        id: String(svc?.id ?? svc?.serviceId ?? ""),
        name: mcPublicText(svc?.name).slice(0, 180),
        platform: mcPublicText(svc?._platformLabel ?? svc?.platform ?? svc?._platformKey ?? "").slice(0, 80),
        category: mcPublicText(svc?.category ?? "").slice(0, 80),
        type: mcPublicText(svc?.type ?? "").slice(0, 60),
        priceXAF: svc?.priceXAF != null && Number.isFinite(Number(svc.priceXAF)) ? Number(svc.priceXAF) : null,
        min: svc?.min != null && Number.isFinite(Number(svc.min)) ? Number(svc.min) : null,
        max: svc?.max != null && Number.isFinite(Number(svc.max)) ? Number(svc.max) : null,
        refill: typeof svc?.refill === "boolean" ? svc.refill : null,
        cancel: typeof svc?.cancel === "boolean" ? svc.cancel : null,
        isPackage: typeof svc?.isPackage === "boolean" ? svc.isPackage : null,
        isPerOne: typeof svc?.isPerOne === "boolean" ? svc.isPerOne : null,
        description: mcPublicText(svc?.description ?? "").slice(0, 260),
      }));
      const firstContext = initialService
        ? candidateServices[0] ?? null
        : (isCompareContext ? null : null);

      try {
        const res = await fetch(`${BASE_URL}api/mc/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: userMessages.slice(-8).map((m) => ({ role: m.role, content: String(m.content ?? "").slice(0, 1500) })),
            displayName: firstName,
            candidateServices,
            serviceContext: firstContext,
            comparisonRefs: isCompareContext ? candidateServices.slice(0, 2).map((svc: any) => svc.key) : [],
          }),
        });
        if (!res.ok) throw new Error(`Mč unavailable (${res.status})`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error ?? "AI error");
        const responseSuggestions: string[] = Array.isArray(data.suggestions)
          ? data.suggestions
              .filter((value: unknown): value is string => typeof value === "string")
              .map((value: string) => formatMcReply(value).slice(0, 90))
              .filter((value: string) => value.length > 0)
              .slice(0, 4)
          : [];

        const validRefs: string[] = Array.isArray(data.recommendationRefs)
          ? data.recommendationRefs.filter((ref: unknown) => typeof ref === "string")
          : (Array.isArray(data.recommendationKeys) ? data.recommendationKeys.filter((key: unknown) => typeof key === "string") : []);
        const recSvcs = validRefs
          .map((ref) => {
            const idx = Number(String(ref).match(/^candidate_(\d+)$/)?.[1] ?? NaN) - 1;
            if (Number.isInteger(idx) && idx >= 0 && idx < shortlist.length) return shortlist[idx];
            // Compatibilité temporaire avec l'ancien format clé fournisseur:id.
            return shortlist.find((svc: any) => mcServiceKey(svc) === ref);
          })
          .filter(Boolean);

        let recommendations: any[] = [];
        if (isCompareContext) {
          // Dans une comparaison demandée par le client, montrer uniquement les deux offres choisies.
          recommendations = suppliedServices;
        } else if (asksForCatalog && ((!asksForExplanation && !suppliedServices.length) || asksForAlternatives)) {
          recommendations = recSvcs.length
            ? recSvcs.slice(0, 5)
            : (localResult.confidence !== "low" ? localResult.results.slice(0, 5).map((r) => r.svc) : []);
        }

        return {
          reply: formatMcReply(data.reply || "Voici ce que les informations disponibles permettent de confirmer."),
          recommendations,
          suggestions: responseSuggestions,
        };
      } catch (_error) {
        if (isCompareContext) {
          return {
            reply: "Je n’ai pas pu joindre l’assistant pour analyser ces deux offres. Les deux services restent sélectionnés ; réessaie lorsque la connexion sera rétablie.",
            recommendations: suppliedServices,
          };
        }
        if (asksForExplanation || (suppliedServices.length > 0 && !asksForAlternatives)) {
          return {
            reply: "Je n’ai pas pu obtenir une réponse fiable pour le moment. Réessaie lorsque la connexion sera rétablie ; je préfère te le dire plutôt que d’inventer des caractéristiques ou de proposer des services au hasard.",
            recommendations: [],
          };
        }
        return {
          reply: mcPublicText(buildLocalResponse(lastUserQuery, localResult, userName)),
          recommendations: asksForCatalog && (!asksForExplanation || asksForAlternatives) && (!suppliedServices.length || asksForAlternatives) && localResult.confidence !== "low"
            ? localResult.results.slice(0, 5).map((r) => r.svc)
            : [],
        };
      }
    },
    [allServices, userName, initialService, initialServices]
  );

  // ═══════════════════════════════════════════════════════════════
  //  Envoi d'un message (IA)
  // ═══════════════════════════════════════════════════════════════
  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const userMsg: McMessage = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setShowStarters(false);
    setLoading(true);

    try {
      const { reply, recommendations, suggestions } = await callAI(nextMessages, text);
      const publicReply = formatMcReply(reply);
      setMessages(prev => [...prev, { role: "assistant", content: publicReply, recommendations, suggestions }]);
    } catch (e: any) {
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: `😅 Je n'ai pas pu traiter ta demande. Réessaie en une phrase simple (ex: "abonnés Instagram").`,
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [input, loading, messages, callAI]);

  // ═══════════════════════════════════════════════════════════════
  //  Recherche texte directe (sans IA)
  // ═══════════════════════════════════════════════════════════════
  const handleTextSearch = useCallback((overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const localResult = searchServices(allServices, text);
    const reply = formatMcReply(buildLocalResponse(text, localResult, userName));

    setMessages(prev => [
      ...prev,
      { role: "user", content: text },
      {
        role: "assistant",
        content: reply,
        recommendations: localResult.results.slice(0, 12).map(r => r.svc),
      },
    ]);
    setInput("");
    setShowStarters(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [input, allServices, userName]);

  // ═══════════════════════════════════════════════════════════════
  //  Animation
  // ═══════════════════════════════════════════════════════════════
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: 280,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [visible]);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [700, 0] });

  // ═══════════════════════════════════════════════════════════════
  //  Rendu d'un message assistant (avec markdown léger)
  // ═══════════════════════════════════════════════════════════════
  const renderMessageContent = (content: string, isUser: boolean) => {
    const cleanContent = formatMcReply(content);
    const textColor = isUser
      ? (isDark ? NAVY : "#fff")
      : (isDark ? "#F8F9FA" : "#1A202C");

    // Découpe par **gras** et *italique*
    const parts: Array<{ type: "text" | "bold" | "italic"; value: string }> = [];
    const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(cleanContent)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", value: cleanContent.slice(lastIndex, match.index) });
      }
      const token = match[0];
      if (token.startsWith("**")) {
        parts.push({ type: "bold", value: token.slice(2, -2) });
      } else {
        parts.push({ type: "italic", value: token.slice(1, -1) });
      }
      lastIndex = match.index + token.length;
    }
    if (lastIndex < cleanContent.length) {
      parts.push({ type: "text", value: cleanContent.slice(lastIndex) });
    }

    return (
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, color: textColor }}>
        {parts.map((p, i) => {
          if (p.type === "bold") {
            return (
              <Text key={i} style={{ fontFamily: "Inter_700Bold" }}>{p.value}</Text>
            );
          }
          if (p.type === "italic") {
            return (
              <Text key={i} style={{ fontFamily: "Inter_400Regular", fontStyle: "italic" }}>{p.value}</Text>
            );
          }
          return <Text key={i}>{p.value}</Text>;
        })}
      </Text>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  //  Rendu d'une carte service suggérée
  // ═══════════════════════════════════════════════════════════════
  const renderServiceCard = (svc: any, idx: number) => {
    const platformColor = svc._platformColor ?? GOLD;
    const platformIcon = svc._platformIcon;
    const platformLabel = svc._platformLabel ?? "";

    return (
      <Pressable
        key={`${svc.id}-${idx}`}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onSelectService(svc);
        }}
        style={({ pressed }) => [
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#FFFFFF",
            borderRadius: 14,
            borderWidth: 1,
            borderColor: isDark ? "rgba(212,175,55,0.22)" : "rgba(212,175,55,0.30)",
            paddingHorizontal: 12,
            paddingVertical: 11,
            marginBottom: 8,
          },
          pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
        ]}
      >
        {/* Icône plateforme */}
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            backgroundColor: platformColor + "20",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            borderWidth: 1,
            borderColor: platformColor + "40",
          }}
        >
          {platformIcon ? (
            <Image
              source={{ uri: platformIcon }}
              style={{ width: 22, height: 22 }}
              contentFit="contain"
            />
          ) : (
            <Feather name="zap" size={16} color={platformColor} />
          )}
        </View>

        {/* Infos */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: "Inter_600SemiBold",
              fontSize: 12.5,
              color: isDark ? "#fff" : "#1A202C",
              lineHeight: 17,
            }}
            numberOfLines={2}
          >
            {mcPublicText(svc.name)}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
            {platformLabel ? (
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 10,
                  color: platformColor,
                }}
                numberOfLines={1}
              >
                {platformLabel}
              </Text>
            ) : null}
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: isDark ? "rgba(255,255,255,0.45)" : "rgba(10,28,58,0.5)" }}>
              · min {svc.min?.toLocaleString?.() ?? svc.min}
            </Text>
            {svc.refill ? (
              <View style={{ backgroundColor: SUCCESS + "20", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 8.5, color: SUCCESS }}>♻ Recharge</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Prix + chevron */}
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: SUCCESS }}>
            {fmt(svc.priceXAF)}
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9.5, color: isDark ? "rgba(255,255,255,0.4)" : "rgba(10,28,58,0.4)" }}>
            /1000
          </Text>
        </View>

        <Feather name="arrow-right" size={16} color={GOLD} />
      </Pressable>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  //  Rendu d'un message
  // ═══════════════════════════════════════════════════════════════
  const renderMessage = (msg: McMessage, idx: number) => {
    const isUser = msg.role === "user";
    return (
      <View
        key={idx}
        style={{
          marginBottom: 16,
          alignItems: isUser ? "flex-end" : "flex-start",
        }}
      >
        {/* Bulle */}
        <View
          style={{
            maxWidth: "90%",
            backgroundColor: isUser
              ? (isDark ? GOLD : NAVY)
              : (isDark ? "rgba(255,255,255,0.06)" : "#F5F6F8"),
            borderRadius: 16,
            paddingHorizontal: 14,
            paddingVertical: 11,
            borderTopLeftRadius: isUser ? 16 : 4,
            borderTopRightRadius: isUser ? 4 : 16,
            borderWidth: isUser ? 0 : 1,
            borderColor: isDark ? "rgba(212,175,55,0.18)" : "rgba(10,28,58,0.06)",
          }}
        >
          {!isUser && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <LinearGradient
                colors={[NAVY, NAVY_LIGHT]}
                style={{
                  width: 22, height: 22, borderRadius: 11,
                  alignItems: "center", justifyContent: "center",
                  borderWidth: 1, borderColor: GOLD + "40",
                }}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              >
                <Text style={{ fontSize: 11 }}>🤖</Text>
              </LinearGradient>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: GOLD, letterSpacing: 0.3 }}>
                Mč
              </Text>
            </View>
          )}
          {renderMessageContent(msg.content, isUser)}
        </View>

        {/* Recommandations */}
        {msg.recommendations && msg.recommendations.length > 0 && (
          <View style={{ width: "100%", marginTop: 10 }}>
            {msg.recommendations.map((svc: any, i: number) => renderServiceCard(svc, i))}
          </View>
        )}
        {!isUser && msg.suggestions && msg.suggestions.length > 0 && (
          <View style={{ width: "100%", marginTop: 8, gap: 7 }}>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: isDark ? "rgba(255,255,255,0.55)" : "rgba(10,28,58,0.55)" }}>Tu peux choisir une option :</Text>
            {msg.suggestions.map((suggestion, suggestionIndex) => (
              <Pressable
                key={`${idx}-suggestion-${suggestionIndex}`}
                onPress={() => handleSend(suggestion)}
                disabled={loading}
                style={({ pressed }) => ({
                  alignSelf: "flex-start", maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 8,
                  paddingVertical: 9, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1,
                  borderColor: isDark ? "rgba(212,175,55,0.35)" : "rgba(10,28,58,0.12)",
                  backgroundColor: isDark ? "rgba(212,175,55,0.08)" : "rgba(10,28,58,0.035)",
                  opacity: pressed ? 0.78 : 1,
                })}
              >
                <Feather name="arrow-up-right" size={13} color={GOLD} />
                <Text style={{ flexShrink: 1, fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 17, color: isDark ? "#F8F9FA" : "#1A202C" }}>{suggestion}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  //  RENDU PRINCIPAL
  // ═══════════════════════════════════════════════════════════════
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: isDark ? "#0F1B33" : "#FFFFFF",
                transform: [{ translateY }],
              },
            ]}
          >
            {/* ─── Header ─── */}
            <View style={[styles.header, { borderBottomColor: C.separator }]}>
              <LinearGradient
                colors={[NAVY, NAVY_LIGHT]}
                style={styles.avatar}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              >
                <Text style={{ fontSize: 22 }}>🤖</Text>
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: isDark ? "#fff" : NAVY }]}>
                  Mč
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: SUCCESS }} />
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: isDark ? "rgba(255,255,255,0.6)" : "rgba(10,28,58,0.55)" }}>
                    En ligne · Réponse instantanée
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={10}
                style={{
                  width: 34, height: 34, borderRadius: 12,
                  backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(10,28,58,0.05)",
                  alignItems: "center", justifyContent: "center",
                }}
              >
                <Feather name="x" size={18} color={isDark ? "rgba(255,255,255,0.7)" : "rgba(10,28,58,0.6)"} />
              </Pressable>
            </View>

            {/* ─── Toggle modes ─── */}
            <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 14, paddingTop: 10 }}>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setSearchMode("ia"); }}
                style={{
                  flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                  gap: 6, paddingVertical: 9, borderRadius: 10,
                  backgroundColor: searchMode === "ia" ? GOLD + "18" : (isDark ? "rgba(255,255,255,0.03)" : "rgba(10,28,58,0.04)"),
                  borderWidth: 1,
                  borderColor: searchMode === "ia" ? GOLD : (isDark ? "rgba(255,255,255,0.08)" : "rgba(10,28,58,0.08)"),
                }}
              >
                <Feather name="zap" size={13} color={searchMode === "ia" ? GOLD : (isDark ? "rgba(255,255,255,0.5)" : "rgba(10,28,58,0.5)")} />
                <Text style={{
                  fontFamily: "Inter_700Bold", fontSize: 11.5,
                  color: searchMode === "ia" ? GOLD : (isDark ? "rgba(255,255,255,0.5)" : "rgba(10,28,58,0.5)"),
                }}>
                  Assistant IA
                </Text>
              </Pressable>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setSearchMode("text"); }}
                style={{
                  flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                  gap: 6, paddingVertical: 9, borderRadius: 10,
                  backgroundColor: searchMode === "text" ? INFO + "18" : (isDark ? "rgba(255,255,255,0.03)" : "rgba(10,28,58,0.04)"),
                  borderWidth: 1,
                  borderColor: searchMode === "text" ? INFO : (isDark ? "rgba(255,255,255,0.08)" : "rgba(10,28,58,0.08)"),
                }}
              >
                <Feather name="search" size={13} color={searchMode === "text" ? INFO : (isDark ? "rgba(255,255,255,0.5)" : "rgba(10,28,58,0.5)")} />
                <Text style={{
                  fontFamily: "Inter_700Bold", fontSize: 11.5,
                  color: searchMode === "text" ? INFO : (isDark ? "rgba(255,255,255,0.5)" : "rgba(10,28,58,0.5)"),
                }}>
                  Recherche rapide
                </Text>
              </Pressable>
            </View>

            {(initialService || (initialServices && initialServices.length > 0)) && (
              <View style={{ paddingHorizontal: 14, paddingTop: 9 }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10.5, color: C.textMuted, letterSpacing: 0.5, marginBottom: 6 }}>
                  {initialServices && initialServices.length > 1 ? "OFFRES SÉLECTIONNÉES" : "SERVICE SÉLECTIONNÉ"}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
                  {(initialServices && initialServices.length > 0 ? initialServices.slice(0, 2) : [initialService]).filter(Boolean).map((svc: any, svcIndex: number) => (
                    <View key={`${svc?._platformKey ?? "service"}-${svc?.id ?? svcIndex}-${svcIndex}`} style={{ maxWidth: "100%", borderRadius: 12, borderWidth: 1, borderColor: C.accent + "55", backgroundColor: C.accent + "0D", paddingHorizontal: 10, paddingVertical: 7 }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: C.accent, marginBottom: 2 }}>{initialServices && initialServices.length > 1 ? (svcIndex === 0 ? "OFFRE A" : "OFFRE B") : "À EXPLIQUER"}</Text>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11.5, lineHeight: 16, color: C.text }} numberOfLines={2}>{mcPublicText(svc?.name) || "Service sélectionné"}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* ─── Contenu ─── */}
            <ScrollView
              ref={scrollRef}
              style={{ flex: 1, marginTop: 8 }}
              contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 16, paddingTop: 6 }}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
              showsVerticalScrollIndicator={false}
            >
              {messages.map((m, i) => renderMessage(m, i))}

              {/* Quick starters */}
              {showStarters && messages.length <= 1 && (
                <View style={{ marginTop: 8 }}>
                  <Text style={{
                    fontFamily: "Inter_700Bold", fontSize: 11.5,
                    color: isDark ? "rgba(255,255,255,0.5)" : "rgba(10,28,58,0.5)",
                    letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10,
                  }}>
                    Suggestions rapides
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {QUICK_STARTERS.map((qs, i) => (
                      <Pressable
                        key={i}
                        onPress={() => {
                          Haptics.selectionAsync();
                          if (searchMode === "ia") handleSend(qs.query);
                          else handleTextSearch(qs.query);
                        }}
                        style={({ pressed }) => [
                          {
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                            paddingHorizontal: 12,
                            paddingVertical: 9,
                            borderRadius: 20,
                            backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(10,28,58,0.04)",
                            borderWidth: 1,
                            borderColor: isDark ? "rgba(212,175,55,0.20)" : "rgba(212,175,55,0.25)",
                          },
                          pressed && { opacity: 0.85, backgroundColor: GOLD + "15" },
                        ]}
                      >
                        <Text style={{ fontSize: 13 }}>{qs.emoji}</Text>
                        <Text style={{
                          fontFamily: "Inter_600SemiBold", fontSize: 11.5,
                          color: isDark ? "#fff" : "#1A202C",
                        }}>
                          {qs.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {loading && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
                  <ActivityIndicator color={GOLD} size="small" />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: isDark ? "rgba(255,255,255,0.78)" : "rgba(10,28,58,0.75)" }}>
                      {MC_LOADING_STAGES[loadingStage]}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      {MC_LOADING_STAGES.map((_, stageIndex) => (
                        <View key={stageIndex} style={{ width: stageIndex === loadingStage ? 22 : 8, height: 4, borderRadius: 3, backgroundColor: stageIndex <= loadingStage ? GOLD : (isDark ? "rgba(255,255,255,0.14)" : "rgba(10,28,58,0.12)") }} />
                      ))}
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* ─── Input ─── */}
            <View
              style={[
                styles.inputRow,
                {
                  borderTopColor: C.separator,
                  backgroundColor: isDark ? "#0F1B33" : "#FFFFFF",
                },
              ]}
            >
              <TextInput
                ref={inputRef}
                style={[
                  styles.input,
                  {
                    color: isDark ? "#fff" : "#1A202C",
                    backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(10,28,58,0.04)",
                  },
                ]}
                placeholder={
                  searchMode === "ia"
                    ? "Décris en une phrase ce que tu cherches…"
                    : "Ex : abonnés Instagram, vues TikTok…"
                }
                placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,28,58,0.35)"}
                value={input}
                onChangeText={setInput}
                multiline
                numberOfLines={3}
                maxLength={600}
                onSubmitEditing={() => {
                  if (searchMode === "ia") handleSend();
                  else handleTextSearch();
                }}
                blurOnSubmit={false}
              />
              <Pressable
                onPress={() => {
                  if (searchMode === "ia") handleSend();
                  else handleTextSearch();
                }}
                disabled={!input.trim() || loading}
                style={{
                  width: 46, height: 46, borderRadius: 23,
                  backgroundColor:
                    input.trim() && !loading
                      ? (isDark ? GOLD : NAVY)
                      : (isDark ? "rgba(255,255,255,0.06)" : "rgba(10,28,58,0.08)"),
                  alignItems: "center", justifyContent: "center",
                }}
              >
                <Feather
                  name={searchMode === "ia" ? "send" : "search"}
                  size={18}
                  color={
                    input.trim() && !loading
                      ? (isDark ? NAVY : GOLD)
                      : (isDark ? "rgba(255,255,255,0.3)" : "rgba(10,28,58,0.3)")
                  }
                />
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Styles
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(4,10,22,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: "92%",
    maxHeight: "94%",
    paddingTop: 10,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: -14 },
    elevation: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 4,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5,
    borderColor: GOLD + "50",
  },
  title: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 18,
    letterSpacing: -0.3,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 18 : 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 110,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlignVertical: "top",
  },
});