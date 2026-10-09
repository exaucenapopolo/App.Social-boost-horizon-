import Feather from "@expo/vector-icons/Feather";
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

// Palette
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
  order_done:      { icon: "check-circle",  color: SUCCESS, bg: "rgba(16,185,129,0.12)" },
  order_partial:   { icon: "alert-triangle", color: WARNING, bg: "rgba(245,158,11,0.12)" },
  order_cancelled: { icon: "x-circle",      color: DANGER, bg: "rgba(239,68,68,0.12)" },
  referral:        { icon: "gift",           color: GOLD, bg: "rgba(212,175,55,0.12)" },
  nouveau_filleul: { icon: "user-plus",      color: INFO, bg: "rgba(59,130,246,0.12)" },
  depot:           { icon: "dollar-sign",    color: SUCCESS, bg: "rgba(16,185,129,0.12)" },
  info:            { icon: "bell",           color: PURPLE, bg: "rgba(139,92,246,0.12)" },
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

function useEntry(delay = 0, duration = 420) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1, duration, delay, useNativeDriver: true, easing: Easing.out(Easing.cubic),
    }).start();
  }, []);
  return anim;
}

// Empty state (SVG-like)
function EmptyNotifs({ C, isDark }: any) {
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 2400, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(float, { toValue: 0, duration: 2400, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

  return (
    <View style={styles.emptyWrap}>
      <Animated.View style={{ width: 140, height: 140, alignItems: "center", justifyContent: "center", transform: [{ translateY }] }}>
        <View style={{
          position: "absolute", width: 130, height: 130, borderRadius: 65,
          borderWidth: 1, borderColor: C.iconBorder, opacity: 0.5,
        }} />
        <View style={{
          width: 96, height: 96, borderRadius: 48,
          backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
          alignItems: "center", justifyContent: "center",
        }}>
          <Feather name="bell-off" size={44} color={C.accentIcon} />
        </View>
        <View style={{ position: "absolute", top: 10, right: 20, width: 10, height: 10, borderRadius: 5, backgroundColor: GOLD, opacity: 0.55 }} />
        <View style={{ position: "absolute", bottom: 16, left: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: INFO, opacity: 0.45 }} />
        <View style={{ position: "absolute", top: 60, left: -4, width: 6, height: 6, borderRadius: 3, backgroundColor: SUCCESS, opacity: 0.4 }} />
      </Animated.View>
      <Text style={[styles.emptyTitle, { color: C.text }]}>Aucune notification</Text>
      <Text style={[styles.emptyText, { color: C.textMuted }]}>
        Vos commandes, bonus de parrainage et alertes importantes apparaîtront ici.
      </Text>
    </View>
  );
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { isDark: ctxIsDark, toggleTheme } = useTheme();
  const isDark = ctxIsDark === true;
  const { user } = useAuth();

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

  const goBack = () => {
    if (router.canGoBack?.()) router.back();
    else router.push("/(tabs)" as any);
  };

  const unread = notifs.filter((n) => !readIds.has(n.id)).length;

  const entry0 = useEntry(60);

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <StarBackground dark={isDark} />

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
              borderWidth: isDark ? 0 : 1,
            },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Feather name="chevron-left" size={20} color={isDark ? "#fff" : NAVY} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: isDark ? "#FFFFFF" : NAVY }]}>
            Notifications
          </Text>
          <Text style={[styles.headerSub, { color: isDark ? "rgba(255,255,255,0.7)" : LIGHT_TEXT_2 }]}>
            {unread > 0
              ? `${unread} non lue${unread > 1 ? "s" : ""}`
              : `${notifs.length} au total`}
          </Text>
        </View>

        <Pressable
          onPress={() => { Haptics.selectionAsync(); toggleTheme(); }}
          style={({ pressed }) => [
            styles.backBtn,
            {
              backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(10,28,58,0.05)",
              borderColor: isDark ? "transparent" : LIGHT_BORDER,
              borderWidth: isDark ? 0 : 1,
            },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Feather name={isDark ? "sun" : "moon"} size={18} color={isDark ? GOLD : NAVY} />
        </Pressable>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={isDark ? GOLD : NAVY}
          />
        }
      >
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={C.accentIcon} size="large" />
            <Text style={[styles.loadingText, { color: C.textMuted }]}>Chargement...</Text>
          </View>
        ) : notifs.length === 0 ? (
          <EmptyNotifs C={C} isDark={isDark} />
        ) : (
          <>
            {unread > 0 && (
              <Pressable
                style={({ pressed }) => [
                  styles.markAllBtn,
                  { backgroundColor: C.iconBg, borderColor: C.iconBorder },
                  pressed && { opacity: 0.85 },
                ]}
                onPress={markAllRead}
              >
                <Feather name="check-circle" size={14} color={C.accentIcon} />
                <Text style={[styles.markAllText, { color: C.accentIcon }]}>
                  Tout marquer comme lu
                </Text>
              </Pressable>
            )}

            <Animated.View style={{
              opacity: entry0,
              transform: [{ translateY: entry0.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
              gap: 10,
            }}>
              {notifs.map((notif, idx) => {
                const cfg = TYPE_CONFIG[notif.type] ?? TYPE_CONFIG.info;
                const isRead = readIds.has(notif.id);
                return (
                  <Pressable
                    key={notif.id}
                    style={({ pressed }) => [
                      styles.notifCard,
                      {
                        backgroundColor: C.surface,
                        borderColor: isRead ? C.border : cfg.color + "50",
                        shadowColor: isDark ? "#000" : NAVY,
                        shadowOpacity: isDark ? 0.25 : 0.04,
                      },
                      !isRead && { borderLeftWidth: 3, borderLeftColor: cfg.color },
                      pressed && { opacity: 0.9 },
                    ]}
                    onPress={() => handleNotifPress(notif)}
                  >
                    <View style={[styles.notifIcon, { backgroundColor: cfg.bg }]}>
                      <Feather name={cfg.icon} size={20} color={cfg.color} />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={styles.notifTitleRow}>
                        <Text style={[styles.notifTitle, { color: C.text }]} numberOfLines={1}>
                          {notif.title}
                        </Text>
                        {!isRead && <View style={[styles.unreadDot, { backgroundColor: cfg.color }]} />}
                      </View>
                      <Text style={[styles.notifMessage, { color: C.textSecondary }]} numberOfLines={4}>
                        {notif.message}
                      </Text>

                      {(notif.type === "order_partial" || notif.type === "order_cancelled") &&
                        (notif.refundAmount ?? 0) > 0 && (
                          <View style={[styles.refundBadge, { backgroundColor: SUCCESS + "15", borderColor: SUCCESS + "30" }]}>
                            <Feather name="refresh-cw" size={12} color={SUCCESS} />
                            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: SUCCESS }}>
                              {userCountry && userCountry.xafRate !== 1
                                ? `${formatCurrency(notif.refundAmount ?? 0, userCountry)} remboursés`
                                : `${(notif.refundAmount ?? 0).toLocaleString("fr-FR")} FCFA remboursés`}
                            </Text>
                          </View>
                        )}

                      {notif.type === "referral" && (notif.amount ?? 0) > 0 && (
                        <Text style={[styles.notifAmount, { color: isDark ? GOLD : NAVY }]}>
                          +{userCountry && userCountry.xafRate !== 1
                            ? formatCurrency(notif.amount ?? 0, userCountry)
                            : `${(notif.amount ?? 0).toLocaleString("fr-FR")} FCFA`}
                        </Text>
                      )}

                      {notif.type === "nouveau_filleul" && notif.filleulName && (
                        <View style={[styles.refundBadge, { backgroundColor: INFO + "15", borderColor: INFO + "30" }]}>
                          <Feather name="user" size={12} color={INFO} />
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: INFO }}>
                            {notif.filleulName}
                          </Text>
                        </View>
                      )}

                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                        <Text style={[styles.notifTime, { color: C.textMuted }]}>{timeAgo(notif.createdAt)}</Text>
                        {(notif.type === "order_done" || notif.type === "order_partial" || notif.type === "order_cancelled") && (
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: C.accentIcon }}>
                            Voir commandes
                          </Text>
                        )}
                        {(notif.type === "referral" || notif.type === "nouveau_filleul") && (
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: isDark ? GOLD : NAVY }}>
                            Voir parrainage
                          </Text>
                        )}
                        {notif.type === "depot" && (
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: SUCCESS }}>
                            Voir portefeuille
                          </Text>
                        )}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </Animated.View>
          </>
        )}

        {notifs.length > 0 && (
          <View style={styles.footerNote}>
            <Feather name="info" size={13} color={C.textMuted} />
            <Text style={[styles.footerText, { color: C.textMuted }]}>
              Commandes, bonus parrainage, filleuls et alertes importantes.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// Haptics requis pour toggleTheme
import * as Haptics from "expo-haptics";

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
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 20, letterSpacing: -0.3 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12.5, marginTop: 3 },

  content: { padding: 16, gap: 10 },
  loadingState: { alignItems: "center", paddingVertical: 60, gap: 12 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14 },

  markAllBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 12, borderWidth: 1,
  },
  markAllText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  notifCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    borderRadius: 16, padding: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8, elevation: 1,
  },
  notifIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  notifTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  notifTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1, letterSpacing: -0.1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  notifMessage: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  notifAmount: { fontFamily: "Inter_700Bold", fontSize: 13, marginTop: 2 },
  refundBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, alignSelf: "flex-start", marginTop: 2,
  },
  notifTime: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },

  emptyWrap: {
    alignItems: "center", justifyContent: "center",
    paddingVertical: 60, paddingHorizontal: 30, gap: 12,
  },
  emptyTitle: { fontFamily: "Inter_700Bold", fontSize: 18, textAlign: "center", letterSpacing: -0.2 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 13.5, textAlign: "center", maxWidth: 280, lineHeight: 20 },

  footerNote: {
    flexDirection: "row", alignItems: "center", gap: 6,
    justifyContent: "center", marginTop: 8,
  },
  footerText: { fontFamily: "Inter_400Regular", fontSize: 12 },
});