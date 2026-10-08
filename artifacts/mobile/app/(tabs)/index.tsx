import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
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

// ─── Palette alignée sur l'identité du logo (login + register) ───
const NAVY        = "#0F2A5C";
const NAVY_LIGHT  = "#1E3F7A";
const NAVY_DK     = "#0A1F44";
const GOLD        = "#C9A961";
const GOLD_DK     = "#B08D4A";

const LIGHT_BG    = "#FAF9F6";
const LIGHT_SURF  = "#FFFFFF";
const LIGHT_BORD  = "#E8E4DA";
const LIGHT_TEXT  = "#0F172A";
const LIGHT_MUTED = "#64748B";
const LIGHT_SOFT  = "#94A3B8";

const DARK_BG     = "#0A162B";
const DARK_SURF   = "#0F2A5C";
const DARK_BORD   = "rgba(255,255,255,0.08)";
const DARK_TEXT   = "#F1F5F9";
const DARK_MUTED  = "#94A3B8";
const DARK_SOFT   = "#64748B";

// ─── Salutation contextuelle (heure + jour) ───
function getGreeting(): string {
  const now = new Date();
  const day = now.getDay(); // 0 = dimanche, 1 = lundi, …, 5 = vendredi, 6 = samedi
  const hour = now.getHours();

  if (day === 1) return "Bonne semaine";
  if (day === 5) return "Bon week-end en avance";
  if (day === 0 || day === 6) return "Bon week-end";
  if (hour >= 5 && hour < 12) return "Bonjour";
  if (hour >= 12 && hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  "En attente": { label: "En attente", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  "en cours":   { label: "En cours",   color: "#1E90FF", bg: "rgba(30,144,255,0.12)" },
  "succès":     { label: "Terminé",    color: "#10B981", bg: "rgba(16,185,129,0.12)" },
  "annulée":    { label: "Annulé",     color: "#EF4444", bg: "rgba(239,68,68,0.12)" },
  "pending":    { label: "En attente", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  "processing": { label: "En cours",   color: "#1E90FF", bg: "rgba(30,144,255,0.12)" },
  "completed":  { label: "Terminé",    color: "#10B981", bg: "rgba(16,185,129,0.12)" },
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const { orders, refreshOrders } = useOrders();
  const { isDark, toggleTheme } = useTheme();

  // Palette locale (garantit un vrai clair / sombre propre)
  const C = useMemo(
    () => ({
      bg:        isDark ? DARK_BG   : LIGHT_BG,
      surface:   isDark ? DARK_SURF : LIGHT_SURF,
      border:    isDark ? DARK_BORD : LIGHT_BORD,
      text:      isDark ? DARK_TEXT : LIGHT_TEXT,
      textMuted: isDark ? DARK_MUTED : LIGHT_MUTED,
      textSoft:  isDark ? DARK_SOFT : LIGHT_SOFT,
      iconBg:    isDark ? "rgba(201,169,97,0.12)" : "rgba(15,42,92,0.06)",
      iconColor: isDark ? GOLD : NAVY,
    }),
    [isDark]
  );

  const topPad = Platform.OS === "web" ? insets.top + 64 : insets.top;
  const recentOrders = orders.slice(0, 3);
  const greeting = useMemo(getGreeting, []);

  const [hasUnread, setHasUnread] = useState(false);

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
      {isDark && <StarBackground />}

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
        {/* ─── Header ─── */}
        <View style={styles.header}>
          <Pressable style={styles.userRow} onPress={() => go("/(tabs)/profile")}>
            <View style={[styles.avatarBox, { borderColor: C.border }]}>
              {user?.photoURL ? (
                <Image source={{ uri: user.photoURL }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: NAVY }]}>
                  <Text style={styles.avatarLetter}>
                    {(user?.name ?? "U").charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[styles.greetSmall, { color: C.textMuted }]}>{greeting}</Text>
              <Text
                style={[styles.greetName, { color: C.text }]}
                numberOfLines={1}
              >
                {user?.name?.split(" ")[0] ?? "Utilisateur"}
              </Text>
            </View>
          </Pressable>

          <View style={styles.headerActions}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                toggleTheme();
              }}
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

        {/* ─── Carte Solde ─── */}
        <Pressable
          onPress={() => go("/(tabs)/wallet")}
          onPressIn={() => Haptics.selectionAsync()}
          style={({ pressed }) => [styles.balanceCard, pressed && { transform: [{ scale: 0.99 }] }]}
        >
          <LinearGradient
            colors={[NAVY_LIGHT, NAVY]}
            style={styles.balanceGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.balanceTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.balanceLabel}>Solde disponible</Text>
                <Text style={styles.balanceAmount}>{balanceFormatted}</Text>
                {userCountry && userCountry.xafRate !== 1 && (
                  <Text style={styles.balanceConvert}>
                    ≈ {(user?.balance ?? 0).toLocaleString("fr-FR")} FCFA
                  </Text>
                )}
              </View>

              <View style={styles.balanceLogoBox}>
                <Image source={{ uri: LOGO_URL }} style={styles.balanceLogo} contentFit="cover" />
              </View>
            </View>

            <View style={styles.balanceDivider} />

            <View style={styles.balanceBottom}>
              <Pressable
                style={styles.referralRow}
                hitSlop={8}
                onPress={() => {
                  Haptics.selectionAsync();
                  router.push("/parrainage" as any);
                }}
              >
                <Feather name="gift" size={14} color={GOLD} />
                <Text style={styles.referralLabel}>Parrainage</Text>
                <Text style={styles.referralValue}>{referralFormatted}</Text>
              </Pressable>

              <View style={styles.chevronBox}>
                <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.55)" />
              </View>
            </View>
          </LinearGradient>
        </Pressable>

        {/* ─── CTA principal : Commander ─── */}
        <Pressable
          onPress={() => go("/(tabs)/new-order")}
          style={({ pressed }) => [
            styles.ctaCard,
            pressed && { opacity: 0.94, transform: [{ scale: 0.985 }] },
          ]}
        >
          <LinearGradient
            colors={[NAVY, NAVY_DK]}
            style={styles.ctaGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.ctaIconBox}>
              <Feather name="zap" size={22} color={GOLD} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ctaTitle}>Commander</Text>
              <Text style={styles.ctaSub}>Booster vos réseaux sociaux</Text>
            </View>
            <Feather name="arrow-right" size={20} color={GOLD} />
          </LinearGradient>
        </Pressable>

        {/* ─── Autres services ─── */}
        <OtherServicesSection />

        {/* ─── Statistiques ─── */}
        <View style={styles.statsRow}>
          {[
            {
              label: "Commandes",
              value: user?.totalOrders ?? 0,
              icon: "shopping-bag" as const,
            },
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
              style={[styles.statCard, { backgroundColor: C.surface, borderColor: C.border }]}
            >
              <View style={[styles.statIcon, { backgroundColor: C.iconBg }]}>
                <Feather name={s.icon} size={16} color={C.iconColor} />
              </View>
              <Text style={[styles.statValue, { color: C.text }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: C.textMuted }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ─── Commandes récentes ─── */}
        {recentOrders.length > 0 && (
          <View style={{ gap: 10 }}>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: C.text }]}>
                Commandes récentes
              </Text>
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
                    <Text
                      style={[styles.orderName, { color: C.text }]}
                      numberOfLines={1}
                    >
                      {order.serviceName}
                    </Text>
                    <Text style={[styles.orderMeta, { color: C.textMuted }]}>
                      {new Date(order.createdAt).toLocaleDateString("fr-FR")} ·{" "}
                      {order.quantity} unités
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text
                      style={[
                        styles.orderPrice,
                        { color: isDark ? GOLD : GOLD_DK },
                      ]}
                    >
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 18, gap: 16 },

  /* Header */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  userRow: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  avatarBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  avatarLetter: { fontFamily: "Inter_700Bold", fontSize: 18, color: GOLD },
  greetSmall: { fontFamily: "Inter_400Regular", fontSize: 12.5 },
  greetName: { fontFamily: "Inter_700Bold", fontSize: 17.5, letterSpacing: 0.1 },

  headerActions: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  dot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },

  /* Balance Card */
  balanceCard: {
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 8,
  },
  balanceGradient: { padding: 20 },
  balanceTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  balanceLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12.5,
    color: "rgba(255,255,255,0.72)",
    letterSpacing: 0.3,
  },
  balanceAmount: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: GOLD,
    marginTop: 6,
    letterSpacing: 0.2,
  },
  balanceConvert: {
    fontFamily: "Inter_400Regular",
    fontSize: 11.5,
    color: "rgba(255,255,255,0.5)",
    marginTop: 4,
  },
  balanceLogoBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(201,169,97,0.35)",
  },
  balanceLogo: { width: "100%", height: "100%" },
  balanceDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginVertical: 16,
  },
  balanceBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  referralRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
    flex: 1,
  },
  referralLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "rgba(255,255,255,0.72)",
  },
  referralValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 13.5,
    color: GOLD,
    marginLeft: 2,
  },
  chevronBox: { opacity: 0.8 },

  /* CTA Commander */
  ctaCard: {
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  ctaGradient: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  ctaIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(201,169,97,0.14)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(201,169,97,0.28)",
  },
  ctaTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16.5,
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  ctaSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12.5,
    color: "rgba(255,255,255,0.68)",
    marginTop: 2,
  },

  /* Stats */
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 19, letterSpacing: 0.2 },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    textAlign: "center",
  },

  /* Recent Orders */
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16, letterSpacing: 0.1 },
  seeAll: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  orderIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  orderName: { fontFamily: "Inter_600SemiBold", fontSize: 13.5 },
  orderMeta: { fontFamily: "Inter_400Regular", fontSize: 11.5, marginTop: 2 },
  orderPrice: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    textAlign: "right",
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  badgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
});