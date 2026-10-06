import Feather from "@expo/vector-icons/Feather";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import React, { useState } from "react";
import {
  Alert,
  ActivityIndicator,
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
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { Order, useOrders } from "@/context/OrdersContext";
import { COUNTRIES, Country, formatCurrency } from "@/lib/countries";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  "En attente": { label: "En attente", color: "#FF9800", bg: "rgba(255,152,0,0.12)", icon: "clock" },
  "en cours":   { label: "En cours",   color: Colors.accent, bg: "rgba(30,144,255,0.12)", icon: "loader" },
  "succès":     { label: "Terminé",    color: Colors.success, bg: "rgba(76,175,80,0.12)", icon: "check-circle" },
  "annulée":    { label: "Annulé",     color: Colors.error, bg: "rgba(255,107,107,0.12)", icon: "x-circle" },
  "remboursé":  { label: "Remboursé", color: "#9C27B0", bg: "rgba(156,39,176,0.12)", icon: "refresh-ccw" },
  "partiel":    { label: "Partiel",   color: "#FF6B35", bg: "rgba(255,107,53,0.12)", icon: "alert-circle" },
  pending:      { label: "En attente", color: "#FF9800", bg: "rgba(255,152,0,0.12)", icon: "clock" },
  processing:   { label: "En cours",   color: Colors.accent, bg: "rgba(30,144,255,0.12)", icon: "loader" },
  completed:    { label: "Terminé",    color: Colors.success, bg: "rgba(76,175,80,0.12)", icon: "check-circle" },
  cancelled:    { label: "Annulé",     color: Colors.error, bg: "rgba(255,107,107,0.12)", icon: "x-circle" },
};

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  standard:    { label: "Standard",    color: "#1E90FF", bg: "rgba(30,144,255,0.15)" },
  revendeur:   { label: "Revendeur",   color: "#FFD700", bg: "rgba(255,215,0,0.15)" },
  automatique: { label: "Automatique", color: "#00C853", bg: "rgba(0,200,83,0.15)"  },
  avancee:     { label: "Avancée",     color: "#FF6B35", bg: "rgba(255,107,53,0.15)" },
  "avancée":   { label: "Avancée",     color: "#FF6B35", bg: "rgba(255,107,53,0.15)" },
};

const STATUS_FILTERS = [
  { key: "all",        label: "Toutes" },
  { key: "En attente", label: "En attente" },
  { key: "en cours",   label: "En cours" },
  { key: "succès",     label: "Terminées" },
  { key: "annulée",    label: "Annulées" },
];

const TYPE_FILTERS = [
  { key: "all",        label: "Tous types" },
  { key: "standard",   label: "Standard" },
  { key: "revendeur",  label: "Revendeur" },
  { key: "automatique", label: "Automatique" },
  { key: "avancée",    label: "Avancée" },
];

function CopyBtn({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Pressable style={styles.copyBtn} onPress={handleCopy}>
      <Feather name={copied ? "check" : "copy"} size={11} color={copied ? Colors.success : Colors.accent} />
      <Text style={[styles.copyBtnText, { color: copied ? Colors.success : Colors.accent }]}>
        {copied ? "Copié !" : label}
      </Text>
    </Pressable>
  );
}

