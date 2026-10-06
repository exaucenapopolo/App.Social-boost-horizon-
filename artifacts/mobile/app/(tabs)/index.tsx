import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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

const QUICK_ACTIONS = [
  {
    id: "commander",
    icon: "shopping-cart" as const,
    label: "Commander",
    sub: "Booster vos réseaux",
    gradient: ["#1e3c72", "#1E90FF"] as [string, string],
    route: "/(tabs)/new-order" as const,
  },
  {
    id: "deposit",
    icon: "credit-card" as const,
    label: "Déposer des fonds",
    sub: "Recharger votre solde",
    gradient: ["#11998e", "#38ef7d"] as [string, string],
    route: "/(tabs)/wallet" as const,
  },
  {
    id: "parrainage",
    icon: "users" as const,
    label: "Parrainage",
    sub: "Gagner des récompenses",
    gradient: ["#D4AF37", "#FFD700"] as [string, string],
    route: "/parrainage" as const,
  },
  {
    id: "historique",
    icon: "list" as const,
    label: "Historique",
    sub: "Vos commandes",
    gradient: ["#6a0dad", "#9C27B0"] as [string, string],
    route: "/(tabs)/orders" as const,
  },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  "En attente": { label: "En attente", color: "#FF9800", bg: "rgba(255,152,0,0.12)" },
  "en cours": { label: "En cours", color: "#1E90FF", bg: "rgba(30,144,255,0.12)" },
  "succès": { label: "Terminé", color: "#4CAF50", bg: "rgba(76,175,80,0.12)" },
  "annulée": { label: "Annulé", color: "#FF6B6B", bg: "rgba(255,107,107,0.12)" },
  "pending": { label: "En attente", color: "#FF9800", bg: "rgba(255,152,0,0.12)" },
  "processing": { label: "En cours", color: "#1E90FF", bg: "rgba(30,144,255,0.12)" },
  "completed": { label: "Terminé", color: "#4CAF50", bg: "rgba(76,175,80,0.12)" },
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const { orders, refreshOrders } = useOrders();
  const { colors, isDark, toggleTheme } = useTheme();

  const topPad = Platform.OS === "web" ? insets.top + 64 : insets.top;
  const recentOrders = orders.slice(0, 5);

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

  const balanceFormatted = userCountry && userCountry.xafRate !== 1
    ? formatCurrency(user?.balance ?? 0, userCountry)
    : `${(user?.balance ?? 0).toLocaleString("fr-FR")} FCFA`;

  const referralFormatted = userCountry && userCountry.xafRate !== 1
    ? formatCurrency(user?.referralBalance ?? 0, userCountry)
    : `${(user?.referralBalance ?? 0).toLocaleString("fr-FR")} FCFA`;

  const handleRefresh = async () => {
    await refreshUser();
    if (user?.id) await refreshOrders(user.id);
  };

  const handleAction = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as any);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StarBackground />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingTop: topPad + 10, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Pressable
            style={styles.headerLeft}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(tabs)/profile");
            }}
          >
            <View style={[styles.avatarRing, { borderColor: colors.success }]}>
              {user?.photoURL ? (
                <Image source={{ uri: user.photoURL }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.avatarGradient}>
                  <Text style={styles.avatarText}>
                    {(user?.name ?? "U").charAt(0).toUpperCase()}
                  </Text>
                </LinearGradient>
              )}
            </View>
            <View>
              <Text style={[styles.greetingSmall, { color: colors.textMuted }]}>Bienvenue 👋</Text>
              <Text style={[styles.greetingName, { color: colors.text }]} numberOfLines={1}>
                {user?.name?.split(" ")[0] ?? "Utilisateur"}
              </Text>
            </View>
          </Pressable>

          <View style={styles.headerRight}>
            <Pressable onPress={toggleTheme} style={[styles.iconBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)", borderColor: colors.separator }]}>
              <Feather name={isDark ? "sun" : "moon"} size={18} color={isDark ? "#FFD700" : "#6a0dad"} />
            </Pressable>
            <Pressable onPress={() => router.push("/(tabs)/notifications")} style={[styles.iconBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)", borderColor: colors.separator }]}>
              <Feather name="bell" size={18} color={colors.textSecondary} />
              {hasUnread && (
                <View style={{
                  position: "absolute", top: 6, right: 6,
                  width: 9, height: 9, borderRadius: 5,
                  backgroundColor: "#FF3B30",
                  borderWidth: 1.5, borderColor: isDark ? "#12122A" : "#ffffff",
                }} />
              )}
            </Pressable>
          </View>
        </View>

        {/* Balance Card */}
        <View style={[styles.balanceCard, { borderColor: "rgba(255,255,255,0.15)" }]}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            style={styles.balanceGradient}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          >
            <View style={styles.balanceTop}>
              <View>
                <Text style={styles.balanceLabel}>
                  Solde total disponible{userCountry ? ` (${userCountry.flag})` : ""}
                </Text>
                <View style={styles.balanceAmountRow}>
                  <Feather name="dollar-sign" size={18} color="#FFD700" />
                  <Text style={styles.balanceAmount}>
                    {balanceFormatted}
                  </Text>
                </View>
                {userCountry && userCountry.xafRate !== 1 && (
                  <Text style={styles.balanceSubConvert}>
                    ≈ {(user?.balance ?? 0).toLocaleString("fr-FR")} FCFA
                  </Text>
                )}
              </View>
              <View style={styles.logoSmall}>
                <Image source={{ uri: LOGO_URL }} style={styles.logoSmallImg} contentFit="cover" />
              </View>
            </View>

            <View style={styles.balanceSeparator} />

            <View style={styles.balanceBottom}>
              <View style={styles.balanceSubItem}>
                <Feather name="gift" size={14} color="#FFD700" />
                <Text style={styles.balanceSubLabel}>Parrainage</Text>
                <Text style={styles.balanceSubValue}>{referralFormatted}</Text>
              </View>
              <Pressable
                style={styles.depositBtn}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(tabs)/wallet"); }}
              >
                <Feather name="plus" size={14} color="#fff" />
                <Text style={styles.depositBtnText}>Recharger</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Actions rapides</Text>
          <View style={styles.actionsGrid}>
            {QUICK_ACTIONS.map((action) => (
              <Pressable
                key={action.id}
                style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
                onPress={() => handleAction(action.route)}
              >
                <LinearGradient
                  colors={action.gradient}
                  style={styles.actionGradient}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                >
                  <View style={styles.actionIconCircle}>
                    <Feather name={action.icon} size={22} color="#fff" />
                  </View>
                  <Text style={styles.actionLabel}>{action.label}</Text>
                  <Text style={styles.actionSub}>{action.sub}</Text>
                </LinearGradient>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Autres services */}
        <OtherServicesSection />

        {/* Stats Row */}
        <View style={styles.statsRow}>
          {[
            { label: "Total commandes", value: user?.totalOrders ?? 0, icon: "shopping-bag" as const, color: colors.accent },
            { label: "Terminées", value: orders.filter(o => o.status === "succès" || (o.status as string) === "completed").length, icon: "check-circle" as const, color: colors.success },
            { label: "En cours", value: orders.filter(o => o.status === "en cours" || (o.status as string) === "processing").length, icon: "loader" as const, color: "#FF9800" },
          ].map((s, i) => (
            <View key={i} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={[styles.statIconCircle, { backgroundColor: s.color + "22" }]}>
                <Feather name={s.icon} size={18} color={s.color} />
              </View>
              <Text style={[styles.statValue, { color: colors.text }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Recent Orders */}
        {recentOrders.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Commandes récentes</Text>
              <Pressable onPress={() => router.push("/(tabs)/orders")}>
                <Text style={[styles.seeAllText, { color: colors.accentLight }]}>Voir tout →</Text>
              </Pressable>
            </View>
            {recentOrders.map((order) => {
              const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG["En attente"];
              return (
                <View key={order.id} style={[styles.orderRow, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                  <View style={[styles.orderIconCircle, { backgroundColor: cfg.bg }]}>
                    <Feather name="trending-up" size={16} color={cfg.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.orderName, { color: colors.text }]} numberOfLines={1}>{order.serviceName}</Text>
                    <Text style={[styles.orderMeta, { color: colors.textMuted }]}>
                      {new Date(order.createdAt).toLocaleDateString("fr-FR")} • {order.quantity} unités
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.orderPrice}>
                      {userCountry && userCountry.xafRate !== 1
                        ? formatCurrency(order.price, userCountry)
                        : `${order.price.toLocaleString("fr-FR")} FCFA`}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Welcome banner if no orders */}
        {orders.length === 0 && (
          <View style={[styles.welcomeBanner, { borderColor: "rgba(255,255,255,0.12)" }]}>
            <LinearGradient
              colors={["rgba(30,60,114,0.6)", "rgba(106,13,173,0.6)"]}
              style={styles.welcomeGradient}
            >
              <Feather name="star" size={32} color="#FFD700" />
              <Text style={styles.welcomeTitle}>Bienvenue chez Social Boost Horizon !</Text>
              <Text style={styles.welcomeText}>
                Boostez votre présence sur les réseaux sociaux avec nos services de qualité.
              </Text>
              <Pressable
                style={[styles.welcomeBtn, { backgroundColor: colors.accent }]}
                onPress={() => router.push("/(tabs)/new-order")}
              >
                <Text style={styles.welcomeBtnText}>Passer ma première commande →</Text>
              </Pressable>
            </LinearGradient>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, gap: 20 },
  headerRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  avatarRing: {
    width: 46, height: 46, borderRadius: 23,
    borderWidth: 2, overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarGradient: { flex: 1, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Inter_700Bold", fontSize: 18, color: "#fff" },
  greetingSmall: { fontFamily: "Inter_400Regular", fontSize: 12 },
  greetingName: { fontFamily: "Inter_700Bold", fontSize: 17, maxWidth: 160 },
  balanceCard: {
    borderRadius: 18, overflow: "hidden",
    shadowColor: "#1E90FF", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 16, elevation: 10,
    borderWidth: 1,
  },
  balanceGradient: { padding: 20 },
  balanceTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  balanceLabel: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.75)", marginBottom: 6 },
  balanceAmountRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  balanceAmount: { fontFamily: "Inter_700Bold", fontSize: 28, color: "#FFD700" },
  balanceSubConvert: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 },
  logoSmall: { width: 50, height: 50, borderRadius: 25, overflow: "hidden", borderWidth: 2, borderColor: "rgba(255,255,255,0.3)" },
  logoSmallImg: { width: "100%", height: "100%" },
  balanceSeparator: { height: 1, backgroundColor: "rgba(255,255,255,0.15)", marginVertical: 14 },
  balanceBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  balanceSubItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  balanceSubLabel: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.7)" },
  balanceSubValue: { fontFamily: "Inter_700Bold", fontSize: 13, color: "#FFD700" },
  depositBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.3)",
  },
  depositBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" },
  section: { gap: 12 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  seeAllText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  actionCard: {
    width: "47%", borderRadius: 16, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  actionGradient: { padding: 18, minHeight: 100, gap: 6 },
  actionIconCircle: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 4,
  },
  actionLabel: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" },
  actionSub: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.75)" },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1, alignItems: "center", gap: 6,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  statIconCircle: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
  },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 20 },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 11, textAlign: "center" },
  orderRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 12, borderWidth: 1, padding: 12,
  },
  orderIconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  orderName: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  orderMeta: { fontFamily: "Inter_400Regular", fontSize: 11 },
  orderPrice: { fontFamily: "Inter_700Bold", fontSize: 13, color: "#FFD700", textAlign: "right" },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 3 },
  statusText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  welcomeBanner: { borderRadius: 18, overflow: "hidden", borderWidth: 1 },
  welcomeGradient: { padding: 24, alignItems: "center", gap: 12 },
  welcomeTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: "#fff", textAlign: "center" },
  welcomeText: { fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.7)", textAlign: "center", lineHeight: 22 },
  welcomeBtn: {
    borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12, marginTop: 4,
  },
  welcomeBtnText: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" },
});
