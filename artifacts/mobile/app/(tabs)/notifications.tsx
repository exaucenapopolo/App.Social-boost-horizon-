import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { apiClient } from "@/services/api";
import { COUNTRIES, formatCurrency } from "@/lib/countries";

type NotifType = "order_done" | "order_partial" | "order_cancelled" | "referral" | "nouveau_filleul" | "depot" | "info";

interface NotifItem {
  id: string;
  type: NotifType;
  title: string;
  message: string;
  amount?: number;
  refundAmount?: number;
  remains?: number;
  platform?: string;
  orderId?: string;
  serviceName?: string;
  quantity?: number;
  filleulName?: string;
  createdAt: string;
  read?: boolean;
}

const TYPE_CONFIG: Record<string, { icon: React.ComponentProps<typeof Feather>["name"]; color: string; bg: string }> = {
  order_done:      { icon: "check-circle",  color: "#4CAF50", bg: "rgba(76,175,80,0.12)" },
  order_partial:   { icon: "alert-triangle", color: "#FF9800", bg: "rgba(255,152,0,0.12)" },
  order_cancelled: { icon: "x-circle",      color: "#F44336", bg: "rgba(244,67,54,0.12)" },
  referral:        { icon: "gift",           color: "#FFD700", bg: "rgba(255,215,0,0.12)" },
  nouveau_filleul: { icon: "user-plus",      color: "#1E90FF", bg: "rgba(30,144,255,0.12)" },
  depot:           { icon: "dollar-sign",    color: "#4CAF50", bg: "rgba(76,175,80,0.12)" },
  info:            { icon: "bell",           color: "#9C27B0", bg: "rgba(156,39,176,0.12)" },
};

