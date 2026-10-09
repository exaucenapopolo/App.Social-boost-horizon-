import Feather from "@expo/vector-icons/Feather";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import StarBackground from "@/components/StarBackground";
import { useAuth } from "@/context/AuthContext";
import { Order, useOrders } from "@/context/OrdersContext";
import { useTheme } from "@/context/ThemeContext";
import { COUNTRIES, Country, formatCurrency } from "@/lib/countries";

// ═══════════════════════════════════════════════════════════════
//  PALETTE (identique dashboard / new-order)
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
//  CONFIGS
// ═══════════════════════════════════════════════════════════════
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  "En attente": { label: "En attente", color: WARNING, bg: "rgba(245,158,11,0.12)", icon: "clock" },
  "en cours":   { label: "En cours",   color: INFO,    bg: "rgba(59,130,246,0.12)", icon: "loader" },
  "succès":     { label: "Terminé",    color: SUCCESS, bg: "rgba(16,185,129,0.12)", icon: "check-circle" },
  "annulée":    { label: "Annulé",     color: DANGER,  bg: "rgba(239,68,68,0.12)",  icon: "x-circle" },
  "remboursé":  { label: "Remboursé",  color: PURPLE,  bg: "rgba(139,92,246,0.12)", icon: "refresh-ccw" },
  "partiel":    { label: "Partiel",    color: "#FF6B35", bg: "rgba(255,107,53,0.12)", icon: "alert-circle" },
  pending:      { label: "En attente", color: WARNING, bg: "rgba(245,158,11,0.12)", icon: "clock" },
  processing:   { label: "En cours",   color: INFO,    bg: "rgba(59,130,246,0.12)", icon: "loader" },
  completed:    { label: "Terminé",    color: SUCCESS, bg: "rgba(16,185,129,0.12)", icon: "check-circle" },
  cancelled:    { label: "Annulé",     color: DANGER,  bg: "rgba(239,68,68,0.12)",  icon: "x-circle" },
};

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  standard:    { label: "Standard",    color: INFO,    bg: "rgba(59,130,246,0.15)" },
  revendeur:   { label: "Revendeur",   color: GOLD,    bg: "rgba(212,175,55,0.15)" },
  automatique: { label: "Automatique", color: SUCCESS, bg: "rgba(16,185,129,0.15)" },
  avancee:     { label: "Avancée",     color: "#FF6B35", bg: "rgba(255,107,53,0.15)" },
  "avancée":   { label: "Avancée",     color: "#FF6B35", bg: "rgba(255,107,53,0.15)" },
};

const STATUS_FILTERS = [
  { key: "all",        label: "Toutes",     icon: "list" as const },
  { key: "En attente", label: "En attente", icon: "clock" as const },
  { key: "en cours",   label: "En cours",   icon: "loader" as const },
  { key: "succès",     label: "Terminées",  icon: "check-circle" as const },
  { key: "annulée",    label: "Annulées",   icon: "x-circle" as const },
];

const TYPE_FILTERS = [
  { key: "all",         label: "Tous",         color: GOLD },
  { key: "standard",    label: "Standard",     color: INFO },
  { key: "revendeur",   label: "Revendeur",    color: GOLD },
  { key: "automatique", label: "Automatique",  color: SUCCESS },
  { key: "avancée",     label: "Avancée",      color: "#FF6B35" },
];

// ═══════════════════════════════════════════════════════════════
//  RECOMMANDATIONS INTELLIGENTES
// ═══════════════════════════════════════════════════════════════
function detectOrderCategory(name: string): string {
  const n = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("comment")) return "comments";
  if (n.includes("like") || n.includes("j'aime") || n.includes("jaime")) return "likes";
  if (n.includes("partage") || n.includes("share") || n.includes("retweet")) return "shares";
  if (n.includes("save") || n.includes("enregistr")) return "saves";
  if (n.includes("vue") || n.includes("view")) return "views";
  if (n.includes("abonn") || n.includes("follower") || n.includes("subscriber")) return "followers";
  if (n.includes("play") || n.includes("stream") || n.includes("ecout") || n.includes("lecture")) return "plays";
  return "other";
}

