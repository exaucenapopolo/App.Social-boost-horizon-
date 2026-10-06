import Feather from "@expo/vector-icons/Feather";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import StarBackground from "@/components/StarBackground";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { COUNTRIES, formatCurrency } from "@/lib/countries";
import { apiClient } from "@/services/api";

const HOW_IT_WORKS = [
  {
    step: "1",
    icon: "share-2" as const,
    title: "Partagez votre lien",
    desc: "Envoyez votre lien de parrainage unique à vos amis par WhatsApp, Facebook, Telegram ou tout autre moyen.",
    color: "#1E90FF",
  },
  {
    step: "2",
    icon: "user-plus" as const,
    title: "Ils s'inscrivent",
    desc: "Quand vos amis s'inscrivent en utilisant votre lien ou code, ils deviennent automatiquement vos filleuls.",
    color: "#00C853",
  },
  {
    step: "3",
    icon: "dollar-sign" as const,
    title: "Gagnez 10% de bonus",
    desc: "Recevez 10% de bonus sur chaque recharge effectuée par vos filleuls ! Le bonus est crédité automatiquement sur votre solde parrainage.",
    color: "#FFD700",
  },
];

const REWARDS = [
  {
    icon: "users" as const,
    label: "Filleul actif",
    sublabel: "Chaque fois qu'un filleul recharge",
    reward: "10%",
    rewardLabel: "de commission",
    color: "#4CAF50",
    gradient: ["#4CAF50", "#2E7D32"] as [string, string],
  },
];

const TIPS = [
  { icon: "zap" as const, text: "Plus vous parrainez, plus vous gagnez sans limite !" },
  { icon: "gift" as const, text: "Le bonus est crédité instantanément après chaque recharge de vos filleuls." },
  { icon: "users" as const, text: "Il n'y a pas de limite au nombre de filleuls que vous pouvez inviter." },
  { icon: "shield" as const, text: "Votre solde parrainage est sécurisé et utilisable pour vos commandes." },
];

type Filleul = {
  id: string;
  name: string;
  photoURL?: string | null;
  country?: string | null;
  joinedAt?: string | null;
  totalOrders?: number;
  commissionEarned?: number;
};