function OrderCard({
  order,
  onCancel,
  onRefreshStatus,
  userCountry,
}: {
  order: Order;
  onCancel: () => void;
  onRefreshStatus: () => Promise<void>;
  userCountry?: Country | null;
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

  // Calculs directs depuis données fournisseur
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

  return (
    <View style={styles.orderCard}>
      <View style={[styles.orderTopBar, { backgroundColor: cfg.color }]} />

      {/* Zone pressable limitée au résumé seulement — évite le conflit avec les boutons d'action */}
      <Pressable
        onPress={() => { setExpanded((e) => !e); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={styles.orderHeader}>
          <View style={[styles.orderStatusDot, { backgroundColor: cfg.color }]} />
          <Text style={styles.orderId} numberOfLines={1}>#{displayId}</Text>
          <View style={styles.headerBadges}>
            <View style={[styles.typeBadge, { backgroundColor: typeCfg.bg }]}>
              <Text style={[styles.typeBadgeText, { color: typeCfg.color }]}>{typeCfg.label}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
              <Feather name={cfg.icon as any} size={10} color={cfg.color} />
              <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={14} color="rgba(255,255,255,0.35)" />
        </View>

        <Text style={styles.orderName} numberOfLines={2}>{order.serviceName}</Text>
        <Text style={styles.orderPlatform}>{order.platform}</Text>

        <View style={styles.orderMeta}>
          <View style={styles.metaItem}>
            <Feather name="hash" size={12} color={Colors.textMuted} />
            <Text style={styles.metaText}>{order.quantity.toLocaleString()} unités</Text>
          </View>
          <View style={styles.metaItem}>
            <Feather name="calendar" size={12} color={Colors.textMuted} />
            <Text style={styles.metaText}>
              {date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Feather name="dollar-sign" size={12} color="#FFD700" />
            <Text style={[styles.metaText, { color: "#FFD700" }]}>
              {userCountry && userCountry.xafRate !== 1
                ? formatCurrency(order.price, userCountry)
                : `${order.price.toLocaleString("fr-FR")} FCFA`}
            </Text>
          </View>
        </View>

        {/* Barre de progression réelle */}
        {!isFinished && (
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
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
          <View style={styles.expandedDivider} />

          {/* ── Boutons copier ──────────────────────────────────────── */}
          <View style={styles.copyRow}>
            <CopyBtn value={displayId} label="Copier ID" />
            <CopyBtn value={exactDate} label="Copier date" />
            <CopyBtn value={order.serviceName} label="Copier service" />
          </View>

          {/* Date exacte avec secondes */}
          <View style={styles.expandedRow}>
            <Feather name="clock" size={12} color={Colors.textMuted} />
            <Text style={styles.expandedLabel}>Date exacte :</Text>
            <Text style={styles.expandedValue}>{exactDate}</Text>
          </View>

          {/* Lien */}
          {order.link ? (
            <View style={styles.expandedRow}>
              <Feather name="link-2" size={12} color={Colors.textMuted} />
              <Text style={styles.expandedLabel}>Lien :</Text>
              <Text style={styles.expandedValue} numberOfLines={2}>{order.link}</Text>
              <Pressable style={styles.linkBtn} onPress={handleOpenLink}>
                <Feather name="external-link" size={13} color={Colors.accent} />
                <Text style={styles.linkBtnText}>Ouvrir</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.expandedRow}>
            <Feather name="tag" size={12} color={Colors.textMuted} />
            <Text style={styles.expandedLabel}>Type :</Text>
            <Text style={[styles.expandedValue, { color: typeCfg.color }]}>{typeCfg.label}</Text>
          </View>

          <View style={styles.expandedRow}>
            <Feather name="activity" size={12} color={Colors.textMuted} />
            <Text style={styles.expandedLabel}>Progression :</Text>
            <Text style={[styles.expandedValue, { color: cfg.color }]}>
              {progress}% — {cfg.label}
            </Text>
          </View>

          {/* ── Compteurs fournisseur (toujours affichés pour commandes actives) ── */}
          {!isFinished && (
            <View style={styles.countRow}>
              {/* Départ */}
              <View style={styles.countBox}>
                <Feather name="play-circle" size={12} color="rgba(255,255,255,0.5)" />
                <Text style={styles.countLabel}>Départ</Text>
                <Text style={styles.countValue}>
                  {order.startCount != null
                    ? order.startCount.toLocaleString("fr-FR")
                    : "—"}
                </Text>
              </View>
              <View style={styles.countDivider} />
              {/* Reste à livrer */}
              <View style={styles.countBox}>
                <Feather name="minus-circle" size={12} color={cfg.color} />
                <Text style={styles.countLabel}>Reste</Text>
                <Text style={[styles.countValue, { color: cfg.color }]}>
                  {hasProviderData
                    ? (order.remains ?? 0).toLocaleString("fr-FR")
                    : "—"}
                </Text>
              </View>
              <View style={styles.countDivider} />
              {/* Livré = quantité commandée − reste */}
              <View style={styles.countBox}>
                <Feather name="check-circle" size={12} color={Colors.success} />
                <Text style={styles.countLabel}>Livré</Text>
                <Text style={[styles.countValue, { color: Colors.success }]}>
                  {livré != null ? livré.toLocaleString("fr-FR") : "—"}
                </Text>
              </View>
            </View>
          )}

          {!hasProviderData && !isFinished && (
            <Text style={styles.providerHint}>
              ⓘ Les données fournisseur apparaîtront après la 1ère actualisation (automatique toutes les 8 min)
            </Text>
          )}

          {/* Boutons action */}
          <View style={styles.actionRow}>
            <Pressable style={styles.refreshBtn} onPress={handleRefresh} disabled={refreshing}>
              {refreshing
                ? <ActivityIndicator size={13} color={Colors.accent} />
                : <Feather name="refresh-cw" size={13} color={Colors.accent} />}
              <Text style={styles.refreshBtnText}>
                {refreshing ? "Actualisation…" : "Actualiser le statut"}
              </Text>
            </Pressable>
            {canCancel && (
              <Pressable style={styles.cancelBtn} onPress={onCancel}>
                <Feather name="x" size={13} color={Colors.error} />
                <Text style={styles.cancelText}>Annuler</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { orders, isLoading, cancelOrder, refreshOrders, refreshOrderStatus } = useOrders();
  const [activeStatusFilter, setActiveStatusFilter] = useState("all");
  const [activeTypeFilter, setActiveTypeFilter]     = useState("all");

  const userCountry = user?.country
    ? COUNTRIES.find((c) => c.code === user.country?.toLowerCase()) ?? null
    : null;

  const topPad = Platform.OS === "web" ? insets.top + 64 : insets.top;

  const filtered = orders.filter((o) => {
    // Status filter
    if (activeStatusFilter !== "all") {
      const statusMatch =
        o.status === activeStatusFilter ||
        (STATUS_CONFIG[o.status]?.label === STATUS_CONFIG[activeStatusFilter]?.label);
      if (!statusMatch) return false;
    }
    // Type filter
    if (activeTypeFilter !== "all") {
      const typeKey = (o.type ?? "standard").toLowerCase();
      const filterKey = activeTypeFilter.toLowerCase();
      if (typeKey !== filterKey) return false;
    }
    return true;
  });

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

  return (
    <View style={styles.root}>
      <StarBackground />

      <LinearGradient
        colors={[Colors.gradientStart, Colors.gradientEnd]}
        style={[styles.header, { paddingTop: topPad + 12 }]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      >
        <View>
          <Text style={styles.headerTitle}>Mes commandes</Text>
          <Text style={styles.headerSub}>{orders.length} commande{orders.length !== 1 ? "s" : ""}</Text>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>
            {orders.filter((o) => o.status === "En attente" || (o.status as string) === "pending").length} en attente
          </Text>
        </View>
      </LinearGradient>

      {/* Status filter bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        {STATUS_FILTERS.map((f) => (
          <Pressable
            key={f.key}
            style={[styles.filterBtn, activeStatusFilter === f.key && styles.filterBtnActive]}
            onPress={() => {
              setActiveStatusFilter(f.key);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Text style={[styles.filterLabel, activeStatusFilter === f.key && { color: Colors.accent }]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Type filter bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.typeFilterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        {TYPE_FILTERS.map((f) => (
          <Pressable
            key={f.key}
            style={[
              styles.typeFilterBtn,
              activeTypeFilter === f.key && styles.typeFilterBtnActive,
            ]}
            onPress={() => {
              setActiveTypeFilter(f.key);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            {f.key !== "all" && (
              <View
                style={[
                  styles.typeFilterDot,
                  { backgroundColor: TYPE_CONFIG[f.key]?.color ?? "#999" },
                ]}
              />
            )}
            <Text
              style={[
                styles.typeFilterLabel,
                activeTypeFilter === f.key && {
                  color: f.key === "all" ? Colors.accent : TYPE_CONFIG[f.key]?.color ?? Colors.accent,
                },
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            onCancel={() => handleCancel(item.id)}
            onRefreshStatus={() => handleRefreshStatus(item.id)}
            userCountry={userCountry}
          />
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => user?.id && refreshOrders(user.id)}
            tintColor={Colors.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="inbox" size={48} color="rgba(255,255,255,0.15)" />
            <Text style={styles.emptyTitle}>Aucune commande trouvée</Text>
            <Text style={styles.emptyText}>
              {activeStatusFilter === "all" && activeTypeFilter === "all"
                ? "Vous n'avez pas encore passé de commande."
                : "Aucune commande dans cette catégorie."}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingHorizontal: 20, paddingBottom: 16,
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#fff" },
  headerSub:   { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  headerBadge: {
    backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  headerBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#FFD700" },

  filterBar: {
    backgroundColor: "rgba(10,22,43,0.95)",
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)",
    height: 46,
    flexShrink: 0,
  },
  filterBarContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: "row" },
  filterBtn: {
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5,
  },
  filterBtnActive: { borderColor: Colors.accent, backgroundColor: "rgba(30,144,255,0.12)" },
  filterLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.55)" },

  typeFilterBar: {
    backgroundColor: "rgba(8,18,38,0.98)",
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)",
    height: 42,
    flexShrink: 0,
  },
  typeFilterBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 14, paddingHorizontal: 11, paddingVertical: 4,
  },
  typeFilterBtnActive: { borderColor: "rgba(255,255,255,0.2)", backgroundColor: "rgba(255,255,255,0.06)" },
  typeFilterDot:  { width: 6, height: 6, borderRadius: 3 },
  typeFilterLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: "rgba(255,255,255,0.45)" },

  listContent: { padding: 14, gap: 12 },

  orderCard: {
    backgroundColor: "rgba(17,32,58,0.8)", borderRadius: 16,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden", padding: 14, gap: 6,
  },
  orderTopBar:     { position: "absolute", top: 0, left: 0, right: 0, height: 2 },
  orderHeader:     { flexDirection: "row", alignItems: "center", gap: 8 },
  orderStatusDot:  { width: 8, height: 8, borderRadius: 4 },
  orderId:         { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "rgba(255,255,255,0.55)", flex: 1 },
  headerBadges:    { flexDirection: "row", gap: 6, alignItems: "center" },

  typeBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  typeBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10 },

  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
  },
  statusText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },

  orderName:     { fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff", marginTop: 4 },
  orderPlatform: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.5)" },

  orderMeta: { flexDirection: "row", gap: 16, marginTop: 4 },
  metaItem:  { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText:  { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.6)" },

  progressRow:  { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  progressTrack: {
    flex: 1, height: 4, backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2, overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 2 },
  progressText: { fontFamily: "Inter_600SemiBold", fontSize: 11, minWidth: 32 },

  expandedSection: { marginTop: 6, gap: 8 },
  expandedDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginBottom: 2 },
  expandedRow:     { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  expandedLabel:   { fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.45)", minWidth: 100 },
  expandedValue:   { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.75)", flex: 1 },

  linkBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: "rgba(30,144,255,0.12)",
    borderRadius: 6, borderWidth: 1, borderColor: "rgba(30,144,255,0.3)",
  },
  linkBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: Colors.accent },

  actionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 },

  refreshBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: "rgba(30,144,255,0.1)",
    borderRadius: 8, borderWidth: 1, borderColor: "rgba(30,144,255,0.2)",
    flex: 1,
  },
  refreshBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.accent },

  cancelBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: "rgba(255,107,107,0.1)",
    borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,107,107,0.2)",
  },
  cancelText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.error },

  countRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
    paddingVertical: 10, paddingHorizontal: 8, marginTop: 2,
  },
  countBox: { flex: 1, alignItems: "center", gap: 3 },
  countDivider: { width: 1, height: 30, backgroundColor: "rgba(255,255,255,0.08)" },
  countLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.4)" },
  countValue: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" },

  copyRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 4 },
  copyBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 9, paddingVertical: 5,
    backgroundColor: "rgba(30,144,255,0.08)",
    borderRadius: 8, borderWidth: 1, borderColor: "rgba(30,144,255,0.2)",
  },
  copyBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },

  providerHint: {
    fontFamily: "Inter_400Regular", fontSize: 11,
    color: "rgba(255,255,255,0.35)", fontStyle: "italic",
    textAlign: "center", marginTop: 2,
  },

  emptyState:  { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyTitle:  { fontFamily: "Inter_700Bold", fontSize: 18, color: "rgba(255,255,255,0.5)" },
  emptyText:   { fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.35)", textAlign: "center" },
});