const RECO_MAP: Record<string, { title: string; message: string; suggestions: string[]; icon: any; color: string }> = {
  views: {
    title: "Complétez vos vues",
    message: "Les vues seules font chuter votre engagement. Pour un rendu 100% naturel, ajoutez des likes (min. 50% des vues), des commentaires et des partages.",
    suggestions: ["Likes", "Commentaires", "Partages"],
    icon: "eye",
    color: INFO,
  },
  likes: {
    title: "Complétez vos likes",
    message: "Pour respecter la règle des proportions, accompagnez vos likes de vues (min. 2× le nombre de likes) et de quelques commentaires.",
    suggestions: ["Vues", "Commentaires"],
    icon: "heart",
    color: "#EC4899",
  },
  followers: {
    title: "Cohérence de votre croissance",
    message: "De nouveaux abonnés sans activité = profil suspect. Ajoutez des likes et des vues sur vos dernières publications.",
    suggestions: ["Likes", "Vues"],
    icon: "users",
    color: SUCCESS,
  },
  comments: {
    title: "Naturel avant tout",
    message: "Les commentaires isolés sont facilement détectables par l'algorithme. Ajoutez des likes pour crédibiliser l'engagement.",
    suggestions: ["Likes", "Vues"],
    icon: "message-circle",
    color: WARNING,
  },
  shares: {
    title: "Renforcez la portée",
    message: "Les partages sont puissants mais visibles seuls. Complétez avec des likes et des vues pour un impact maximal.",
    suggestions: ["Likes", "Vues"],
    icon: "share-2",
    color: "#06B6D4",
  },
  saves: {
    title: "Renforcez l'algorithme",
    message: "Les sauvegardes sont un signal fort. Complétez avec likes et vues pour maximiser votre portée.",
    suggestions: ["Likes", "Vues"],
    icon: "bookmark",
    color: "#A16207",
  },
  plays: {
    title: "Booster vos écoutes",
    message: "Accompagnez vos écoutes de likes pour que l'algorithme recommande activement votre contenu.",
    suggestions: ["Likes", "Partages"],
    icon: "play-circle",
    color: SUCCESS,
  },
};

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
//  COPY BUTTON
// ═══════════════════════════════════════════════════════════════
function CopyBtn({ value, label, C }: { value: string; label: string; C: any }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Pressable
      onPress={handleCopy}
      style={({ pressed }) => [
        styles.copyBtn,
        {
          backgroundColor: copied ? SUCCESS + "15" : C.iconBg,
          borderColor: copied ? SUCCESS + "40" : C.iconBorder,
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Feather name={copied ? "check" : "copy"} size={11} color={copied ? SUCCESS : C.accentIcon} />
      <Text style={[styles.copyBtnText, { color: copied ? SUCCESS : C.accentIcon }]}>
        {copied ? "Copié !" : label}
      </Text>
    </Pressable>
  );
}

// ═══════════════════════════════════════════════════════════════
//  RECOMMANDATION CARD (affichée sous une commande active)
// ═══════════════════════════════════════════════════════════════
function RecommendationInline({ order, C, isDark }: any) {
  const cat = detectOrderCategory(order.serviceName);
  const reco = RECO_MAP[cat];
  if (!reco) return null;

  // Only for active orders
  const isActive =
    order.status === "En attente" || order.status === "en cours" ||
    order.status === "pending"    || order.status === "processing";
  if (!isActive) return null;

  const handleGo = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: "/(tabs)/new-order" as any,
      params: {
        reco: reco.suggestions.join(","),
        platform: order.platform ?? "",
      },
    } as any);
  };

  return (
    <View
      style={[
        styles.recoCard,
        {
          backgroundColor: isDark ? "rgba(212,175,55,0.06)" : "rgba(212,175,55,0.08)",
          borderColor: GOLD + "40",
        },
      ]}
    >
      <View style={styles.recoHeader}>
        <View style={[styles.recoIconBox, { backgroundColor: GOLD + "22" }]}>
          <Feather name="zap" size={13} color={isDark ? GOLD : GOLD_SOFT} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.recoTitle, { color: isDark ? GOLD : NAVY }]}>{reco.title}</Text>
          <Text style={[styles.recoMessage, { color: isDark ? "rgba(255,255,255,0.65)" : LIGHT_TEXT_2 }]}>
            {reco.message}
          </Text>
        </View>
      </View>

      <View style={styles.recoSuggestions}>
        {reco.suggestions.map((s, i) => (
          <View key={i} style={[styles.recoChip, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#FFFFFF", borderColor: isDark ? DARK_BORDER : LIGHT_BORDER }]}>
            <Feather name="plus-circle" size={10} color={isDark ? GOLD : GOLD_SOFT} />
            <Text style={[styles.recoChipText, { color: isDark ? "#fff" : LIGHT_TEXT }]}>{s}</Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={handleGo}
        style={({ pressed }) => [
          styles.recoBtn,
          { backgroundColor: isDark ? GOLD : NAVY },
          pressed && { opacity: 0.9 },
        ]}
      >
        <Feather name="shopping-cart" size={13} color={isDark ? "#000" : GOLD} />
        <Text style={[styles.recoBtnText, { color: isDark ? "#000" : GOLD }]}>
          Commander un service complémentaire
        </Text>
        <Feather name="arrow-right" size={13} color={isDark ? "#000" : GOLD} />
      </Pressable>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  ORDER CARD
// ═══════════════════════════════════════════════════════════════
function OrderCard({
  order, onCancel, onRefreshStatus, userCountry, C, isDark,
}: {
  order: Order;
  onCancel: () => void;
  onRefreshStatus: () => Promise<void>;
  userCountry?: Country | null;
  C: any;
  isDark: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const cfg     = STATUS_CONFIG[order.status] ?? STATUS_CONFIG["En attente"];
  const typeKey = (order.type ?? "standard").toLowerCase();
  const typeCfg = TYPE_CONFIG[typeKey] ?? TYPE_CONFIG["standard"];
  const date    = new Date(order.createdAt);
  const progress = order.progress ?? 0;

  const displayId = order.orderId ?? order.id.slice(-8).toUpperCase();
  const exactDate = date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    + " à "
    + date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const hasProviderData = order.remains != null;
  const livré = hasProviderData
    ? Math.max(order.quantity - (order.remains ?? 0), 0)
    : null;

  const handleRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRefreshing(true);
    try { await onRefreshStatus(); }
    finally { setRefreshing(false); }
  };

  const handleOpenLink = () => {
    if (order.link) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Linking.openURL(order.link).catch(() => Alert.alert("Erreur", "Impossible d'ouvrir ce lien."));
    }
  };

  const canCancel  = order.status === "En attente" || (order.status as string) === "pending";
  const isFinished = order.status === "annulée" || order.status === "remboursé" || (order.status as string) === "cancelled";

  const { scale, onPressIn, onPressOut } = usePressSpring(0.995);
  const expandAnim = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: expanded ? 1 : 0, duration: 260,
      useNativeDriver: false, easing: Easing.out(Easing.cubic),
    }).start();
  }, [expanded]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[
          styles.orderCard,
          {
            backgroundColor: C.surface,
            borderColor: C.border,
            shadowColor: isDark ? "#000" : NAVY,
            shadowOpacity: isDark ? 0.30 : 0.05,
          },
        ]}
      >
        <View style={[styles.orderTopBar, { backgroundColor: cfg.color }]} />

        <Pressable
          onPress={() => { setExpanded((e) => !e); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          {/* Header row */}
          <View style={styles.orderHeader}>
            <View style={[styles.orderStatusDot, { backgroundColor: cfg.color }]} />
            <Text style={[styles.orderId, { color: C.textMuted }]} numberOfLines={1}>#{displayId}</Text>
            <View style={styles.headerBadges}>
              <View style={[styles.typeBadge, { backgroundColor: typeCfg.bg }]}>
                <Text style={[styles.typeBadgeText, { color: typeCfg.color }]}>{typeCfg.label}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                <Feather name={cfg.icon} size={10} color={cfg.color} />
                <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
            </View>
            <Feather
              name={expanded ? "chevron-up" : "chevron-down"}
              size={14}
              color={C.textMuted}
            />
          </View>

          <Text style={[styles.orderName, { color: C.text }]} numberOfLines={2}>
            {order.serviceName}
          </Text>
          <Text style={[styles.orderPlatform, { color: C.textMuted }]}>{order.platform}</Text>

          <View style={styles.orderMeta}>
            <View style={styles.metaItem}>
              <Feather name="hash" size={12} color={C.textMuted} />
              <Text style={[styles.metaText, { color: C.textMuted }]}>
                {order.quantity.toLocaleString()} unités
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Feather name="calendar" size={12} color={C.textMuted} />
              <Text style={[styles.metaText, { color: C.textMuted }]}>
                {date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Feather name="dollar-sign" size={12} color={isDark ? GOLD : NAVY} />
              <Text style={[styles.metaText, { color: isDark ? GOLD : NAVY }]}>
                {userCountry && userCountry.xafRate !== 1
                  ? formatCurrency(order.price, userCountry)
                  : `${order.price.toLocaleString("fr-FR")} FCFA`}
              </Text>
            </View>
          </View>

          {!isFinished && (
            <View style={styles.progressRow}>
              <View style={[styles.progressTrack, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(10,28,58,0.08)" }]}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(progress, 100)}%` as any, backgroundColor: cfg.color },
                  ]}
                />
              </View>
              <Text style={[styles.progressText, { color: cfg.color }]}>{progress}%</Text>
            </View>
          )}
        </Pressable>

        {expanded && (
          <View style={styles.expandedSection}>
            <View style={[styles.expandedDivider, { backgroundColor: C.border }]} />

            <View style={styles.copyRow}>
              <CopyBtn value={displayId} label="ID" C={C} />
              <CopyBtn value={exactDate} label="Date" C={C} />
              <CopyBtn value={order.serviceName} label="Service" C={C} />
            </View>

            <View style={styles.expandedRow}>
              <Feather name="clock" size={12} color={C.textMuted} />
              <Text style={[styles.expandedLabel, { color: C.textMuted }]}>Date exacte :</Text>
              <Text style={[styles.expandedValue, { color: C.text }]}>{exactDate}</Text>
            </View>

            {order.link ? (
              <View style={styles.expandedRow}>
                <Feather name="link-2" size={12} color={C.textMuted} />
                <Text style={[styles.expandedLabel, { color: C.textMuted }]}>Lien :</Text>
                <Text style={[styles.expandedValue, { color: C.text }]} numberOfLines={2}>{order.link}</Text>
                <Pressable
                  style={[styles.linkBtn, { backgroundColor: C.iconBg, borderColor: C.iconBorder }]}
                  onPress={handleOpenLink}
                >
                  <Feather name="external-link" size={13} color={C.accentIcon} />
                  <Text style={[styles.linkBtnText, { color: C.accentIcon }]}>Ouvrir</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.expandedRow}>
              <Feather name="tag" size={12} color={C.textMuted} />
              <Text style={[styles.expandedLabel, { color: C.textMuted }]}>Type :</Text>
              <Text style={[styles.expandedValue, { color: typeCfg.color }]}>{typeCfg.label}</Text>
            </View>

            <View style={styles.expandedRow}>
              <Feather name="activity" size={12} color={C.textMuted} />
              <Text style={[styles.expandedLabel, { color: C.textMuted }]}>Progression :</Text>
              <Text style={[styles.expandedValue, { color: cfg.color }]}>
                {progress}% — {cfg.label}
              </Text>
            </View>

            {!isFinished && (
              <View style={[styles.countRow, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                <View style={styles.countBox}>
                  <Feather name="play-circle" size={12} color={C.textMuted} />
                  <Text style={[styles.countLabel, { color: C.textMuted }]}>Départ</Text>
                  <Text style={[styles.countValue, { color: C.text }]}>
                    {order.startCount != null ? order.startCount.toLocaleString("fr-FR") : "—"}
                  </Text>
                </View>
                <View style={[styles.countDivider, { backgroundColor: C.border }]} />
                <View style={styles.countBox}>
                  <Feather name="minus-circle" size={12} color={cfg.color} />
                  <Text style={[styles.countLabel, { color: C.textMuted }]}>Reste</Text>
                  <Text style={[styles.countValue, { color: cfg.color }]}>
                    {hasProviderData ? (order.remains ?? 0).toLocaleString("fr-FR") : "—"}
                  </Text>
                </View>
                <View style={[styles.countDivider, { backgroundColor: C.border }]} />
                <View style={styles.countBox}>
                  <Feather name="check-circle" size={12} color={SUCCESS} />
                  <Text style={[styles.countLabel, { color: C.textMuted }]}>Livré</Text>
                  <Text style={[styles.countValue, { color: SUCCESS }]}>
                    {livré != null ? livré.toLocaleString("fr-FR") : "—"}
                  </Text>
                </View>
              </View>
            )}

            {!hasProviderData && !isFinished && (
              <Text style={[styles.providerHint, { color: C.textMuted }]}>
                Les données fournisseur apparaîtront après la 1ère actualisation (auto toutes les 8 min)
              </Text>
            )}

            <View style={styles.actionRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.refreshBtn,
                  { backgroundColor: C.iconBg, borderColor: C.iconBorder },
                  pressed && { opacity: 0.85 },
                ]}
                onPress={handleRefresh}
                disabled={refreshing}
              >
                {refreshing
                  ? <ActivityIndicator size={13} color={C.accentIcon} />
                  : <Feather name="refresh-cw" size={13} color={C.accentIcon} />}
                <Text style={[styles.refreshBtnText, { color: C.accentIcon }]}>
                  {refreshing ? "Actualisation…" : "Actualiser"}
                </Text>
              </Pressable>
              {canCancel && (
                <Pressable
                  style={({ pressed }) => [
                    styles.cancelBtn,
                    { backgroundColor: DANGER + "12", borderColor: DANGER + "30" },
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={onCancel}
                >
                  <Feather name="x" size={13} color={DANGER} />
                  <Text style={[styles.cancelText, { color: DANGER }]}>Annuler</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </Pressable>

      {/* Recommandation inline */}
      <RecommendationInline order={order} C={C} isDark={isDark} />
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  EMPTY STATE (illustration)
// ═══════════════════════════════════════════════════════════════
function EmptyState({ onCta, C, isDark, filtered }: any) {
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

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });

  return (
    <View style={styles.emptyWrap}>
      <Animated.View style={[styles.emptyIllustration, { transform: [{ translateY }] }]}>
        {/* Halo */}
        <View style={[styles.emptyHalo, { backgroundColor: C.iconBg, borderColor: C.iconBorder }]} />
        {/* Icône principale */}
        <View style={[styles.emptyIconCenter, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Feather name="package" size={44} color={C.accentIcon} />
        </View>
        {/* Petits dots */}
        <View style={[styles.emptyDot, { backgroundColor: GOLD, top: 8, right: 24, opacity: 0.55 }]} />
        <View style={[styles.emptyDot, { backgroundColor: INFO, bottom: 20, left: 18, opacity: 0.45 }]} />
        <View style={[styles.emptyDot, { backgroundColor: SUCCESS, top: 60, left: -6, opacity: 0.4 }]} />
        {/* Petits cercles */}
        <View style={[styles.emptyRing, { borderColor: GOLD + "60", top: -14, right: -10 }]} />
        <View style={[styles.emptyRing, { borderColor: INFO + "50", bottom: -8, left: -4, width: 22, height: 22, borderRadius: 11 }]} />
      </Animated.View>

      <Text style={[styles.emptyTitle, { color: C.text }]}>
        {filtered ? "Aucun résultat" : "Aucune commande pour l'instant"}
      </Text>
      <Text style={[styles.emptyText, { color: C.textMuted }]}>
        {filtered
          ? "Essayez de modifier vos filtres ou de revenir à la vue d'ensemble."
          : "Lancez votre première commande et boostez votre présence en ligne dès maintenant."}
      </Text>

      {!filtered && (
        <Pressable
          style={({ pressed }) => [
            styles.emptyCta,
            { shadowColor: isDark ? "#000" : NAVY },
            pressed && { transform: [{ scale: 0.97 }] },
          ]}
          onPress={onCta}
        >
          <LinearGradient
            colors={isDark ? [NAVY_LIGHT, NAVY] : [NAVY, "#071229"]}
            style={styles.emptyCtaGradient}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          >
            <Feather name="plus-circle" size={16} color={GOLD} />
            <Text style={styles.emptyCtaText}>Passer ma première commande</Text>
            <Feather name="arrow-right" size={16} color={GOLD} />
          </LinearGradient>
        </Pressable>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ═══════════════════════════════════════════════════════════════
export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { orders, isLoading, cancelOrder, refreshOrders, refreshOrderStatus } = useOrders();
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

  const [activeStatusFilter, setActiveStatusFilter] = useState("all");
  const [activeTypeFilter, setActiveTypeFilter]     = useState("all");

  const userCountry = user?.country
    ? COUNTRIES.find((c) => c.code === user.country?.toLowerCase()) ?? null
    : null;

  const topPad = Platform.OS === "web" ? insets.top + 64 : insets.top;

  const filtered = orders.filter((o) => {
    if (activeStatusFilter !== "all") {
      const statusMatch =
        o.status === activeStatusFilter ||
        (STATUS_CONFIG[o.status]?.label === STATUS_CONFIG[activeStatusFilter]?.label);
      if (!statusMatch) return false;
    }
    if (activeTypeFilter !== "all") {
      const typeKey = (o.type ?? "standard").toLowerCase();
      const filterKey = activeTypeFilter.toLowerCase();
      if (typeKey !== filterKey) return false;
    }
    return true;
  });

  const pendingCount = orders.filter((o) => o.status === "En attente" || (o.status as string) === "pending").length;
  const completedCount = orders.filter((o) => o.status === "succès" || (o.status as string) === "completed").length;
  const activeCount = orders.filter((o) => o.status === "en cours" || (o.status as string) === "processing").length;

  const handleCancel = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await cancelOrder(id);
  };

  const handleRefreshStatus = async (id: string) => {
    const result = await refreshOrderStatus(id);
    if (!result) {
      Alert.alert(
        "Fournisseur inaccessible",
        "Impossible de récupérer le statut en temps réel. Réessayez plus tard."
      );
    }
  };

  const goBack = () => {
    Haptics.selectionAsync();
    if (router.canGoBack?.()) router.back();
    else router.push("/(tabs)" as any);
  };

  const goNewOrder = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/(tabs)/new-order" as any);
  };

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <StarBackground dark={isDark} />

      {/* ═══ HEADER adaptatif ═══ */}
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
            Mes commandes
          </Text>
          <Text style={[styles.headerSub, { color: isDark ? "rgba(255,255,255,0.7)" : LIGHT_TEXT_2 }]}>
            {orders.length} commande{orders.length !== 1 ? "s" : ""} au total
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
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.statsBar}
        contentContainerStyle={styles.statsBarContent}
      >
        {[
          { label: "Total",        value: orders.length,    color: isDark ? GOLD : NAVY,      icon: "package" as const },
          { label: "En cours",     value: activeCount,      color: INFO,                       icon: "loader" as const },
          { label: "En attente",   value: pendingCount,     color: WARNING,                    icon: "clock" as const },
          { label: "Terminées",    value: completedCount,   color: SUCCESS,                    icon: "check-circle" as const },
        ].map((s, i) => (
          <View
            key={i}
            style={[
              styles.statChip,
              { backgroundColor: C.surface, borderColor: C.border },
            ]}
          >
            <View style={[styles.statChipIcon, { backgroundColor: s.color + "20" }]}>
              <Feather name={s.icon} size={12} color={s.color} />
            </View>
            <Text style={[styles.statChipValue, { color: C.text }]}>{s.value}</Text>
            <Text style={[styles.statChipLabel, { color: C.textMuted }]}>{s.label}</Text>
          </View>
        ))}
      </ScrollView>

      {/* ═══ Status segmented control ═══ */}
      <View style={styles.filtersWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {STATUS_FILTERS.map((f) => {
            const active = activeStatusFilter === f.key;
            return (
              <Pressable
                key={f.key}
                style={({ pressed }) => [
                  styles.filterChip,
                  {
                    backgroundColor: active
                      ? (isDark ? GOLD : NAVY)
                      : C.surface,
                    borderColor: active
                      ? (isDark ? GOLD : NAVY)
                      : C.border,
                  },
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => {
                  setActiveStatusFilter(f.key);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Feather
                  name={f.icon}
                  size={12}
                  color={active ? (isDark ? "#0A1C3A" : "#FFFFFF") : C.textMuted}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: active
                        ? (isDark ? "#0A1C3A" : "#FFFFFF")
                        : C.textMuted,
                    },
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Type pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.filterRow, { paddingTop: 8 }]}
        >
          {TYPE_FILTERS.map((f) => {
            const active = activeTypeFilter === f.key;
            return (
              <Pressable
                key={f.key}
                style={({ pressed }) => [
                  styles.typeChip,
                  {
                    backgroundColor: active ? f.color + "18" : "transparent",
                    borderColor: active ? f.color : C.border,
                  },
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => {
                  setActiveTypeFilter(f.key);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <View style={[styles.typeDot, { backgroundColor: f.color }]} />
                <Text
                  style={[
                    styles.typeChipText,
                    { color: active ? f.color : C.textMuted },
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            onCancel={() => handleCancel(item.id)}
            onRefreshStatus={() => handleRefreshStatus(item.id)}
            userCountry={userCountry}
            C={C}
            isDark={isDark}
          />
        )}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 100 },
          filtered.length === 0 && { flexGrow: 1 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => user?.id && refreshOrders(user.id)}
            tintColor={isDark ? GOLD : NAVY}
          />
        }
        ListEmptyComponent={
          <EmptyState
            onCta={goNewOrder}
            C={C}
            isDark={isDark}
            filtered={activeStatusFilter !== "all" || activeTypeFilter !== "all"}
          />
        }
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  root: { flex: 1 },

  /* Header */
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
    borderWidth: 1,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 20, letterSpacing: -0.3 },
  headerSub:   { fontFamily: "Inter_400Regular", fontSize: 12.5, marginTop: 3 },

  /* Stats bar */
  statsBar: { flexGrow: 0, flexShrink: 0 },
  statsBarContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, gap: 8 },
  statChip: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 14, borderWidth: 1, minWidth: 110,
  },
  statChipIcon: {
    width: 26, height: 26, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  statChipValue: { fontFamily: "Inter_700Bold", fontSize: 15, letterSpacing: -0.2 },
  statChipLabel: { fontFamily: "Inter_400Regular", fontSize: 11, marginLeft: 2 },

  /* Filters */
  filtersWrapper: { paddingBottom: 4 },
  filterRow: { paddingHorizontal: 14, gap: 8 },
  filterChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1,
  },
  filterChipText: { fontFamily: "Inter_600SemiBold", fontSize: 12.5, letterSpacing: 0.1 },

  typeChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, borderWidth: 1,
  },
  typeDot: { width: 6, height: 6, borderRadius: 3 },
  typeChipText: { fontFamily: "Inter_500Medium", fontSize: 11.5, letterSpacing: 0.05 },

  /* List */
  listContent: { padding: 14, gap: 12 },

  /* Order card */
  orderCard: {
    borderRadius: 18, borderWidth: 1,
    overflow: "hidden", padding: 14, gap: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12, elevation: 2,
  },
  orderTopBar: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  orderHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  orderStatusDot: { width: 8, height: 8, borderRadius: 4 },
  orderId: { fontFamily: "Inter_600SemiBold", fontSize: 12, flex: 1, letterSpacing: 0.2 },
  headerBadges: { flexDirection: "row", gap: 6, alignItems: "center" },

  typeBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  typeBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.2 },

  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
  },
  statusText: { fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 0.2 },

  orderName: { fontFamily: "Inter_700Bold", fontSize: 14.5, letterSpacing: -0.1, marginTop: 6 },
  orderPlatform: { fontFamily: "Inter_400Regular", fontSize: 12 },

  orderMeta: { flexDirection: "row", gap: 14, marginTop: 8, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontFamily: "Inter_500Medium", fontSize: 11.5 },

  progressRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  progressTrack: { flex: 1, height: 5, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  progressText: { fontFamily: "Inter_700Bold", fontSize: 11.5, minWidth: 34 },

  expandedSection: { marginTop: 8, gap: 9 },
  expandedDivider: { height: 1, marginBottom: 4 },
  expandedRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  expandedLabel: { fontFamily: "Inter_500Medium", fontSize: 11.5, minWidth: 88 },
  expandedValue: { fontFamily: "Inter_500Medium", fontSize: 11.5, flex: 1 },

  linkBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1,
  },
  linkBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },

  actionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 6 },

  refreshBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1, flex: 1,
    justifyContent: "center",
  },
  refreshBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },

  cancelBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1,
  },
  cancelText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },

  countRow: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 12, borderWidth: 1,
    paddingVertical: 10, paddingHorizontal: 8, marginTop: 4,
  },
  countBox: { flex: 1, alignItems: "center", gap: 3 },
  countDivider: { width: 1, height: 30 },
  countLabel: { fontFamily: "Inter_400Regular", fontSize: 10, letterSpacing: 0.2, textTransform: "uppercase" },
  countValue: { fontFamily: "Inter_700Bold", fontSize: 14 },

  copyRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 4 },
  copyBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1,
  },
  copyBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },

  providerHint: {
    fontFamily: "Inter_400Regular", fontSize: 11,
    fontStyle: "italic", textAlign: "center", marginTop: 4,
  },

  /* Recommendation */
  recoCard: {
    marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1,
    gap: 10,
  },
  recoHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  recoIconBox: {
    width: 28, height: 28, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  recoTitle: { fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: -0.1 },
  recoMessage: { fontFamily: "Inter_400Regular", fontSize: 11.5, lineHeight: 17, marginTop: 3 },
  recoSuggestions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  recoChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1,
  },
  recoChipText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  recoBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: 11, marginTop: 2,
  },
  recoBtnText: { fontFamily: "Inter_700Bold", fontSize: 12.5, letterSpacing: 0.1 },

  /* Empty state */
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 30, gap: 16 },
  emptyIllustration: { width: 160, height: 140, alignItems: "center", justifyContent: "center", position: "relative" },
  emptyHalo: {
    position: "absolute", width: 140, height: 140, borderRadius: 70,
    borderWidth: 1, opacity: 0.5,
  },
  emptyIconCenter: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  emptyDot: { position: "absolute", width: 8, height: 8, borderRadius: 4 },
  emptyRing: { position: "absolute", width: 30, height: 30, borderRadius: 15, borderWidth: 1.5 },
  emptyTitle: { fontFamily: "Inter_700Bold", fontSize: 18, textAlign: "center", letterSpacing: -0.2 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 13.5, textAlign: "center", lineHeight: 20 },
  emptyCta: {
    borderRadius: 14, overflow: "hidden", marginTop: 6,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 4,
  },
  emptyCtaGradient: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 20, paddingVertical: 14,
  },
  emptyCtaText: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#FFFFFF", letterSpacing: 0.1 },
});