import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

const AMOUNTS_FCFA = [500, 1000, 2000, 5000, 10000, 20000];

export interface PayCountry extends Country {
  operators: string[];
}

const INTL_COUNTRIES: PayCountry[] = [
  // ── Zone XAF (FCFA Afrique centrale) ────────────────────────────────────
  { code: "cm", name: "Cameroun",             flag: "🇨🇲", phoneCode: "+237", currency: "XAF", currencySymbol: "FCFA", xafRate: 1,      operators: ["MTN Mobile Money", "Orange Money"] },
  { code: "ga", name: "Gabon",                flag: "🇬🇦", phoneCode: "+241", currency: "XAF", currencySymbol: "FCFA", xafRate: 1,      operators: ["MTN Mobile Money", "Airtel Money"] },
  { code: "cg", name: "Congo Brazzaville",    flag: "🇨🇬", phoneCode: "+242", currency: "XAF", currencySymbol: "FCFA", xafRate: 1,      operators: ["MTN Mobile Money", "Airtel Money"] },
  { code: "td", name: "Tchad",                flag: "🇹🇩", phoneCode: "+235", currency: "XAF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Airtel Money"] },
  { code: "cf", name: "Centrafrique",         flag: "🇨🇫", phoneCode: "+236", currency: "XAF", currencySymbol: "FCFA", xafRate: 1,      operators: ["MTN Mobile Money"] },
  { code: "gq", name: "Guinée Équatoriale",   flag: "🇬🇶", phoneCode: "+240", currency: "XAF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Airtel Money"] },
  // ── Zone XOF (FCFA Afrique de l'Ouest) ──────────────────────────────────
  { code: "sn", name: "Sénégal",              flag: "🇸🇳", phoneCode: "+221", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Orange Money", "Wave"] },
  { code: "ci", name: "Côte d'Ivoire",        flag: "🇨🇮", phoneCode: "+225", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Orange Money", "MTN Mobile Money", "Wave"] },
  { code: "ml", name: "Mali",                 flag: "🇲🇱", phoneCode: "+223", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Orange Money", "Moov Money"] },
  { code: "bf", name: "Burkina Faso",         flag: "🇧🇫", phoneCode: "+226", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Orange Money", "Moov Money"] },
  { code: "bj", name: "Bénin",               flag: "🇧🇯", phoneCode: "+229", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["MTN Mobile Money", "Moov Money"] },
  { code: "tg", name: "Togo",                flag: "🇹🇬", phoneCode: "+228", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Flooz", "T-Money"] },
  { code: "ne", name: "Niger",               flag: "🇳🇪", phoneCode: "+227", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["Airtel Money", "Zamani"] },
  { code: "gw", name: "Guinée-Bissau",       flag: "🇬🇼", phoneCode: "+245", currency: "XOF", currencySymbol: "FCFA", xafRate: 1,      operators: ["MTN Mobile Money"] },
  // ── Guinée Conakry (GNF — hors zone CFA) ───────────────────────────────
  { code: "gn", name: "Guinée Conakry",      flag: "🇬🇳", phoneCode: "+224", currency: "GNF", currencySymbol: "FG",   xafRate: 14.5,   operators: ["Orange Money", "MTN Mobile Money"] },
  // ── Afrique centrale / Est ──────────────────────────────────────────────
  { code: "cd", name: "RD Congo",            flag: "🇨🇩", phoneCode: "+243", currency: "CDF", currencySymbol: "FC",   xafRate: 4.70,   operators: ["M-Pesa", "Airtel Money", "Orange Money"] },
  { code: "rw", name: "Rwanda",              flag: "🇷🇼", phoneCode: "+250", currency: "RWF", currencySymbol: "FRw",  xafRate: 1.98,   operators: ["MTN Mobile Money", "Airtel Money"] },
  { code: "ug", name: "Ouganda",             flag: "🇺🇬", phoneCode: "+256", currency: "UGX", currencySymbol: "USh",  xafRate: 5.64,   operators: ["MTN Mobile Money", "Airtel Money"] },
  { code: "tz", name: "Tanzanie",            flag: "🇹🇿", phoneCode: "+255", currency: "TZS", currencySymbol: "TSh",  xafRate: 3.81,   operators: ["M-Pesa", "Airtel Money"] },
  { code: "ke", name: "Kenya",               flag: "🇰🇪", phoneCode: "+254", currency: "KES", currencySymbol: "KSh",  xafRate: 0.20,   operators: ["M-Pesa"] },
  { code: "et", name: "Éthiopie",            flag: "🇪🇹", phoneCode: "+251", currency: "ETB", currencySymbol: "Br",   xafRate: 0.19,   operators: ["Telebirr"] },
  { code: "zm", name: "Zambie",              flag: "🇿🇲", phoneCode: "+260", currency: "ZMW", currencySymbol: "ZK",   xafRate: 0.041,  operators: ["MTN Mobile Money", "Airtel Money"] },
  { code: "mw", name: "Malawi",              flag: "🇲🇼", phoneCode: "+265", currency: "MWK", currencySymbol: "MK",   xafRate: 2.67,   operators: ["TNM Mpamba", "Airtel Money"] },
  // ── Afrique de l'Ouest hors CFA ─────────────────────────────────────────
  { code: "gh", name: "Ghana",               flag: "🇬🇭", phoneCode: "+233", currency: "GHS", currencySymbol: "GH₵",  xafRate: 0.024,  operators: ["MTN Mobile Money", "AirtelTigo Money"] },
  { code: "ng", name: "Nigéria",             flag: "🇳🇬", phoneCode: "+234", currency: "NGN", currencySymbol: "₦",    xafRate: 2.44,   operators: ["MTN Mobile Money", "Airtel Money", "OPay"] },
  { code: "sl", name: "Sierra Leone",        flag: "🇸🇱", phoneCode: "+232", currency: "SLE", currencySymbol: "Le",   xafRate: 0.034,  operators: ["Orange Money"] },
  { code: "mr", name: "Mauritanie",         flag: "🇲🇷", phoneCode: "+222", currency: "MRU", currencySymbol: "UM",   xafRate: 0.056,  operators: ["Masrvi", "Bankily"] },
  { code: "gm", name: "Gambie",             flag: "🇬🇲", phoneCode: "+220", currency: "GMD", currencySymbol: "D",    xafRate: 0.097,  operators: ["QMoney", "Afrimoney"] },
  // ── Afrique australe / île ───────────────────────────────────────────
  { code: "mg", name: "Madagascar",         flag: "🇲🇬", phoneCode: "+261", currency: "MGA", currencySymbol: "Ar",   xafRate: 68,     operators: ["MVola", "Orange Money", "Airtel Money"] },
  { code: "mz", name: "Mozambique",         flag: "🇲🇿", phoneCode: "+258", currency: "MZN", currencySymbol: "MT",   xafRate: 0.099,  operators: ["M-Pesa", "Airtel Money"] },
  // ── International ─────────────────────────────────────────────────────
  { code: "ca", name: "Canada",              flag: "🇨🇦", phoneCode: "+1",   currency: "CAD", currencySymbol: "C$",   xafRate: 0.0021, operators: ["Interac"] },
  { code: "fr", name: "France",              flag: "🇫🇷", phoneCode: "+33",  currency: "EUR", currencySymbol: "€",    xafRate: 0.00152,operators: ["Virement SEPA", "Lydia"] },
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
  pending:   { label: "En attente", color: "#FF9800", bg: "rgba(255,152,0,0.12)" },
  confirmed: { label: "Confirmé",   color: "#4CAF50", bg: "rgba(76,175,80,0.12)" },
  rejected:  { label: "Rejeté",     color: "#FF6B6B", bg: "rgba(255,107,107,0.12)" },
};

function RechargeItem({ item, colors, userCountry }: { item: Recharge; colors: any; userCountry?: Country | null }) {
  const cfg = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
  const date = new Date(item.createdAt);
  return (
    <View style={[styles.rechargeItem, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={[styles.rechargeIconBox, { backgroundColor: "rgba(30,144,255,0.12)" }]}>
        <Feather name="arrow-down-circle" size={22} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rechargeMethod, { color: colors.text }]}>{item.method ?? "Dépôt"}</Text>
        <Text style={[styles.rechargeMeta, { color: colors.textMuted }]}>
          {date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
          {item.phone ? ` • ${item.phone}` : ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={styles.rechargeAmount}>
          +{userCountry && userCountry.xafRate !== 1
            ? formatCurrency(item.amount ?? 0, userCountry)
            : `${(item.amount ?? 0).toLocaleString("fr-FR")} FCFA`}
        </Text>
        <View style={[styles.rechargeBadge, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.rechargeBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>
    </View>
  );
}

const ACTIVITY_TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string; prefix: string }> = {
  depot:         { icon: "arrow-down-circle", color: "#11998e", bg: "rgba(17,153,142,0.12)", prefix: "+" },
  commande:      { icon: "shopping-cart",    color: "#1E90FF", bg: "rgba(30,144,255,0.12)", prefix: "-" },
  remboursement: { icon: "refresh-ccw",      color: "#4CAF50", bg: "rgba(76,175,80,0.12)",  prefix: "+" },
  annulation:    { icon: "x-circle",         color: "#FF5722", bg: "rgba(255,87,34,0.12)",  prefix: "" },
  transfert:     { icon: "arrow-right-circle",color: "#FFD700",bg: "rgba(255,215,0,0.12)",  prefix: "" },
  retrait:       { icon: "download",          color: "#9C27B0", bg: "rgba(156,39,176,0.12)", prefix: "-" },
  parrainage:    { icon: "gift",              color: "#FFD700", bg: "rgba(255,215,0,0.12)",  prefix: "+" },
};

const ACTIVITY_STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  confirmed:    { label: "Effectué",    color: "#4CAF50", bg: "rgba(76,175,80,0.15)" },
  completed:    { label: "Effectué",    color: "#4CAF50", bg: "rgba(76,175,80,0.15)" },
  success:      { label: "Effectué",    color: "#4CAF50", bg: "rgba(76,175,80,0.15)" },
  pending:      { label: "En attente",  color: "#FF9800", bg: "rgba(255,152,0,0.15)" },
  "En attente": { label: "En attente",  color: "#FF9800", bg: "rgba(255,152,0,0.15)" },
  rejected:     { label: "Rejeté",      color: "#FF6B6B", bg: "rgba(255,107,107,0.15)" },
  failed:       { label: "Échoué",      color: "#FF6B6B", bg: "rgba(255,107,107,0.15)" },
  annulée:      { label: "Annulé",      color: "#FF6B6B", bg: "rgba(255,107,107,0.15)" },
};

function getActivityStatusCfg(status: string) {
  return ACTIVITY_STATUS_LABEL[status] ?? { label: status ?? "—", color: "#9E9E9E", bg: "rgba(158,158,158,0.1)" };
}

function ActivityItem({ item, colors, userCountry }: { item: any; colors: any; userCountry?: Country | null }) {
  const cfg = ACTIVITY_TYPE_CONFIG[item.type] ?? { icon: "activity", color: colors.accent, bg: colors.accent + "18", prefix: "" };
  const scfg = getActivityStatusCfg(item.status ?? "");
  const date = new Date(item.createdAt ?? Date.now());
  const amount = Number(item.amount ?? 0);

  return (
    <View style={[styles.rechargeItem, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={[styles.rechargeIconBox, { backgroundColor: cfg.bg }]}>
        <Feather name={cfg.icon} size={20} color={cfg.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rechargeMethod, { color: colors.text }]} numberOfLines={1}>
          {item.label ?? item.type ?? "Transaction"}
        </Text>
        <Text style={[styles.rechargeMeta, { color: colors.textMuted }]}>
          {date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
          {" · "}
          {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        {amount > 0 && (
          <Text style={[styles.rechargeAmount, { color: cfg.color }]}>
            {cfg.prefix}{userCountry && userCountry.xafRate !== 1
            ? formatCurrency(amount, userCountry)
            : `${amount.toLocaleString("fr-FR")} FCFA`}
          </Text>
        )}
        <View style={[styles.rechargeBadge, { backgroundColor: scfg.bg }]}>
          <Text style={[styles.rechargeBadgeText, { color: scfg.color }]}>{scfg.label}</Text>
        </View>
      </View>
    </View>
  );
}

type PayMode = "cameroun" | "international" | "historique";

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const { recharges, isLoading } = useWallet();
  const { colors, isDark, toggleTheme } = useTheme();

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

  const [intlCountry, setIntlCountry] = useState<PayCountry>(INTL_COUNTRIES[0]);
  const [intlPhone, setIntlPhone] = useState("");
  const [intlAmount, setIntlAmount] = useState("");
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  // Transfer: Parrainage → Principal ou Retrait
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

  const handleTransfer = async () => {
    const referral = user?.referralBalance ?? 0;
    if (referral <= 0) {
      Alert.alert("Solde insuffisant", "Vous n'avez aucun solde parrainage à transférer.");
      return;
    }
    if (!transferTarget) {
      Alert.alert("Destination requise", "Choisissez vers quel solde transférer.");
      return;
    }
    setTransferring(true);
    try {
      const res = await apiClient.wallet.transfer(transferTarget);
      if (res.success) {
        await refreshUser();
        setShowTransferModal(false);
        setTransferTarget(null);
        Alert.alert(
          "✅ Transfert réussi !",
          `${referral.toLocaleString()} FCFA transférés vers votre solde ${transferTarget === "main" ? "principal" : "de retrait"}.`
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("Erreur", res.error ?? "Le transfert a échoué.");
      }
    } catch (e: any) {
      Alert.alert("Erreur connexion", e?.message ?? "Vérifiez votre connexion.");
    } finally {
      setTransferring(false);
    }
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
        setWdAmount("");
        setWdPhone("");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "✅ Retrait soumis",
          `Votre demande de retrait de ${amt.toLocaleString()} FCFA a été enregistrée.\n\nNotre équipe va traiter votre demande sous 24h ouvrables.`
        );
      } else {
        Alert.alert("Erreur", res.error ?? "Le retrait a échoué.");
      }
    } catch (e: any) {
      Alert.alert("Erreur connexion", e?.message ?? "Vérifiez votre connexion.");
    } finally {
      setWdSubmitting(false);
    }
  };

  const handleWithdraw = () => {
    const MIN = 1500;
    const amt = parseInt(wdAmount, 10);
    if (!amt || amt < MIN) {
      Alert.alert("Montant invalide", `Le retrait minimum est ${MIN.toLocaleString()} FCFA.`);
      return;
    }
    if (amt > withdrawal) {
      Alert.alert("Solde insuffisant", `Votre solde retrait est de ${withdrawal.toLocaleString()} FCFA.`);
      return;
    }
    if (!wdPhone.trim()) {
      Alert.alert("Numéro requis", "Entrez votre numéro de téléphone Mobile Money.");
      return;
    }

    const fee = amt < WITHDRAWAL_FEE_THRESHOLD ? WITHDRAWAL_FEE : 0;
    if (fee === 0) {
      doWithdraw(undefined);
      return;
    }

    const mainBal = user?.balance ?? 0;
    const canPayFromMain = mainBal >= fee;
    const canPayFromWithdrawal = withdrawal >= amt + fee;

    if (!canPayFromMain && !canPayFromWithdrawal) {
      Alert.alert(
        "Frais de retrait requis",
        `Des frais de ${fee} FCFA s'appliquent car votre retrait est inférieur à ${WITHDRAWAL_FEE_THRESHOLD.toLocaleString()} FCFA.\n\nVous n'avez pas suffisamment de fonds pour payer ces frais.\n\n• Solde principal : ${mainBal.toLocaleString()} FCFA\n• Solde retrait après retrait : ${(withdrawal - amt).toLocaleString()} FCFA\n\nVeuillez recharger votre solde ou augmenter le montant du retrait.`
      );
      return;
    }

    const buttons: any[] = [];
    if (canPayFromMain) {
      buttons.push({
        text: `💳 Solde principal (${mainBal.toLocaleString()} FCFA)`,
        onPress: () => doWithdraw("main"),
      });
    }
    if (canPayFromWithdrawal) {
      buttons.push({
        text: `🏦 Solde retrait (${(withdrawal - amt).toLocaleString()} FCFA restant)`,
        onPress: () => doWithdraw("withdrawal"),
      });
    }
    buttons.push({ text: "Annuler", style: "cancel" });

    Alert.alert(
      "💳 Frais de retrait : 455 FCFA",
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

  // Only show payment-related activities (not orders / cancellations / refunds)
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
      // Always merge rechargements from WalletContext to catch pending ones
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
    } finally {
      setLoadingActivities(false);
    }
  }, [recharges]);

  useEffect(() => {
    if (payMode === "historique") loadActivities();
  }, [payMode, loadActivities]);

  // Quick poll right after browser close (3 × 5s = 15s)
  // The server-side Fapshi poller handles payments that take longer (every 2 min, 24h)
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
        // success = newly credited OR already credited by webhook
        if (res.success && (res.data?.credited || (res as any).alreadyCredited)) {
          credited = true;
          await refreshUser();
          loadActivities();
          setIsPolling(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(
            "✅ Paiement confirmé !",
            `${(res.data?.credited ?? amount).toLocaleString()} FCFA ont été crédités sur votre solde.`
          );
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
        "⏳ Paiement en cours de traitement",
        "Votre paiement est en cours de validation par l'opérateur Mobile Money.\n\n" +
        "Notre serveur vérifie automatiquement toutes les 2 minutes et créditera votre solde dès confirmation — même si vous fermez l'application.\n\n" +
        "Vous recevrez une notification push dès que c'est fait. ✅",
        [{ text: "OK" }]
      );
    }
  };

  const handleFapshiPay = async () => {
    const amount = parseInt(fapshiAmount, 10);
    if (!amount || amount < 100) {
      Alert.alert("Montant invalide", "Le montant minimum est 100 FCFA.");
      return;
    }
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
        // Record pending in history immediately so user sees it
        try {
          const token = await getFreshToken();
          await fetch(`${BASE_URL}api/wallet/record-pending-recharge`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ transId: data.transId, amount, method: "Fapshi Mobile Money" }),
          });
          loadActivities();
        } catch {}

        // Open Fapshi checkout browser
        setSubmitting(false);
        await WebBrowser.openBrowserAsync(data.checkoutUrl);

        // Browser closed — start polling regardless of result type
        if (data.transId) {
          await confirmFapshiPayment(data.transId, amount);
        }
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

  const handleIntlPay = async () => {
    const amountLocal = parseInt(intlAmount, 10);
    const minLocal = getEquivalentLocal(500, intlCountry);
    if (!amountLocal || amountLocal < minLocal) {
      Alert.alert("Montant invalide", `Le minimum est ${minLocal.toLocaleString()} ${intlCountry.currencySymbol}.`);
      return;
    }
    if (!intlPhone.trim()) {
      Alert.alert("Numéro requis", "Entrez votre numéro Mobile Money.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      const amountXAF = getEquivalentXAF(amountLocal, intlCountry);
      const res = await fetch(`${BASE_URL}api/create-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user?.email ?? `${user?.id}@sbh.local`,
          userId: user?.id ?? "",
          username: user?.name ?? user?.email?.split("@")[0] ?? "user",
          country: intlCountry.code.toUpperCase(),
          phone: intlPhone.trim(),
          amount: amountLocal,
          amountXAF,
          currency: intlCountry.currency,
        }),
      });
      const data = await res.json();
      if (data.success && data.checkoutUrl) {
        try {
          const token = await getFreshToken();
          await fetch(`${BASE_URL}api/wallet/record-pending-recharge`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              transId: data.transId ?? data.transactionId ?? "",
              amount: getEquivalentXAF(parseInt(intlAmount, 10), intlCountry),
              method: `Mobile Money ${intlCountry.name}`,
              phone: intlPhone.trim(),
            }),
          });
        } catch {}
        await WebBrowser.openBrowserAsync(data.checkoutUrl);
        await refreshUser();
        loadActivities();
        Alert.alert(
          "✅ Paiement initié",
          `Votre solde sera crédité automatiquement après confirmation de l'opérateur.\n\nSi votre solde n'est pas mis à jour dans 5 minutes, contactez le support.`,
          [{ text: "OK" }]
        );
        if (payMode === "historique") loadActivities();
      } else {
        Alert.alert("Erreur paiement", data.error ?? data.message ?? "Impossible d'initier le paiement.");
      }
    } catch (e: any) {
      Alert.alert("Erreur connexion", e?.message ?? "Vérifiez votre connexion.");
    } finally {
      setSubmitting(false);
    }
  };

  const balance = user?.balance ?? 0;
  const referral = user?.referralBalance ?? 0;
  // withdrawalBalance declared above with const withdrawal = ...

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StarBackground />

      {/* Polling overlay — shown while verifying Fapshi payment */}
      <Modal visible={isPolling} transparent animationType="fade">
        <View style={styles.pollingOverlay}>
          <View style={[styles.pollingCard, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="large" color="#11998e" />
            <Text style={[styles.pollingTitle, { color: colors.text }]}>
              Vérification du paiement
            </Text>
            <Text style={[styles.pollingDesc, { color: colors.textMuted }]}>
              En attente de confirmation par l'opérateur...
            </Text>
            <View style={[styles.pollingProgress, { backgroundColor: colors.inputBg }]}>
              <View
                style={[
                  styles.pollingBar,
                  {
                    width: `${Math.min((pollingAttempt / 8) * 100, 100)}%`,
                    backgroundColor: "#11998e",
                  },
                ]}
              />
            </View>
            <Text style={[styles.pollingAttemptText, { color: colors.textMuted }]}>
              Tentative {pollingAttempt}/8
            </Text>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <LinearGradient
        colors={["#11998e", "#38ef7d"]}
        style={[styles.header, { paddingTop: topPad + 12 }]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Mon Portefeuille</Text>
          <Text style={styles.headerSub}>Gérez votre solde</Text>
        </View>
        <Pressable onPress={toggleTheme} style={styles.themeBtn}>
          <Feather name={isDark ? "sun" : "moon"} size={18} color="#fff" />
        </Pressable>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Balance Cards Row - 3 cards */}
        <View style={styles.balanceRow}>
          <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: "#11998e40" }]}>
            <View style={styles.balanceCardIcon}>
              <Feather name="credit-card" size={18} color="#11998e" />
            </View>
            <Text style={[styles.balanceCardLabel, { color: colors.textMuted }]}>Principal</Text>
            <Text style={[styles.balanceCardValue, { color: colors.text }]}>
              {userCountry && userCountry.xafRate !== 1
                ? Math.round(balance * userCountry.xafRate).toLocaleString("fr-FR")
                : balance.toLocaleString("fr-FR")}
            </Text>
            <Text style={[styles.balanceCardCurrency, { color: "#11998e" }]}>
              {userCountry?.currencySymbol ?? "FCFA"}
            </Text>
          </View>
          <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: "#FFD70040" }]}>
            <View style={[styles.balanceCardIcon, { backgroundColor: "rgba(255,215,0,0.12)" }]}>
              <Feather name="gift" size={18} color="#FFD700" />
            </View>
            <Text style={[styles.balanceCardLabel, { color: colors.textMuted }]}>Parrainage</Text>
            <Text style={[styles.balanceCardValue, { color: colors.text }]}>
              {userCountry && userCountry.xafRate !== 1
                ? Math.round(referral * userCountry.xafRate).toLocaleString("fr-FR")
                : referral.toLocaleString("fr-FR")}
            </Text>
            <Text style={[styles.balanceCardCurrency, { color: "#FFD700" }]}>
              {userCountry?.currencySymbol ?? "FCFA"}
            </Text>
            <Pressable
              style={[{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4, backgroundColor: "#FFD70015", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }]}
              onPress={() => { setTransferTarget(null); setShowTransferModal(true); }}
            >
              <Feather name="arrow-right-circle" size={11} color="#FFD700" />
              <Text style={[{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#FFD700" }]}>Transférer</Text>
            </Pressable>
          </View>
          <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: "#9C27B040" }]}>
            <View style={[styles.balanceCardIcon, { backgroundColor: "rgba(156,39,176,0.12)" }]}>
              <Feather name="download-cloud" size={18} color="#9C27B0" />
            </View>
            <Text style={[styles.balanceCardLabel, { color: colors.textMuted }]}>Retrait</Text>
            <Text style={[styles.balanceCardValue, { color: colors.text }]}>
              {userCountry && userCountry.xafRate !== 1
                ? Math.round(withdrawal * userCountry.xafRate).toLocaleString("fr-FR")
                : withdrawal.toLocaleString("fr-FR")}
            </Text>
            <Text style={[styles.balanceCardCurrency, { color: "#9C27B0" }]}>
              {userCountry?.currencySymbol ?? "FCFA"}
            </Text>
            <Pressable
              style={[{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4, backgroundColor: "#9C27B015", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }]}
              onPress={() => { setWdAmount(""); setWdPhone(""); setShowWithdrawModal(true); }}
            >
              <Feather name="send" size={11} color="#9C27B0" />
              <Text style={[{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#9C27B0" }]}>Retirer</Text>
            </Pressable>
          </View>
        </View>

        {/* Mode tabs */}
        <View style={[styles.modeTabs, { backgroundColor: colors.card, borderColor: colors.cardBorder, flexDirection: "row" }]}>
          <Pressable
            style={[styles.modeTab, payMode === "cameroun" && { backgroundColor: "#11998e20", borderColor: "#11998e" }]}
            onPress={() => setPayMode("cameroun")}
          >
            <Text style={styles.modeTabFlag}>🇨🇲</Text>
            <View>
              <Text style={[styles.modeTabTitle, { color: payMode === "cameroun" ? "#11998e" : colors.text }]}>Cameroun</Text>
              <Text style={[styles.modeTabSub, { color: colors.textMuted }]}>MTN · Orange</Text>
            </View>
          </Pressable>

          <View style={[styles.modeTabDivider, { backgroundColor: colors.separator }]} />

          <Pressable
            style={[styles.modeTab, payMode === "international" && { backgroundColor: colors.accent + "18", borderColor: colors.accent }]}
            onPress={() => setPayMode("international")}
          >
            <Text style={styles.modeTabFlag}>🌍</Text>
            <View>
              <Text style={[styles.modeTabTitle, { color: payMode === "international" ? colors.accent : colors.text }]}>
                International
              </Text>
              <Text style={[styles.modeTabSub, { color: colors.textMuted }]}>Mobile Money</Text>
            </View>
          </Pressable>

          <View style={[styles.modeTabDivider, { backgroundColor: colors.separator }]} />

          <Pressable
            style={[styles.modeTab, payMode === "historique" && { backgroundColor: "#9C27B018", borderColor: "#9C27B0" }]}
            onPress={() => setPayMode("historique")}
          >
            <Text style={styles.modeTabFlag}>📋</Text>
            <View>
              <Text style={[styles.modeTabTitle, { color: payMode === "historique" ? "#9C27B0" : colors.text }]}>Historique</Text>
              <Text style={[styles.modeTabSub, { color: colors.textMuted }]}>Transactions</Text>
            </View>
          </Pressable>
        </View>

        {/* Fapshi Form */}
        {payMode === "cameroun" && (
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={[styles.formSection, { backgroundColor: colors.card, borderColor: "#11998e30" }]}>
              <View style={[styles.formHeader, { backgroundColor: "#11998e18", borderColor: "#11998e30" }]}>
                <View style={styles.formHeaderIcon}>
                  <Text style={{ fontSize: 22 }}>📱</Text>
                </View>
                <View>
                  <Text style={[styles.formTitle, { color: colors.text }]}>Dépôt Mobile Money</Text>
                  <Text style={[styles.formSub, { color: colors.textMuted }]}>MTN MoMo · Orange Money</Text>
                </View>
              </View>

              <View style={styles.amountSection}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Montant (FCFA)</Text>
                <View style={styles.presetsWrap}>
                  {AMOUNTS_FCFA.map((a) => {
                    const isActive = fapshiAmount === String(a);
                    return (
                      <Pressable
                        key={a}
                        style={[
                          styles.presetChip,
                          { backgroundColor: isActive ? "#11998e" : colors.inputBg, borderColor: isActive ? "#11998e" : colors.inputBorder },
                        ]}
                        onPress={() => { setFapshiAmount(String(a)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      >
                        <Text style={[styles.presetChipText, { color: isActive ? "#fff" : colors.text }]}>
                          {a.toLocaleString()}
                        </Text>
                        <Text style={[styles.presetChipSub, { color: isActive ? "rgba(255,255,255,0.75)" : colors.textMuted }]}>
                          FCFA
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={[styles.customInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                  <Feather name="edit-3" size={16} color={colors.textMuted} />
                  <TextInput
                    style={[styles.customInputText, { color: colors.text }]}
                    placeholder="Montant personnalisé..."
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    value={fapshiAmount}
                    onChangeText={setFapshiAmount}
                  />
                  <Text style={[styles.customInputSuffix, { color: colors.textMuted }]}>FCFA</Text>
                </View>
              </View>

              <View style={[styles.secureRow, { backgroundColor: "rgba(76,175,80,0.08)", borderColor: "rgba(76,175,80,0.2)" }]}>
                <Feather name="shield" size={16} color="#4CAF50" />
                <Text style={[styles.secureText, { color: "#4CAF50" }]}>
                  Paiement sécurisé · Crédit instantané après confirmation opérateur
                </Text>
              </View>

              <Pressable
                style={({ pressed }) => [styles.payBtn, pressed && { opacity: 0.85 }, submitting && { opacity: 0.65 }]}
                onPress={handleFapshiPay}
                disabled={submitting}
              >
                <LinearGradient colors={["#11998e", "#38ef7d"]} style={styles.payBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Feather name="smartphone" size={20} color="#fff" />
                  )}
                  <Text style={styles.payBtnText}>{submitting ? "Traitement..." : "Payer maintenant"}</Text>
                </LinearGradient>
              </Pressable>

              <View style={styles.methodsRow}>
                {intlCountry.operators.map((op, idx) => (
                  <View key={op} style={[styles.methodChip, { backgroundColor: colors.inputBg, borderColor: colors.accent + "40" }]}>
                    <Feather name="smartphone" size={12} color={colors.accent} />
                    <Text style={[styles.methodChipName, { color: colors.text, fontSize: 12 }]}>{op}</Text>
                  </View>
                ))}
              </View>
            </View>
          </KeyboardAvoidingView>
        )}

        {/* International Form */}
        {payMode === "international" && (
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={[styles.formSection, { backgroundColor: colors.card, borderColor: colors.accent + "30" }]}>
              <View style={[styles.formHeader, { backgroundColor: colors.accent + "12", borderColor: colors.accent + "25" }]}>
                <View style={[styles.formHeaderIcon, { backgroundColor: colors.accent + "20" }]}>
                  <Text style={{ fontSize: 22 }}>🌍</Text>
                </View>
                <View>
                  <Text style={[styles.formTitle, { color: colors.text }]}>Dépôt International</Text>
                  <Text style={[styles.formSub, { color: colors.textMuted }]}>Mobile Money · {INTL_COUNTRIES.length} pays</Text>
                </View>
              </View>

              {/* Country selector */}
              <View>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Pays</Text>
                <Pressable
                  style={[styles.countrySelectorBtn, { backgroundColor: colors.inputBg, borderColor: colors.accent }]}
                  onPress={() => { setShowCountryModal(true); setCountrySearch(""); }}
                >
                  <Text style={styles.countryFlag}>{intlCountry.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.countryName, { color: colors.text }]}>{intlCountry.name}</Text>
                    <Text style={[styles.countryCurrency, { color: colors.textMuted }]}>
                      {intlCountry.operators.join(" · ")}
                    </Text>
                  </View>
                  <Feather name="chevron-down" size={18} color={colors.accent} />
                </Pressable>
              </View>

              {/* Phone */}
              <View>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Numéro Mobile Money</Text>
                <View style={[styles.phoneInputRow, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                  <View style={[styles.phoneCode, { backgroundColor: colors.accent + "18" }]}>
                    <Text style={[styles.phoneCodeText, { color: colors.accent }]}>{intlCountry.phoneCode}</Text>
                  </View>
                  <TextInput
                    style={[styles.phoneInputText, { color: colors.text }]}
                    placeholder="6XX XXX XXX"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="phone-pad"
                    value={intlPhone}
                    onChangeText={setIntlPhone}
                  />
                </View>
              </View>

              {/* Amount */}
              <View>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  Montant ({intlCountry.currencySymbol})
                </Text>
                <View style={styles.presetsWrap}>
                  {amountPresets.map((p) => {
                    const isActive = intlAmount === String(p.local);
                    return (
                      <Pressable
                        key={p.xaf}
                        style={[
                          styles.presetChip,
                          { backgroundColor: isActive ? colors.accent : colors.inputBg, borderColor: isActive ? colors.accent : colors.inputBorder },
                        ]}
                        onPress={() => { setIntlAmount(String(p.local)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      >
                        <Text style={[styles.presetChipText, { color: isActive ? "#fff" : colors.text }]}>
                          {p.local.toLocaleString()}
                        </Text>
                        <Text style={[styles.presetChipSub, { color: isActive ? "rgba(255,255,255,0.75)" : colors.textMuted }]}>
                          {intlCountry.currencySymbol}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={[styles.customInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                  <Feather name="edit-3" size={16} color={colors.textMuted} />
                  <TextInput
                    style={[styles.customInputText, { color: colors.text }]}
                    placeholder={`Montant en ${intlCountry.currencySymbol}`}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    value={intlAmount}
                    onChangeText={setIntlAmount}
                  />
                  <Text style={[styles.customInputSuffix, { color: colors.textMuted }]}>{intlCountry.currencySymbol}</Text>
                </View>

                {intlAmount && (
                  <View style={[styles.conversionRow, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder }]}>
                    <Feather name="refresh-cw" size={12} color={colors.accent} />
                    <Text style={[styles.conversionText, { color: colors.accent }]}>
                      ≈ {getEquivalentXAF(parseInt(intlAmount) || 0, intlCountry).toLocaleString("fr-FR")} FCFA
                    </Text>
                  </View>
                )}
              </View>

              <View style={[styles.secureRow, { backgroundColor: "rgba(30,144,255,0.08)", borderColor: "rgba(30,144,255,0.2)" }]}>
                <Feather name="shield" size={16} color={colors.accent} />
                <Text style={[styles.secureText, { color: colors.accent }]}>
                  Paiement sécurisé · Solde crédité automatiquement après confirmation
                </Text>
              </View>
              <View style={[styles.secureRow, { backgroundColor: "rgba(255,152,0,0.08)", borderColor: "rgba(255,152,0,0.2)" }]}>
                <Feather name="clock" size={15} color="#FF9800" />
                <Text style={[styles.secureText, { color: "#FF9800" }]}>
                  Délai de crédit : 5 à 30 minutes selon l'opérateur choisi
                </Text>
              </View>

              <Pressable
                style={({ pressed }) => [styles.payBtn, pressed && { opacity: 0.85 }, submitting && { opacity: 0.65 }]}
                onPress={handleIntlPay}
                disabled={submitting}
              >
                <LinearGradient colors={[colors.gradientStart, colors.accent]} style={styles.payBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Feather name="credit-card" size={20} color="#fff" />
                  )}
                  <Text style={styles.payBtnText}>{submitting ? "Traitement..." : "Procéder au paiement"}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        )}

        {/* Historique complet des activités */}
        {payMode === "historique" && (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={[styles.historyTitle, { color: colors.text }]}>Toutes les activités</Text>
              <Pressable onPress={loadActivities} style={{ padding: 6 }}>
                <Feather name="refresh-cw" size={16} color="#9C27B0" />
              </Pressable>
            </View>

            {loadingActivities ? (
              <ActivityIndicator size="small" color="#9C27B0" style={{ marginVertical: 20 }} />
            ) : activities.length === 0 ? (
              <View style={[styles.emptyHistory, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <Feather name="inbox" size={36} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>Aucune activité récente</Text>
                <Text style={[{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 6 }]}>
                  Vos dépôts, commandes et remboursements apparaîtront ici
                </Text>
              </View>
            ) : (
              activities.map((a, idx) => (
                <ActivityItem key={a.id ?? idx} item={a} colors={colors} userCountry={userCountry} />
              ))
            )}
          </View>
        )}

        {/* Recharges récentes (Cameroun / International mode) */}
        {payMode !== "historique" && (
          <View style={{ gap: 10 }}>
            <Text style={[styles.historyTitle, { color: colors.text }]}>Rechargements récents</Text>
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: 20 }} />
            ) : recharges.length === 0 ? (
              <View style={[styles.emptyHistory, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <Feather name="inbox" size={36} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>Aucun rechargement récent</Text>
              </View>
            ) : (
              recharges.slice(0, 8).map((r) => <RechargeItem key={r.id} item={r} colors={colors} userCountry={userCountry} />)
            )}
          </View>
        )}
      </ScrollView>

      {/* Transfer Modal: Parrainage → Principal ou Retrait */}
      <Modal visible={showTransferModal} animationType="slide" transparent onRequestClose={() => { setShowTransferModal(false); setTransferTarget(null); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.separator }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Transférer vos fonds</Text>
              <Pressable onPress={() => { setShowTransferModal(false); setTransferTarget(null); }} style={[styles.modalCloseBtn, { backgroundColor: colors.inputBg }]}>
                <Feather name="x" size={20} color={colors.text} />
              </Pressable>
            </View>
            <View style={{ padding: 20, gap: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFD70012", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#FFD70030" }}>
                <Feather name="gift" size={18} color="#FFD700" />
                <Text style={[{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text }]}>
                  Solde parrainage disponible :{" "}
                  <Text style={{ fontFamily: "Inter_700Bold", color: "#FFD700" }}>
                    {userCountry && userCountry.xafRate !== 1 ? formatCurrency(referral, userCountry) : `${referral.toLocaleString("fr-FR")} FCFA`}
                  </Text>
                </Text>
              </View>

              <Text style={[{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text }]}>
                Choisissez la destination
              </Text>

              {/* Option 1 : Solde Principal */}
              <Pressable
                style={[{
                  flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 14, borderWidth: 2,
                  backgroundColor: transferTarget === "main" ? "#1E90FF18" : colors.card,
                  borderColor: transferTarget === "main" ? "#1E90FF" : colors.cardBorder,
                }]}
                onPress={() => setTransferTarget("main")}
              >
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#1E90FF22", alignItems: "center", justifyContent: "center" }}>
                  <Feather name="credit-card" size={22} color="#1E90FF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[{ fontFamily: "Inter_700Bold", fontSize: 15, color: colors.text }]}>Solde Principal</Text>
                  <Text style={[{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textMuted }]}>Utilisez vos fonds pour passer des commandes</Text>
                </View>
                {transferTarget === "main" && <Feather name="check-circle" size={20} color="#1E90FF" />}
              </Pressable>

              {/* Option 2 : Solde de Retrait */}
              <Pressable
                style={[{
                  flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 14, borderWidth: 2,
                  backgroundColor: transferTarget === "withdrawal" ? "#FF9800" + "18" : colors.card,
                  borderColor: transferTarget === "withdrawal" ? "#FF9800" : colors.cardBorder,
                }]}
                onPress={() => setTransferTarget("withdrawal")}
              >
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#FF980022", alignItems: "center", justifyContent: "center" }}>
                  <Feather name="download-cloud" size={22} color="#FF9800" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[{ fontFamily: "Inter_700Bold", fontSize: 15, color: colors.text }]}>Solde de Retrait</Text>
                  <Text style={[{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textMuted }]}>Retirez vos gains en espèces</Text>
                </View>
                {transferTarget === "withdrawal" && <Feather name="check-circle" size={20} color="#FF9800" />}
              </Pressable>

              {/* Confirm button */}
              <Pressable
                style={[{
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12,
                  backgroundColor: transferTarget ? "#FFD700" : colors.inputBg,
                  opacity: (!transferTarget || transferring) ? 0.6 : 1,
                }]}
                onPress={handleTransfer}
                disabled={!transferTarget || transferring}
              >
                {transferring ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Feather name="arrow-right-circle" size={16} color={transferTarget ? "#000" : colors.textMuted} />
                )}
                <Text style={[{ fontFamily: "Inter_700Bold", fontSize: 14, color: transferTarget ? "#000" : colors.textMuted }]}>
                  {transferring ? "Transfert en cours..." : "Confirmer le transfert"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Withdrawal Modal */}
      <Modal visible={showWithdrawModal} animationType="slide" transparent onRequestClose={() => setShowWithdrawModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.separator }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Retrait Mobile Money</Text>
              <Pressable onPress={() => setShowWithdrawModal(false)} style={[styles.modalCloseBtn, { backgroundColor: colors.inputBg }]}>
                <Feather name="x" size={20} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#9C27B012", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#9C27B030" }}>
                <Feather name="download-cloud" size={18} color="#9C27B0" />
                <Text style={[{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text }]}>
                  Solde retrait : <Text style={{ fontFamily: "Inter_700Bold", color: "#9C27B0" }}>
                    {userCountry && userCountry.xafRate !== 1 ? formatCurrency(withdrawal, userCountry) : `${withdrawal.toLocaleString("fr-FR")} FCFA`}
                  </Text>
                  {"\n"}
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>Minimum : 1 500 FCFA</Text>
                </Text>
              </View>

              {/* Country picker */}
              <View>
                <Text style={[{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.textSecondary, marginBottom: 6 }]}>Pays de réception</Text>
                <Pressable
                  style={[{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, borderWidth: 1, padding: 12, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                  onPress={() => { setWdCountrySearch(""); setShowWdCountryModal(true); }}
                >
                  <Text style={{ fontSize: 22 }}>{wdCountry.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text }]}>{wdCountry.name}</Text>
                    <Text style={[{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textMuted }]}>
                      {wdCountry.phoneCode} · {wdCountry.operators.join(" • ")}
                    </Text>
                  </View>
                  <Feather name="chevron-down" size={16} color={colors.textMuted} />
                </Pressable>
              </View>

              {/* Method selector (based on country operators) */}
              <View>
                <Text style={[{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.textSecondary, marginBottom: 8 }]}>Opérateur Mobile Money</Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {wdCountry.operators.map((op) => (
                    <Pressable
                      key={op}
                      style={[{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
                        backgroundColor: wdMethod === op ? "#9C27B018" : colors.inputBg,
                        borderColor: wdMethod === op ? "#9C27B0" : colors.inputBorder,
                      }]}
                      onPress={() => setWdMethod(op)}
                    >
                      <Text style={[{ fontFamily: "Inter_500Medium", fontSize: 13, color: wdMethod === op ? "#9C27B0" : colors.text }]}>{op}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Phone number */}
              <View>
                <Text style={[{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.textSecondary, marginBottom: 6 }]}>
                  Numéro Mobile Money ({wdCountry.phoneCode})
                </Text>
                <View style={[{ flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, padding: 12, backgroundColor: colors.inputBg, borderColor: colors.inputBorder, gap: 8 }]}>
                  <Text style={[{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#9C27B0" }]}>{wdCountry.phoneCode}</Text>
                  <View style={{ width: 1, height: 20, backgroundColor: colors.separator }} />
                  <TextInput
                    style={[{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text }]}
                    placeholder="6XX XXX XXX"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="phone-pad"
                    value={wdPhone}
                    onChangeText={setWdPhone}
                  />
                </View>
              </View>

              {/* Amount */}
              <View>
                <Text style={[{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.textSecondary, marginBottom: 6 }]}>Montant à retirer (FCFA)</Text>
                <View style={[{ flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, padding: 12, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                  <TextInput
                    style={[{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text }]}
                    placeholder="Minimum 1 500 FCFA"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    value={wdAmount}
                    onChangeText={setWdAmount}
                  />
                  <Text style={[{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.textMuted }]}>FCFA</Text>
                </View>
              </View>

              {/* Fee banner */}
              {(() => {
                const parsedAmt = parseInt(wdAmount, 10);
                if (!parsedAmt || parsedAmt <= 0) return null;
                if (parsedAmt >= WITHDRAWAL_FEE_THRESHOLD) return (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#4CAF5018", borderRadius: 10, padding: 10 }}>
                    <Feather name="check-circle" size={15} color="#4CAF50" />
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#4CAF50", flex: 1 }}>
                      Aucun frais — retraits ≥ 10 000 FCFA sont gratuits.
                    </Text>
                  </View>
                );
                return (
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#FF980018", borderRadius: 10, padding: 10 }}>
                    <Feather name="alert-circle" size={15} color="#FF9800" style={{ marginTop: 1 }} />
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#FF9800", flex: 1 }}>
                      <Text style={{ fontFamily: "Inter_700Bold" }}>Frais de 455 FCFA</Text> s'appliquent aux retraits inférieurs à 10 000 FCFA. Vous choisirez le solde à débiter lors de la confirmation.
                    </Text>
                  </View>
                );
              })()}

              <Pressable
                style={[{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12, backgroundColor: "#9C27B0", opacity: wdSubmitting ? 0.65 : 1 }]}
                onPress={handleWithdraw}
                disabled={wdSubmitting}
              >
                {wdSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="send" size={16} color="#fff" />
                )}
                <Text style={[{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" }]}>
                  {wdSubmitting ? "Traitement..." : "Soumettre le retrait"}
                </Text>
              </Pressable>
              <Text style={[{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textMuted, textAlign: "center" }]}>
                Traitement sous 24h ouvrables. L'administrateur sera notifié automatiquement.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Withdrawal Country Picker Modal */}
      <Modal visible={showWdCountryModal} animationType="slide" transparent onRequestClose={() => setShowWdCountryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.separator }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Pays de retrait</Text>
              <Pressable onPress={() => setShowWdCountryModal(false)} style={[styles.modalCloseBtn, { backgroundColor: colors.inputBg }]}>
                <Feather name="x" size={20} color={colors.text} />
              </Pressable>
            </View>
            <View style={[styles.searchBar, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
              <Feather name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Rechercher un pays..."
                placeholderTextColor={colors.textMuted}
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
                    style={[styles.countryOption, { backgroundColor: isSelected ? "#9C27B018" : colors.card, borderColor: isSelected ? "#9C27B0" : colors.cardBorder }]}
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
                      <Text style={[styles.countryOptionName, { color: colors.text }]}>{item.name}</Text>
                      <Text style={[styles.countryOptionCurrency, { color: colors.textMuted }]}>
                        {item.phoneCode} · {item.operators.join(" • ")}
                      </Text>
                    </View>
                    {isSelected && <Feather name="check-circle" size={18} color="#9C27B0" />}
                  </Pressable>
                );
              }}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>

      {/* Country Picker Modal */}
      <Modal
        visible={showCountryModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCountryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Choisir un pays</Text>
              <Pressable onPress={() => setShowCountryModal(false)} style={[styles.modalCloseBtn, { backgroundColor: colors.inputBg }]}>
                <Feather name="x" size={20} color={colors.text} />
              </Pressable>
            </View>

            <View style={[styles.searchBar, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
              <Feather name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Rechercher un pays..."
                placeholderTextColor={colors.textMuted}
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
                    style={[
                      styles.countryOption,
                      {
                        backgroundColor: isSelected ? colors.accent + "18" : colors.card,
                        borderColor: isSelected ? colors.accent : colors.cardBorder,
                      },
                    ]}
                    onPress={() => {
                      setIntlCountry(item);
                      setIntlAmount("");
                      setShowCountryModal(false);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={styles.countryOptionFlag}>{item.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.countryOptionName, { color: colors.text }]}>{item.name}</Text>
                        <Text style={[styles.countryOptionCurrency, { color: colors.textMuted }]}>
                        {item.phoneCode} · {item.operators.join(" • ")}
                      </Text>
                    </View>
                    {isSelected && <Feather name="check-circle" size={18} color={colors.accent} />}
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 16, flexDirection: "row", alignItems: "flex-end" },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#fff" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  themeBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  content: { padding: 14, gap: 16 },
  balanceRow: { flexDirection: "row", gap: 12 },
  balanceCard: {
    flex: 1, borderRadius: 16, borderWidth: 1.5,
    padding: 16, gap: 4, alignItems: "flex-start",
  },
  balanceCardIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(17,153,142,0.15)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 6,
  },
  balanceCardLabel: { fontFamily: "Inter_400Regular", fontSize: 12 },
  balanceCardValue: { fontFamily: "Inter_700Bold", fontSize: 22 },
  balanceCardCurrency: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  modeTabs: {
    flexDirection: "row", borderRadius: 16, borderWidth: 1,
    padding: 6, gap: 0,
  },
  modeTab: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 10,
    padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: "transparent",
  },
  modeTabDivider: { width: 1, marginVertical: 6, marginHorizontal: 3 },
  modeTabFlag: { fontSize: 24 },
  modeTabTitle: { fontFamily: "Inter_700Bold", fontSize: 14 },
  modeTabSub: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 1 },
  formSection: { borderRadius: 18, borderWidth: 1.5, overflow: "hidden", gap: 0 },
  formHeader: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 16, borderBottomWidth: 1,
  },
  formHeaderIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(17,153,142,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  formTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  formSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  amountSection: { padding: 16, gap: 10 },
  fieldLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, marginBottom: 4, paddingHorizontal: 16 },
  presetsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16 },
  presetChip: {
    alignItems: "center", gap: 1,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1.5,
    minWidth: 72,
  },
  presetChipText: { fontFamily: "Inter_700Bold", fontSize: 14 },
  presetChipSub: { fontFamily: "Inter_400Regular", fontSize: 10 },
  customInput: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    marginHorizontal: 16,
  },
  customInputText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 15 },
  customInputSuffix: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  countrySelectorBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    marginHorizontal: 16,
  },
  countryFlag: { fontSize: 26 },
  countryName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  countryCurrency: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  phoneInputRow: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderRadius: 12,
    overflow: "hidden", marginHorizontal: 16,
  },
  phoneCode: { paddingHorizontal: 14, paddingVertical: 14 },
  phoneCodeText: { fontFamily: "Inter_700Bold", fontSize: 15 },
  phoneInputText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 15, paddingHorizontal: 12, paddingVertical: 14 },
  conversionRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 8, padding: 8, marginHorizontal: 16, borderWidth: 1,
  },
  conversionText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  secureRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 10, borderWidth: 1,
    padding: 10, marginHorizontal: 16,
  },
  secureText: { fontFamily: "Inter_400Regular", fontSize: 12, flex: 1, lineHeight: 18 },
  payBtn: { overflow: "hidden", borderRadius: 12, marginHorizontal: 16, marginVertical: 16 },
  payBtnGradient: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  payBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
  methodsRow: { flexDirection: "row", gap: 8, justifyContent: "center", paddingBottom: 16 },
  methodChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  methodChipName: { fontFamily: "Inter_700Bold", fontSize: 14 },
  methodChipSub: { fontFamily: "Inter_400Regular", fontSize: 11 },
  historyTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  rechargeItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 12, borderWidth: 1, padding: 12,
  },
  rechargeIconBox: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: "center", justifyContent: "center",
  },
  rechargeMethod: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  rechargeMeta: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  rechargeAmount: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#4CAF50" },
  rechargeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  rechargeBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  emptyHistory: { borderRadius: 12, borderWidth: 1, padding: 28, alignItems: "center", gap: 8 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%" },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)",
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
  modalCloseBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    margin: 16, marginTop: 12,
  },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 15 },
  countryOption: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 12, borderWidth: 1, padding: 12,
  },
  countryOptionFlag: { fontSize: 26 },
  countryOptionName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  countryOptionCurrency: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  // Polling overlay
  pollingOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  pollingCard: {
    width: "100%",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  pollingTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    textAlign: "center",
    marginTop: 4,
  },
  pollingDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  pollingProgress: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 8,
  },
  pollingBar: {
    height: "100%",
    borderRadius: 3,
  },
  pollingAttemptText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
});
