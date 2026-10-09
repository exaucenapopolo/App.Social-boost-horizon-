import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import StarBackground from "@/components/StarBackground";
import OtherServicesSection from "@/components/OtherServicesSection";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useOrders } from "@/context/OrdersContext";
import { LOGO_URL } from "@/lib/firebase";
import { COUNTRIES, formatCurrency } from "@/lib/countries";
import { apiClient } from "@/services/api";

const NOTIF_READ_KEY = "@sbh_notif_read";

// ═══════════════════════════════════════════════════════════════
//  CHARTE GRAPHIQUE OFFICIELLE
// ═══════════════════════════════════════════════════════════════
const NAVY        = "#0A1C3A";
const NAVY_LIGHT  = "#152E54";
const GOLD        = "#D4AF37";
const GOLD_SOFT   = "#C6A15B";
const GOLD_BG     = "rgba(212,175,55,0.10)";
const GOLD_BORDER = "rgba(212,175,55,0.32)";

// Mode clair (base chaude, plus douce pour les yeux)
const LIGHT_BG        = "#F7F5F0";
const LIGHT_SURFACE   = "#FFFFFF";
const LIGHT_TEXT      = "#1A202C";
const LIGHT_TEXT_2    = "#718096";
const LIGHT_BORDER    = "rgba(10,28,58,0.08)";
const LIGHT_ICON_BG   = "rgba(10,28,58,0.05)";
const LIGHT_ICON_BORD = "rgba(10,28,58,0.08)";

// Mode sombre
const DARK_BG         = "#0B132B";
const DARK_SURFACE    = "#1C2541";
const DARK_SURFACE_2  = "#232F52";
const DARK_TEXT       = "#F8F9FA";
const DARK_TEXT_2     = "#A0AEC0";
const DARK_BORDER     = "rgba(255,255,255,0.08)";
const DARK_ICON_BG    = "rgba(212,175,55,0.12)";
const DARK_ICON_BORD  = "rgba(212,175,55,0.26)";

// Status badges
const SUCCESS = "#10B981";
const WARNING = "#F59E0B";
const INFO    = "#3B82F6";
const DANGER  = "#EF4444";

function getGreeting(): string {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  if (day === 1) return "Bonne semaine";
  if (day === 5) return "Bon week-end en avance";
  if (day === 0 || day === 6) return "Bon week-end";
  if (hour >= 5 && hour < 12) return "Bonjour";
  if (hour >= 12 && hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  "En attente": { label: "En attente", color: WARNING, bg: "rgba(245,158,11,0.10)" },
  "en cours":   { label: "En cours",   color: INFO,    bg: "rgba(59,130,246,0.10)" },
  "succès":     { label: "Terminé",    color: SUCCESS, bg: "rgba(16,185,129,0.10)" },
  "annulée":    { label: "Annulé",     color: DANGER,  bg: "rgba(239,68,68,0.10)" },
  "pending":    { label: "En attente", color: WARNING, bg: "rgba(245,158,11,0.10)" },
  "processing": { label: "En cours",   color: INFO,    bg: "rgba(59,130,246,0.10)" },
  "completed":  { label: "Terminé",    color: SUCCESS, bg: "rgba(16,185,129,0.10)" },
};

// Animation d'entrée en cascade
function useStagger(count: number, step = 90, duration = 520) {
  const anims = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(
      step,
      anims.map((a) =>
        Animated.timing(a, {
          toValue: 1, duration, useNativeDriver: true, easing: Easing.out(Easing.cubic),
        })
      )
    ).start();
  }, []);
  return anims;
}