export default function ParrainageScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();

  const userCountry = user?.country
    ? COUNTRIES.find((c) => c.code === user.country?.toLowerCase()) ?? null
    : null;
  const fmt = (amount: number) =>
    userCountry && userCountry.xafRate !== 1
      ? formatCurrency(amount, userCountry)
      : `${amount.toLocaleString("fr-FR")} FCFA`;

  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [filleuls, setFilleuls] = useState<Filleul[]>([]);
  const [loadingFilleuls, setLoadingFilleuls] = useState(false);
  const [filleulsLoaded, setFilleulsLoaded] = useState(false);

  const [parrainName, setParrainName] = useState<string | null>(null);
  const [parrainCode, setParrainCode] = useState<string | null>(null);
  const [parrainLoaded, setParrainLoaded] = useState(false);

  const topPad = Platform.OS === "web" ? insets.top + 64 : insets.top;
  const referralLink = `https://socialboosthorizon.com/register?ref=${user?.referralCode ?? ""}`;

  const loadParrain = useCallback(async () => {
    if (parrainLoaded) return;
    try {
      const res = await apiClient.request<{ name: string; code: string } | null>("/auth/parrain-info");
      if (res.success && res.data) {
        setParrainName(res.data.name);
        setParrainCode(res.data.code);
      }
    } catch { /* silent */ } finally {
      setParrainLoaded(true);
    }
  }, [parrainLoaded]);

  const loadFilleuls = useCallback(async () => {
    if (loadingFilleuls || filleulsLoaded) return;
    setLoadingFilleuls(true);
    try {
      const res = await apiClient.request<{
        referrals: Filleul[];
        count: number;
        totalEarned: number;
      }>("/referrals");
      if (res.success && res.data?.referrals) {
        setFilleuls(res.data.referrals);
      }
    } catch { /* silent */ } finally {
      setLoadingFilleuls(false);
      setFilleulsLoaded(true);
    }
  }, [loadingFilleuls, filleulsLoaded]);

  useEffect(() => {
    void loadParrain();
    void loadFilleuls();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(user?.referralCode ?? "");
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync(referralLink);
    setCopiedLink(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Share.share({
      message: `🚀 Rejoins Social Boost Horizon et boostez vos réseaux sociaux !\n\n✨ Utilise mon code de parrainage : ${user?.referralCode}\n\n🔗 Inscription : ${referralLink}\n\n💰 Tu bénéficieras d'avantages exclusifs et je gagne un bonus sur tes recharges !`,
      title: "Invitation Social Boost Horizon",
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StarBackground />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topPad + 10, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Pressable style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Programme de parrainage</Text>
          <Pressable style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={toggleTheme}>
            <Feather name={isDark ? "sun" : "moon"} size={18} color={colors.text} />
          </Pressable>
        </View>

        {/* Parrain section – shown if user was referred */}
        {parrainLoaded && parrainName && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: "#1E90FF30" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#1E90FF20", alignItems: "center", justifyContent: "center" }}>
                <Feather name="user-check" size={20} color="#1E90FF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textMuted }}>Vous avez été parrainé par</Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 17, color: "#1E90FF" }}>
                  {parrainName}
                </Text>
                {parrainCode && (
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textMuted }}>
                    Code : {parrainCode}
                  </Text>
                )}
              </View>
              <View style={{ alignItems: "center", gap: 4 }}>
                <Feather name="heart" size={18} color="#FF6B8A" />
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.textMuted }}>Filleul</Text>
              </View>
            </View>
            <View style={{ height: 1, backgroundColor: "#1E90FF20", marginTop: 10, marginBottom: 8 }} />
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textMuted }}>
              Chaque recharge que vous effectuez génère un bonus de{" "}
              <Text style={{ fontFamily: "Inter_700Bold", color: "#4CAF50" }}>10%</Text>
              {" "}pour votre parrain.
            </Text>
          </View>
        )}

        {/* Hero Banner */}
        <LinearGradient
          colors={["rgba(255,215,0,0.15)", "rgba(212,175,55,0.06)"]}
          style={[styles.heroBanner, { borderColor: "rgba(255,215,0,0.25)" }]}
        >
          <LinearGradient colors={["#D4AF37", "#FFD700"]} style={styles.heroIconGradient}>
            <Feather name="users" size={28} color="#fff" />
          </LinearGradient>
          <Text style={styles.heroTitle}>Parrainez et gagnez !</Text>
          <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
            Invitez vos amis et recevez{" "}
            <Text style={{ color: "#FFD700", fontFamily: "Inter_700Bold" }}>10% de bonus</Text>
            {" "}sur chacune de leurs recharges
          </Text>
        </LinearGradient>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={[styles.statIcon, { backgroundColor: "rgba(30,144,255,0.15)" }]}>
              <Feather name="users" size={18} color={colors.accent} />
            </View>
            <Text style={[styles.statValue, { color: colors.accent }]}>
              {filleuls.length > 0 ? filleuls.length : (user?.referralCount ?? 0)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Filleuls actifs</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: "#FFD70025" }]}>
            <View style={[styles.statIcon, { backgroundColor: "rgba(255,215,0,0.15)" }]}>
              <Feather name="dollar-sign" size={18} color="#FFD700" />
            </View>
            <Text style={[styles.statValue, { color: "#FFD700" }]}>
              {userCountry && userCountry.xafRate !== 1
                ? Math.round((user?.referralBalance ?? 0) * userCountry.xafRate).toLocaleString("fr-FR")
                : (user?.referralBalance ?? 0).toLocaleString("fr-FR")}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>
              {userCountry && userCountry.xafRate !== 1 ? `${userCountry.currencySymbol} gagnés` : "FCFA gagnés"}
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: "#4CAF5025" }]}>
            <View style={[styles.statIcon, { backgroundColor: "rgba(76,175,80,0.15)" }]}>
              <Feather name="percent" size={18} color="#4CAF50" />
            </View>
            <Text style={[styles.statValue, { color: "#4CAF50" }]}>10%</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Taux de bonus</Text>
          </View>
        </View>

        {/* Referral Code Card */}
        <View style={[styles.codeCard, { shadowColor: "#FFD700" }]}>
          <LinearGradient
            colors={isDark ? ["rgba(20,35,65,0.95)", "rgba(12,22,45,0.98)"] : ["rgba(255,248,220,0.95)", "rgba(255,235,180,0.98)"]}
            style={styles.codeCardGradient}
          >
            <View style={styles.goldTopBar} />
            <Text style={[styles.codeCardTitle, { color: colors.text }]}>
              Votre code de parrainage
            </Text>
            <View style={[styles.codeDashedBox, { borderColor: "#FFD700" }]}>
              <Text style={styles.codeValueSmall}>CODE UNIQUE</Text>
              <Text style={styles.codeValue}>{user?.referralCode ?? "—"}</Text>
            </View>
            <View style={styles.codeActions}>
              <Pressable
                style={[styles.codeActionBtn, { borderColor: copied ? "#4CAF5060" : "rgba(255,215,0,0.35)", backgroundColor: copied ? "rgba(76,175,80,0.1)" : "rgba(255,215,0,0.08)" }]}
                onPress={handleCopy}
              >
                <Feather name={copied ? "check" : "copy"} size={16} color={copied ? "#4CAF50" : "#FFD700"} />
                <Text style={[styles.codeActionText, { color: copied ? "#4CAF50" : "#FFD700" }]}>
                  {copied ? "Copié !" : "Copier le code"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.codeActionBtn, { borderColor: colors.accent + "60", backgroundColor: colors.accent + "10" }]}
                onPress={handleShare}
              >
                <Feather name="share-2" size={16} color={colors.accent} />
                <Text style={[styles.codeActionText, { color: colors.accent }]}>Partager</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </View>

        {/* Referral Link */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Lien de parrainage
          </Text>
          <View style={[styles.linkRow, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
            <Feather name="link" size={14} color={colors.accent} />
            <Text style={[styles.linkText, { color: colors.accent }]} numberOfLines={1}>{referralLink}</Text>
            <Pressable
              style={[styles.linkCopyBtn, { backgroundColor: copiedLink ? "#4CAF5015" : colors.accent + "15" }]}
              onPress={handleCopyLink}
            >
              <Feather name={copiedLink ? "check" : "copy"} size={14} color={copiedLink ? "#4CAF50" : colors.accent} />
            </Pressable>
          </View>
          <Text style={[styles.linkHint, { color: colors.textMuted }]}>
            Partagez ce lien sur WhatsApp, Facebook, Telegram ou par SMS pour inviter vos amis.
          </Text>
        </View>

        {/* 10% Bonus highlight */}
        <LinearGradient
          colors={["rgba(76,175,80,0.15)", "rgba(76,175,80,0.06)"]}
          style={[styles.bonusCard, { borderColor: "rgba(76,175,80,0.3)" }]}
        >
          <View style={styles.bonusIconRow}>
            <LinearGradient colors={["#4CAF50", "#2E7D32"]} style={styles.bonusIcon}>
              <Feather name="percent" size={24} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bonusTitle, { color: colors.text }]}>
                10% sur chaque recharge de vos filleuls
              </Text>
              <Text style={[styles.bonusSub, { color: colors.textSecondary }]}>
                Dès qu'un filleul recharge son compte, vous recevez automatiquement 10% du montant sur votre solde parrainage.
              </Text>
            </View>
          </View>
          <View style={[styles.bonusExample, { backgroundColor: colors.card + "aa", borderColor: "#4CAF5030" }]}>
            <Text style={[styles.bonusExampleLabel, { color: colors.textMuted }]}>Exemple :</Text>
            <Text style={[styles.bonusExampleText, { color: "#4CAF50" }]}>
              Filleul recharge 5 000 FCFA → Vous recevez <Text style={{ fontFamily: "Inter_700Bold" }}>500 FCFA</Text>
            </Text>
            <Text style={[styles.bonusExampleText, { color: "#4CAF50" }]}>
              Filleul recharge 10 000 FCFA → Vous recevez <Text style={{ fontFamily: "Inter_700Bold" }}>1 000 FCFA</Text>
            </Text>
          </View>
        </LinearGradient>

        {/* How it works */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Comment ça fonctionne
          </Text>
          {HOW_IT_WORKS.map((step, i) => (
            <View key={i} style={[styles.howRow, i < HOW_IT_WORKS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.separator, paddingBottom: 12 }]}>
              <LinearGradient
                colors={[step.color, step.color + "99"]}
                style={styles.stepCircle}
              >
                <Text style={styles.stepNum}>{step.step}</Text>
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={[styles.stepTitle, { color: colors.text }]}>{step.title}</Text>
                <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>{step.desc}</Text>
              </View>
              <View style={[styles.stepIconBox, { backgroundColor: step.color + "18" }]}>
                <Feather name={step.icon} size={18} color={step.color} />
              </View>
            </View>
          ))}
        </View>

        {/* Tips */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Bon à savoir
          </Text>
          {TIPS.map((tip, i) => (
            <View key={i} style={[styles.tipRow, { borderColor: colors.separator }]}>
              <View style={[styles.tipIcon, { backgroundColor: colors.accent + "18" }]}>
                <Feather name={tip.icon} size={14} color={colors.accent} />
              </View>
              <Text style={[styles.tipText, { color: colors.textSecondary }]}>{tip.text}</Text>
            </View>
          ))}
        </View>

        {/* Mes filleuls */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Mes filleuls ({filleuls.length})
            </Text>
            {loadingFilleuls && <ActivityIndicator size="small" color={colors.accent} />}
          </View>
          {!filleulsLoaded && !loadingFilleuls && (
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textMuted }}>
              Chargement...
            </Text>
          )}
          {filleulsLoaded && filleuls.length === 0 && (
            <View style={{ alignItems: "center", paddingVertical: 16, gap: 8 }}>
              <Feather name="users" size={32} color={colors.textMuted} />
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textMuted, textAlign: "center" }}>
                Aucun filleul pour l'instant.{"\n"}Partagez votre code pour commencer à gagner !
              </Text>
            </View>
          )}
          {filleuls.map((f, i) => (
            <View
              key={f.id}
              style={[
                styles.filleulRow,
                { borderColor: colors.separator },
                i > 0 && { borderTopWidth: 1, paddingTop: 10 },
              ]}
            >
              <View style={[styles.filleulAvatar, { backgroundColor: colors.accent + "20" }]}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colors.accent }}>
                  {(f.name ?? "?")[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text }}>{f.name}</Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {f.country && (
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textMuted }}>
                      🌍 {f.country}
                    </Text>
                  )}
                  {f.joinedAt && (
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textMuted }}>
                      Inscrit le {new Date(f.joinedAt).toLocaleDateString("fr-FR")}
                    </Text>
                  )}
                </View>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                {(f.commissionEarned ?? 0) > 0 ? (
                  <View style={{ backgroundColor: "rgba(76,175,80,0.14)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#4CAF50" }}>
                      +{fmt(f.commissionEarned ?? 0)}
                    </Text>
                  </View>
                ) : (
                  <View style={{ backgroundColor: "rgba(158,158,158,0.1)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textMuted }}>
                      En attente
                    </Text>
                  </View>
                )}
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colors.textMuted }}>
                  commissions gagnées
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Share CTA */}
        <Pressable
          style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.85 }]}
          onPress={handleShare}
        >
          <LinearGradient
            colors={["#D4AF37", "#FFD700", "#FFC107"]}
            style={styles.shareBtnGradient}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          >
            <Feather name="share-2" size={20} color="#000" />
            <Text style={styles.shareBtnText}>Inviter mes amis maintenant</Text>
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 17 },

  heroBanner: { borderRadius: 18, borderWidth: 1, padding: 24, alignItems: "center", gap: 10 },
  heroIconGradient: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFD700", textAlign: "center" },
  heroSub: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", lineHeight: 22 },

  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, alignItems: "center", gap: 6, borderRadius: 14, borderWidth: 1, padding: 12 },
  statIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 18 },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 10, textAlign: "center" },

  codeCard: {
    borderRadius: 18, overflow: "hidden",
    borderWidth: 1.5, borderColor: "rgba(255,215,0,0.4)",
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 14,
  },
  codeCardGradient: { padding: 20, alignItems: "center", gap: 14 },
  goldTopBar: { position: "absolute", top: 0, left: 0, right: 0, height: 3, backgroundColor: "#FFD700" },
  codeCardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  codeDashedBox: {
    borderWidth: 1.5, borderStyle: "dashed", borderRadius: 12,
    padding: 16, alignItems: "center", width: "100%",
    backgroundColor: "rgba(255,215,0,0.04)",
  },
  codeValueSmall: { fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,215,0,0.5)", letterSpacing: 2, marginBottom: 4 },
  codeValue: { fontFamily: "Inter_700Bold", fontSize: 28, color: "#FFD700", letterSpacing: 4 },
  codeActions: { flexDirection: "row", gap: 10, width: "100%" },
  codeActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderRadius: 10, paddingVertical: 10 },
  codeActionText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 15, marginBottom: 2 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  linkText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12 },
  linkCopyBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  linkHint: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },

  bonusCard: { borderRadius: 16, borderWidth: 1.5, padding: 16, gap: 12 },
  bonusIconRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  bonusIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  bonusTitle: { fontFamily: "Inter_700Bold", fontSize: 15, lineHeight: 22, marginBottom: 4 },
  bonusSub: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  bonusExample: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 6 },
  bonusExampleLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, marginBottom: 4 },
  bonusExampleText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20 },

  howRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingTop: 4 },
  stepCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  stepNum: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
  stepTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginBottom: 4 },
  stepDesc: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  stepIconBox: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", flexShrink: 0 },

  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  tipIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  tipText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, paddingTop: 4 },

  shareBtn: { borderRadius: 14, overflow: "hidden", marginBottom: 8 },
  shareBtnGradient: { height: 58, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  shareBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#000" },

  filleulRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  filleulAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", flexShrink: 0 },
});
