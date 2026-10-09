import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, router } from "expo-router";
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

// ─── Palette LIGHT ───
const NAVY        = "#0F2A5C";
const NAVY_LIGHT  = "#1E3F7A";
const NAVY_DK     = "#0A1F44";
const GOLD        = "#C9A961";
const GOLD_DK     = "#B08D4A";
const GOLD_SOFT   = "#F7F1E1";
const GOLD_BORDER = "#E8DFC7";
const BG          = "#FAF9F6";
const SURFACE     = "#FFFFFF";
const TEXT        = "#0F172A";
const TEXT_MUTED  = "#64748B";
const TEXT_SOFT   = "#94A3B8";
const BORDER      = "#E8E4DA";
const SUCCESS     = "#10B981";
const WARNING     = "#F59E0B";
const INFO        = "#1E90FF";
const DANGER      = "#EF4444";

// ─── Palette DARK (surfaces plus claires pour vraie hiérarchie) ───
const D_BG         = "#0A162B";         // fond très sombre
const D_SURFACE    = "#152C57";         // surface nettement plus claire → contraste
const D_SURFACE_2  = "#1B3768";         // surface élevée (commander)
const D_BORDER     = "rgba(201,169,97,0.20)";  // bordure dorée bien visible
const D_BORDER_2   = "rgba(201,169,97,0.32)";
const D_TEXT       = "#F1F5F9";
const D_TEXT_MUTED = "#A5B4CB";
const D_TEXT_SOFT  = "#64748B";

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
  "en cours":   { label: "En cours",   color: INFO,    bg: "rgba(30,144,255,0.10)" },
  "succès":     { label: "Terminé",    color: SUCCESS, bg: "rgba(16,185,129,0.10)" },
  "annulée":    { label: "Annulé",     color: DANGER,  bg: "rgba(239,68,68,0.10)" },
  "pending":    { label: "En attente", color: WARNING, bg: "rgba(245,158,11,0.10)" },
  "processing": { label: "En cours",   color: INFO,    bg: "rgba(30,144,255,0.10)" },
  "completed":  { label: "Terminé",    color: SUCCESS, bg: "rgba(16,185,129,0.10)" },
};

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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const { orders, refreshOrders } = useOrders();
  const { isDark: ctxIsDark, toggleTheme } = useTheme();
  const isDark = ctxIsDark === true;

  const C = useMemo(() => ({
    bg:         isDark ? D_BG         : BG,
    surface:    isDark ? D_SURFACE    : SURFACE,
    surface2:   isDark ? D_SURFACE_2  : SURFACE,
    border:     isDark ? D_BORDER     : BORDER,
    border2:    isDark ? D_BORDER_2   : GOLD_BORDER,
    text:       isDark ? D_TEXT       : TEXT,
    textMuted:  isDark ? D_TEXT_MUTED : TEXT_MUTED,
    textSoft:   isDark ? D_TEXT_SOFT  : TEXT_SOFT,
    chipBg:     isDark ? "rgba(201,169,97,0.12)" : GOLD_SOFT,
    chipBorder: isDark ? "rgba(201,169,97,0.28)" : GOLD_BORDER,
  }), [isDark]);

  const topPad = Platform.OS === "web" ? insets.top + 64 : insets.top;
  const recentOrders = orders.slice(0, 3);
  const greeting = useMemo(getGreeting, []);

  const [hasUnread, setHasUnread] = useState(false);

  const anims = useStagger(5);
  const translateY = (v: Animated.Value) =>
    v.interpolate({ inputRange: [0, 1], outputRange: [22, 0] });

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
      <StarBackground dark={isDark} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topPad + 12, paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={handleRefresh} tintColor={GOLD} />
        }
      >
        {/* ═══ 1. HEADER ═══ */}
        <Animated.View style={{ opacity: anims[0], transform: [{ translateY: translateY(anims[0]) }] }}>
          <View style={styles.header}>
            <Pressable style={styles.userRow} onPress={() => go("/(tabs)/profile")}>
              <View style={[styles.avatarBox, { borderColor: C.border, backgroundColor: C.surface }]}>
                {user?.photoURL ? (
                  <Image source={{ uri: user.photoURL }} style={styles.avatarImg} contentFit="cover" />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: C.chipBg }]}>
                    <Text style={[styles.avatarLetter, { color: isDark ? GOLD : NAVY }]}>
                      {(user?.name ?? "U").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.greetSmall, { color: C.textMuted }]}>{greeting}</Text>
                <Text style={[styles.greetName, { color: C.text }]} numberOfLines={1}>
                  {user?.name?.split(" ")[0] ?? "Utilisateur"}
                </Text>
              </View>
            </Pressable>

            <View style={styles.headerActions}>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); toggleTheme(); }}
                style={[styles.iconBtn, { backgroundColor: C.surface, borderColor: C.border }]}
              >
                <Feather name={isDark ? "sun" : "moon"} size={17} color={isDark ? GOLD : NAVY} />
              </Pressable>
              <Pressable
                onPress={() => go("/(tabs)/notifications")}
                style={[styles.iconBtn, { backgroundColor: C.surface, borderColor: C.border }]}
              >
                <Feather name="bell" size={17} color={C.text} />
                {hasUnread && <View style={styles.dot} />}
              </Pressable>
            </View>
          </View>
        </Animated.View>

        {/* ═══ 2. SOLDE HERO (navy premium, identique dans les 2 modes) ═══ */}
        <Animated.View style={{ opacity: anims[1], transform: [{ translateY: translateY(anims[1]) }] }}>
          <Pressable
            onPress={() => go("/(tabs)/wallet")}
            onPressIn={() => Haptics.selectionAsync()}
            style={({ pressed }) => [styles.balanceWrap, pressed && { transform: [{ scale: 0.99 }] }]}
          >
            <LinearGradient
              colors={["#22478A", NAVY, NAVY_DK]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.balanceGrad}
            >
              <View style={styles.balanceAccent} />
              <View style={styles.balanceDecor} pointerEvents="none" />
              <View style={styles.balanceDecor2} pointerEvents="none" />

              <View style={styles.balanceTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.balanceKicker}>SOLDE DISPONIBLE</Text>
                  <Text style={styles.balanceAmount}>{balanceFormatted}</Text>
                  {userCountry && userCountry.xafRate !== 1 && (
                    <Text style={styles.balanceConvert}>
                      ≈ {(user?.balance ?? 0).toLocaleString("fr-FR")} FCFA
                    </Text>
                  )}
                </View>
                <View style={styles.balanceLogoBox}>
                  <Image
                    source={{ uri: LOGO_URL }}
                    style={styles.balanceLogo}
                    contentFit="contain"
                  />
                </View>
              </View>

              <View style={styles.balanceDivider} />

              <View style={styles.balanceBottomRow}>
                <Pressable
                  style={styles.referralRow}
                  hitSlop={8}
                  onPress={() => { Haptics.selectionAsync(); router.push("/parrainage" as any); }}
                >
                  <View style={styles.referralIconBox}>
                    <Feather name="gift" size={12} color={GOLD} />
                  </View>
                  <View>
                    <Text style={styles.referralLabel}>Parrainage</Text>
                    <Text style={styles.referralValue}>{referralFormatted}</Text>
                  </View>
                </Pressable>

                <View style={styles.balanceCta}>
                  <Text style={styles.balanceCtaText}>Gérer</Text>
                  <Feather name="chevron-right" size={14} color={GOLD} />
                </View>
              </View>
            </LinearGradient>
          </Pressable>
        </Animated.View>

        {/* ═══ 3. COMMANDER — HERO CTA (design "ticket" premium) ═══ */}
        <Animated.View style={{ opacity: anims[2], transform: [{ translateY: translateY(anims[2]) }] }}>
          <Pressable
            onPress={() => go("/(tabs)/new-order")}
            onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
            style={({ pressed }) => [
              styles.commanderWrap,
              {
                backgroundColor: C.surface2,
                borderColor: C.border2,
              },
              pressed && { transform: [{ scale: 0.985 }] },
            ]}
          >
            {/* Bande dorée gauche signature */}
            <View style={styles.commanderAccent} />

            {/* Décor discret en haut à droite */}
            <View
              style={[
                styles.commanderDecor,
                { backgroundColor: isDark ? "rgba(201,169,97,0.08)" : GOLD_SOFT },
              ]}
              pointerEvents="none"
            />

            {/* Badge haut */}
            <View
              style={[
                styles.commanderBadge,
                {
                  backgroundColor: isDark ? "rgba(201,169,97,0.14)" : GOLD_SOFT,
                  borderColor: C.border2,
                },
              ]}
            >
              <View style={styles.commanderBadgeDot} />
              <Text
                style={[
                  styles.commanderBadgeText,
                  { color: isDark ? GOLD : GOLD_DK },
                ]}
              >
                SERVICE PRINCIPAL
              </Text>
            </View>

            {/* Contenu principal */}
            <View style={styles.commanderMain}>
              <View
                style={[
                  styles.commanderIconBox,
                  { backgroundColor: isDark ? "#0F2A5C" : NAVY },
                ]}
              >
                <Feather name="shopping-cart" size={20} color={GOLD} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.commanderTitle, { color: isDark ? D_TEXT : NAVY }]}>
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
                    backgroundColor: isDark ? "rgba(201,169,97,0.14)" : NAVY,
                    borderColor: isDark ? "rgba(201,169,97,0.32)" : NAVY,
                  },
                ]}
              >
                <Feather
                  name="arrow-up-right"
                  size={18}
                  color={isDark ? GOLD : "#FFFFFF"}
                />
              </View>
            </View>
          </Pressable>
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
                <View style={[styles.statIcon, { backgroundColor: C.chipBg }]}>
                  <Feather name={s.icon} size={15} color={isDark ? GOLD : NAVY} />
                </View>
                <Text style={[styles.statValue, { color: C.text }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: C.textMuted }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {recentOrders.length > 0 && (
            <View style={{ gap: 10 }}>
              <View style={styles.sectionRow}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.accentBar} />
                  <Text style={[styles.sectionTitle, { color: C.text }]}>
                    Commandes récentes
                  </Text>
                </View>
                <Pressable onPress={() => go("/(tabs)/orders")} hitSlop={6}>
                  <Text style={[styles.seeAll, { color: isDark ? GOLD : GOLD_DK }]}>
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
                      <Feather name="trending-up" size={15} color={cfg.color} />
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
                      <Text style={[styles.orderPrice, { color: isDark ? GOLD : GOLD_DK }]}>
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
  scroll: { paddingHorizontal: 18, gap: 16 },

  /* Header */
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  userRow: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  avatarBox: {
    width: 46, height: 46, borderRadius: 14,
    overflow: "hidden", borderWidth: 1,
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  avatarLetter: { fontFamily: "Inter_700Bold", fontSize: 18 },
  greetSmall: { fontFamily: "Inter_400Regular", fontSize: 12.5 },
  greetName: { fontFamily: "Inter_700Bold", fontSize: 17.5, letterSpacing: 0.1 },

  headerActions: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  dot: {
    position: "absolute", top: 8, right: 8,
    width: 8, height: 8, borderRadius: 4, backgroundColor: DANGER,
  },

  /* ═══ SOLDE HERO ═══ */
  balanceWrap: {
    borderRadius: 22, overflow: "hidden",
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28, shadowRadius: 26, elevation: 10,
  },
  balanceGrad: { padding: 22, position: "relative", overflow: "hidden" },
  balanceAccent: {
    position: "absolute", top: 0, left: 22, right: 22, height: 2,
    backgroundColor: GOLD, opacity: 0.9,
    borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
  },
  balanceDecor: {
    position: "absolute", top: -80, right: -70,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: GOLD, opacity: 0.07,
  },
  balanceDecor2: {
    position: "absolute", bottom: -50, left: -40,
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: "#FFFFFF", opacity: 0.03,
  },
  balanceTopRow: {
    flexDirection: "row", alignItems: "flex-start",
    justifyContent: "space-between", gap: 12,
  },
  balanceKicker: {
    fontFamily: "Inter_600SemiBold", fontSize: 10.5,
    color: "rgba(201,169,97,0.90)", letterSpacing: 1.5,
  },
  balanceAmount: {
    fontFamily: "Inter_700Bold", fontSize: 30,
    color: "#FFFFFF", marginTop: 8, letterSpacing: -0.3,
  },
  balanceConvert: {
    fontFamily: "Inter_400Regular", fontSize: 11.5,
    color: "rgba(255,255,255,0.55)", marginTop: 4,
  },
  balanceLogoBox: {
    width: 54, height: 54, borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: 1, borderColor: "rgba(201,169,97,0.45)",
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 8,
  },
  balanceLogo: { width: "100%", height: "100%" },
  balanceDivider: {
    height: 1, backgroundColor: "rgba(255,255,255,0.12)", marginVertical: 18,
  },
  balanceBottomRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  referralRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  referralIconBox: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: "rgba(201,169,97,0.18)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(201,169,97,0.32)",
  },
  referralLabel: {
    fontFamily: "Inter_500Medium", fontSize: 10.5,
    color: "rgba(255,255,255,0.65)", letterSpacing: 0.3,
  },
  referralValue: {
    fontFamily: "Inter_700Bold", fontSize: 13.5, color: GOLD, marginTop: 1,
  },
  balanceCta: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(201,169,97,0.14)",
    borderWidth: 1, borderColor: "rgba(201,169,97,0.32)",
  },
  balanceCtaText: {
    fontFamily: "Inter_600SemiBold", fontSize: 12.5,
    color: GOLD, letterSpacing: 0.3,
  },

  /* ═══ COMMANDER — design "ticket" ═══ */
  commanderWrap: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    paddingTop: 16, paddingBottom: 18, paddingRight: 18, paddingLeft: 22,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08, shadowRadius: 14, elevation: 3,
  },
  commanderAccent: {
    position: "absolute", left: 0, top: 0, bottom: 0,
    width: 4, backgroundColor: GOLD,
  },
  commanderDecor: {
    position: "absolute", top: -40, right: -40,
    width: 140, height: 140, borderRadius: 70,
    opacity: 0.55,
  },
  commanderBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 7, borderWidth: 1,
  },
  commanderBadgeDot: {
    width: 5, height: 5, borderRadius: 3, backgroundColor: GOLD,
  },
  commanderBadgeText: {
    fontFamily: "Inter_700Bold", fontSize: 9,
    letterSpacing: 1.2,
  },
  commanderMain: {
    flexDirection: "row", alignItems: "center",
    gap: 13, marginTop: 12,
  },
  commanderIconBox: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8,
  },
  commanderTitle: {
    fontFamily: "Inter_700Bold", fontSize: 16.5, letterSpacing: 0.1,
  },
  commanderSub: {
    fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3,
  },
  commanderArrowBox: {
    width: 40, height: 40, borderRadius: 12,
    borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },

  /* Section */
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  accentBar: { width: 3, height: 16, borderRadius: 2, backgroundColor: GOLD },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 15.5, letterSpacing: 0.1 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  seeAll: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  /* Stats */
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1, alignItems: "center", gap: 6,
    borderRadius: 16, borderWidth: 1,
    paddingVertical: 16, paddingHorizontal: 8,
  },
  statIcon: {
    width: 34, height: 34, borderRadius: 11,
    alignItems: "center", justifyContent: "center",
  },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 19, letterSpacing: 0.2 },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 11, textAlign: "center" },

  /* Orders */
  orderRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 12,
  },
  orderIcon: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  orderName: { fontFamily: "Inter_600SemiBold", fontSize: 13.5 },
  orderMeta: { fontFamily: "Inter_400Regular", fontSize: 11.5, marginTop: 2 },
  orderPrice: { fontFamily: "Inter_700Bold", fontSize: 13, textAlign: "right" },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  badgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
});