// Press spring réutilisable
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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const { orders, refreshOrders } = useOrders();
  const { isDark: ctxIsDark, toggleTheme } = useTheme();
  const isDark = ctxIsDark === true;

  // Palette theme-aware
  const C = useMemo(() => ({
    bg:           isDark ? DARK_BG        : LIGHT_BG,
    surface:      isDark ? DARK_SURFACE   : LIGHT_SURFACE,
    surface2:     isDark ? DARK_SURFACE_2 : LIGHT_SURFACE,
    border:       isDark ? DARK_BORDER    : LIGHT_BORDER,
    text:         isDark ? DARK_TEXT      : LIGHT_TEXT,
    textMuted:    isDark ? DARK_TEXT_2    : LIGHT_TEXT_2,
    iconBg:       isDark ? DARK_ICON_BG   : LIGHT_ICON_BG,
    iconBorder:   isDark ? DARK_ICON_BORD : LIGHT_ICON_BORD,
    accentIcon:   isDark ? GOLD           : NAVY,
  }), [isDark]);

  const topPad = Platform.OS === "web" ? insets.top + 64 : insets.top;
  const recentOrders = orders.slice(0, 3);
  const greeting = useMemo(getGreeting, []);

  const [hasUnread, setHasUnread] = useState(false);

  const anims = useStagger(5);
  const translateY = (v: Animated.Value) =>
    v.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  const balancePress = usePressSpring(0.98);
  const commanderPress = usePressSpring(0.98);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const [res, raw] = await Promise.all([
            apiClient.request<any[]>("/notifications"),
            AsyncStorage.getItem(NOTIF_READ_KEY),
          ]);
          if (cancelled) return;
          if (res.success && Array.isArray(res.data) && res.data.length > 0) {
            const readIds = new Set<string>(raw ? JSON.parse(raw) : []);
            setHasUnread(res.data.some((n: any) => !readIds.has(n.id)));
          } else {
            setHasUnread(false);
          }
        } catch {
          setHasUnread(false);
        }
      })();
      return () => { cancelled = true; };
    }, [])
  );

  const userCountry = user?.country
    ? COUNTRIES.find((c) => c.code === user.country?.toLowerCase())
    : null;

  const balanceFormatted =
    userCountry && userCountry.xafRate !== 1
      ? formatCurrency(user?.balance ?? 0, userCountry)
      : `${(user?.balance ?? 0).toLocaleString("fr-FR")} FCFA`;

  const referralFormatted =
    userCountry && userCountry.xafRate !== 1
      ? formatCurrency(user?.referralBalance ?? 0, userCountry)
      : `${(user?.referralBalance ?? 0).toLocaleString("fr-FR")} FCFA`;

  const handleRefresh = async () => {
    await refreshUser();
    if (user?.id) await refreshOrders(user.id);
  };

  const go = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as any);
  };

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      {/* ✅ Fix barre de statut : texte sombre en clair, clair en nuit */}
      <StatusBar style={isDark ? "light" : "dark"} />

      <StarBackground dark={isDark} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topPad + 16, paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={handleRefresh} tintColor={GOLD} />
        }
      >
        {/* ═══ 1. HEADER ═══ */}
        <Animated.View style={{ opacity: anims[0], transform: [{ translateY: translateY(anims[0]) }] }}>
          <View style={styles.header}>
            <Pressable
              style={styles.userRow}
              onPress={() => go("/(tabs)/profile")}
              hitSlop={6}
            >
              <View
                style={[
                  styles.avatarBox,
                  { borderColor: C.border, backgroundColor: C.surface },
                ]}
              >
                {user?.photoURL ? (
                  <Image source={{ uri: user.photoURL }} style={styles.avatarImg} contentFit="cover" />
                ) : (
                  <Image source={{ uri: LOGO_URL }} style={styles.avatarImg} contentFit="contain" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.userName, { color: C.text }]} numberOfLines={1}>
                  {user?.name?.split(" ")[0] ?? "Utilisateur"}
                </Text>
                <Text style={[styles.userGreet, { color: C.textMuted }]} numberOfLines={1}>
                  {greeting}
                </Text>
              </View>
            </Pressable>

            <View style={styles.headerActions}>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); toggleTheme(); }}
                style={({ pressed }) => [
                  styles.iconBtn,
                  { backgroundColor: C.surface, borderColor: C.border },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Feather name={isDark ? "sun" : "moon"} size={18} color={isDark ? GOLD : NAVY} />
              </Pressable>
              <Pressable
                onPress={() => go("/(tabs)/notifications")}
                style={({ pressed }) => [
                  styles.iconBtn,
                  { backgroundColor: C.surface, borderColor: C.border },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Feather name="bell" size={18} color={C.text} />
                {hasUnread && <View style={styles.dot} />}
              </Pressable>
            </View>
          </View>
        </Animated.View>

        {/* ═══ 2. SOLDE ═══ */}
        <Animated.View style={{ opacity: anims[1], transform: [{ translateY: translateY(anims[1]) }] }}>
          <Animated.View style={{ transform: [{ scale: balancePress.scale }] }}>
            <Pressable
              onPress={() => go("/(tabs)/wallet")}
              onPressIn={balancePress.onPressIn}
              onPressOut={balancePress.onPressOut}
              style={[
                styles.balanceWrap,
                {
                  shadowColor: isDark ? "#000" : NAVY,
                  shadowOpacity: isDark ? 0.40 : 0.10,
                },
              ]}
            >
              <LinearGradient
                colors={isDark
                  ? ["#132C57", "#0A1C3A", "#071229"]
                  : ["#FFFFFF", "#FBF8F1"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.balanceGrad,
                  !isDark && { borderWidth: 1, borderColor: "rgba(212,175,55,0.22)" },
                ]}
              >
                {/* Fine ligne dorée en haut (accent premium en clair) */}
                {!isDark && <View style={styles.goldTopLine} />}

                <View style={styles.balanceTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.balanceLabel, { color: isDark ? "rgba(255,255,255,0.65)" : LIGHT_TEXT_2 }]}>
                      Solde disponible
                    </Text>
                    <Text style={[styles.balanceAmount, { color: isDark ? "#FFFFFF" : NAVY }]}>
                      {balanceFormatted}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.balanceLogoBox,
                      isDark && { backgroundColor: "#FFFFFF", borderColor: GOLD_BORDER },
                      !isDark && { backgroundColor: "#F7F5F0", borderColor: "rgba(10,28,58,0.08)" },
                    ]}
                  >
                    <Image source={{ uri: LOGO_URL }} style={styles.balanceLogo} contentFit="contain" />
                  </View>
                </View>

                <View
                  style={[
                    styles.balanceDivider,
                    { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(10,28,58,0.08)" },
                  ]}
                />

                <View style={styles.balanceBottomRow}>
                  <Pressable
                    style={styles.referralRow}
                    hitSlop={8}
                    onPress={() => { Haptics.selectionAsync(); router.push("/parrainage" as any); }}
                  >
                    <View
                      style={[
                        styles.referralIconBox,
                        isDark && { backgroundColor: GOLD_BG, borderColor: GOLD_BORDER },
                        !isDark && { backgroundColor: "rgba(212,175,55,0.12)", borderColor: "rgba(212,175,55,0.28)" },
                      ]}
                    >
                      <Feather name="gift" size={12} color={isDark ? GOLD : GOLD_SOFT} />
                    </View>
                    <View>
                      <Text
                        style={[
                          styles.referralLabel,
                          { color: isDark ? "rgba(255,255,255,0.55)" : LIGHT_TEXT_2 },
                        ]}
                      >
                        Parrainage
                      </Text>
                      <Text style={[styles.referralValue, { color: isDark ? GOLD : NAVY }]}>
                        {referralFormatted}
                      </Text>
                    </View>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.balanceCta,
                      isDark && { backgroundColor: "rgba(212,175,55,0.15)", borderColor: GOLD_BORDER },
                      !isDark && { backgroundColor: NAVY, borderColor: NAVY },
                      pressed && { opacity: 0.9 },
                    ]}
                    onPress={() => go("/(tabs)/wallet")}
                  >
                    <Text
                      style={[
                        styles.balanceCtaText,
                        { color: isDark ? GOLD : "#FFFFFF" },
                      ]}
                    >
                      Gérer
                    </Text>
                    <Feather name="chevron-right" size={15} color={isDark ? GOLD : "#FFFFFF"} />
                  </Pressable>
                </View>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </Animated.View>

        {/* ═══ 3. COMMANDER ═══ */}
        <Animated.View style={{ opacity: anims[2], transform: [{ translateY: translateY(anims[2]) }] }}>
          <Animated.View style={{ transform: [{ scale: commanderPress.scale }] }}>
            <Pressable
              onPress={() => go("/(tabs)/new-order")}
              onPressIn={() => { commanderPress.onPressIn(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
              onPressOut={commanderPress.onPressOut}
              style={[
                styles.commanderWrap,
                {
                  backgroundColor: C.surface,
                  borderColor: C.border,
                  shadowColor: isDark ? "#000" : NAVY,
                  shadowOpacity: isDark ? 0.30 : 0.06,
                },
              ]}
            >
              <View
                style={[
                  styles.commanderIconBox,
                  { backgroundColor: isDark ? GOLD_BG : NAVY },
                ]}
              >
                <Feather name="shopping-cart" size={22} color={isDark ? GOLD : "#FFFFFF"} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.commanderTitle, { color: C.text }]}>
                  Commander un boost
                </Text>
                <Text style={[styles.commanderSub, { color: C.textMuted }]}>
                  Boostez vos réseaux en quelques secondes
                </Text>
              </View>

              <View
                style={[
                  styles.commanderArrowBox,
                  {
                    backgroundColor: isDark ? GOLD_BG : LIGHT_ICON_BG,
                    borderColor: isDark ? GOLD_BORDER : LIGHT_ICON_BORD,
                  },
                ]}
              >
                <Feather name="chevron-right" size={20} color={C.accentIcon} />
              </View>
            </Pressable>
          </Animated.View>
        </Animated.View>

        {/* ═══ 4. SERVICES ═══ */}
        <Animated.View style={{ opacity: anims[3], transform: [{ translateY: translateY(anims[3]) }] }}>
          <OtherServicesSection />
        </Animated.View>

        {/* ═══ 5. ACTIVITÉ ═══ */}
        <Animated.View
          style={{
            opacity: anims[4],
            transform: [{ translateY: translateY(anims[4]) }],
            gap: 16,
          }}
        >
          <View style={styles.sectionHeaderRow}>
            <View style={styles.accentBar} />
            <Text style={[styles.sectionTitle, { color: C.text }]}>Activité</Text>
          </View>

          <View style={styles.statsRow}>
            {[
              { label: "Commandes",  value: user?.totalOrders ?? 0, icon: "shopping-bag" as const },
              {
                label: "Terminées",
                value: orders.filter(
                  (o) => o.status === "succès" || (o.status as string) === "completed"
                ).length,
                icon: "check-circle" as const,
              },
              {
                label: "En cours",
                value: orders.filter(
                  (o) => o.status === "en cours" || (o.status as string) === "processing"
                ).length,
                icon: "loader" as const,
              },
            ].map((s, i) => (
              <View
                key={i}
                style={[
                  styles.statCard,
                  { backgroundColor: C.surface, borderColor: C.border },
                ]}
              >
                <View style={[styles.statIcon, { backgroundColor: C.iconBg, borderColor: C.iconBorder }]}>
                  <Feather name={s.icon} size={16} color={C.accentIcon} />
                </View>
                <Text style={[styles.statValue, { color: C.text }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: C.textMuted }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {recentOrders.length > 0 && (
            <View style={{ gap: 12 }}>
              <View style={styles.sectionRow}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.accentBar} />
                  <Text style={[styles.sectionTitle, { color: C.text }]}>
                    Commandes récentes
                  </Text>
                </View>
                <Pressable onPress={() => go("/(tabs)/orders")} hitSlop={6}>
                  <Text style={[styles.seeAll, { color: C.accentIcon }]}>
                    Voir tout
                  </Text>
                </Pressable>
              </View>

              {recentOrders.map((order) => {
                const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG["En attente"];
                return (
                  <View
                    key={order.id}
                    style={[
                      styles.orderRow,
                      { backgroundColor: C.surface, borderColor: C.border },
                    ]}
                  >
                    <View style={[styles.orderIcon, { backgroundColor: cfg.bg }]}>
                      <Feather name="trending-up" size={16} color={cfg.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.orderName, { color: C.text }]} numberOfLines={1}>
                        {order.serviceName}
                      </Text>
                      <Text style={[styles.orderMeta, { color: C.textMuted }]}>
                        {new Date(order.createdAt).toLocaleDateString("fr-FR")} ·{" "}
                        {order.quantity} unités
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[styles.orderPrice, { color: C.accentIcon }]}>
                        {userCountry && userCountry.xafRate !== 1
                          ? formatCurrency(order.price, userCountry)
                          : `${order.price.toLocaleString("fr-FR")} FCFA`}
                      </Text>
                      <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
                        <Text style={[styles.badgeText, { color: cfg.color }]}>
                          {cfg.label}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 20, gap: 20 },

  /* ═══ Header ═══ */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  userRow: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  avatarBox: {
    width: 44, height: 44, borderRadius: 14,
    overflow: "hidden", borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  avatarImg: { width: "100%", height: "100%" },
  userName: {
    fontFamily: "Inter_600SemiBold", fontSize: 17,
    letterSpacing: -0.25,
  },
  userGreet: {
    fontFamily: "Inter_400Regular", fontSize: 12.5,
    marginTop: 2, letterSpacing: 0.1,
  },

  headerActions: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 13,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  dot: {
    position: "absolute", top: 9, right: 9,
    width: 8, height: 8, borderRadius: 4, backgroundColor: DANGER,
  },

  /* ═══ Solde ═══ */
  balanceWrap: {
    borderRadius: 22, overflow: "hidden",
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14, elevation: 5,
  },
  balanceGrad: { padding: 22, position: "relative", overflow: "hidden" },
  goldTopLine: {
    position: "absolute", top: 0, left: 22, right: 22,
    height: 2, backgroundColor: GOLD, opacity: 0.55,
    borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
  },
  balanceTopRow: {
    flexDirection: "row", alignItems: "flex-start",
    justifyContent: "space-between", gap: 12,
  },
  balanceLabel: {
    fontFamily: "Inter_500Medium", fontSize: 12,
    letterSpacing: 0.3, textTransform: "uppercase",
  },
  balanceAmount: {
    fontFamily: "Inter_700Bold", fontSize: 30,
    marginTop: 8, letterSpacing: -0.6,
  },
  balanceLogoBox: {
    width: 46, height: 46, borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    padding: 6,
  },
  balanceLogo: { width: "100%", height: "100%" },
  balanceDivider: {
    height: 1, marginVertical: 16,
  },
  balanceBottomRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", gap: 12,
  },
  referralRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  referralIconBox: {
    width: 30, height: 30, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  referralLabel: {
    fontFamily: "Inter_500Medium", fontSize: 10.5,
    letterSpacing: 0.3, textTransform: "uppercase",
  },
  referralValue: {
    fontFamily: "Inter_700Bold", fontSize: 14,
    marginTop: 2, letterSpacing: -0.1,
  },
  balanceCta: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 11,
    borderWidth: 1,
  },
  balanceCtaText: {
    fontFamily: "Inter_600SemiBold", fontSize: 12.5,
    letterSpacing: 0.2,
  },

  /* ═══ Commander ═══ */
  commanderWrap: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 18, borderWidth: 1,
    padding: 16, gap: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12, elevation: 3,
  },
  commanderIconBox: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  commanderTitle: {
    fontFamily: "Inter_600SemiBold", fontSize: 15.5,
    letterSpacing: -0.15,
  },
  commanderSub: {
    fontFamily: "Inter_400Regular", fontSize: 12.5,
    marginTop: 3, letterSpacing: 0.1,
  },
  commanderArrowBox: {
    width: 40, height: 40, borderRadius: 13,
    borderWidth: 1, alignItems: "center", justifyContent: "center",
  },

  /* ═══ Section headers ═══ */
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  accentBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: GOLD },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold", fontSize: 16,
    letterSpacing: -0.15,
  },
  sectionRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
  },
  seeAll: { fontFamily: "Inter_600SemiBold", fontSize: 13, letterSpacing: 0.1 },

  /* ═══ Stats ═══ */
  statsRow: { flexDirection: "row", gap: 12 },
  statCard: {
    flex: 1, alignItems: "center", gap: 8,
    borderRadius: 16, borderWidth: 1,
    paddingVertical: 18, paddingHorizontal: 8,
  },
  statIcon: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  statValue: {
    fontFamily: "Inter_700Bold", fontSize: 20,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontFamily: "Inter_400Regular", fontSize: 11.5,
    textAlign: "center", letterSpacing: 0.1,
  },

  /* ═══ Orders ═══ */
  orderRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 16, borderWidth: 1, padding: 16,
  },
  orderIcon: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  orderName: { fontFamily: "Inter_600SemiBold", fontSize: 14, letterSpacing: -0.1 },
  orderMeta: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3 },
  orderPrice: { fontFamily: "Inter_700Bold", fontSize: 13.5, letterSpacing: -0.1 },
  badge: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 5,
  },
  badgeText: {
    fontFamily: "Inter_600SemiBold", fontSize: 10,
    letterSpacing: 0.2,
  },
});