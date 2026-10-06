import Colors from "@/constants/colors";

export interface ServiceOption {
  quantity: number;
  price: number;
  label: string;
  popular?: boolean;
}

export interface Service {
  id: string;
  name: string;
  type: string;
  platform: string;
  platformColor: string;
  platformIcon: string;
  description: string;
  options: ServiceOption[];
  deliveryTime: string;
  quality: "standard" | "premium" | "ultra";
  gradient: [string, string];
}

export interface Platform {
  id: string;
  name: string;
  color: string;
  icon: string;
  gradient: [string, string];
}

export const PLATFORMS: Platform[] = [
  {
    id: "instagram",
    name: "Instagram",
    color: Colors.instagram,
    icon: "instagram",
    gradient: ["#833AB4", "#E1306C"],
  },
  {
    id: "tiktok",
    name: "TikTok",
    color: "#69C9D0",
    icon: "music",
    gradient: ["#010101", "#69C9D0"],
  },
  {
    id: "youtube",
    name: "YouTube",
    color: Colors.youtube,
    icon: "youtube",
    gradient: ["#CC0000", "#FF4444"],
  },
  {
    id: "facebook",
    name: "Facebook",
    color: Colors.facebook,
    icon: "facebook",
    gradient: ["#1877F2", "#3B5998"],
  },
  {
    id: "twitter",
    name: "Twitter / X",
    color: Colors.twitter,
    icon: "twitter",
    gradient: ["#1DA1F2", "#0080C9"],
  },
  {
    id: "telegram",
    name: "Telegram",
    color: Colors.telegram,
    icon: "send",
    gradient: ["#0088CC", "#006699"],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    color: Colors.whatsapp,
    icon: "message-circle",
    gradient: ["#25D366", "#128C7E"],
  },
  {
    id: "spotify",
    name: "Spotify",
    color: Colors.spotify,
    icon: "headphones",
    gradient: ["#1DB954", "#158A3E"],
  },
];

