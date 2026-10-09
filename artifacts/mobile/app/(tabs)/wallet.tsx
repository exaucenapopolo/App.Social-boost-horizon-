import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
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
import { type Recharge, useWallet } from "@/context/WalletContext";
import { apiClient, BASE_URL } from "@/services/api";
import { getFreshToken } from "@/services/tokenStore";
import { COUNTRIES, Country, formatCurrency } from "@/lib/countries";

// ═══════════════════════════════════════════════════════════════
//  PALETTE
// ═══════════════════════════════════════════════════════════════
const NAVY        = "#0A1C3A";
const NAVY_LIGHT  = "#152E54";
const GOLD        = "#D4AF37";
const GOLD_SOFT   = "#C6A15B";

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
const PURPLE  = "#8B5CF6";

// ═══════════════════════════════════════════════════════════════
//  DATA
// ═══════════════════════════════════════════════════════════════
const AMOUNTS_FCFA = [500, 1000, 2000, 5000, 10000, 20000];

export interface PayCountry extends Country {
  operators: string[];
}

const INTL_COUNTRIES: PayCountry[] = [
  { code: "cm", name: "Cameroun",             flag: "🇨🇲", phoneCode: "+237", currency: "XAF", currencySymbol: "FCFA", xafRate: 1,      operators: ["MTN Mobile Money", "Orange Money"] },
  { code: "ga", name: "Gabon",                flag: "🇬🇦", phoneCode: "+241", currency: "XAF", currencySymbol: "FCFA", xafRate: 1,      operators: ["MTN Mobile Money", "Airtel Money"] },
  { code: "cg", name: "Congo Brazzaville",    flag: "🇨🇬", phoneCode: "+242", currency: "XAF", currencySymbol: "FCFA", xafRate: 1,      operators: ["MTN Mobile Money", "Airtel Money"] },
  { code: "td", name: "Tchad",                flag: "🇹🇩", phoneCode: "+235", currency: "XAF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Airtel Money"] },
  { code: "cf", name: "Centrafrique",         flag: "🇨🇫", phoneCode: "+236", currency: "XAF", currencySymbol: "FCFA", xafRate: 1,      operators: ["MTN Mobile Money"] },
  { code: "gq", name: "Guinée Équatoriale",   flag: "🇬🇶", phoneCode: "+240", currency: "XAF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Airtel Money"] },
  { code: "sn", name: "Sénégal",              flag: "🇸🇳", phoneCode: "+221", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Orange Money", "Wave"] },
  { code: "ci", name: "Côte d'Ivoire",        flag: "🇨🇮", phoneCode: "+225", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Orange Money", "MTN Mobile Money", "Wave"] },
  { code: "ml", name: "Mali",                 flag: "🇲🇱", phoneCode: "+223", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Orange Money", "Moov Money"] },
  { code: "bf", name: "Burkina Faso",         flag: "🇧🇫", phoneCode: "+226", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Orange Money", "Moov Money"] },
  { code: "bj", name: "Bénin",                flag: "🇧🇯", phoneCode: "+229", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["MTN Mobile Money", "Moov Money"] },
  { code: "tg", name: "Togo",                 flag: "🇹🇬", phoneCode: "+228", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Flooz", "T-Money"] },
  { code: "ne", name: "Niger",                flag: "🇳🇪", phoneCode: "+227", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Airtel Money", "Zamani"] },
  { code: "gw", name: "Guinée-Bissau",        flag: "🇬🇼", phoneCode: "+245", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["MTN Mobile Money"] },
  { code: "gn", name: "Guinée Conakry",       flag: "🇬🇳", phoneCode: "+224", currency: "GNF", currencySymbol: "FG",   xafRate: 14.5,   operators: ["Orange Money", "MTN Mobile Money"] },
  { code: "cd", name: "RD Congo",             flag: "🇨🇩", phoneCode: "+243", currency: "CDF", currencySymbol: "FC",   xafRate: 4.70,   operators: ["M-Pesa", "Airtel Money", "Orange Money"] },
  { code: "rw", name: "Rwanda",               flag: "🇷🇼", phoneCode: "+250", currency: "RWF", currencySymbol: "FRw",  xafRate: 1.98,   operators: ["MTN Mobile Money", "Airtel Money"] },
  { code: "ug", name: "Ouganda",              flag: "🇺🇬", phoneCode: "+256", currency: "UGX", currencySymbol: "USh",  xafRate: 5.64,   operators: ["MTN Mobile Money", "Airtel Money"] },
  { code: "tz", name: "Tanzanie",             flag: "🇹🇿", phoneCode: "+255", currency: "TZS", currencySymbol: "TSh",  xafRate: 3.81,   operators: ["M-Pesa", "Airtel Money"] },
  { code: "ke", name: "Kenya",                flag: "🇰🇪", phoneCode: "+254", currency: "KES", currencySymbol: "KSh",  xafRate: 0.20,   operators: ["M-Pesa"] },
  { code: "et", name: "Éthiopie",             flag: "🇪🇹", phoneCode: "+251", currency: "ETB", currencySymbol: "Br",   xafRate: 0.19,   operators: ["Telebirr"] },
  { code: "zm", name: "Zambie",               flag: "🇿🇲", phoneCode: "+260", currency: "ZMW", currencySymbol: "ZK",   xafRate: 0.041,  operators: ["MTN Mobile Money", "Airtel Money"] },
  { code: "mw", name: "Malawi",               flag: "🇲🇼", phoneCode: "+265", currency: "MWK", currencySymbol: "MK",   xafRate: 2.67,   operators: ["TNM Mpamba", "Airtel Money"] },
  { code: "gh", name: "Ghana",                flag: "🇬🇭", phoneCode: "+233", currency: "GHS", currencySymbol: "GH₵",  xafRate: 0.024,  operators: ["MTN Mobile Money", "AirtelTigo Money"] },
  { code: "ng", name: "Nigéria",              flag: "🇳🇬", phoneCode: "+234", currency: "NGN", currencySymbol: "₦",    xafRate: 2.44,   operators: ["MTN Mobile Money", "Airtel Money", "OPay"] },
  { code: "sl", name: "Sierra Leone",         flag: "🇸🇱", phoneCode: "+232", currency: "SLE", currencySymbol: "Le",   xafRate: 0.034,  operators: ["Orange Money"] },
  { code: "mr", name: "Mauritanie",           flag: "🇲🇷", phoneCode: "+222", currency: "MRU", currencySymbol: "UM",   xafRate: 0.056,  operators: ["Masrvi", "Bankily"] },
  { code: "gm", name: "Gambie",               flag: "🇬🇲", phoneCode: "+220", currency: "GMD", currencySymbol: "D",    xafRate: 0.097,  operators: ["QMoney", "Afrimoney"] },
  { code: "mg", name: "Madagascar",           flag: "🇲🇬", phoneCode: "+261", currency: "MGA", currencySymbol: "Ar",   xafRate: 68,     operators: ["MVola", "Orange Money", "Airtel Money"] },
  { code: "mz", name: "Mozambique",           flag: "🇲🇿", phoneCode: "+258", currency: "MZN", currencySymbol: "MT",   xafRate: 0.099,  operators: ["M-Pesa", "Airtel Money"] },
  { code: "ca", name: "Canada",               flag: "🇨🇦", phoneCode: "+1",   currency: "CAD", currencySymbol: "C$",   xafRate: 0.0021, operators: ["Interac"] },
  { code: "fr", name: "France",               flag: "🇫🇷", phoneCode: "+33",  currency: "EUR", currencySymbol: "€",    xafRate: 0.00152,operators: ["Virement SEPA", "Lydia"] },
];

function getEquivalentLocal(amountXAF: number, country: PayCountry): number {
  if (country.xafRate === 1) return amountXAF;
  return Math.round(amountXAF * country.xafRate);
}
function getEquivalentXAF(localAmount: number, country: PayCountry): number {
  if (country.xafRate === 1) return localAmount;
  return Math.round(localAmount / country.xafRate);
}

const STATUS_CONFIG = {
  pending:   { label: "En attente", color: WARNING, bg: "rgba(245,158,11,0.12)" },
  confirmed: { label: "Confirmé",   color: SUCCESS, bg: "rgba(16,185,129,0.12)" },
  rejected:  { label: "Rejeté",     color: DANGER,  bg: "rgba(239,68,68,0.12)" },
};

const ACTIVITY_TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string; prefix: string }> = {
  depot:         { icon: "arrow-down-circle", color: "#11998e", bg: "rgba(17,153,142,0.12)", prefix: "+" },
  commande:      { icon: "shopping-cart",    color: INFO,      bg: "rgba(59,130,246,0.12)", prefix: "-" },
  remboursement: { icon: "refresh-ccw",      color: SUCCESS,   bg: "rgba(16,185,129,0.12)", prefix: "+" },
  annulation:    { icon: "x-circle",         color: "#FF5722", bg: "rgba(255,87,34,0.12)",  prefix: "" },
  transfert:     { icon: "arrow-right-circle",color: GOLD,     bg: "rgba(212,175,55,0.12)", prefix: "" },
  retrait:       { icon: "download",         color: PURPLE,    bg: "rgba(139,92,246,0.12)", prefix: "-" },
  parrainage:    { icon: "gift",             color: GOLD,      bg: "rgba(212,175,55,0.12)", prefix: "+" },
};

const ACTIVITY_STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  confirmed:    { label: "Effectué",    color: SUCCESS, bg: "rgba(16,185,129,0.15)" },
  completed:    { label: "Effectué",    color: SUCCESS, bg: "rgba(16,185,129,0.15)" },
  success:      { label: "Effectué",    color: SUCCESS, bg: "rgba(16,185,129,0.15)" },
  pending:      { label: "En attente",  color: WARNING, bg: "rgba(245,158,11,0.15)" },
  "En attente": { label: "En attente",  color: WARNING, bg: "rgba(245,158,11,0.15)" },
  rejected:     { label: "Rejeté",      color: DANGER,  bg: "rgba(239,68,68,0.15)" },
  failed:       { label: "Échoué",      color: DANGER,  bg: "rgba(239,68,68,0.15)" },
  annulée:      { label: "Annulé",      color: DANGER,  bg: "rgba(239,68,68,0.15)" },
};

function getActivityStatusCfg(status: string) {
  return ACTIVITY_STATUS_LABEL[status] ?? { label: status ?? "—", color: LIGHT_TEXT_2, bg: "rgba(158,158,158,0.1)" };
}

// ═══════════════════════════════════════════════════════════════
//  ANIMATIONS
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
//  SUB COMPONENTS
// ═══════════════════════════════════════════════════════════════

function RechargeItem({ item, C, userCountry }: { item: Recharge; C: any; userCountry?: Country | null }) {
  const cfg = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
  const date = new Date(item.createdAt);
  return (
    <View style={[styles.histItem, { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={[styles.histIcon, { backgroundColor: "#11998e" + "18" }]}>
        <Feather name="arrow-down-circle" size={20} color="#11998e" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.histTitle, { color: C.text }]} numberOfLines={1}>
          {item.method ?? "Dépôt"}
        </Text>
        <Text style={[styles.histMeta, { color: C.textMuted }]}>
          {date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
          {item.phone ? ` • ${item.phone}` : ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={[styles.histAmount, { color: SUCCESS }]}>
          +{userCountry && userCountry.xafRate !== 1
            ? formatCurrency(item.amount ?? 0, userCountry)
            : `${(item.amount ?? 0).toLocaleString("fr-FR")} FCFA`}
        </Text>
        <View style={[styles.histBadge, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.histBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>
    </View>
  );
}

function ActivityItem({ item, C, userCountry }: { item: any; C: any; userCountry?: Country | null }) {
  const cfg = ACTIVITY_TYPE_CONFIG[item.type] ?? { icon: "activity", color: C.accentIcon, bg: C.iconBg, prefix: "" };
  const scfg = getActivityStatusCfg(item.status ?? "");
  const date = new Date(item.createdAt ?? Date.now());
  const amount = Number(item.amount ?? 0);

  return (
    <View style={[styles.histItem, { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={[styles.histIcon, { backgroundColor: cfg.bg }]}>
        <Feather name={cfg.icon} size={18} color={cfg.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.histTitle, { color: C.text }]} numberOfLines={1}>
          {item.label ?? item.type ?? "Transaction"}
        </Text>
        <Text style={[styles.histMeta, { color: C.textMuted }]}>
          {date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
          {" · "}
          {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        {amount > 0 && (
          <Text style={[styles.histAmount, { color: cfg.color }]}>
            {cfg.prefix}{userCountry && userCountry.xafRate !== 1
            ? formatCurrency(amount, userCountry)
            : `${amount.toLocaleString("fr-FR")} FCFA`}
          </Text>
        )}
        <View style={[styles.histBadge, { backgroundColor: scfg.bg }]}>
          <Text style={[styles.histBadgeText, { color: scfg.color }]}>{scfg.label}</Text>
        </View>
      </View>
    </View>
  );
}

function BalanceCard({
  icon, label, value, currency, color, C, isDark, action, onAction,
}: any) {
  const { scale, onPressIn, onPressOut } = usePressSpring(0.97);
  return (
    <Animated.View style={[styles.balanceCard, { backgroundColor: C.surface, borderColor: color + "40", transform: [{ scale }] }]}>
      <Pressable onPressIn={onPressIn} onPressOut={onPressOut} style={{ gap: 6 }}>
        <View style={[styles.balanceIconBox, { backgroundColor: color + "18", borderColor: color + "30" }]}>
          <Feather name={icon} size={16} color={color} />
        </View>
        <Text style={[styles.balanceLabel, { color: C.textMuted }]}>{label}</Text>
        <Text style={[styles.balanceValue, { color: C.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        <Text style={[styles.balanceCurrency, { color }]}>{currency}</Text>
        {action && (
          <Pressable
            onPress={onAction}
            style={({ pressed }) => [
              styles.balanceAction,
              { backgroundColor: color + "15", borderColor: color + "30" },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Feather name="arrow-up-right" size={10} color={color} />
            <Text style={[styles.balanceActionText, { color }]}>{action}</Text>
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
}

function ModeSegmented({ payMode, setPayMode, C, isDark }: any) {
  const tabs = [
    { key: "cameroun",      icon: "smartphone" as const, label: "Cameroun",     sub: "MTN · Orange", color: "#11998e" },
    { key: "international", icon: "globe" as const,      label: "International", sub: "Mobile Money · Carte",  color: INFO },
    { key: "historique",    icon: "list" as const,       label: "Historique",    sub: "Transactions",  color: PURPLE },
  ];
  return (
    <View style={[styles.segment, { backgroundColor: C.surface, borderColor: C.border }]}>
      {tabs.map((t, i) => {
        const active = payMode === t.key;
        return (
          <React.Fragment key={t.key}>
            {i > 0 && <View style={[styles.segmentDivider, { backgroundColor: C.border }]} />}
            <Pressable
              style={({ pressed }) => [
                styles.segmentBtn,
                active && { backgroundColor: t.color + "14" },
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => {
                setPayMode(t.key);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <View style={[styles.segmentIconBox, { backgroundColor: active ? t.color + "20" : C.iconBg }]}>
                <Feather name={t.icon} size={14} color={active ? t.color : C.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.segmentLabel, { color: active ? t.color : C.text }]} numberOfLines={1}>
                  {t.label}
                </Text>
                <Text style={[styles.segmentSub, { color: C.textMuted }]} numberOfLines={1}>
                  {t.sub}
                </Text>
              </View>
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════
type PayMode = "cameroun" | "international" | "historique";
type IntlMethod = "mobilemoney" | "card";

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const { recharges, isLoading } = useWallet();
  const { isDark: ctxIsDark, toggleTheme } = useTheme();
  const isDark = ctxIsDark === true;

  const C = useMemo(() => ({
    bg:          isDark ? DARK_BG         : LIGHT_BG,
    surface:     isDark ? DARK_SURFACE    : LIGHT_SURFACE,
    border:      isDark ? DARK_BORDER     : LIGHT_BORDER,
    separator:   isDark ? DARK_BORDER     : LIGHT_BORDER,
    text:        isDark ? DARK_TEXT       : LIGHT_TEXT,
    textMuted:   isDark ? DARK_TEXT_2     : LIGHT_TEXT_2,
    inputBg:     isDark ? DARK_INPUT_BG   : LIGHT_INPUT_BG,
    inputBorder: isDark ? DARK_BORDER     : LIGHT_BORDER,
    iconBg:      isDark ? DARK_ICON_BG    : LIGHT_ICON_BG,
    iconBorder:  isDark ? DARK_ICON_BORD  : LIGHT_ICON_BORD,
    accentIcon:  isDark ? GOLD            : NAVY,
  }), [isDark]);

  const topPad = Platform.OS === "web" ? insets.top + 64 : insets.top;

  const userCountry = user?.country
    ? COUNTRIES.find((c) => c.code === user.country?.toLowerCase()) ?? null
    : null;

  const [payMode, setPayMode] = useState<PayMode>("cameroun");
  const [submitting, setSubmitting] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [pendingTransId, setPendingTransId] = useState<string | null>(null);
  const [pendingAmount, setPendingAmount] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const [pollingAttempt, setPollingAttempt] = useState(0);

  const [fapshiAmount, setFapshiAmount] = useState("");
  const [fapshiDesc, setFapshiDesc] = useState("Rechargement SBH");

  // ── International : Mobile Money (par défaut) ou Carte ──
  const [intlMethod, setIntlMethod] = useState<IntlMethod>("mobilemoney");
  const [intlCountry, setIntlCountry] = useState<PayCountry>(INTL_COUNTRIES[0]);
  const [intlPhone, setIntlPhone] = useState("");
  const [intlAmount, setIntlAmount] = useState("");
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  // ── Carte bancaire (NelsiusPay) ──
  const [cardAmount, setCardAmount] = useState("");
  const [nelsiusRef, setNelsiusRef] = useState<string | null>(null);
  const [nelsiusPolling, setNelsiusPolling] = useState(false);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTarget, setTransferTarget] = useState<"main" | "withdrawal" | null>(null);
  const [transferring, setTransferring] = useState(false);

  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [wdCountry, setWdCountry] = useState<PayCountry>(INTL_COUNTRIES[0]);
  const [wdPhone, setWdPhone] = useState("");
  const [wdAmount, setWdAmount] = useState("");
  const [wdMethod, setWdMethod] = useState("MTN Mobile Money");
  const [wdSubmitting, setWdSubmitting] = useState(false);
  const [showWdCountryModal, setShowWdCountryModal] = useState(false);
  const [wdCountrySearch, setWdCountrySearch] = useState("");

  const withdrawal = user?.withdrawalBalance ?? 0;
  const balance = user?.balance ?? 0;
  const referral = user?.referralBalance ?? 0;

  const entry0 = useEntry(60);
  const entry1 = useEntry(140);
  const entry2 = useEntry(220);

  // ═══ Handlers transfert / retrait (inchangés) ═══
  const handleTransfer = async () => {
    const ref = user?.referralBalance ?? 0;
    if (ref <= 0) { Alert.alert("Solde insuffisant", "Vous n'avez aucun solde parrainage à transférer."); return; }
    if (!transferTarget) { Alert.alert("Destination requise", "Choisissez vers quel solde transférer."); return; }
    setTransferring(true);
    try {
      const res = await apiClient.wallet.transfer(transferTarget);
      if (res.success) {
        await refreshUser();
        setShowTransferModal(false);
        setTransferTarget(null);
        Alert.alert("Transfert réussi !", `${ref.toLocaleString()} FCFA transférés vers votre solde ${transferTarget === "main" ? "principal" : "de retrait"}.`);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("Erreur", res.error ?? "Le transfert a échoué.");
      }
    } catch (e: any) {
      Alert.alert("Erreur connexion", e?.message ?? "Vérifiez votre connexion.");
    } finally { setTransferring(false); }
  };

  const WITHDRAWAL_FEE = 455;
  const WITHDRAWAL_FEE_THRESHOLD = 10000;

  const doWithdraw = async (feeSource?: "main" | "withdrawal") => {
    const amt = parseInt(wdAmount, 10);
    setWdSubmitting(true);
    try {
      const res = await apiClient.wallet.withdraw({
        amount: amt,
        phone: `${wdCountry.phoneCode}${wdPhone.replace(/\D/g, "")}`,
        country: wdCountry.code.toUpperCase(),
        countryName: wdCountry.name,
        method: wdMethod,
        feeSource,
      });
      if (res.success) {
        await refreshUser();
        setShowWithdrawModal(false);
        setWdAmount(""); setWdPhone("");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Retrait soumis", `Votre demande de retrait de ${amt.toLocaleString()} FCFA a été enregistrée.\n\nNotre équipe va traiter votre demande sous 24h ouvrables.`);
      } else {
        Alert.alert("Erreur", res.error ?? "Le retrait a échoué.");
      }
    } catch (e: any) {
      Alert.alert("Erreur connexion", e?.message ?? "Vérifiez votre connexion.");
    } finally { setWdSubmitting(false); }
  };

  const handleWithdraw = () => {
    const MIN = 1500;
    const amt = parseInt(wdAmount, 10);
    if (!amt || amt < MIN) { Alert.alert("Montant invalide", `Le retrait minimum est ${MIN.toLocaleString()} FCFA.`); return; }
    if (amt > withdrawal) { Alert.alert("Solde insuffisant", `Votre solde retrait est de ${withdrawal.toLocaleString()} FCFA.`); return; }
    if (!wdPhone.trim()) { Alert.alert("Numéro requis", "Entrez votre numéro de téléphone Mobile Money."); return; }

    const fee = amt < WITHDRAWAL_FEE_THRESHOLD ? WITHDRAWAL_FEE : 0;
    if (fee === 0) { doWithdraw(undefined); return; }

    const mainBal = user?.balance ?? 0;
    const canPayFromMain = mainBal >= fee;
    const canPayFromWithdrawal = withdrawal >= amt + fee;

    if (!canPayFromMain && !canPayFromWithdrawal) {
      Alert.alert("Frais de retrait requis", `Des frais de ${fee} FCFA s'appliquent car votre retrait est inférieur à ${WITHDRAWAL_FEE_THRESHOLD.toLocaleString()} FCFA.\n\nVous n'avez pas suffisamment de fonds pour payer ces frais.\n\n• Solde principal : ${mainBal.toLocaleString()} FCFA\n• Solde retrait après retrait : ${(withdrawal - amt).toLocaleString()} FCFA\n\nVeuillez recharger votre solde ou augmenter le montant du retrait.`);
      return;
    }

    const buttons: any[] = [];
    if (canPayFromMain) buttons.push({ text: `Solde principal (${mainBal.toLocaleString()} FCFA)`, onPress: () => doWithdraw("main") });
    if (canPayFromWithdrawal) buttons.push({ text: `Solde retrait (${(withdrawal - amt).toLocaleString()} FCFA restant)`, onPress: () => doWithdraw("withdrawal") });
    buttons.push({ text: "Annuler", style: "cancel" });

    Alert.alert(
      `Frais de retrait : ${fee} FCFA`,
      `Des frais de ${fee} FCFA s'appliquent aux retraits inférieurs à ${WITHDRAWAL_FEE_THRESHOLD.toLocaleString()} FCFA.\n\nDepuis quel solde souhaitez-vous payer ces frais ?`,
      buttons
    );
  };

  const filteredWdCountries = INTL_COUNTRIES.filter(
    (c) => !wdCountrySearch || c.name.toLowerCase().includes(wdCountrySearch.toLowerCase())
  );
  const filteredCountries = INTL_COUNTRIES.filter(
    (c) => !countrySearch || c.name.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const amountPresets = AMOUNTS_FCFA.map((a) => ({
    xaf: a,
    local: getEquivalentLocal(a, intlCountry),
  }));

  const PAYMENT_TYPES = new Set(["depot", "parrainage", "transfert", "retrait"]);

  const mergeRecharges = (acts: any[], contextRecharges: any[]): any[] => {
    const seenIds = new Set(acts.map((a: any) => a.id).filter(Boolean));
    const seenTransIds = new Set(acts.map((a: any) => a.transId).filter(Boolean));
    const extra = (contextRecharges as any[])
      .map((r) => ({
        id: r.id,
        type: "depot",
        label: r.method ?? "Dépôt Mobile Money",
        amount: r.amount ?? 0,
        status: r.status ?? "pending",
        transId: r.transactionId ?? r.transId ?? "",
        phone: r.phone ?? "",
        createdAt: r.createdAt,
      }))
      .filter((r) => {
        if (seenIds.has(r.id)) return false;
        if (r.transId && seenTransIds.has(r.transId)) return false;
        return true;
      });
    return [...acts, ...extra].sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  };

  const loadActivities = useCallback(async () => {
    setLoadingActivities(true);
    try {
      const res = await apiClient.wallet.activities();
      const fromApi: any[] = res.success && Array.isArray(res.data)
        ? (res.data as any[]).filter((a) => PAYMENT_TYPES.has(a.type))
        : [];
      setActivities(mergeRecharges(fromApi, recharges as any[]));
    } catch {
      const fallback = (recharges as any[]).map((r) => ({
        id: r.id,
        type: "depot",
        label: r.method ?? "Dépôt Mobile Money",
        amount: r.amount ?? 0,
        status: r.status ?? "pending",
        createdAt: r.createdAt,
      }));
      setActivities(fallback.sort(
        (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
    } finally { setLoadingActivities(false); }
  }, [recharges]);

  useEffect(() => {
    if (payMode === "historique") loadActivities();
  }, [payMode, loadActivities]);

  // ═══ Fapshi (Cameroun) — inchangé ═══
  const confirmFapshiPayment = async (transId: string, amount: number) => {
    const MAX_ATTEMPTS = 3;
    const DELAY_MS = 5000;
    setIsPolling(true);
    setPollingAttempt(0);
    let credited = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      setPollingAttempt(attempt);
      try {
        const res = await apiClient.wallet.fapshiConfirm(transId, amount);
        if (res.success && (res.data?.credited || (res as any).alreadyCredited)) {
          credited = true;
          await refreshUser();
          loadActivities();
          setIsPolling(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert("Paiement confirmé !", `${(res.data?.credited ?? amount).toLocaleString()} FCFA ont été crédités sur votre solde.`);
          return;
        }
      } catch {}
      if (attempt < MAX_ATTEMPTS) {
        await new Promise<void>((resolve) => setTimeout(resolve, DELAY_MS));
      }
    }
    setIsPolling(false);
    if (!credited) {
      await refreshUser();
      loadActivities();
      Alert.alert(
        "Paiement en cours de traitement",
        "Votre paiement est en cours de validation par l'opérateur Mobile Money.\n\nNotre serveur vérifie automatiquement toutes les 2 minutes et créditera votre solde dès confirmation — même si vous fermez l'application.\n\nVous recevrez une notification push dès que c'est fait.",
        [{ text: "OK" }]
      );
    }
  };

  const handleFapshiPay = async () => {
    const amount = parseInt(fapshiAmount, 10);
    if (!amount || amount < 100) { Alert.alert("Montant invalide", "Le montant minimum est 100 FCFA."); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}api/create-fapshi-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          description: fapshiDesc || "Rechargement Social Boost Horizon",
          externalId: user?.id,
        }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        setPendingTransId(data.transId ?? null);
        setPendingAmount(amount);
        try {
          const token = await getFreshToken();
          await fetch(`${BASE_URL}api/wallet/record-pending-recharge`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ transId: data.transId, amount, method: "Fapshi Mobile Money" }),
          });
          loadActivities();
        } catch {}
        setSubmitting(false);
        await WebBrowser.openBrowserAsync(data.checkoutUrl);
        if (data.transId) await confirmFapshiPayment(data.transId, amount);
      } else {
        Alert.alert("Erreur paiement", data.error ?? data.message ?? "Impossible d'initier le paiement.");
      }
    } catch (e: any) {
      Alert.alert("Erreur connexion", e?.message ?? "Vérifiez votre connexion.");
    } finally {
      setSubmitting(false);
      setPendingTransId(null);
    }
  };

  // ═══ Mobile Money International (AccountPe — via apiClient) ═══
  const handleIntlPay = async () => {
    const amountLocal = parseInt(intlAmount, 10);
    const minLocal = getEquivalentLocal(500, intlCountry);
    if (!amountLocal || amountLocal < minLocal) {
      Alert.alert("Montant invalide", `Le minimum est ${minLocal.toLocaleString()} ${intlCountry.currencySymbol}.`);
      return;
    }
    if (!intlPhone.trim()) { Alert.alert("Numéro requis", "Entrez votre numéro Mobile Money."); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      const amountXAF = getEquivalentXAF(amountLocal, intlCountry);
      const res = await apiClient.wallet.createIntlPayment({
        amount: amountLocal,
        amountXAF,
        currency: intlCountry.currency,
        country: intlCountry.code.toUpperCase(),
        phone: intlPhone.trim(),
        username: user?.name ?? undefined,
        email: user?.email ?? undefined,
      });
      if (res && (res as any).success && (res as any).checkoutUrl) {
        const checkoutUrl = (res as any).checkoutUrl as string;
        const ref = (res as any).transId as string | undefined;
        await WebBrowser.openBrowserAsync(checkoutUrl);
        await refreshUser();
        loadActivities();
        Alert.alert(
          "Paiement initié",
          "Votre solde sera crédité automatiquement après confirmation de l'opérateur.\n\n" +
          (ref ? `Référence : ${ref}\n\n` : "") +
          "Si votre solde n'est pas mis à jour dans 5 minutes, ouvrez l'historique pour vérifier.",
          [{ text: "OK" }]
        );
      } else {
        Alert.alert("Erreur paiement", (res as any)?.error ?? "Impossible d'initier le paiement.");
      }
    } catch (e: any) {
      Alert.alert("Erreur connexion", e?.message ?? "Vérifiez votre connexion.");
    } finally { setSubmitting(false); }
  };

  // ═══ Carte bancaire NelsiusPay ═══
  const handleNelsiusPay = async () => {
    const amount = parseInt(cardAmount, 10);
    if (!amount || amount < 1) {
      Alert.alert("Montant invalide", "Entrez un montant valide.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      const res = await apiClient.wallet.nelsiuspayCheckout({
        amount,
        currency: intlCountry.currency,
      });
      if (res && (res as any).success && (res as any).checkoutUrl) {
        const reference = (res as any).reference as string;
        setNelsiusRef(reference);
        const checkoutUrl = (res as any).checkoutUrl as string;

        await WebBrowser.openBrowserAsync(checkoutUrl);

        setNelsiusPolling(true);
        let credited = false;
        for (let i = 0; i < 6; i++) {
          await new Promise<void>((resolve) => setTimeout(resolve, i === 0 ? 1000 : 4000));
          try {
            const statusRes = await apiClient.wallet.nelsiuspayStatus(reference);
            if (statusRes && (statusRes as any).success) {
              const st = (statusRes as any).status;
              if (st === "CONFIRMED") {
                credited = true;
                await refreshUser();
                loadActivities();
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                const creditedXAF = (statusRes as any).creditedAmountXAF;
                Alert.alert(
                  "Paiement confirmé !",
                  creditedXAF
                    ? `${creditedXAF.toLocaleString("fr-FR")} FCFA ont été crédités.`
                    : "Votre paiement a été confirmé."
                );
                break;
              }
              if (st === "FAILED") {
                Alert.alert("Paiement non confirmé", "Le paiement a échoué. Aucun montant n'a été débité.");
                break;
              }
            }
          } catch {
            // on continue le polling
          }
        }
        setNelsiusPolling(false);
        if (!credited) {
          await refreshUser();
          loadActivities();
          Alert.alert(
            "Paiement en cours",
            `Votre paiement est en cours de traitement.\nRéférence : ${reference}\n\n` +
            "Il sera crédité automatiquement dès confirmation. Vous pouvez vérifier plus tard.",
            [{ text: "OK" }]
          );
        }
      } else {
        Alert.alert("Erreur paiement", (res as any)?.error ?? "Impossible d'initier le paiement par carte.");
      }
    } catch (e: any) {
      Alert.alert("Erreur connexion", e?.message ?? "Vérifiez votre connexion.");
    } finally { setSubmitting(false); }
  };

  const goBack = () => {
    Haptics.selectionAsync();
    if (router.canGoBack?.()) router.back();
    else router.push("/(tabs)" as any);
  };

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <StarBackground dark={isDark} />

      {/* Polling overlay (Fapshi) */}
      <Modal visible={isPolling} transparent animationType="fade">
        <View style={styles.pollingOverlay}>
          <View style={[styles.pollingCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: "#11998e18", alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator size="large" color="#11998e" />
            </View>
            <Text style={[styles.pollingTitle, { color: C.text }]}>Vérification du paiement</Text>
            <Text style={[styles.pollingDesc, { color: C.textMuted }]}>
              En attente de confirmation par l'opérateur...
            </Text>
            <View style={[styles.pollingProgress, { backgroundColor: C.inputBg }]}>
              <View style={[styles.pollingBar, { width: `${Math.min((pollingAttempt / 8) * 100, 100)}%`, backgroundColor: "#11998e" }]} />
            </View>
            <Text style={[styles.pollingAttemptText, { color: C.textMuted }]}>
              Tentative {pollingAttempt}/8
            </Text>
          </View>
        </View>
      </Modal>

      {/* Polling overlay (NelsiusPay) */}
      <Modal visible={nelsiusPolling} transparent animationType="fade">
        <View style={styles.pollingOverlay}>
          <View style={[styles.pollingCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: GOLD + "22", alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator size="large" color={GOLD} />
            </View>
            <Text style={[styles.pollingTitle, { color: C.text }]}>Vérification du paiement carte</Text>
            <Text style={[styles.pollingDesc, { color: C.textMuted }]}>
              Nous interrogeons le prestataire pour confirmer votre paiement...
            </Text>
          </View>
        </View>
      </Modal>

      {/* ═══ HEADER ═══ */}
      <LinearGradient
        colors={isDark ? ["#132C57", "#0A1C3A"] : ["#FFFFFF", "#FBF8F1"]}
        style={[styles.header, { paddingTop: topPad + 12 }]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      >
        {!isDark && <View style={styles.headerGoldLine} />}

        <Pressable
          onPress={goBack}
          style={({ pressed }) => [
            styles.backBtn,
            {
              backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(10,28,58,0.05)",
              borderColor: isDark ? "transparent" : LIGHT_BORDER,
            },
            pressed && { opacity: 0.85 },
          ]}
          hitSlop={8}
        >
          <Feather name="chevron-left" size={20} color={isDark ? "#fff" : NAVY} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: isDark ? "#FFFFFF" : NAVY }]}>
            Mon Portefeuille
          </Text>
          <Text style={[styles.headerSub, { color: isDark ? "rgba(255,255,255,0.7)" : LIGHT_TEXT_2 }]}>
            Gérez votre solde en toute sécurité
          </Text>
        </View>

        <Pressable
          onPress={() => { Haptics.selectionAsync(); toggleTheme(); }}
          style={({ pressed }) => [
            styles.headerBtn,
            {
              backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(10,28,58,0.05)",
              borderColor: isDark ? "transparent" : LIGHT_BORDER,
              borderWidth: isDark ? 0 : 1,
            },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Feather name={isDark ? "sun" : "moon"} size={17} color={isDark ? GOLD : NAVY} />
        </Pressable>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ═══ BALANCE CARDS ═══ */}
        <Animated.View
          style={{
            opacity: entry0,
            transform: [{ translateY: entry0.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
            gap: 12,
          }}
        >
          <View
            style={[
              styles.mainBalanceCard,
              {
                borderColor: isDark ? GOLD + "30" : "rgba(212,175,55,0.22)",
                shadowColor: isDark ? "#000" : NAVY,
              },
            ]}
          >
            <LinearGradient
              colors={isDark ? ["#132C57", "#0A1C3A", "#071229"] : ["#FFFFFF", "#FBF8F1"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.mainBalanceGrad}
            >
              {!isDark && <View style={styles.goldTopLine} />}
              <View style={styles.mainBalanceTop}>
                <View style={{ flex: 1 }}>
                  <View style={styles.mainBalanceLabelRow}>
                    <View style={[styles.mainBalanceIconBox, { backgroundColor: isDark ? "rgba(212,175,55,0.15)" : "rgba(10,28,58,0.06)" }]}>
                      <Feather name="credit-card" size={13} color={isDark ? GOLD : NAVY} />
                    </View>
                    <Text style={[styles.mainBalanceLabel, { color: isDark ? "rgba(255,255,255,0.65)" : LIGHT_TEXT_2 }]}>
                      Solde principal
                    </Text>
                  </View>
                  <Text style={[styles.mainBalanceValue, { color: isDark ? "#FFFFFF" : NAVY }]}>
                    {userCountry && userCountry.xafRate !== 1
                      ? formatCurrency(balance, userCountry)
                      : `${balance.toLocaleString("fr-FR")} FCFA`}
                  </Text>
                </View>
                <View
                  style={[
                    styles.mainBalanceIconLarge,
                    {
                      backgroundColor: isDark ? "rgba(212,175,55,0.15)" : "rgba(212,175,55,0.18)",
                      borderColor: isDark ? GOLD + "40" : "rgba(212,175,55,0.35)",
                    },
                  ]}
                >
                  <Feather name="wallet" size={26} color={isDark ? GOLD : GOLD_SOFT} />
                </View>
              </View>

              <View style={[styles.mainBalanceDivider, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(10,28,58,0.08)" }]} />

              <View style={styles.mainBalanceBottom}>
                <Text style={[styles.mainBalanceHint, { color: isDark ? "rgba(255,255,255,0.55)" : LIGHT_TEXT_2 }]}>
                  Utilisez ce solde pour passer vos commandes
                </Text>
                <View style={[styles.secureChip, { backgroundColor: isDark ? "rgba(16,185,129,0.12)" : "rgba(16,185,129,0.10)" }]}>
                  <Feather name="shield" size={10} color={SUCCESS} />
                  <Text style={[styles.secureChipText, { color: SUCCESS }]}>Sécurisé</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          <View style={styles.balanceRow}>
            <BalanceCard
              icon="gift"
              label="Parrainage"
              value={userCountry && userCountry.xafRate !== 1
                ? Math.round(referral * userCountry.xafRate).toLocaleString("fr-FR")
                : referral.toLocaleString("fr-FR")}
              currency={userCountry?.currencySymbol ?? "FCFA"}
              color={GOLD}
              C={C}
              isDark={isDark}
              action="Transférer"
              onAction={() => { setTransferTarget(null); setShowTransferModal(true); Haptics.selectionAsync(); }}
            />
            <BalanceCard
              icon="download-cloud"
              label="Retrait"
              value={userCountry && userCountry.xafRate !== 1
                ? Math.round(withdrawal * userCountry.xafRate).toLocaleString("fr-FR")
                : withdrawal.toLocaleString("fr-FR")}
              currency={userCountry?.currencySymbol ?? "FCFA"}
              color={PURPLE}
              C={C}
              isDark={isDark}
              action="Retirer"
              onAction={() => { setWdAmount(""); setWdPhone(""); setShowWithdrawModal(true); Haptics.selectionAsync(); }}
            />
          </View>
        </Animated.View>

        {/* ═══ SEGMENTED TABS ═══ */}
        <Animated.View
          style={{
            opacity: entry1,
            transform: [{ translateY: entry1.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          }}
        >
          <ModeSegmented payMode={payMode} setPayMode={setPayMode} C={C} isDark={isDark} />
        </Animated.View>

        {/* ═══ CAMEROUN FORM (inchangé) ═══ */}
        {payMode === "cameroun" && (
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <Animated.View
              style={[
                styles.formSection,
                {
                  backgroundColor: C.surface,
                  borderColor: "#11998e" + "35",
                  opacity: entry2,
                  transform: [{ translateY: entry2.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
                },
              ]}
            >
              <View style={[styles.formHeader, { backgroundColor: "#11998e" + "14", borderColor: "#11998e" + "25" }]}>
                <View style={[styles.formHeaderIcon, { backgroundColor: "#11998e" + "20" }]}>
                  <Feather name="smartphone" size={20} color="#11998e" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formTitle, { color: C.text }]}>Dépôt Mobile Money</Text>
                  <Text style={[styles.formSub, { color: C.textMuted }]}>MTN MoMo · Orange Money</Text>
                </View>
              </View>

              <View style={styles.formBody}>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Choisissez un montant</Text>
                <View style={styles.presetsWrap}>
                  {AMOUNTS_FCFA.map((a) => {
                    const isActive = fapshiAmount === String(a);
                    return (
                      <Pressable
                        key={a}
                        style={({ pressed }) => [
                          styles.presetChip,
                          {
                            backgroundColor: isActive ? "#11998e" : C.inputBg,
                            borderColor: isActive ? "#11998e" : C.inputBorder,
                          },
                          pressed && { opacity: 0.85 },
                        ]}
                        onPress={() => { setFapshiAmount(String(a)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      >
                        <Text style={[styles.presetChipText, { color: isActive ? "#fff" : C.text }]}>
                          {a.toLocaleString()}
                        </Text>
                        <Text style={[styles.presetChipSub, { color: isActive ? "rgba(255,255,255,0.75)" : C.textMuted }]}>
                          FCFA
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={[styles.inputRow, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                  <Feather name="edit-3" size={16} color={C.textMuted} />
                  <TextInput
                    style={[styles.input, { color: C.text }]}
                    placeholder="Montant personnalisé..."
                    placeholderTextColor={C.textMuted}
                    keyboardType="numeric"
                    value={fapshiAmount}
                    onChangeText={setFapshiAmount}
                  />
                  <Text style={[styles.inputSuffix, { color: C.textMuted }]}>FCFA</Text>
                </View>

                <View style={[styles.infoBanner, { backgroundColor: "rgba(16,185,129,0.08)", borderColor: "rgba(16,185,129,0.20)" }]}>
                  <Feather name="shield" size={14} color={SUCCESS} />
                  <Text style={[styles.infoBannerText, { color: SUCCESS }]}>
                    Paiement sécurisé · Crédit instantané après confirmation opérateur
                  </Text>
                </View>

                <Pressable
                  style={({ pressed }) => [styles.payBtn, pressed && { opacity: 0.9 }, submitting && { opacity: 0.6 }]}
                  onPress={handleFapshiPay}
                  disabled={submitting}
                >
                  <LinearGradient colors={["#11998e", "#38ef7d"]} style={styles.payBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="smartphone" size={18} color="#fff" />}
                    <Text style={styles.payBtnText}>{submitting ? "Traitement..." : "Payer maintenant"}</Text>
                    {!submitting && <Feather name="arrow-right" size={18} color="#fff" />}
                  </LinearGradient>
                </Pressable>

                <View style={styles.methodsRow}>
                  {["MTN MoMo", "Orange Money"].map((op, idx) => (
                    <View key={op} style={[styles.methodChip, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                      <View style={[styles.methodDot, { backgroundColor: idx === 0 ? "#FFCC00" : "#FF6600" }]} />
                      <Text style={[styles.methodChipText, { color: C.text }]}>{op}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        )}

        {/* ═══ INTERNATIONAL FORM ═══ */}
        {payMode === "international" && (
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <Animated.View
              style={[
                styles.formSection,
                {
                  backgroundColor: C.surface,
                  borderColor: INFO + "35",
                  opacity: entry2,
                  transform: [{ translateY: entry2.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
                },
              ]}
            >
              <View style={[styles.formHeader, { backgroundColor: INFO + "12", borderColor: INFO + "25" }]}>
                <View style={[styles.formHeaderIcon, { backgroundColor: INFO + "20" }]}>
                  <Feather name="globe" size={20} color={INFO} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formTitle, { color: C.text }]}>Dépôt International</Text>
                  <Text style={[styles.formSub, { color: C.textMuted }]}>{INTL_COUNTRIES.length} pays disponibles</Text>
                </View>
              </View>

              {/* Sous-toggle : Mobile Money / Carte */}
              <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 14 }}>
                <Pressable
                  onPress={() => { setIntlMethod("mobilemoney"); Haptics.selectionAsync(); }}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingVertical: 11,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      backgroundColor: intlMethod === "mobilemoney" ? INFO + "18" : C.inputBg,
                      borderColor: intlMethod === "mobilemoney" ? INFO : C.border,
                    },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Feather name="smartphone" size={14} color={intlMethod === "mobilemoney" ? INFO : C.textMuted} />
                  <Text
                    style={[
                      styles.methodBtnText,
                      { color: intlMethod === "mobilemoney" ? INFO : C.text, marginLeft: 6 },
                    ]}
                    numberOfLines={1}
                  >
                    Mobile Money
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => { setIntlMethod("card"); Haptics.selectionAsync(); }}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingVertical: 11,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      backgroundColor: intlMethod === "card" ? GOLD + "18" : C.inputBg,
                      borderColor: intlMethod === "card" ? GOLD : C.border,
                    },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Feather name="credit-card" size={14} color={intlMethod === "card" ? GOLD : C.textMuted} />
                  <Text
                    style={[
                      styles.methodBtnText,
                      { color: intlMethod === "card" ? GOLD : C.text, marginLeft: 6 },
                    ]}
                    numberOfLines={1}
                  >
                    Carte bancaire
                  </Text>
                </Pressable>
              </View>

              {/* ── CONTENU MOBILE MONEY ── */}
              {intlMethod === "mobilemoney" && (
                <View style={styles.formBody}>
                  <View>
                    <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Pays</Text>
                    <Pressable
                      style={[styles.countryBtn, { backgroundColor: C.inputBg, borderColor: INFO + "40" }]}
                      onPress={() => { setShowCountryModal(true); setCountrySearch(""); }}
                    >
                      <Text style={styles.countryFlag}>{intlCountry.flag}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.countryName, { color: C.text }]} numberOfLines={1}>{intlCountry.name}</Text>
                        <Text style={[styles.countrySub, { color: C.textMuted }]} numberOfLines={1}>
                          {intlCountry.phoneCode} · {intlCountry.operators.join(" · ")}
                        </Text>
                      </View>
                      <Feather name="chevron-down" size={16} color={INFO} />
                    </Pressable>
                  </View>

                  <View>
                    <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Numéro Mobile Money</Text>
                    <View style={[styles.phoneRow, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                      <View style={[styles.phoneCodeBox, { backgroundColor: INFO + "14" }]}>
                        <Text style={[styles.phoneCodeText, { color: INFO }]}>{intlCountry.phoneCode}</Text>
                      </View>
                      <TextInput
                        style={[styles.phoneInput, { color: C.text }]}
                        placeholder="6XX XXX XXX"
                        placeholderTextColor={C.textMuted}
                        keyboardType="phone-pad"
                        value={intlPhone}
                        onChangeText={setIntlPhone}
                      />
                    </View>
                  </View>

                  <View>
                    <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                      Montant ({intlCountry.currencySymbol})
                    </Text>
                    <View style={styles.presetsWrap}>
                      {amountPresets.map((p) => {
                        const isActive = intlAmount === String(p.local);
                        return (
                          <Pressable
                            key={p.xaf}
                            style={({ pressed }) => [
                              styles.presetChip,
                              {
                                backgroundColor: isActive ? INFO : C.inputBg,
                                borderColor: isActive ? INFO : C.inputBorder,
                              },
                              pressed && { opacity: 0.85 },
                            ]}
                            onPress={() => { setIntlAmount(String(p.local)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                          >
                            <Text style={[styles.presetChipText, { color: isActive ? "#fff" : C.text }]}>
                              {p.local.toLocaleString()}
                            </Text>
                            <Text style={[styles.presetChipSub, { color: isActive ? "rgba(255,255,255,0.75)" : C.textMuted }]}>
                              {intlCountry.currencySymbol}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <View style={[styles.inputRow, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                      <Feather name="edit-3" size={16} color={C.textMuted} />
                      <TextInput
                        style={[styles.input, { color: C.text }]}
                        placeholder={`Montant en ${intlCountry.currencySymbol}`}
                        placeholderTextColor={C.textMuted}
                        keyboardType="numeric"
                        value={intlAmount}
                        onChangeText={setIntlAmount}
                      />
                      <Text style={[styles.inputSuffix, { color: C.textMuted }]}>{intlCountry.currencySymbol}</Text>
                    </View>

                    {intlAmount && (
                      <View style={[styles.conversionRow, { backgroundColor: INFO + "10", borderColor: INFO + "30" }]}>
                        <Feather name="refresh-cw" size={12} color={INFO} />
                        <Text style={[styles.conversionText, { color: INFO }]}>
                          ≈ {getEquivalentXAF(parseInt(intlAmount) || 0, intlCountry).toLocaleString("fr-FR")} FCFA
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={[styles.infoBanner, { backgroundColor: INFO + "0D", borderColor: INFO + "25" }]}>
                    <Feather name="shield" size={14} color={INFO} />
                    <Text style={[styles.infoBannerText, { color: INFO }]}>
                      Paiement sécurisé · Solde crédité automatiquement après confirmation
                    </Text>
                  </View>
                  <View style={[styles.infoBanner, { backgroundColor: WARNING + "10", borderColor: WARNING + "25" }]}>
                    <Feather name="clock" size={14} color={WARNING} />
                    <Text style={[styles.infoBannerText, { color: WARNING }]}>
                      Délai de crédit : 5 à 30 minutes selon l'opérateur choisi
                    </Text>
                  </View>

                  <Pressable
                    style={({ pressed }) => [styles.payBtn, pressed && { opacity: 0.9 }, submitting && { opacity: 0.6 }]}
                    onPress={handleIntlPay}
                    disabled={submitting}
                  >
                    <LinearGradient colors={isDark ? [NAVY_LIGHT, NAVY] : [INFO, "#2563EB"]} style={styles.payBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                      {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="credit-card" size={18} color="#fff" />}
                      <Text style={styles.payBtnText}>{submitting ? "Traitement..." : "Procéder au paiement"}</Text>
                      {!submitting && <Feather name="arrow-right" size={18} color={isDark ? GOLD : "#fff"} />}
                    </LinearGradient>
                  </Pressable>
                </View>
              )}

              {/* ── CONTENU CARTE BANCAIRE ── */}
              {intlMethod === "card" && (
                <View style={styles.formBody}>
                  <View>
                    <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Pays / devise</Text>
                    <Pressable
                      style={[styles.countryBtn, { backgroundColor: C.inputBg, borderColor: GOLD + "40" }]}
                      onPress={() => { setShowCountryModal(true); setCountrySearch(""); }}
                    >
                      <Text style={styles.countryFlag}>{intlCountry.flag}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.countryName, { color: C.text }]} numberOfLines={1}>
                          {intlCountry.name}
                        </Text>
                        <Text style={[styles.countrySub, { color: C.textMuted }]} numberOfLines={1}>
                          {intlCountry.currencySymbol} · {intlCountry.currency}
                        </Text>
                      </View>
                      <Feather name="chevron-down" size={16} color={GOLD} />
                    </Pressable>
                  </View>

                  <View>
                    <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                      Montant ({intlCountry.currencySymbol})
                    </Text>
                    <View style={styles.presetsWrap}>
                      {[2000, 5000, 10000, 20000, 50000, 100000].map((xaf) => {
                        const local = getEquivalentLocal(xaf, intlCountry);
                        const isActive = cardAmount === String(local);
                        return (
                          <Pressable
                            key={xaf}
                            style={({ pressed }) => [
                              styles.presetChip,
                              {
                                backgroundColor: isActive ? GOLD : C.inputBg,
                                borderColor: isActive ? GOLD : C.inputBorder,
                              },
                              pressed && { opacity: 0.85 },
                            ]}
                            onPress={() => { setCardAmount(String(local)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                          >
                            <Text style={[styles.presetChipText, { color: isActive ? "#000" : C.text }]}>
                              {local.toLocaleString()}
                            </Text>
                            <Text style={[styles.presetChipSub, { color: isActive ? "rgba(0,0,0,0.65)" : C.textMuted }]}>
                              {intlCountry.currencySymbol}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <View style={[styles.inputRow, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                      <Feather name="credit-card" size={16} color={C.textMuted} />
                      <TextInput
                        style={[styles.input, { color: C.text }]}
                        placeholder={`Montant en ${intlCountry.currencySymbol}`}
                        placeholderTextColor={C.textMuted}
                        keyboardType="numeric"
                        value={cardAmount}
                        onChangeText={setCardAmount}
                      />
                      <Text style={[styles.inputSuffix, { color: C.textMuted }]}>
                        {intlCountry.currencySymbol}
                      </Text>
                    </View>
                    {cardAmount && (
                      <View style={[styles.conversionRow, { backgroundColor: GOLD + "10", borderColor: GOLD + "30" }]}>
                        <Feather name="refresh-cw" size={12} color={GOLD} />
                        <Text style={[styles.conversionText, { color: GOLD }]}>
                          ≈ {getEquivalentXAF(parseInt(cardAmount) || 0, intlCountry).toLocaleString("fr-FR")} FCFA
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={[styles.infoBanner, { backgroundColor: GOLD + "10", borderColor: GOLD + "25" }]}>
                    <Feather name="shield" size={14} color={GOLD} />
                    <Text style={[styles.infoBannerText, { color: GOLD }]}>
                      Paiement 100% sécurisé · Visa / Mastercard · Crédit automatique après confirmation
                    </Text>
                  </View>

                  <Pressable
                    style={({ pressed }) => [styles.payBtn, pressed && { opacity: 0.9 }, submitting && { opacity: 0.6 }]}
                    onPress={handleNelsiusPay}
                    disabled={submitting}
                  >
                    <LinearGradient
                      colors={[GOLD_SOFT, GOLD]}
                      style={styles.payBtnGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      {submitting ? (
                        <ActivityIndicator size="small" color="#000" />
                      ) : (
                        <Feather name="credit-card" size={18} color="#000" />
                      )}
                      <Text style={[styles.payBtnText, { color: "#000" }]}>
                        {submitting ? "Traitement..." : "Payer par carte"}
                      </Text>
                      {!submitting && <Feather name="arrow-right" size={18} color="#000" />}
                    </LinearGradient>
                  </Pressable>
                </View>
              )}
            </Animated.View>
          </KeyboardAvoidingView>
        )}

        {/* ═══ HISTORIQUE ═══ */}
        {payMode === "historique" && (
          <View style={{ gap: 10 }}>
            <View style={styles.histHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={[styles.accentBar, { backgroundColor: PURPLE }]} />
                <Text style={[styles.histTitle, { color: C.text }]}>Toutes les activités</Text>
              </View>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); loadActivities(); }}
                style={({ pressed }) => [
                  styles.histRefresh,
                  { backgroundColor: C.iconBg, borderColor: C.iconBorder },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Feather name="refresh-cw" size={14} color={C.accentIcon} />
              </Pressable>
            </View>

            {loadingActivities ? (
              <ActivityIndicator size="small" color={PURPLE} style={{ marginVertical: 20 }} />
            ) : activities.length === 0 ? (
              <View style={[styles.emptyHistory, { backgroundColor: C.surface, borderColor: C.border }]}>
                <View style={[styles.emptyIconBox, { backgroundColor: C.iconBg, borderColor: C.iconBorder }]}>
                  <Feather name="inbox" size={32} color={C.accentIcon} />
                </View>
                <Text style={[styles.emptyTitle, { color: C.text }]}>Aucune activité récente</Text>
                <Text style={[styles.emptyText, { color: C.textMuted }]}>
                  Vos dépôts, commandes et remboursements apparaîtront ici
                </Text>
              </View>
            ) : (
              activities.map((a, idx) => (
                <ActivityItem key={a.id ?? idx} item={a} C={C} userCountry={userCountry} />
              ))
            )}
          </View>
        )}

        {/* ═══ RECHARGES RÉCENTES ═══ */}
        {payMode !== "historique" && (
          <View style={{ gap: 10 }}>
            <View style={styles.histHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={[styles.accentBar, { backgroundColor: GOLD }]} />
                <Text style={[styles.histTitle, { color: C.text }]}>Rechargements récents</Text>
              </View>
            </View>
            {isLoading ? (
              <ActivityIndicator size="small" color={C.accentIcon} style={{ marginVertical: 20 }} />
            ) : recharges.length === 0 ? (
              <View style={[styles.emptyHistory, { backgroundColor: C.surface, borderColor: C.border }]}>
                <View style={[styles.emptyIconBox, { backgroundColor: C.iconBg, borderColor: C.iconBorder }]}>
                  <Feather name="inbox" size={28} color={C.accentIcon} />
                </View>
                <Text style={[styles.emptyTitle, { color: C.text }]}>Aucun rechargement récent</Text>
              </View>
            ) : (
              recharges.slice(0, 8).map((r) => <RechargeItem key={r.id} item={r} C={C} userCountry={userCountry} />)
            )}
          </View>
        )}
      </ScrollView>

      {/* ═══ TRANSFER MODAL ═══ */}
      <Modal visible={showTransferModal} animationType="slide" transparent onRequestClose={() => { setShowTransferModal(false); setTransferTarget(null); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: C.surface }]}>
            <View style={styles.modalGrabber} />
            <View style={[styles.modalHeader, { borderBottomColor: C.separator }]}>
              <Text style={[styles.modalTitle, { color: C.text }]}>Transférer vos fonds</Text>
              <Pressable onPress={() => { setShowTransferModal(false); setTransferTarget(null); }} style={[styles.modalClose, { backgroundColor: C.inputBg }]}>
                <Feather name="x" size={18} color={C.text} />
              </Pressable>
            </View>
            <View style={{ padding: 20, gap: 14 }}>
              <View style={[styles.transferInfoBox, { backgroundColor: GOLD + "12", borderColor: GOLD + "30" }]}>
                <View style={[styles.transferInfoIcon, { backgroundColor: GOLD + "22" }]}>
                  <Feather name="gift" size={16} color={GOLD} />
                </View>
                <Text style={[styles.transferInfoText, { color: C.text }]}>
                  Solde parrainage :{" "}
                  <Text style={{ fontFamily: "Inter_700Bold", color: isDark ? GOLD : NAVY }}>
                    {userCountry && userCountry.xafRate !== 1 ? formatCurrency(referral, userCountry) : `${referral.toLocaleString("fr-FR")} FCFA`}
                  </Text>
                </Text>
              </View>

              <Text style={[styles.transferLabel, { color: C.text }]}>Choisissez la destination</Text>

              {[
                { key: "main", label: "Solde Principal", sub: "Utilisez vos fonds pour passer des commandes", icon: "credit-card" as const, color: INFO },
                { key: "withdrawal", label: "Solde de Retrait", sub: "Retirez vos gains en espèces", icon: "download-cloud" as const, color: PURPLE },
              ].map((opt) => {
                const active = transferTarget === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => { setTransferTarget(opt.key as any); Haptics.selectionAsync(); }}
                    style={({ pressed }) => [
                      styles.transferOption,
                      {
                        backgroundColor: active ? opt.color + "14" : C.inputBg,
                        borderColor: active ? opt.color : C.border,
                      },
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <View style={[styles.transferOptionIcon, { backgroundColor: opt.color + "20" }]}>
                      <Feather name={opt.icon} size={20} color={opt.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.transferOptionLabel, { color: C.text }]}>{opt.label}</Text>
                      <Text style={[styles.transferOptionSub, { color: C.textMuted }]}>{opt.sub}</Text>
                    </View>
                    {active && <Feather name="check-circle" size={20} color={opt.color} />}
                  </Pressable>
                );
              })}

              <Pressable
                style={({ pressed }) => [
                  styles.transferConfirmBtn,
                  {
                    backgroundColor: transferTarget ? (isDark ? GOLD : NAVY) : C.inputBg,
                    opacity: (!transferTarget || transferring) ? 0.6 : 1,
                  },
                  pressed && { opacity: 0.9 },
                ]}
                onPress={handleTransfer}
                disabled={!transferTarget || transferring}
              >
                {transferring ? (
                  <ActivityIndicator size="small" color={isDark ? "#000" : "#fff"} />
                ) : (
                  <Feather name="arrow-right-circle" size={16} color={transferTarget ? (isDark ? "#000" : "#fff") : C.textMuted} />
                )}
                <Text style={[styles.transferConfirmText, { color: transferTarget ? (isDark ? "#000" : "#fff") : C.textMuted }]}>
                  {transferring ? "Transfert en cours..." : "Confirmer le transfert"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══ WITHDRAW MODAL ═══ */}
      <Modal visible={showWithdrawModal} animationType="slide" transparent onRequestClose={() => setShowWithdrawModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: C.surface, maxHeight: "90%" }]}>
            <View style={styles.modalGrabber} />
            <View style={[styles.modalHeader, { borderBottomColor: C.separator }]}>
              <Text style={[styles.modalTitle, { color: C.text }]}>Retrait Mobile Money</Text>
              <Pressable onPress={() => setShowWithdrawModal(false)} style={[styles.modalClose, { backgroundColor: C.inputBg }]}>
                <Feather name="x" size={18} color={C.text} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
              <View style={[styles.withdrawInfo, { backgroundColor: PURPLE + "12", borderColor: PURPLE + "30" }]}>
                <View style={[styles.withdrawIcon, { backgroundColor: PURPLE + "22" }]}>
                  <Feather name="download-cloud" size={18} color={PURPLE} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.withdrawInfoText, { color: C.text }]}>
                    Solde retrait : <Text style={{ fontFamily: "Inter_700Bold", color: PURPLE }}>
                      {userCountry && userCountry.xafRate !== 1 ? formatCurrency(withdrawal, userCountry) : `${withdrawal.toLocaleString("fr-FR")} FCFA`}
                    </Text>
                  </Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                    Minimum : 1 500 FCFA
                  </Text>
                </View>
              </View>

              <View>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Pays de réception</Text>
                <Pressable
                  style={[styles.countryBtn, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}
                  onPress={() => { setWdCountrySearch(""); setShowWdCountryModal(true); }}
                >
                  <Text style={styles.countryFlag}>{wdCountry.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.countryName, { color: C.text }]} numberOfLines={1}>{wdCountry.name}</Text>
                    <Text style={[styles.countrySub, { color: C.textMuted }]} numberOfLines={1}>
                      {wdCountry.phoneCode} · {wdCountry.operators.join(" • ")}
                    </Text>
                  </View>
                  <Feather name="chevron-down" size={16} color={C.textMuted} />
                </Pressable>
              </View>

              <View>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Opérateur Mobile Money</Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {wdCountry.operators.map((op) => (
                    <Pressable
                      key={op}
                      style={({ pressed }) => [
                        styles.methodBtn,
                        {
                          backgroundColor: wdMethod === op ? PURPLE + "15" : C.inputBg,
                          borderColor: wdMethod === op ? PURPLE : C.border,
                        },
                        pressed && { opacity: 0.9 },
                      ]}
                      onPress={() => { setWdMethod(op); Haptics.selectionAsync(); }}
                    >
                      <Text style={[styles.methodBtnText, { color: wdMethod === op ? PURPLE : C.text }]}>{op}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                  Numéro Mobile Money ({wdCountry.phoneCode})
                </Text>
                <View style={[styles.phoneRow, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                  <View style={[styles.phoneCodeBox, { backgroundColor: PURPLE + "14" }]}>
                    <Text style={[styles.phoneCodeText, { color: PURPLE }]}>{wdCountry.phoneCode}</Text>
                  </View>
                  <TextInput
                    style={[styles.phoneInput, { color: C.text }]}
                    placeholder="6XX XXX XXX"
                    placeholderTextColor={C.textMuted}
                    keyboardType="phone-pad"
                    value={wdPhone}
                    onChangeText={setWdPhone}
                  />
                </View>
              </View>

              <View>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Montant à retirer (FCFA)</Text>
                <View style={[styles.inputRow, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                  <TextInput
                    style={[styles.input, { color: C.text }]}
                    placeholder="Minimum 1 500 FCFA"
                    placeholderTextColor={C.textMuted}
                    keyboardType="numeric"
                    value={wdAmount}
                    onChangeText={setWdAmount}
                  />
                  <Text style={[styles.inputSuffix, { color: C.textMuted }]}>FCFA</Text>
                </View>
              </View>

              {(() => {
                const parsedAmt = parseInt(wdAmount, 10);
                if (!parsedAmt || parsedAmt <= 0) return null;
                if (parsedAmt >= WITHDRAWAL_FEE_THRESHOLD) return (
                  <View style={[styles.infoBanner, { backgroundColor: SUCCESS + "12", borderColor: SUCCESS + "30" }]}>
                    <Feather name="check-circle" size={14} color={SUCCESS} />
                    <Text style={[styles.infoBannerText, { color: SUCCESS }]}>
                      Aucun frais — retraits ≥ 10 000 FCFA sont gratuits.
                    </Text>
                  </View>
                );
                return (
                  <View style={[styles.infoBanner, { backgroundColor: WARNING + "12", borderColor: WARNING + "30", alignItems: "flex-start" }]}>
                    <Feather name="alert-circle" size={14} color={WARNING} style={{ marginTop: 1 }} />
                    <Text style={[styles.infoBannerText, { color: WARNING }]}>
                      <Text style={{ fontFamily: "Inter_700Bold" }}>Frais de 455 FCFA</Text> s'appliquent aux retraits inférieurs à 10 000 FCFA. Vous choisirez le solde à débiter lors de la confirmation.
                    </Text>
                  </View>
                );
              })()}

              <Pressable
                style={({ pressed }) => [
                  styles.withdrawSubmit,
                  { backgroundColor: PURPLE, opacity: wdSubmitting ? 0.6 : 1 },
                  pressed && { opacity: 0.9 },
                ]}
                onPress={handleWithdraw}
                disabled={wdSubmitting}
              >
                {wdSubmitting ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="send" size={16} color="#fff" />}
                <Text style={styles.withdrawSubmitText}>
                  {wdSubmitting ? "Traitement..." : "Soumettre le retrait"}
                </Text>
              </Pressable>

              <Text style={[styles.withdrawHint, { color: C.textMuted }]}>
                Traitement sous 24h ouvrables. L'administrateur sera notifié automatiquement.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══ WD COUNTRY MODAL ═══ */}
      <Modal visible={showWdCountryModal} animationType="slide" transparent onRequestClose={() => setShowWdCountryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: C.surface, maxHeight: "90%" }]}>
            <View style={styles.modalGrabber} />
            <View style={[styles.modalHeader, { borderBottomColor: C.separator }]}>
              <Text style={[styles.modalTitle, { color: C.text }]}>Pays de retrait</Text>
              <Pressable onPress={() => setShowWdCountryModal(false)} style={[styles.modalClose, { backgroundColor: C.inputBg }]}>
                <Feather name="x" size={18} color={C.text} />
              </Pressable>
            </View>
            <View style={[styles.searchBar, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
              <Feather name="search" size={16} color={C.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: C.text }]}
                placeholder="Rechercher un pays..."
                placeholderTextColor={C.textMuted}
                value={wdCountrySearch}
                onChangeText={setWdCountrySearch}
              />
            </View>
            <FlatList
              data={filteredWdCountries}
              keyExtractor={(c) => c.code}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 6 }}
              renderItem={({ item }) => {
                const isSelected = wdCountry.code === item.code;
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.countryOption,
                      {
                        backgroundColor: isSelected ? PURPLE + "15" : C.inputBg,
                        borderColor: isSelected ? PURPLE : C.border,
                      },
                      pressed && { opacity: 0.9 },
                    ]}
                    onPress={() => {
                      setWdCountry(item);
                      setWdMethod(item.operators[0] ?? "Mobile Money");
                      setWdCountrySearch("");
                      setShowWdCountryModal(false);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={styles.countryOptionFlag}>{item.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.countryOptionName, { color: C.text }]}>{item.name}</Text>
                      <Text style={[styles.countryOptionSub, { color: C.textMuted }]} numberOfLines={1}>
                        {item.phoneCode} · {item.operators.join(" • ")}
                      </Text>
                    </View>
                    {isSelected && <Feather name="check-circle" size={18} color={PURPLE} />}
                  </Pressable>
                );
              }}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>

      {/* ═══ COUNTRY PICKER (International) ═══ */}
      <Modal visible={showCountryModal} animationType="slide" transparent onRequestClose={() => setShowCountryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: C.surface, maxHeight: "90%" }]}>
            <View style={styles.modalGrabber} />
            <View style={[styles.modalHeader, { borderBottomColor: C.separator }]}>
              <Text style={[styles.modalTitle, { color: C.text }]}>Choisir un pays</Text>
              <Pressable onPress={() => setShowCountryModal(false)} style={[styles.modalClose, { backgroundColor: C.inputBg }]}>
                <Feather name="x" size={18} color={C.text} />
              </Pressable>
            </View>
            <View style={[styles.searchBar, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
              <Feather name="search" size={16} color={C.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: C.text }]}
                placeholder="Rechercher un pays..."
                placeholderTextColor={C.textMuted}
                value={countrySearch}
                onChangeText={setCountrySearch}
              />
            </View>
            <FlatList
              data={filteredCountries}
              keyExtractor={(c) => c.code}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 6 }}
              renderItem={({ item }) => {
                const isSelected = intlCountry.code === item.code;
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.countryOption,
                      {
                        backgroundColor: isSelected ? INFO + "15" : C.inputBg,
                        borderColor: isSelected ? INFO : C.border,
                      },
                      pressed && { opacity: 0.9 },
                    ]}
                    onPress={() => {
                      setIntlCountry(item);
                      setIntlAmount("");
                      setCardAmount("");
                      setShowCountryModal(false);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={styles.countryOptionFlag}>{item.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.countryOptionName, { color: C.text }]}>{item.name}</Text>
                      <Text style={[styles.countryOptionSub, { color: C.textMuted }]} numberOfLines={1}>
                        {item.phoneCode} · {item.operators.join(" • ")}
                      </Text>
                    </View>
                    {isSelected && <Feather name="check-circle" size={18} color={INFO} />}
                  </Pressable>
                );
              }}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: "row", alignItems: "center", gap: 12,
    position: "relative",
  },
  headerGoldLine: {
    position: "absolute", top: 0, left: 20, right: 20, height: 2,
    backgroundColor: GOLD, opacity: 0.35,
    borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 13,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 20, letterSpacing: -0.3 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12.5, marginTop: 3 },

  content: { padding: 14, gap: 16 },

  mainBalanceCard: {
    borderRadius: 22, overflow: "hidden",
    borderWidth: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14, shadowOpacity: 0.10, elevation: 5,
  },
  mainBalanceGrad: { padding: 20, position: "relative" },
  goldTopLine: {
    position: "absolute", top: 0, left: 22, right: 22, height: 2,
    backgroundColor: GOLD, opacity: 0.55,
    borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
  },
  mainBalanceTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  mainBalanceLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  mainBalanceIconBox: {
    width: 24, height: 24, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  mainBalanceLabel: { fontFamily: "Inter_500Medium", fontSize: 11.5, letterSpacing: 0.4, textTransform: "uppercase" },
  mainBalanceValue: { fontFamily: "Inter_700Bold", fontSize: 30, marginTop: 10, letterSpacing: -0.6 },
  mainBalanceIconLarge: {
    width: 54, height: 54, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  mainBalanceDivider: { height: 1, marginVertical: 16 },
  mainBalanceBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  mainBalanceHint: { fontFamily: "Inter_400Regular", fontSize: 12, flex: 1 },
  secureChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  secureChipText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.3 },

  balanceRow: { flexDirection: "row", gap: 10 },
  balanceCard: {
    flex: 1, borderRadius: 18, borderWidth: 1.5, padding: 14, gap: 4,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 1,
  },
  balanceIconBox: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
    marginBottom: 4,
  },
  balanceLabel: { fontFamily: "Inter_500Medium", fontSize: 11, letterSpacing: 0.3, textTransform: "uppercase" },
  balanceValue: { fontFamily: "Inter_700Bold", fontSize: 18, letterSpacing: -0.3, marginTop: 2 },
  balanceCurrency: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  balanceAction: {
    flexDirection: "row", alignItems: "center", gap: 3,
    alignSelf: "flex-start",
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, marginTop: 6,
  },
  balanceActionText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.2 },

  segment: {
    flexDirection: "row", borderRadius: 16, borderWidth: 1, padding: 4,
  },
  segmentBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    padding: 10, borderRadius: 12,
  },
  segmentDivider: { width: 1, marginVertical: 8, marginHorizontal: 2 },
  segmentIconBox: {
    width: 30, height: 30, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  segmentLabel: { fontFamily: "Inter_700Bold", fontSize: 12.5, letterSpacing: -0.1 },
  segmentSub: { fontFamily: "Inter_400Regular", fontSize: 10.5, marginTop: 1 },

  formSection: { borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  formHeader: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderBottomWidth: 1,
  },
  formHeaderIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  formTitle: { fontFamily: "Inter_700Bold", fontSize: 15.5, letterSpacing: -0.2 },
  formSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  formBody: { padding: 16, gap: 14 },

  fieldLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12.5, letterSpacing: 0.1, marginBottom: 6 },

  presetsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  presetChip: {
    alignItems: "center", gap: 1,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1.5,
    minWidth: 76, flexGrow: 1, flexBasis: "30%",
  },
  presetChipText: { fontFamily: "Inter_700Bold", fontSize: 13.5 },
  presetChipSub: { fontFamily: "Inter_400Regular", fontSize: 10 },

  inputRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  input: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14.5 },
  inputSuffix: { fontFamily: "Inter_700Bold", fontSize: 12.5 },

  countryBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  countryFlag: { fontSize: 26 },
  countryName: { fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: -0.1 },
  countrySub: { fontFamily: "Inter_400Regular", fontSize: 11.5, marginTop: 2 },

  phoneRow: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderRadius: 12, overflow: "hidden",
  },
  phoneCodeBox: { paddingHorizontal: 14, paddingVertical: 13 },
  phoneCodeText: { fontFamily: "Inter_700Bold", fontSize: 14 },
  phoneInput: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14.5, paddingHorizontal: 12, paddingVertical: 13 },

  conversionRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1,
    alignSelf: "flex-start",
  },
  conversionText: { fontFamily: "Inter_600SemiBold", fontSize: 12.5 },

  infoBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, borderWidth: 1, padding: 10,
  },
  infoBannerText: { fontFamily: "Inter_500Medium", fontSize: 11.5, flex: 1, lineHeight: 16 },

  payBtn: { borderRadius: 14, overflow: "hidden", marginTop: 4 },
  payBtnGradient: {
    height: 54, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 10, paddingHorizontal: 20,
  },
  payBtnText: { fontFamily: "Inter_700Bold", fontSize: 15.5, color: "#fff", letterSpacing: 0.1 },

  methodsRow: { flexDirection: "row", gap: 8, justifyContent: "center", flexWrap: "wrap" },
  methodChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  methodDot: { width: 8, height: 8, borderRadius: 4 },
  methodChipText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },

  histHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
  },
  accentBar: { width: 3, height: 18, borderRadius: 2 },
  histTitle: { fontFamily: "Inter_700Bold", fontSize: 16, letterSpacing: -0.2 },
  histRefresh: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  histItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 12,
  },
  histIcon: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  histMeta: { fontFamily: "Inter_400Regular", fontSize: 11.5, marginTop: 2 },
  histAmount: { fontFamily: "Inter_700Bold", fontSize: 13.5 },
  histBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  histBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.2 },

  emptyHistory: {
    borderRadius: 16, borderWidth: 1, padding: 28,
    alignItems: "center", gap: 12,
  },
  emptyIconBox: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  emptyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14.5, textAlign: "center" },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 12.5, textAlign: "center", lineHeight: 18 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(10,28,58,0.55)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: "88%", paddingTop: 8 },
  modalGrabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(128,128,128,0.3)", marginBottom: 6 },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, paddingBottom: 12,
    borderBottomWidth: 1,
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 17, letterSpacing: -0.2 },
  modalClose: {
    width: 34, height: 34, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },

  transferInfoBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, padding: 12, borderWidth: 1,
  },
  transferInfoIcon: {
    width: 34, height: 34, borderRadius: 11,
    alignItems: "center", justifyContent: "center",
  },
  transferInfoText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13 },
  transferLabel: { fontFamily: "Inter_700Bold", fontSize: 14, marginTop: 4 },
  transferOption: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 2,
  },
  transferOptionIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  transferOptionLabel: { fontFamily: "Inter_700Bold", fontSize: 14.5, letterSpacing: -0.1 },
  transferOptionSub: { fontFamily: "Inter_400Regular", fontSize: 11.5, marginTop: 3 },
  transferConfirmBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, padding: 15, borderRadius: 13, marginTop: 6,
  },
  transferConfirmText: { fontFamily: "Inter_700Bold", fontSize: 14.5, letterSpacing: 0.1 },

  withdrawInfo: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, padding: 14, borderWidth: 1,
  },
  withdrawIcon: {
    width: 42, height: 42, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  withdrawInfoText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  methodBtn: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1,
  },
  methodBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12.5 },
  withdrawSubmit: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, padding: 15, borderRadius: 13,
  },
  withdrawSubmitText: { fontFamily: "Inter_700Bold", fontSize: 14.5, color: "#fff", letterSpacing: 0.1 },
  withdrawHint: { fontFamily: "Inter_400Regular", fontSize: 11, textAlign: "center", lineHeight: 16 },

  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    margin: 16, marginTop: 12,
  },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14.5 },
  countryOption: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 12,
  },
  countryOptionFlag: { fontSize: 26 },
  countryOptionName: { fontFamily: "Inter_600SemiBold", fontSize: 14.5 },
  countryOptionSub: { fontFamily: "Inter_400Regular", fontSize: 11.5, marginTop: 2 },

  pollingOverlay: {
    flex: 1, backgroundColor: "rgba(10,28,58,0.65)",
    alignItems: "center", justifyContent: "center", padding: 30,
  },
  pollingCard: {
    width: "100%", borderRadius: 22, padding: 28,
    alignItems: "center", gap: 12,
    borderWidth: 1,
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 20, elevation: 10,
  },
  pollingTitle: { fontFamily: "Inter_700Bold", fontSize: 17, textAlign: "center", marginTop: 6, letterSpacing: -0.2 },
  pollingDesc: { fontFamily: "Inter_400Regular", fontSize: 13.5, textAlign: "center", lineHeight: 20 },
  pollingProgress: { width: "100%", height: 6, borderRadius: 3, overflow: "hidden", marginTop: 10 },
  pollingBar: { height: "100%", borderRadius: 3 },
  pollingAttemptText: { fontFamily: "Inter_500Medium", fontSize: 12 },
});