import Feather from "@expo/vector-icons/Feather";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
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

const HOW_IT_WORKS = [
  { step: "1", icon: "share-2" as const, title: "Partagez votre lien", desc: "Envoyez votre lien de parrainage unique à vos amis par WhatsApp, Facebook, Telegram ou tout autre moyen.", color: INFO },
  { step: "2", icon: "user-plus" as const, title: "Ils s'inscrivent", desc: "Quand vos amis s'inscrivent en utilisant votre lien ou code, ils deviennent automatiquement vos filleuls.", color: SUCCESS },
  { step: "3", icon: "dollar-sign" as const, title: "Gagnez 10% de bonus", desc: "Recevez 10% de bonus sur chaque recharge effectuée par vos filleuls ! Crédité automatiquement sur votre solde parrainage.", color: GOLD },
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

// Empty state for filleuls
function EmptyFilleuls({ C, isDark }: any) {
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 2200, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(float, { toValue: 0, duration: 2200, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

  return (
    <View style={{ alignItems: "center", paddingVertical: 24, gap: 12 }}>
      <Animated.View style={{ width: 100, height: 100, alignItems: "center", justifyContent: "center", transform: [{ translateY }] }}>
        <View style={{
          position: "absolute", width: 90, height: 90, borderRadius: 45,
          borderWidth: 1, borderColor: C.iconBorder, opacity: 0.6,
        }} />
        <View style={{
          width: 68, height: 68, borderRadius: 34,
          backgroundColor: C.iconBg, borderWidth: 1, borderColor: C.iconBorder,
          alignItems: "center", justifyContent: "center",
        }}>
          <Feather name="users" size={30} color={C.accentIcon} />
        </View>
        <View style={{ position: "absolute", top: 6, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: GOLD, opacity: 0.55 }} />
        <View style={{ position: "absolute", bottom: 12, left: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: INFO, opacity: 0.45 }} />
      </Animated.View>
      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.text, textAlign: "center" }}>
        Aucun filleul pour l'instant
      </Text>
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12.5, color: C.textMuted, textAlign: "center", lineHeight: 18, maxWidth: 260 }}>
        Partagez votre code de parrainage pour commencer à gagner 10% sur chaque recharge de vos amis.
      </Text>
    </View>
  );
}