export const SERVICES: Service[] = [
  {
    id: "ig-followers",
    name: "Abonnés Instagram",
    type: "Abonnés",
    platform: "instagram",
    platformColor: Colors.instagram,
    platformIcon: "instagram",
    description: "Abonnés réels de qualité pour votre compte Instagram",
    deliveryTime: "1-3 heures",
    quality: "standard",
    gradient: ["#833AB4", "#E1306C"],
    options: [
      { quantity: 100, price: 1500, label: "100 abonnés" },
      { quantity: 500, price: 5000, label: "500 abonnés", popular: true },
      { quantity: 1000, price: 9000, label: "1 000 abonnés" },
      { quantity: 5000, price: 35000, label: "5 000 abonnés" },
      { quantity: 10000, price: 60000, label: "10 000 abonnés" },
    ],
  },
  {
    id: "ig-likes",
    name: "Likes Instagram",
    type: "Likes",
    platform: "instagram",
    platformColor: Colors.instagram,
    platformIcon: "instagram",
    description: "Likes réels pour vos photos et reels Instagram",
    deliveryTime: "30 min - 1 heure",
    quality: "premium",
    gradient: ["#E1306C", "#F58529"],
    options: [
      { quantity: 100, price: 800, label: "100 likes" },
      { quantity: 500, price: 3000, label: "500 likes", popular: true },
      { quantity: 1000, price: 5500, label: "1 000 likes" },
      { quantity: 5000, price: 20000, label: "5 000 likes" },
    ],
  },
  {
    id: "ig-views",
    name: "Vues Reels Instagram",
    type: "Vues",
    platform: "instagram",
    platformColor: Colors.instagram,
    platformIcon: "instagram",
    description: "Vues pour vos Reels et Stories Instagram",
    deliveryTime: "15-30 minutes",
    quality: "standard",
    gradient: ["#F58529", "#DD2A7B"],
    options: [
      { quantity: 500, price: 600, label: "500 vues" },
      { quantity: 1000, price: 1000, label: "1 000 vues", popular: true },
      { quantity: 5000, price: 4000, label: "5 000 vues" },
      { quantity: 10000, price: 7000, label: "10 000 vues" },
    ],
  },
  {
    id: "tt-followers",
    name: "Abonnés TikTok",
    type: "Abonnés",
    platform: "tiktok",
    platformColor: "#69C9D0",
    platformIcon: "music",
    description: "Abonnés de qualité pour booster votre compte TikTok",
    deliveryTime: "1-3 heures",
    quality: "premium",
    gradient: ["#010101", "#69C9D0"],
    options: [
      { quantity: 100, price: 1200, label: "100 abonnés" },
      { quantity: 500, price: 4500, label: "500 abonnés", popular: true },
      { quantity: 1000, price: 8000, label: "1 000 abonnés" },
      { quantity: 5000, price: 32000, label: "5 000 abonnés" },
    ],
  },
  {
    id: "tt-likes",
    name: "Likes TikTok",
    type: "Likes",
    platform: "tiktok",
    platformColor: "#69C9D0",
    platformIcon: "music",
    description: "Likes pour vos vidéos TikTok",
    deliveryTime: "30 minutes",
    quality: "standard",
    gradient: ["#69C9D0", "#010101"],
    options: [
      { quantity: 100, price: 700, label: "100 likes" },
      { quantity: 500, price: 2800, label: "500 likes", popular: true },
      { quantity: 1000, price: 5000, label: "1 000 likes" },
      { quantity: 5000, price: 18000, label: "5 000 likes" },
    ],
  },
  {
    id: "tt-views",
    name: "Vues TikTok",
    type: "Vues",
    platform: "tiktok",
    platformColor: "#69C9D0",
    platformIcon: "music",
    description: "Vues massives pour vos vidéos TikTok",
    deliveryTime: "15 minutes",
    quality: "standard",
    gradient: ["#010101", "#EE1D52"],
    options: [
      { quantity: 1000, price: 600, label: "1 000 vues" },
      { quantity: 5000, price: 2500, label: "5 000 vues", popular: true },
      { quantity: 10000, price: 4500, label: "10 000 vues" },
      { quantity: 50000, price: 18000, label: "50 000 vues" },
    ],
  },
  {
    id: "yt-subscribers",
    name: "Abonnés YouTube",
    type: "Abonnés",
    platform: "youtube",
    platformColor: Colors.youtube,
    platformIcon: "youtube",
    description: "Abonnés réels pour votre chaîne YouTube",
    deliveryTime: "2-5 heures",
    quality: "premium",
    gradient: ["#CC0000", "#FF4444"],
    options: [
      { quantity: 100, price: 2000, label: "100 abonnés" },
      { quantity: 500, price: 8000, label: "500 abonnés", popular: true },
      { quantity: 1000, price: 14000, label: "1 000 abonnés" },
      { quantity: 5000, price: 60000, label: "5 000 abonnés" },
    ],
  },
  {
    id: "yt-views",
    name: "Vues YouTube",
    type: "Vues",
    platform: "youtube",
    platformColor: Colors.youtube,
    platformIcon: "youtube",
    description: "Vues de qualité pour vos vidéos YouTube",
    deliveryTime: "24-48 heures",
    quality: "standard",
    gradient: ["#FF4444", "#CC0000"],
    options: [
      { quantity: 1000, price: 2500, label: "1 000 vues" },
      { quantity: 5000, price: 10000, label: "5 000 vues", popular: true },
      { quantity: 10000, price: 18000, label: "10 000 vues" },
      { quantity: 50000, price: 70000, label: "50 000 vues" },
    ],
  },
  {
    id: "fb-followers",
    name: "Abonnés Facebook",
    type: "Abonnés",
    platform: "facebook",
    platformColor: Colors.facebook,
    platformIcon: "facebook",
    description: "Abonnés pour votre page ou profil Facebook",
    deliveryTime: "2-4 heures",
    quality: "standard",
    gradient: ["#1877F2", "#3B5998"],
    options: [
      { quantity: 100, price: 1000, label: "100 abonnés" },
      { quantity: 500, price: 4000, label: "500 abonnés", popular: true },
      { quantity: 1000, price: 7000, label: "1 000 abonnés" },
      { quantity: 5000, price: 28000, label: "5 000 abonnés" },
    ],
  },
  {
    id: "tw-followers",
    name: "Abonnés Twitter/X",
    type: "Abonnés",
    platform: "twitter",
    platformColor: Colors.twitter,
    platformIcon: "twitter",
    description: "Abonnés pour votre compte Twitter / X",
    deliveryTime: "1-3 heures",
    quality: "standard",
    gradient: ["#1DA1F2", "#0080C9"],
    options: [
      { quantity: 100, price: 1200, label: "100 abonnés" },
      { quantity: 500, price: 4800, label: "500 abonnés", popular: true },
      { quantity: 1000, price: 8500, label: "1 000 abonnés" },
      { quantity: 5000, price: 35000, label: "5 000 abonnés" },
    ],
  },
  {
    id: "tg-members",
    name: "Membres Telegram",
    type: "Membres",
    platform: "telegram",
    platformColor: Colors.telegram,
    platformIcon: "send",
    description: "Membres actifs pour votre canal ou groupe Telegram",
    deliveryTime: "1-2 heures",
    quality: "premium",
    gradient: ["#0088CC", "#006699"],
    options: [
      { quantity: 100, price: 1500, label: "100 membres" },
      { quantity: 500, price: 6000, label: "500 membres", popular: true },
      { quantity: 1000, price: 10000, label: "1 000 membres" },
      { quantity: 5000, price: 40000, label: "5 000 membres" },
    ],
  },
  {
    id: "sp-listeners",
    name: "Auditeurs Spotify",
    type: "Auditeurs",
    platform: "spotify",
    platformColor: Colors.spotify,
    platformIcon: "headphones",
    description: "Auditeurs mensuels pour votre profil Spotify",
    deliveryTime: "24 heures",
    quality: "premium",
    gradient: ["#1DB954", "#158A3E"],
    options: [
      { quantity: 1000, price: 3000, label: "1 000 auditeurs" },
      { quantity: 5000, price: 12000, label: "5 000 auditeurs", popular: true },
      { quantity: 10000, price: 20000, label: "10 000 auditeurs" },
      { quantity: 50000, price: 80000, label: "50 000 auditeurs" },
    ],
  },
];

export function getServicesByPlatform(platformId: string) {
  return SERVICES.filter((s) => s.platform === platformId);
}

export function getServiceById(id: string) {
  return SERVICES.find((s) => s.id === id);
}

export function formatPrice(price: number) {
  return price.toLocaleString("fr-FR") + " FCFA";
}