const READ_KEY = "@sbh_notif_read";

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "À l'instant";
  if (m < 60) return `Il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Il y a ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Hier";
  if (d < 7) return `Il y a ${d} jours`;
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme } = useTheme();
  const { user } = useAuth();
  const topPad = Platform.OS === "web" ? insets.top + 64 : insets.top;

  const userCountry = user?.country
    ? COUNTRIES.find((c) => c.code === user.country?.toLowerCase()) ?? null
    : null;

  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const loadReadIds = async () => {
    try {
      const raw = await AsyncStorage.getItem(READ_KEY);
      if (raw) setReadIds(new Set(JSON.parse(raw)));
    } catch {}
  };

  const saveReadId = async (id: string) => {
    try {
      const raw = await AsyncStorage.getItem(READ_KEY);
      const ids: string[] = raw ? JSON.parse(raw) : [];
      if (!ids.includes(id)) {
        ids.push(id);
        await AsyncStorage.setItem(READ_KEY, JSON.stringify(ids.slice(-200)));
      }
    } catch {}
  };

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await apiClient.request<NotifItem[]>("/notifications");
      if (res.success && Array.isArray(res.data)) {
        setNotifs(res.data);
      }
    } catch (e) {
      console.error("[notifications] fetch error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadReadIds();
    fetchNotifications();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchNotifications]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const markRead = async (id: string) => {
    setReadIds((prev) => new Set([...prev, id]));
    await saveReadId(id);
  };

  const handleNotifPress = (notif: NotifItem) => {
    markRead(notif.id);
    switch (notif.type) {
      case "order_done":
      case "order_partial":
      case "order_cancelled":
        router.push("/(tabs)/orders");
        break;
      case "referral":
      case "nouveau_filleul":
        router.push("/parrainage");
        break;
      case "depot":
        router.push("/(tabs)/wallet");
        break;
      default:
        break;
    }
  };

  const markAllRead = async () => {
    const allIds = notifs.map((n) => n.id);
    setReadIds(new Set(allIds));
    try {
      const raw = await AsyncStorage.getItem(READ_KEY);
      const existing: string[] = raw ? JSON.parse(raw) : [];
      const merged = Array.from(new Set([...existing, ...allIds]));
      await AsyncStorage.setItem(READ_KEY, JSON.stringify(merged.slice(-200)));
    } catch {}
  };

  const unread = notifs.filter((n) => !readIds.has(n.id)).length;
  const c = colors;

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StarBackground />

      <LinearGradient
        colors={[c.gradientStart, c.gradientEnd]}
        style={[styles.header, { paddingTop: topPad + 12 }]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#fff" />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unread > 0 && (
            <Text style={styles.headerSub}>{unread} non lue{unread > 1 ? "s" : ""}</Text>
          )}
        </View>
        <Pressable onPress={toggleTheme} style={styles.themeBtn}>
          <Feather name={isDark ? "sun" : "moon"} size={18} color="#fff" />
        </Pressable>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />
        }
      >
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={c.accent} size="large" />
            <Text style={[styles.loadingText, { color: c.textMuted }]}>Chargement...</Text>
          </View>
        ) : notifs.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="bell-off" size={52} color={c.textMuted} />
            <Text style={[styles.emptyTitle, { color: c.text }]}>Aucune notification</Text>
            <Text style={[styles.emptyText, { color: c.textMuted }]}>
              Vos commandes, bonus de parrainage et alertes importants apparaîtront ici.
            </Text>
          </View>
        ) : (
          <>
            {unread > 0 && (
              <Pressable style={styles.markAllBtn} onPress={markAllRead}>
                <Feather name="check-circle" size={14} color={c.accent} />
                <Text style={[styles.markAllText, { color: c.accent }]}>Tout marquer comme lu</Text>
              </Pressable>
            )}

            {notifs.map((notif) => {
              const cfg = TYPE_CONFIG[notif.type] ?? TYPE_CONFIG.info;
              const isRead = readIds.has(notif.id);
              return (
                <Pressable
                  key={notif.id}
                  style={[
                    styles.notifCard,
                    { backgroundColor: c.card, borderColor: isRead ? c.cardBorder : cfg.color + "50" },
                    !isRead && { borderLeftWidth: 3, borderLeftColor: cfg.color },
                  ]}
                  onPress={() => handleNotifPress(notif)}
                >
                  <View style={[styles.notifIcon, { backgroundColor: cfg.bg }]}>
                    <Feather name={cfg.icon} size={20} color={cfg.color} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.notifTitleRow}>
                      <Text style={[styles.notifTitle, { color: c.text }]} numberOfLines={1}>
                        {notif.title}
                      </Text>
                      {!isRead && <View style={[styles.unreadDot, { backgroundColor: cfg.color }]} />}
                    </View>
                    <Text style={[styles.notifMessage, { color: c.textSecondary ?? c.textMuted }]} numberOfLines={4}>
                      {notif.message}
                    </Text>

                    {/* Refund badge for partial/cancelled */}
                    {(notif.type === "order_partial" || notif.type === "order_cancelled") &&
                      (notif.refundAmount ?? 0) > 0 && (
                        <View style={[styles.refundBadge, { backgroundColor: "#4CAF5015", borderColor: "#4CAF5030" }]}>
                          <Feather name="refresh-cw" size={12} color="#4CAF50" />
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#4CAF50" }}>
                            {userCountry && userCountry.xafRate !== 1
                              ? `${formatCurrency(notif.refundAmount ?? 0, userCountry)} remboursés`
                              : `${(notif.refundAmount ?? 0).toLocaleString("fr-FR")} FCFA remboursés`}
                          </Text>
                        </View>
                      )}

                    {/* Bonus amount for referral */}
                    {notif.type === "referral" && (notif.amount ?? 0) > 0 && (
                      <Text style={[styles.notifAmount, { color: cfg.color }]}>
                        +{userCountry && userCountry.xafRate !== 1
                          ? formatCurrency(notif.amount ?? 0, userCountry)
                          : `${(notif.amount ?? 0).toLocaleString("fr-FR")} FCFA`}
                      </Text>
                    )}

                    {/* Filleul name */}
                    {notif.type === "nouveau_filleul" && notif.filleulName && (
                      <View style={[styles.refundBadge, { backgroundColor: "#1E90FF15", borderColor: "#1E90FF30" }]}>
                        <Feather name="user" size={12} color="#1E90FF" />
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#1E90FF" }}>
                          {notif.filleulName}
                        </Text>
                      </View>
                    )}

                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                      <Text style={[styles.notifTime, { color: c.textMuted }]}>{timeAgo(notif.createdAt)}</Text>
                      {(notif.type === "order_done" || notif.type === "order_partial" || notif.type === "order_cancelled") && (
                        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: c.accent }}>Voir commandes →</Text>
                      )}
                      {(notif.type === "referral" || notif.type === "nouveau_filleul") && (
                        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: "#FFD700" }}>Voir parrainage →</Text>
                      )}
                      {notif.type === "depot" && (
                        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: "#4CAF50" }}>Voir portefeuille →</Text>
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </>
        )}

        <View style={styles.footerNote}>
          <Feather name="info" size={13} color={c.textMuted} />
          <Text style={[styles.footerText, { color: c.textMuted }]}>
            Commandes, bonus parrainage, filleuls et alertes importantes.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 16, paddingBottom: 16,
    flexDirection: "row", alignItems: "flex-end",
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  themeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#fff" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  content: { padding: 16, gap: 10 },
  loadingState: { alignItems: "center", paddingVertical: 60, gap: 12 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  markAllBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-end", paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 20,
  },
  markAllText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  notifCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    borderRadius: 14, padding: 14,
    borderWidth: 1,
  },
  notifIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  notifTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  notifTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  notifMessage: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  notifAmount: { fontFamily: "Inter_700Bold", fontSize: 13, marginTop: 2 },
  refundBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, alignSelf: "flex-start", marginTop: 2,
  },
  notifTime: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  emptyState: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", maxWidth: 260 },
  footerNote: {
    flexDirection: "row", alignItems: "center", gap: 6,
    justifyContent: "center", marginTop: 8,
  },
  footerText: { fontFamily: "Inter_400Regular", fontSize: 12 },
});