export default function ParrainageScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isDark: ctxIsDark, toggleTheme } = useTheme();
  const isDark = ctxIsDark === true;

  const C = useMemo(() => ({
    bg:            isDark ? DARK_BG         : LIGHT_BG,
    surface:       isDark ? DARK_SURFACE    : LIGHT_SURFACE,
    border:        isDark ? DARK_BORDER     : LIGHT_BORDER,
    separator:     isDark ? DARK_BORDER     : LIGHT_BORDER,
    text:          isDark ? DARK_TEXT       : LIGHT_TEXT,
    textSecondary: isDark ? DARK_TEXT_2     : LIGHT_TEXT_2,
    textMuted:     isDark ? DARK_TEXT_2     : LIGHT_TEXT_2,
    inputBg:       isDark ? DARK_INPUT_BG   : LIGHT_INPUT_BG,
    inputBorder:   isDark ? DARK_BORDER     : LIGHT_BORDER,
    iconBg:        isDark ? DARK_ICON_BG    : LIGHT_ICON_BG,
    iconBorder:    isDark ? DARK_ICON_BORD  : LIGHT_ICON_BORD,
    accent:        isDark ? GOLD            : NAVY,
    accentIcon:    isDark ? GOLD            : NAVY,
  }), [isDark]);

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

  const entry0 = useEntry(60);
  const entry1 = useEntry(140);
  const entry2 = useEntry(220);
  const entry3 = useEntry(300);

  const loadParrain = useCallback(async () => {
    if (parrainLoaded) return;
    try {
      const res = await apiClient.request<{ name: string; code: string } | null>("/auth/parrain-info");
      if (res.success && res.data) {
        setParrainName(res.data.name);
        setParrainCode(res.data.code);
      }
    } catch {} finally {
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
    } catch {} finally {
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

  const goBack = () => {
    Haptics.selectionAsync();
    if (router.canGoBack?.()) router.back();
    else router.push("/(tabs)" as any);
  };

  const sharePress = usePressSpring(0.98);

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <StarBackground dark={isDark} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topPad + 10, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Pressable
            style={({ pressed }) => [
              styles.backBtn,
              {
                backgroundColor: C.surface,
                borderColor: C.border,
              },
              pressed && { opacity: 0.85 },
            ]}
            onPress={goBack}
          >
            <Feather name="chevron-left" size={20} color={isDark ? "#fff" : NAVY} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: C.text }]}>Parrainage</Text>
          <Pressable
            style={({ pressed }) => [
              styles.backBtn,
              { backgroundColor: C.surface, borderColor: C.border },
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => { Haptics.selectionAsync(); toggleTheme(); }}
          >
            <Feather name={isDark ? "sun" : "moon"} size={18} color={isDark ? GOLD : NAVY} />
          </Pressable>
        </View>

        {/* Parrain section */}
        {parrainLoaded && parrainName && (
          <Animated.View style={{ opacity: entry0, transform: [{ translateY: entry0.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
            <View style={[styles.card, { backgroundColor: C.surface, borderColor: INFO + "30" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: INFO + "20", alignItems: "center", justifyContent: "center" }}>
                  <Feather name="user-check" size={20} color={INFO} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: C.textMuted }}>Vous avez été parrainé par</Text>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 17, color: isDark ? GOLD : NAVY }}>{parrainName}</Text>
                  {parrainCode && (
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted }}>Code : {parrainCode}</Text>
                  )}
                </View>
                <View style={{ alignItems: "center", gap: 4 }}>
                  <Feather name="heart" size={18} color="#FF6B8A" />
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: C.textMuted }}>Filleul</Text>
                </View>
              </View>
              <View style={{ height: 1, backgroundColor: INFO + "20", marginTop: 10, marginBottom: 8 }} />
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: C.textMuted }}>
                Chaque recharge que vous effectuez génère un bonus de{" "}
                <Text style={{ fontFamily: "Inter_700Bold", color: SUCCESS }}>10%</Text>
                {" "}pour votre parrain.
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Hero */}
        <Animated.View style={{ opacity: entry0 }}>
          <LinearGradient
            colors={isDark
              ? ["rgba(212,175,55,0.15)", "rgba(212,175,55,0.05)"]
              : ["rgba(212,175,55,0.18)", "rgba(212,175,55,0.06)"]}
            style={[styles.heroBanner, { borderColor: "rgba(212,175,55,0.30)" }]}
          >
            <LinearGradient colors={[GOLD, GOLD_SOFT]} style={styles.heroIconGradient}>
              <Feather name="users" size={28} color="#fff" />
            </LinearGradient>
            <Text style={[styles.heroTitle, { color: isDark ? GOLD : NAVY }]}>Parrainez et gagnez !</Text>
            <Text style={[styles.heroSub, { color: C.textSecondary }]}>
              Invitez vos amis et recevez{" "}
              <Text style={{ color: isDark ? GOLD : NAVY, fontFamily: "Inter_700Bold" }}>10% de bonus</Text>
              {" "}sur chacune de leurs recharges
            </Text>
          </LinearGradient>
        </Animated.View>

        {/* Stats */}
        <Animated.View style={{ opacity: entry1, flexDirection: "row", gap: 10 }}>
          <View style={[styles.statCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={[styles.statIcon, { backgroundColor: C.iconBg, borderColor: C.iconBorder }]}>
              <Feather name="users" size={18} color={C.accentIcon} />
            </View>
            <Text style={[styles.statValue, { color: C.accentIcon }]}>
              {filleuls.length > 0 ? filleuls.length : (user?.referralCount ?? 0)}
            </Text>
            <Text style={[styles.statLabel, { color: C.textMuted }]}>Filleuls</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: C.surface, borderColor: "rgba(212,175,55,0.30)" }]}>
            <View style={[styles.statIcon, { backgroundColor: "rgba(212,175,55,0.15)" }]}>
              <Feather name="dollar-sign" size={18} color={GOLD} />
            </View>
            <Text style={[styles.statValue, { color: isDark ? GOLD : NAVY }]}>
              {userCountry && userCountry.xafRate !== 1
                ? Math.round((user?.referralBalance ?? 0) * userCountry.xafRate).toLocaleString("fr-FR")
                : (user?.referralBalance ?? 0).toLocaleString("fr-FR")}
            </Text>
            <Text style={[styles.statLabel, { color: C.textMuted }]}>
              {userCountry && userCountry.xafRate !== 1 ? `${userCountry.currencySymbol} gagnés` : "FCFA gagnés"}
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: C.surface, borderColor: SUCCESS + "30" }]}>
            <View style={[styles.statIcon, { backgroundColor: SUCCESS + "15" }]}>
              <Feather name="percent" size={18} color={SUCCESS} />
            </View>
            <Text style={[styles.statValue, { color: SUCCESS }]}>10%</Text>
            <Text style={[styles.statLabel, { color: C.textMuted }]}>Bonus</Text>
          </View>
        </Animated.View>

        {/* Code Card */}
        <Animated.View style={{
          opacity: entry1,
          transform: [{ translateY: entry1.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
        }}>
          <View style={[styles.codeCard, {
            shadowColor: isDark ? "#000" : NAVY,
            borderColor: "rgba(212,175,55,0.40)",
          }]}>
            <LinearGradient
              colors={isDark
                ? ["rgba(20,35,65,0.95)", "rgba(12,22,45,0.98)"]
                : ["rgba(255,248,220,0.95)", "rgba(255,235,180,0.98)"]}
              style={styles.codeCardGradient}
            >
              <View style={styles.goldTopBar} />
              <Text style={[styles.codeCardTitle, { color: C.text }]}>Votre code de parrainage</Text>
              <View style={[styles.codeDashedBox, {
                borderColor: isDark ? GOLD : GOLD_SOFT,
                backgroundColor: isDark ? "rgba(212,175,55,0.04)" : "rgba(212,175,55,0.06)",
              }]}>
                <Text style={[styles.codeValueSmall, { color: isDark ? "rgba(212,175,55,0.55)" : "rgba(10,28,58,0.45)" }]}>
                  CODE UNIQUE
                </Text>
                <Text style={[styles.codeValue, { color: isDark ? GOLD : NAVY }]}>
                  {user?.referralCode ?? "—"}
                </Text>
              </View>
              <View style={styles.codeActions}>
                <Pressable
                  style={[styles.codeActionBtn, {
                    borderColor: copied ? SUCCESS + "60" : "rgba(212,175,55,0.35)",
                    backgroundColor: copied ? SUCCESS + "15" : "rgba(212,175,55,0.08)",
                  }]}
                  onPress={handleCopy}
                >
                  <Feather name={copied ? "check" : "copy"} size={16} color={copied ? SUCCESS : (isDark ? GOLD : NAVY)} />
                  <Text style={[styles.codeActionText, { color: copied ? SUCCESS : (isDark ? GOLD : NAVY) }]}>
                    {copied ? "Copié !" : "Copier le code"}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.codeActionBtn, {
                    borderColor: C.accentIcon + "60",
                    backgroundColor: C.iconBg,
                  }]}
                  onPress={handleShare}
                >
                  <Feather name="share-2" size={16} color={C.accentIcon} />
                  <Text style={[styles.codeActionText, { color: C.accentIcon }]}>Partager</Text>
                </Pressable>
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Link */}
        <Animated.View style={{ opacity: entry2 }}>
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>Lien de parrainage</Text>
            <View style={[styles.linkRow, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
              <Feather name="link" size={14} color={C.accentIcon} />
              <Text style={[styles.linkText, { color: C.accentIcon }]} numberOfLines={1}>{referralLink}</Text>
              <Pressable
                style={[styles.linkCopyBtn, {
                  backgroundColor: copiedLink ? SUCCESS + "15" : C.iconBg,
                }]}
                onPress={handleCopyLink}
              >
                <Feather name={copiedLink ? "check" : "copy"} size={14} color={copiedLink ? SUCCESS : C.accentIcon} />
              </Pressable>
            </View>
            <Text style={[styles.linkHint, { color: C.textMuted }]}>
              Partagez ce lien sur WhatsApp, Facebook, Telegram ou par SMS pour inviter vos amis.
            </Text>
          </View>
        </Animated.View>

        {/* Bonus card */}
        <Animated.View style={{ opacity: entry2 }}>
          <LinearGradient
            colors={isDark
              ? ["rgba(16,185,129,0.12)", "rgba(16,185,129,0.04)"]
              : ["rgba(16,185,129,0.10)", "rgba(16,185,129,0.03)"]}
            style={[styles.bonusCard, { borderColor: SUCCESS + "40" }]}
          >
            <View style={styles.bonusIconRow}>
              <LinearGradient colors={[SUCCESS, "#059669"]} style={styles.bonusIcon}>
                <Feather name="percent" size={24} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={[styles.bonusTitle, { color: C.text }]}>
                  10% sur chaque recharge de vos filleuls
                </Text>
                <Text style={[styles.bonusSub, { color: C.textSecondary }]}>
                  Dès qu'un filleul recharge, vous recevez automatiquement 10% sur votre solde parrainage.
                </Text>
              </View>
            </View>
            <View style={[styles.bonusExample, {
              backgroundColor: isDark ? C.inputBg : "#FFFFFF",
              borderColor: SUCCESS + "30",
            }]}>
              <Text style={[styles.bonusExampleLabel, { color: C.textMuted }]}>Exemples :</Text>
              <Text style={[styles.bonusExampleText, { color: SUCCESS }]}>
                Filleul recharge 5 000 FCFA → Vous recevez <Text style={{ fontFamily: "Inter_700Bold" }}>500 FCFA</Text>
              </Text>
              <Text style={[styles.bonusExampleText, { color: SUCCESS }]}>
                Filleul recharge 10 000 FCFA → Vous recevez <Text style={{ fontFamily: "Inter_700Bold" }}>1 000 FCFA</Text>
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* How it works */}
        <Animated.View style={{ opacity: entry3 }}>
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>Comment ça fonctionne</Text>
            {HOW_IT_WORKS.map((step, i) => (
              <View
                key={i}
                style={[styles.howRow, i < HOW_IT_WORKS.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: C.border,
                  paddingBottom: 12,
                }]}
              >
                <LinearGradient colors={[step.color, step.color + "99"]} style={styles.stepCircle}>
                  <Text style={styles.stepNum}>{step.step}</Text>
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stepTitle, { color: C.text }]}>{step.title}</Text>
                  <Text style={[styles.stepDesc, { color: C.textSecondary }]}>{step.desc}</Text>
                </View>
                <View style={[styles.stepIconBox, { backgroundColor: step.color + "18" }]}>
                  <Feather name={step.icon} size={18} color={step.color} />
                </View>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Tips */}
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.cardTitle, { color: C.text }]}>Bon à savoir</Text>
          {TIPS.map((tip, i) => (
            <View key={i} style={[styles.tipRow, { borderColor: C.separator }]}>
              <View style={[styles.tipIcon, { backgroundColor: C.iconBg, borderColor: C.iconBorder }]}>
                <Feather name={tip.icon} size={14} color={C.accentIcon} />
              </View>
              <Text style={[styles.tipText, { color: C.textSecondary }]}>{tip.text}</Text>
            </View>
          ))}
        </View>

        {/* Mes filleuls */}
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[styles.cardTitle, { color: C.text }]}>
              Mes filleuls ({filleuls.length})
            </Text>
            {loadingFilleuls && <ActivityIndicator size="small" color={C.accentIcon} />}
          </View>
          {!filleulsLoaded && !loadingFilleuls && (
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: C.textMuted }}>
              Chargement...
            </Text>
          )}
          {filleulsLoaded && filleuls.length === 0 && <EmptyFilleuls C={C} isDark={isDark} />}
          {filleuls.map((f, i) => (
            <View
              key={f.id}
              style={[
                styles.filleulRow,
                { borderColor: C.border },
                i > 0 && { borderTopWidth: 1, paddingTop: 10 },
              ]}
            >
              <View style={[styles.filleulAvatar, { backgroundColor: C.iconBg, borderWidth: 1, borderColor: C.iconBorder }]}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: C.accentIcon }}>
                  {(f.name ?? "?")[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.text }}>{f.name}</Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {f.country && (
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted }}>
                      {f.country}
                    </Text>
                  )}
                  {f.joinedAt && (
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted }}>
                      Inscrit le {new Date(f.joinedAt).toLocaleDateString("fr-FR")}
                    </Text>
                  )}
                </View>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                {(f.commissionEarned ?? 0) > 0 ? (
                  <View style={{ backgroundColor: SUCCESS + "14", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: SUCCESS }}>
                      +{fmt(f.commissionEarned ?? 0)}
                    </Text>
                  </View>
                ) : (
                  <View style={{ backgroundColor: C.inputBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted }}>
                      En attente
                    </Text>
                  </View>
                )}
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: C.textMuted }}>
                  commissions
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Share CTA */}
        <Animated.View style={{ transform: [{ scale: sharePress.scale }] }}>
          <Pressable
            onPressIn={sharePress.onPressIn}
            onPressOut={sharePress.onPressOut}
            onPress={handleShare}
            style={styles.shareBtn}
          >
            <LinearGradient
              colors={[GOLD, GOLD_SOFT, "#FFC107"]}
              style={styles.shareBtnGradient}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              <Feather name="share-2" size={20} color={NAVY} />
              <Text style={styles.shareBtnText}>Inviter mes amis maintenant</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: {
    width: 40, height: 40, borderRadius: 13,
    borderWidth: 1, alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 17, letterSpacing: -0.2 },

  heroBanner: { borderRadius: 18, borderWidth: 1, padding: 24, alignItems: "center", gap: 10 },
  heroIconGradient: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontFamily: "Inter_700Bold", fontSize: 22, textAlign: "center", letterSpacing: -0.3 },
  heroSub: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", lineHeight: 22 },

  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, alignItems: "center", gap: 6, borderRadius: 14, borderWidth: 1, padding: 12 },
  statIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 18, letterSpacing: -0.2 },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 10, textAlign: "center" },

  codeCard: {
    borderRadius: 18, overflow: "hidden",
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.20, shadowRadius: 14, elevation: 4,
  },
  codeCardGradient: { padding: 20, alignItems: "center", gap: 14 },
  goldTopBar: { position: "absolute", top: 0, left: 0, right: 0, height: 3, backgroundColor: GOLD },
  codeCardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  codeDashedBox: {
    borderWidth: 1.5, borderStyle: "dashed", borderRadius: 12,
    padding: 16, alignItems: "center", width: "100%",
  },
  codeValueSmall: { fontFamily: "Inter_400Regular", fontSize: 10, letterSpacing: 2, marginBottom: 4 },
  codeValue: { fontFamily: "Inter_700Bold", fontSize: 28, letterSpacing: 4 },
  codeActions: { flexDirection: "row", gap: 10, width: "100%" },
  codeActionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, borderWidth: 1, borderRadius: 10, paddingVertical: 10,
  },
  codeActionText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 15, marginBottom: 2, letterSpacing: -0.1 },
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
  stepCircle: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  stepNum: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
  stepTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginBottom: 4 },
  stepDesc: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  stepIconBox: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },

  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  tipIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0, borderWidth: 1 },
  tipText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12.5, lineHeight: 18, paddingTop: 5 },

  shareBtn: { borderRadius: 14, overflow: "hidden", marginBottom: 8 },
  shareBtnGradient: { height: 58, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  shareBtnText: { fontFamily: "Inter_700Bold", fontSize: 15.5, color: NAVY, letterSpacing: 0.1 },

  filleulRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  filleulAvatar: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
});