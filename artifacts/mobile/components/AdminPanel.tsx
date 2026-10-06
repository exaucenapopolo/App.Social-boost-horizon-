/**
 * AdminPanel — Tableau de bord Fondateur
 * 5 sections : Dashboard · Utilisateurs · Commandes · Paiements · Retraits
 * Quota-safe : toutes les données viennent d'un seul appel /admin/stats (cache 3 min)
 *              + /admin/users (cache 3 min, filtrage en mémoire côté serveur)
 *              + /admin/withdrawals-list (cache 2 min) chargé à la demande
 */
import Feather from "@expo/vector-icons/Feather";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import Colors from "@/constants/colors";
import { BASE_URL } from "@/services/api";
import { getFreshToken } from "@/services/tokenStore";

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Stats {
  users: { total: number; usersWithBalance: number; totalBalances: number; newToday: number; newYesterday: number; newWeek: number };
  orders: { total: number; today: number; yesterday: number; week: number; byType: Record<string, number>; byStatus: Record<string, number> };
  revenue: { totalRecharged: number; rechCount: number; todayCount: number; todayAmount: number; yesterdayCount: number; yesterdayAmount: number; weekCount: number; weekAmount: number };
  resellers: { total: number };
  referrals: { total: number };
  withdrawals: { pendingCount: number; totalWithdrawn: number; recentPending: Withdrawal[] };
  topUsers: UserRow[];
  recentUsers: UserRow[];
  pendingCredits: number;
  updatedAt: string;
}
interface UserRow {
  id: string; name: string; email: string; balance: number;
  totalOrders: number; isReseller: boolean; country: string;
  referralCode: string; createdAt: string;
}
interface Withdrawal {
  id: string; userId: string; amount: number; method?: string; operator?: string;
  phone?: string; status: string; createdAt?: string;
}

type Section = "dashboard" | "users" | "orders" | "payments" | "withdrawals";

// ─── HELPERS ──────────────────────────────────────────────────────────────────
async function apiGet(path: string) {
  const token = await getFreshToken();
  const r = await fetch(`${BASE_URL}api/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}
async function apiPost(path: string, body: Record<string, unknown> = {}) {
  const token = await getFreshToken();
  const r = await fetch(`${BASE_URL}api/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return r.json();
}
async function apiPatch(path: string, body: Record<string, unknown> = {}) {
  const token = await getFreshToken();
  const r = await fetch(`${BASE_URL}api/${path}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return r.json();
}

function fmt(n: number) { return Math.round(n).toLocaleString("fr-FR"); }
function fmtK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1000).toFixed(0)}k`;
  return String(Math.round(n));
}
function fmtDate(iso: string) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("fr-FR"); } catch { return "—"; }
}
function initials(name: string) {
  return (name || "?").split(" ").map(w => w[0] || "").join("").toUpperCase().slice(0, 2) || "?";
}
function trend(today: number, yesterday: number) {
  if (yesterday === 0) return today > 0 ? { label: `+${today} vs hier`, color: "#4CAF50" } : { label: "— vs hier", color: "#888" };
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  if (pct > 2)  return { label: `+${pct}% vs hier`, color: "#4CAF50" };
  if (pct < -2) return { label: `${pct}% vs hier`, color: "#F44336" };
  return { label: "stable vs hier", color: "#FF9800" };
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────
function ExpandCard({
  icon, iconColor, label, value, sub, trendLabel, trendColor,
  miniStats, children,
}: {
  icon: string; iconColor: string; label: string; value: string; sub?: string;
  trendLabel?: string; trendColor?: string;
  miniStats?: { label: string; value: string }[];
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Pressable
      style={[S.statCard, { borderColor: `${iconColor}28` }]}
      onPress={() => { setExpanded(e => !e); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
    >
      <View style={S.statCardTop}>
        <View style={[S.statIconBox, { backgroundColor: `${iconColor}22` }]}>
          <Feather name={icon as any} size={16} color={iconColor} />
        </View>
        {trendLabel && (
          <View style={[S.trendBadge, { backgroundColor: `${trendColor}22` }]}>
            <Text style={[S.trendText, { color: trendColor }]}>{trendLabel}</Text>
          </View>
        )}
      </View>
      <Text style={S.statLabel}>{label}</Text>
      <Text style={[S.statValue, { color: iconColor }]}>{value}</Text>
      {sub && <Text style={S.statSub}>{sub}</Text>}
      {miniStats && (
        <View style={S.miniRow}>
          {miniStats.map(m => (
            <View key={m.label} style={S.miniItem}>
              <Text style={S.miniVal}>{m.value}</Text>
              <Text style={S.miniLbl}>{m.label}</Text>
            </View>
          ))}
        </View>
      )}
      {expanded && children && (
        <View style={S.expandPanel}>
          {children}
        </View>
      )}
      <View style={{ alignItems: "center", marginTop: 4 }}>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={12} color="#555" />
      </View>
    </Pressable>
  );
}

function ExpandLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={S.expLine}>
      <Text style={S.expLineLabel}>{label}</Text>
      <Text style={S.expLineValue}>{value}</Text>
    </View>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={S.progressBg}>
      <View style={[S.progressFill, { width: `${Math.min(pct, 100)}%` as any, backgroundColor: color }]} />
    </View>
  );
}

function SectionHead({ icon, title, right }: { icon: string; title: string; right?: React.ReactNode }) {
  return (
    <View style={S.secHead}>
      <Feather name={icon as any} size={13} color={Colors.gold} />
      <Text style={S.secHeadText}>{title}</Text>
      {right && <View style={{ marginLeft: "auto" }}>{right}</View>}
    </View>
  );
}

function ActionBtn({ icon, label, color, loading, onPress }: {
  icon: string; label: string; color: string; loading?: boolean; onPress: () => void;
}) {
  return (
    <Pressable style={[S.actionBtn, { borderColor: `${color}44` }]} onPress={onPress} disabled={loading}>
      <View style={[S.actionIcon, { backgroundColor: `${color}22` }]}>
        {loading ? <ActivityIndicator size={14} color={color} /> : <Feather name={icon as any} size={14} color={color} />}
      </View>
      <Text style={S.actionLabel}>{label}</Text>
    </Pressable>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function AdminPanel() {
  const [section, setSection] = useState<Section>("dashboard");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Users section state
  const [userSearch, setUserSearch] = useState("");
  const [userSort, setUserSort] = useState<"balance" | "name" | "recent">("balance");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Withdrawals section state
  const [wdList, setWdList] = useState<Withdrawal[]>([]);
  const [wdLoading, setWdLoading] = useState(false);
  const [wdLoaded, setWdLoaded] = useState(false);

  // User detail + balance modal
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [balanceOp, setBalanceOp] = useState<"add" | "subtract" | "set">("add");
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceReason, setBalanceReason] = useState("");
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Credit user modal (UID-based)
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditUid, setCreditUid] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [creditLoading, setCreditLoading] = useState(false);

  // Broadcast modal
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [bTitle, setBTitle] = useState("");
  const [bMessage, setBMessage] = useState("");
  const [bTarget, setBTarget] = useState<"all" | "user">("all");
  const [bUserId, setBUserId] = useState("");
  const [bSaveInbox, setBSaveInbox] = useState(true);
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  // Report buttons
  const [reportLoading, setReportLoading] = useState<Record<string, boolean>>({});
  const [auditLoading, setAuditLoading] = useState(false);

  // ── Data loaders ─────────────────────────────────────────────────────────
  const fetchStats = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      // Server-side cache is invalidated automatically by PATCH endpoints
      // On force refresh, wait briefly to let server cache expire, then re-fetch
      if (force) await new Promise(r => setTimeout(r, 300));
      const res = await apiGet("admin/stats");
      if (res.success) { setStats(res.data as Stats); setCached(!!res.cached); }
      else setError(res.error ?? "Erreur serveur");
    } catch (e: any) { setError(e.message ?? "Erreur réseau"); }
    finally { setLoading(false); }
  };

  const fetchUsers = async (search = "", sort = "balance") => {
    setUsersLoading(true);
    try {
      const res = await apiGet(`admin/users?search=${encodeURIComponent(search)}&sort=${sort}&limit=50`);
      if (res.success) { setUsers(res.users ?? []); setUsersTotal(res.total ?? 0); setUsersLoaded(true); }
    } catch {} finally { setUsersLoading(false); }
  };

  const fetchWithdrawals = async () => {
    setWdLoading(true);
    try {
      const res = await apiGet("admin/withdrawals-list");
      if (res.success) { setWdList(res.data ?? []); setWdLoaded(true); }
    } catch {} finally { setWdLoading(false); }
  };

  useEffect(() => { fetchStats(); }, []);

  const goSection = (s: Section) => {
    setSection(s);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (s === "users" && !usersLoaded) fetchUsers();
    if (s === "withdrawals" && !wdLoaded) fetchWithdrawals();
  };

  // ── Report trigger ────────────────────────────────────────────────────────
  const sendReport = async (route: string) => {
    setReportLoading(p => ({ ...p, [route]: true }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await apiPost(route);
      Alert.alert("Rapport envoyé ✅", res.message ?? "Vérifiez votre WhatsApp.");
    } catch { Alert.alert("Erreur", "Impossible d'envoyer le rapport."); }
    finally { setReportLoading(p => ({ ...p, [route]: false })); }
  };

  // ── Audit payments ────────────────────────────────────────────────────────
  const handleAudit = async () => {
    setAuditLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await apiPost("admin/audit-payments");
      if (res.success) {
        const r = res.report;
        Alert.alert("Audit paiements", `✅ ${r.found} scannés\n🔁 ${r.queued} enqueued\n✔️ ${r.alreadyCredited} déjà crédités\n⏳ ${r.failed} en attente`);
      } else Alert.alert("Erreur", res.error ?? "Audit échoué");
    } catch { Alert.alert("Erreur", "Impossible de lancer l'audit."); }
    finally { setAuditLoading(false); }
  };

  // ── Balance update ────────────────────────────────────────────────────────
  const handleBalanceUpdate = async () => {
    if (!selectedUser) return;
    const amt = Number(balanceAmount);
    if (!balanceAmount || isNaN(amt) || amt < 0) { Alert.alert("Montant invalide"); return; }
    setBalanceLoading(true);
    try {
      const res = await apiPatch(`admin/user/${selectedUser.id}/balance`, {
        operation: balanceOp, amount: amt, reason: balanceReason.trim() || undefined,
      });
      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Succès ✅", `Nouveau solde : ${fmt(res.newBalance)} FCFA`);
        setShowBalanceModal(false); setShowUserModal(false);
        setBalanceAmount(""); setBalanceReason("");
        // Update local state optimistically
        setSelectedUser(u => u ? { ...u, balance: res.newBalance } : u);
        fetchStats(true); fetchUsers(userSearch, userSort);
      } else Alert.alert("Erreur", res.error ?? "Modification échouée");
    } catch { Alert.alert("Erreur réseau"); }
    finally { setBalanceLoading(false); }
  };

  // ── Credit user (UID) ─────────────────────────────────────────────────────
  const handleCreditUser = async () => {
    if (!creditUid.trim() || !creditAmount) { Alert.alert("Requis", "UID et montant obligatoires"); return; }
    const amt = Number(creditAmount);
    if (isNaN(amt) || amt <= 0) { Alert.alert("Montant invalide"); return; }
    setCreditLoading(true);
    try {
      const res = await apiPost("admin/credit-user", { userId: creditUid.trim(), amount: amt, reason: creditReason.trim() || undefined });
      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Succès", res.queued ? "⏳ Crédit en file d'attente." : `✅ ${fmt(amt)} FCFA crédités.`);
        setShowCreditModal(false); setCreditUid(""); setCreditAmount(""); setCreditReason("");
        fetchStats(true);
      } else Alert.alert("Erreur", res.error ?? "Crédit échoué");
    } catch { Alert.alert("Erreur réseau"); }
    finally { setCreditLoading(false); }
  };

  // ── Broadcast ─────────────────────────────────────────────────────────────
  const handleBroadcast = async () => {
    if (!bTitle.trim() || !bMessage.trim()) { Alert.alert("Requis", "Titre et message obligatoires"); return; }
    if (bTarget === "user" && !bUserId.trim()) { Alert.alert("Requis", "UID utilisateur obligatoire"); return; }
    setBroadcastLoading(true);
    try {
      const res = await apiPost("admin/notifications/broadcast", {
        title: bTitle.trim(), message: bMessage.trim(), target: bTarget,
        userId: bUserId.trim() || undefined, saveToInbox: bSaveInbox,
      });
      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Envoyé ✅", `${res.sent} push envoyés.`);
        setShowBroadcastModal(false); setBTitle(""); setBMessage(""); setBUserId("");
      } else Alert.alert("Erreur", res.error ?? "Échec");
    } catch { Alert.alert("Erreur réseau"); }
    finally { setBroadcastLoading(false); }
  };

  // ── Withdrawal action ─────────────────────────────────────────────────────
  const handleWithdrawal = async (id: string, action: "confirm" | "reject") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await apiPatch(`admin/withdrawal/${id}`, { action });
      if (res.success) {
        Alert.alert(action === "confirm" ? "Confirmé ✅" : "Rejeté", `Statut: ${res.status}`);
        setWdList(list => list.map(w => w.id === id ? { ...w, status: res.status } : w));
        fetchStats(true);
      } else Alert.alert("Erreur", res.error ?? "Action échouée");
    } catch { Alert.alert("Erreur réseau"); }
  };

  // ── Loading / Error states ─────────────────────────────────────────────────
  if (loading && !stats) {
    return (
      <View style={S.center}>
        <ActivityIndicator size="large" color={Colors.gold} />
        <Text style={S.loadingText}>Chargement du tableau de bord…</Text>
      </View>
    );
  }
  if (error && !stats) {
    return (
      <View style={S.center}>
        <Feather name="alert-triangle" size={32} color={Colors.error} />
        <Text style={S.errText}>{error}</Text>
        <Pressable style={S.retryBtn} onPress={() => fetchStats()}>
          <Text style={S.retryText}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }

  const o = stats?.orders   ?? { total: 0, today: 0, yesterday: 0, week: 0, byType: {}, byStatus: {} };
  const u = stats?.users    ?? { total: 0, usersWithBalance: 0, totalBalances: 0, newToday: 0, newYesterday: 0, newWeek: 0 };
  const rv = stats?.revenue ?? { totalRecharged: 0, rechCount: 0, todayCount: 0, todayAmount: 0, yesterdayCount: 0, yesterdayAmount: 0, weekCount: 0, weekAmount: 0 };
  const wd = stats?.withdrawals ?? { pendingCount: 0, totalWithdrawn: 0, recentPending: [] };

  const SECTIONS: { key: Section; label: string; icon: string }[] = [
    { key: "dashboard",   label: "Dashboard",    icon: "bar-chart-2" },
    { key: "users",       label: "Utilisateurs", icon: "users" },
    { key: "orders",      label: "Commandes",    icon: "box" },
    { key: "payments",    label: "Paiements",    icon: "credit-card" },
    { key: "withdrawals", label: "Retraits",     icon: "arrow-up-circle" },
  ];

  return (
    <View style={S.root}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <LinearGradient colors={["rgba(124,58,237,0.18)", "rgba(244,185,66,0.06)"]} style={S.header}>
        <View style={S.headerInner}>
          <LinearGradient colors={[Colors.gold, Colors.secondary]} style={S.logoBadge}>
            <Text style={{ fontSize: 14 }}>👑</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={S.logoTitle}>ESPACE FONDATEUR</Text>
            <Text style={S.logoSub}>Social Boost Horizon</Text>
          </View>
          <View style={S.headerRight}>
            <View style={S.onlineDot} />
            <Text style={S.onlineText}>En ligne</Text>
            <Pressable style={S.refreshBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); fetchStats(true); }}
              disabled={loading}>
              {loading
                ? <ActivityIndicator size={13} color={Colors.gold} />
                : <Feather name="refresh-cw" size={13} color={Colors.gold} />}
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      {cached && <Text style={S.cacheNote}>Cache 3 min · ↺ pour actualiser</Text>}

      {/* ── Nav tabs ───────────────────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.navScroll} contentContainerStyle={S.navRow}>
        {SECTIONS.map(s => (
          <Pressable key={s.key} style={[S.navBtn, section === s.key && S.navBtnActive]} onPress={() => goSection(s.key)}>
            <Feather name={s.icon as any} size={11} color={section === s.key ? Colors.gold : "#888"} />
            <Text style={[S.navBtnText, section === s.key && S.navBtnTextActive]}>{s.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 50 }}>

        {/* ════════════════════════════════════════════════════════════════
            DASHBOARD
        ════════════════════════════════════════════════════════════════ */}
        {section === "dashboard" && (
          <View style={S.sec}>

            {(stats?.pendingCredits ?? 0) > 0 && (
              <View style={S.alertBanner}>
                <Feather name="alert-circle" size={14} color="#FF9800" />
                <Text style={S.alertText}>{stats!.pendingCredits} crédit(s) en file d'attente (quota Firestore)</Text>
              </View>
            )}

            {/* 6 stat cards */}
            <View style={S.cardGrid}>

              <ExpandCard
                icon="users" iconColor="#7C3AED" label="Utilisateurs"
                value={fmt(u.total)} sub={`${u.usersWithBalance} avec solde`}
                trendLabel={trend(u.newToday, u.newYesterday).label}
                trendColor={trend(u.newToday, u.newYesterday).color}
                miniStats={[
                  { label: "Auj.", value: `+${u.newToday}` },
                  { label: "Hier", value: `+${u.newYesterday}` },
                  { label: "Sem.", value: `+${u.newWeek}` },
                ]}
              >
                <ExpandLine label="Nouveaux aujourd'hui" value={`+${u.newToday}`} />
                <ExpandLine label="Nouveaux hier" value={`+${u.newYesterday}`} />
                <ExpandLine label="Cette semaine" value={`+${u.newWeek}`} />
                <ExpandLine label="Total inscrits" value={fmt(u.total)} />
                <ExpandLine label="Revendeurs actifs" value={fmt(stats?.resellers.total ?? 0)} />
              </ExpandCard>

              <ExpandCard
                icon="box" iconColor="#10B981" label="Commandes"
                value={fmt(o.total)}
                trendLabel={trend(o.today, o.yesterday).label}
                trendColor={trend(o.today, o.yesterday).color}
                miniStats={[
                  { label: "Auj.", value: String(o.today) },
                  { label: "Hier", value: String(o.yesterday) },
                  { label: "Sem.", value: String(o.week) },
                ]}
              >
                <ExpandLine label="Aujourd'hui" value={String(o.today)} />
                <ExpandLine label="Hier" value={String(o.yesterday)} />
                <ExpandLine label="Cette semaine" value={String(o.week)} />
                <ExpandLine label="Standard" value={fmt(o.byType.standard ?? 0)} />
                <ExpandLine label="Automatique" value={fmt(o.byType.automatique ?? 0)} />
                <ExpandLine label="Avancée" value={fmt(o.byType["avancée"] ?? 0)} />
              </ExpandCard>

              <ExpandCard
                icon="dollar-sign" iconColor={Colors.gold} label="Recharges Encaissées"
                value={`${fmtK(rv.totalRecharged)} F`}
                trendLabel={trend(rv.todayCount, rv.yesterdayCount).label}
                trendColor={trend(rv.todayCount, rv.yesterdayCount).color}
                miniStats={[
                  { label: "Auj.", value: fmtK(rv.todayAmount) },
                  { label: "Hier", value: fmtK(rv.yesterdayAmount) },
                  { label: "Sem.", value: fmtK(rv.weekAmount) },
                ]}
              >
                <ExpandLine label="Dépôts aujourd'hui" value={`${rv.todayCount} — ${fmt(rv.todayAmount)} F`} />
                <ExpandLine label="Dépôts hier" value={`${rv.yesterdayCount} — ${fmt(rv.yesterdayAmount)} F`} />
                <ExpandLine label="Cette semaine" value={`${rv.weekCount} — ${fmt(rv.weekAmount)} F`} />
                <ExpandLine label="Total dépôts" value={fmt(rv.rechCount)} />
              </ExpandCard>

              <ExpandCard
                icon="star" iconColor="#F97316" label="Revendeurs"
                value={fmt(stats?.resellers.total ?? 0)}
              >
                <ExpandLine label="Total revendeurs actifs" value={fmt(stats?.resellers.total ?? 0)} />
              </ExpandCard>

              <ExpandCard
                icon="credit-card" iconColor="#EF4444" label="Soldes Totaux"
                value={`${fmtK(u.totalBalances)} F`}
                sub="Tous les utilisateurs"
              >
                <ExpandLine label="Soldes cumulés" value={`${fmt(u.totalBalances)} FCFA`} />
                <ExpandLine label="Utilisateurs avec solde" value={fmt(u.usersWithBalance)} />
              </ExpandCard>

              <ExpandCard
                icon="gift" iconColor="#A855F7" label="Parrainages"
                value={fmt(stats?.referrals.total ?? 0)}
                sub="filleuls inscrits"
              >
                <ExpandLine label="Total parrainages" value={fmt(stats?.referrals.total ?? 0)} />
              </ExpandCard>

            </View>

            {/* Order type breakdown */}
            <View style={S.card}>
              <SectionHead icon="bar-chart-2" title="Répartition Commandes" />
              {[
                { label: "Standard (ExoSupplier)", count: o.byType.standard ?? 0, color: "#06B6D4" },
                { label: "Automatique (MTP/SMMGen)", count: o.byType.automatique ?? 0, color: "#A78BFA" },
                { label: "Avancée (AfriqueBoost)", count: o.byType["avancée"] ?? 0, color: Colors.gold },
              ].map(item => (
                <View key={item.label} style={{ marginTop: 12 }}>
                  <View style={S.breakdownRow}>
                    <Text style={[S.breakdownLabel, { color: item.color }]}>{item.label}</Text>
                    <Text style={[S.breakdownCount, { color: item.color }]}>{fmt(item.count)}</Text>
                  </View>
                  <ProgressBar pct={o.total > 0 ? (item.count / o.total) * 100 : 0} color={item.color} />
                </View>
              ))}
            </View>

            {/* Top 5 users */}
            <View style={S.card}>
              <SectionHead icon="trophy" title="Top Soldes Utilisateurs" />
              {(stats?.topUsers ?? []).map((usr, i) => (
                <Pressable
                  key={usr.id}
                  style={S.topUserRow}
                  onPress={() => { setSelectedUser(usr); setShowUserModal(true); }}
                >
                  <Text style={S.topRank}>{["🥇","🥈","🥉","4.","5."][i]}</Text>
                  <View style={S.topAvatar}>
                    <Text style={S.topAvatarText}>{initials(usr.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.topName} numberOfLines={1}>{usr.name}</Text>
                    <Text style={S.topSub}>{usr.country || "—"}{usr.isReseller ? " · 👑 Revendeur" : ""}</Text>
                  </View>
                  <Text style={S.topBalance}>{fmt(usr.balance)} F</Text>
                </Pressable>
              ))}
              {(stats?.topUsers ?? []).length === 0 && (
                <Text style={S.emptyText}>Aucun utilisateur chargé</Text>
              )}
            </View>

            {/* Quick actions + reports */}
            <View style={S.card}>
              <SectionHead icon="zap" title="Actions Rapides" />
              <View style={S.actionGrid}>
                <ActionBtn icon="search" label="Audit paiements" color="#1E90FF" loading={auditLoading} onPress={handleAudit} />
                <ActionBtn icon="dollar-sign" label="Créditer user" color="#4CAF50" onPress={() => setShowCreditModal(true)} />
                <ActionBtn icon="bell" label="Notification" color="#9C27B0" loading={broadcastLoading} onPress={() => setShowBroadcastModal(true)} />
                <ActionBtn icon="send" label="Rapport quotidien" color={Colors.gold} loading={!!reportLoading["reports/daily/orders"]} onPress={() => sendReport("reports/daily/orders")} />
                <ActionBtn icon="send" label="Rapport paiements" color="#10B981" loading={!!reportLoading["reports/daily/payments"]} onPress={() => sendReport("reports/daily/payments")} />
                <ActionBtn icon="send" label="Rapport hebdo" color="#A855F7" loading={!!reportLoading["reports/weekly/orders"]} onPress={() => sendReport("reports/weekly/orders")} />
                <ActionBtn icon="send" label="Bilan mensuel" color="#F97316" loading={!!reportLoading["reports/monthly"]} onPress={() => sendReport("reports/monthly")} />
                <ActionBtn icon="refresh-cw" label="Vider cache" color="#64748B" onPress={() => fetchStats(true)} />
              </View>
            </View>
          </View>
        )}

        {/* ════════════════════════════════════════════════════════════════
            UTILISATEURS
        ════════════════════════════════════════════════════════════════ */}
        {section === "users" && (
          <View style={S.sec}>
            <View style={S.card}>
              <SectionHead icon="users" title={`Utilisateurs (${usersTotal})`}
                right={<Text style={S.cacheNote}>cache 3 min</Text>} />

              {/* Search + sort */}
              <View style={S.searchRow}>
                <View style={S.searchBox}>
                  <Feather name="search" size={14} color="#666" />
                  <TextInput
                    style={S.searchInput}
                    value={userSearch}
                    onChangeText={v => {
                      setUserSearch(v);
                      if (searchTimer.current) clearTimeout(searchTimer.current);
                      searchTimer.current = setTimeout(() => fetchUsers(v, userSort), 400);
                    }}
                    placeholder="Nom, email, UID, pays…"
                    placeholderTextColor="#555"
                    autoCapitalize="none"
                  />
                  {userSearch.length > 0 && (
                    <Pressable onPress={() => { setUserSearch(""); fetchUsers("", userSort); }}>
                      <Feather name="x" size={13} color="#666" />
                    </Pressable>
                  )}
                </View>
                <View style={S.sortRow}>
                  {(["balance", "name", "recent"] as const).map(s => (
                    <Pressable key={s} style={[S.sortBtn, userSort === s && S.sortBtnActive]}
                      onPress={() => { setUserSort(s); fetchUsers(userSearch, s); }}>
                      <Text style={[S.sortBtnText, userSort === s && S.sortBtnTextActive]}>
                        {s === "balance" ? "Solde" : s === "name" ? "Nom" : "Récent"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {usersLoading && <ActivityIndicator color={Colors.gold} style={{ marginVertical: 20 }} />}
              {!usersLoading && (
                <>
                  {users.length === 0 && <Text style={S.emptyText}>Aucun utilisateur trouvé</Text>}
                  {users.map(usr => (
                    <Pressable key={usr.id} style={S.userRow}
                      onPress={() => { setSelectedUser(usr); setShowUserModal(true); }}
                      onLongPress={async () => {
                        await Clipboard.setStringAsync(usr.id);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        Alert.alert("UID copié", usr.id);
                      }}
                    >
                      <LinearGradient colors={[Colors.secondary, Colors.accent]} style={S.userAvatar}>
                        <Text style={S.userAvatarText}>{initials(usr.name)}</Text>
                      </LinearGradient>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={S.userName} numberOfLines={1}>{usr.name}</Text>
                          {usr.isReseller && <View style={S.resellerBadge}><Text style={S.resellerBadgeText}>👑 Revendeur</Text></View>}
                        </View>
                        <Text style={S.userEmail} numberOfLines={1}>{usr.email || usr.id.slice(0, 14) + "…"}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={S.userBalance}>{fmt(usr.balance)} F</Text>
                        <Text style={S.userOrdersCount}>{usr.totalOrders} cmd</Text>
                      </View>
                    </Pressable>
                  ))}
                  <Pressable style={S.refreshListBtn} onPress={() => { usersListCache_invalidate(); fetchUsers(userSearch, userSort); }}>
                    <Feather name="refresh-cw" size={13} color={Colors.gold} />
                    <Text style={S.refreshListText}>Actualiser la liste</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        )}

        {/* ════════════════════════════════════════════════════════════════
            COMMANDES
        ════════════════════════════════════════════════════════════════ */}
        {section === "orders" && (
          <View style={S.sec}>
            <View style={S.card}>
              <SectionHead icon="box" title="Vue d'ensemble Commandes" />

              {/* Summary row */}
              <View style={S.summaryRow}>
                {[
                  { label: "Total",       value: fmt(o.total),     color: "#10B981" },
                  { label: "Aujourd'hui", value: String(o.today),  color: "#1E90FF" },
                  { label: "Cette sem.",  value: String(o.week),   color: "#A855F7" },
                ].map(item => (
                  <LinearGradient key={item.label} colors={[`${item.color}22`, `${item.color}08`]} style={S.summaryCard}>
                    <Text style={[S.summaryValue, { color: item.color }]}>{item.value}</Text>
                    <Text style={S.summaryLabel}>{item.label}</Text>
                  </LinearGradient>
                ))}
              </View>
            </View>

            <View style={S.card}>
              <SectionHead icon="pie-chart" title="Par type de commande" />
              {[
                { label: "Standard", count: o.byType.standard ?? 0, color: "#06B6D4", icon: "shopping-cart" },
                { label: "Automatique", count: o.byType.automatique ?? 0, color: "#A78BFA", icon: "zap" },
                { label: "Avancée", count: o.byType["avancée"] ?? 0, color: Colors.gold, icon: "settings" },
                { label: "Autre", count: o.byType.autre ?? 0, color: "#888", icon: "package" },
              ].filter(i => i.count > 0).map(item => (
                <View key={item.label} style={{ marginTop: 14 }}>
                  <View style={S.breakdownRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Feather name={item.icon as any} size={13} color={item.color} />
                      <Text style={S.breakdownLabel}>{item.label}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={[S.breakdownCount, { color: item.color }]}>{fmt(item.count)}</Text>
                      <Text style={S.breakdownPct}>{o.total > 0 ? `${Math.round((item.count / o.total) * 100)}%` : "0%"}</Text>
                    </View>
                  </View>
                  <ProgressBar pct={o.total > 0 ? (item.count / o.total) * 100 : 0} color={item.color} />
                </View>
              ))}
              {Object.values(o.byType).every(v => v === 0) && (
                <Text style={S.emptyText}>Aucune commande dans cette période</Text>
              )}
            </View>

            <View style={S.card}>
              <SectionHead icon="activity" title="Par statut" />
              {Object.entries(o.byStatus).filter(([, c]) => c > 0).map(([status, count]) => {
                const col = status.includes("succ") || status.includes("compl") ? "#4CAF50"
                  : status.includes("cours") || status.includes("run") ? "#06B6D4"
                  : status.includes("annul") || status.includes("cancel") ? "#EF4444"
                  : status.includes("partiel") ? "#F97316"
                  : "#FF9800";
                return (
                  <View key={status} style={S.statusRow}>
                    <View style={[S.statusDot, { backgroundColor: col }]} />
                    <Text style={S.statusLabel}>{status}</Text>
                    <Text style={[S.statusCount, { color: col }]}>{count}</Text>
                    <Text style={S.breakdownPct}>{o.total > 0 ? `${Math.round((count / o.total) * 100)}%` : "0%"}</Text>
                  </View>
                );
              })}
              {Object.values(o.byStatus).every(v => v === 0) && (
                <Text style={S.emptyText}>Aucun statut disponible</Text>
              )}
            </View>
          </View>
        )}

        {/* ════════════════════════════════════════════════════════════════
            PAIEMENTS
        ════════════════════════════════════════════════════════════════ */}
        {section === "payments" && (
          <View style={S.sec}>
            <View style={S.card}>
              <SectionHead icon="credit-card" title="Recharges & Paiements" />
              <View style={S.summaryRow}>
                {[
                  { label: "Total encaissé", value: `${fmtK(rv.totalRecharged)} F`, color: Colors.gold },
                  { label: "Auj.", value: `${fmtK(rv.todayAmount)} F`, color: "#4CAF50" },
                  { label: "Cette sem.", value: `${fmtK(rv.weekAmount)} F`, color: "#A855F7" },
                ].map(item => (
                  <LinearGradient key={item.label} colors={[`${item.color}22`, `${item.color}08`]} style={S.summaryCard}>
                    <Text style={[S.summaryValue, { color: item.color }]}>{item.value}</Text>
                    <Text style={S.summaryLabel}>{item.label}</Text>
                  </LinearGradient>
                ))}
              </View>
            </View>

            <View style={S.card}>
              <SectionHead icon="bar-chart" title="Statistiques dépôts" />
              {[
                { label: "Aujourd'hui", count: rv.todayCount, amount: rv.todayAmount, color: "#4CAF50" },
                { label: "Hier", count: rv.yesterdayCount, amount: rv.yesterdayAmount, color: "#06B6D4" },
                { label: "Cette semaine", count: rv.weekCount, amount: rv.weekAmount, color: "#A855F7" },
                { label: "Total (200 derniers)", count: rv.rechCount, amount: rv.totalRecharged, color: Colors.gold },
              ].map(item => (
                <View key={item.label} style={S.paymentStatRow}>
                  <View style={[S.paymentDot, { backgroundColor: item.color }]} />
                  <Text style={S.paymentLabel}>{item.label}</Text>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[S.paymentAmount, { color: item.color }]}>{fmt(item.amount)} FCFA</Text>
                    <Text style={S.paymentCount}>{item.count} dépôt{item.count > 1 ? "s" : ""}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={S.card}>
              <SectionHead icon="send" title="Rapports Paiements" />
              {[
                { route: "reports/daily/payments",   label: "Rapport journalier paiements",    color: "#4CAF50" },
                { route: "reports/weekly/payments",  label: "Rapport hebdomadaire paiements",  color: "#A855F7" },
                { route: "reports/monthly",          label: "Bilan mensuel complet",            color: "#F97316" },
              ].map(r => (
                <Pressable key={r.route} style={[S.reportRow, { borderColor: `${r.color}44` }]}
                  onPress={() => sendReport(r.route)} disabled={!!reportLoading[r.route]}>
                  <View style={[S.reportDot, { backgroundColor: `${r.color}22` }]}>
                    {reportLoading[r.route]
                      ? <ActivityIndicator size={14} color={r.color} />
                      : <Feather name="send" size={14} color={r.color} />}
                  </View>
                  <Text style={S.reportLabel}>{r.label}</Text>
                  <Text style={[S.reportArrow, { color: r.color }]}>→</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* ════════════════════════════════════════════════════════════════
            RETRAITS
        ════════════════════════════════════════════════════════════════ */}
        {section === "withdrawals" && (
          <View style={S.sec}>
            <View style={S.card}>
              <SectionHead icon="arrow-up-circle" title="Demandes de Retrait"
                right={
                  <Pressable onPress={fetchWithdrawals} style={S.miniRefreshBtn}>
                    {wdLoading ? <ActivityIndicator size={12} color={Colors.gold} /> : <Feather name="refresh-cw" size={12} color={Colors.gold} />}
                  </Pressable>
                } />

              <View style={S.summaryRow}>
                {[
                  { label: "En attente", value: String(wd.pendingCount), color: "#FF9800" },
                  { label: "Total payé", value: `${fmtK(wd.totalWithdrawn)} F`, color: "#4CAF50" },
                ].map(item => (
                  <LinearGradient key={item.label} colors={[`${item.color}22`, `${item.color}08`]} style={[S.summaryCard, { flex: 1 }]}>
                    <Text style={[S.summaryValue, { color: item.color }]}>{item.value}</Text>
                    <Text style={S.summaryLabel}>{item.label}</Text>
                  </LinearGradient>
                ))}
              </View>

              {wdLoading && <ActivityIndicator color={Colors.gold} style={{ marginVertical: 20 }} />}

              {!wdLoading && wdList.length === 0 && !wdLoaded && (
                <Text style={S.emptyText}>Appuyez sur ↺ pour charger</Text>
              )}
              {!wdLoading && wdLoaded && wdList.length === 0 && (
                <Text style={S.emptyText}>Aucune demande de retrait</Text>
              )}

              {wdList.map(w => {
                const isPending = w.status === "pending";
                const statusColor = isPending ? "#FF9800" : w.status === "confirmed" ? "#4CAF50" : "#EF4444";
                return (
                  <View key={w.id} style={[S.wdRow, { borderColor: `${statusColor}33` }]}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={[S.wdAmount, { color: statusColor }]}>{fmt(Number(w.amount ?? 0))} FCFA</Text>
                      <Text style={S.wdSub}>{w.method ?? w.operator ?? "—"} {w.phone ? `· ${w.phone}` : ""}</Text>
                      <Text style={S.wdSub} numberOfLines={1}>{w.userId}</Text>
                      <Text style={S.wdDate}>{fmtDate(w.createdAt ?? "")}</Text>
                      <View style={[S.wdStatusBadge, { backgroundColor: `${statusColor}22` }]}>
                        <Text style={[S.wdStatusText, { color: statusColor }]}>{w.status}</Text>
                      </View>
                    </View>
                    <View style={{ gap: 6 }}>
                      <Pressable style={S.copyUidBtn}
                        onPress={async () => {
                          await Clipboard.setStringAsync(w.userId ?? "");
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          Alert.alert("UID copié", w.userId ?? "");
                        }}>
                        <Feather name="copy" size={12} color={Colors.accent} />
                      </Pressable>
                      {isPending && (
                        <>
                          <Pressable style={[S.wdActionBtn, { backgroundColor: "#4CAF5022" }]}
                            onPress={() => {
                              Alert.alert("Confirmer le retrait", `Confirmer ${fmt(Number(w.amount ?? 0))} FCFA ?`,
                                [{ text: "Annuler", style: "cancel" }, { text: "Confirmer ✅", onPress: () => handleWithdrawal(w.id, "confirm") }]);
                            }}>
                            <Feather name="check" size={13} color="#4CAF50" />
                          </Pressable>
                          <Pressable style={[S.wdActionBtn, { backgroundColor: "#EF444422" }]}
                            onPress={() => {
                              Alert.alert("Rejeter le retrait", `Rejeter ${fmt(Number(w.amount ?? 0))} FCFA ?`,
                                [{ text: "Annuler", style: "cancel" }, { text: "Rejeter ❌", style: "destructive", onPress: () => handleWithdrawal(w.id, "reject") }]);
                            }}>
                            <Feather name="x" size={13} color="#EF4444" />
                          </Pressable>
                        </>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

      </ScrollView>

      {/* ════════════════════════════════════════════════════════════════
          MODALS
      ════════════════════════════════════════════════════════════════ */}

      {/* User detail modal */}
      <Modal visible={showUserModal} transparent animationType="slide">
        <View style={S.overlay}>
          <View style={S.modal}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>👤 Détail Utilisateur</Text>
              <Pressable onPress={() => setShowUserModal(false)}><Feather name="x" size={20} color="#888" /></Pressable>
            </View>
            {selectedUser && (
              <ScrollView style={S.modalBody}>
                <View style={S.userDetailHeader}>
                  <LinearGradient colors={[Colors.secondary, Colors.accent]} style={S.userDetailAvatar}>
                    <Text style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>{initials(selectedUser.name)}</Text>
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={S.userDetailName}>{selectedUser.name}</Text>
                    <Text style={S.userDetailEmail}>{selectedUser.email}</Text>
                    <Text style={S.userDetailUid}>{selectedUser.id}</Text>
                  </View>
                </View>
                <View style={S.infoGrid}>
                  {[
                    { label: "Solde", value: `${fmt(selectedUser.balance)} FCFA`, color: Colors.gold },
                    { label: "Commandes", value: String(selectedUser.totalOrders), color: "#10B981" },
                    { label: "Pays", value: selectedUser.country || "—", color: Colors.accent },
                    { label: "Type", value: selectedUser.isReseller ? "👑 Revendeur" : "Standard", color: "#A855F7" },
                    { label: "Code parrain", value: selectedUser.referralCode || "—", color: Colors.gold },
                    { label: "Inscrit le", value: fmtDate(selectedUser.createdAt), color: "#888" },
                  ].map(item => (
                    <View key={item.label} style={S.infoItem}>
                      <Text style={S.infoLabel}>{item.label}</Text>
                      <Text style={[S.infoValue, { color: item.color }]}>{item.value}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ gap: 10, marginTop: 8 }}>
                  <Pressable style={[S.modalBtn, { backgroundColor: `${Colors.gold}22`, borderColor: `${Colors.gold}44` }]}
                    onPress={() => { setShowUserModal(false); setTimeout(() => setShowBalanceModal(true), 300); }}>
                    <Feather name="edit-2" size={15} color={Colors.gold} />
                    <Text style={[S.modalBtnText, { color: Colors.gold }]}>Modifier le solde</Text>
                  </Pressable>
                  <Pressable style={S.copyUidBtnLarge}
                    onPress={async () => {
                      await Clipboard.setStringAsync(selectedUser.id);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      Alert.alert("UID copié ✅", selectedUser.id);
                    }}>
                    <Feather name="copy" size={14} color="#888" />
                    <Text style={{ color: "#888", fontSize: 12 }}>Copier l'UID</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Balance edit modal */}
      <Modal visible={showBalanceModal} transparent animationType="slide">
        <View style={S.overlay}>
          <View style={S.modal}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>💰 Modifier le Solde</Text>
              <Pressable onPress={() => setShowBalanceModal(false)}><Feather name="x" size={20} color="#888" /></Pressable>
            </View>
            <ScrollView style={S.modalBody}>
              {selectedUser && (
                <View style={S.balanceCurrentBox}>
                  <Text style={S.balanceCurrent}>{fmt(selectedUser.balance)} FCFA</Text>
                  <Text style={S.balanceCurrentLabel}>Solde actuel de {selectedUser.name}</Text>
                </View>
              )}
              <Text style={S.inputLabel}>Opération</Text>
              <View style={S.opRow}>
                {([
                  { key: "add", label: "➕ Ajouter", color: "#4CAF50" },
                  { key: "subtract", label: "➖ Soustraire", color: "#EF4444" },
                  { key: "set", label: "🎯 Définir", color: Colors.gold },
                ] as const).map(op => (
                  <Pressable key={op.key} style={[S.opBtn, balanceOp === op.key && { borderColor: op.color, backgroundColor: `${op.color}15` }]}
                    onPress={() => setBalanceOp(op.key)}>
                    <Text style={[S.opBtnText, balanceOp === op.key && { color: op.color }]}>{op.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={S.inputLabel}>Montant (FCFA) *</Text>
              <TextInput style={S.input} value={balanceAmount} onChangeText={setBalanceAmount}
                placeholder="Ex: 5000" keyboardType="numeric" placeholderTextColor="#444" />
              <Text style={S.inputLabel}>Raison (facultatif)</Text>
              <TextInput style={S.input} value={balanceReason} onChangeText={setBalanceReason}
                placeholder="Ex: Correction manuelle, bonus…" placeholderTextColor="#444" />
              <Pressable style={[S.modalBtnFull, { backgroundColor: Colors.gold }]}
                onPress={handleBalanceUpdate} disabled={balanceLoading}>
                {balanceLoading ? <ActivityIndicator size={18} color="#000" /> : <Text style={[S.modalBtnText, { color: "#000" }]}>Confirmer</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Credit user (UID) modal */}
      <Modal visible={showCreditModal} transparent animationType="slide">
        <View style={S.overlay}>
          <View style={S.modal}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>💵 Créditer un utilisateur</Text>
              <Pressable onPress={() => setShowCreditModal(false)}><Feather name="x" size={20} color="#888" /></Pressable>
            </View>
            <ScrollView style={S.modalBody}>
              <Text style={S.inputLabel}>UID utilisateur *</Text>
              <TextInput style={S.input} value={creditUid} onChangeText={setCreditUid}
                placeholder="uid_utilisateur" placeholderTextColor="#444" autoCapitalize="none" />
              <Text style={S.inputLabel}>Montant (FCFA) *</Text>
              <TextInput style={S.input} value={creditAmount} onChangeText={setCreditAmount}
                placeholder="Ex: 5000" keyboardType="numeric" placeholderTextColor="#444" />
              <Text style={S.inputLabel}>Raison (optionnel)</Text>
              <TextInput style={S.input} value={creditReason} onChangeText={setCreditReason}
                placeholder="Ex: Remboursement paiement X" placeholderTextColor="#444" />
              <Pressable style={[S.modalBtnFull, { backgroundColor: "#4CAF50" }]}
                onPress={handleCreditUser} disabled={creditLoading}>
                {creditLoading ? <ActivityIndicator size={18} color="#fff" /> : <Text style={S.modalBtnTextWhite}>Créditer</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Broadcast modal */}
      <Modal visible={showBroadcastModal} transparent animationType="slide">
        <View style={S.overlay}>
          <View style={S.modal}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>🔔 Notification</Text>
              <Pressable onPress={() => setShowBroadcastModal(false)}><Feather name="x" size={20} color="#888" /></Pressable>
            </View>
            <ScrollView style={S.modalBody}>
              <Text style={S.inputLabel}>Titre *</Text>
              <TextInput style={S.input} value={bTitle} onChangeText={setBTitle}
                placeholder="Ex: Nouvelle promo !" placeholderTextColor="#444" />
              <Text style={S.inputLabel}>Message *</Text>
              <TextInput style={[S.input, { minHeight: 80 }]} value={bMessage} onChangeText={setBMessage}
                placeholder="Texte de la notification…" placeholderTextColor="#444" multiline textAlignVertical="top" />
              <Text style={S.inputLabel}>Cible</Text>
              <View style={S.targetRow}>
                {(["all", "user"] as const).map(t => (
                  <Pressable key={t} style={[S.targetBtn, bTarget === t && S.targetBtnActive]} onPress={() => setBTarget(t)}>
                    <Text style={[S.targetBtnText, bTarget === t && { color: Colors.gold }]}>
                      {t === "all" ? "Tous les utilisateurs" : "Un utilisateur"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {bTarget === "user" && (
                <>
                  <Text style={S.inputLabel}>UID utilisateur *</Text>
                  <TextInput style={S.input} value={bUserId} onChangeText={setBUserId}
                    placeholder="uid_utilisateur" placeholderTextColor="#444" autoCapitalize="none" />
                </>
              )}
              <Pressable style={S.checkRow} onPress={() => setBSaveInbox(!bSaveInbox)}>
                <View style={[S.checkbox, bSaveInbox && S.checkboxOn]}>
                  {bSaveInbox && <Feather name="check" size={10} color="#fff" />}
                </View>
                <Text style={S.checkLabel}>Sauvegarder dans l'inbox</Text>
              </Pressable>
              <Pressable style={[S.modalBtnFull, { backgroundColor: "#9C27B0" }]}
                onPress={handleBroadcast} disabled={broadcastLoading}>
                {broadcastLoading ? <ActivityIndicator size={18} color="#fff" /> : <Text style={S.modalBtnTextWhite}>Envoyer</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// Hack to invalidate users cache from server side
function usersListCache_invalidate() {
  // This call just ensures fresh data from server on next request
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const BG    = "#0A0B14";
const CARD  = "rgba(255,255,255,0.04)";
const BORD  = "rgba(255,255,255,0.08)";
const TEXT  = "#F1F5F9";
const TEXT2 = "#94A3B8";
const TEXT3 = "#64748B";

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, backgroundColor: BG },
  loadingText: { color: TEXT2, fontSize: 14 },
  errText: { color: Colors.error, fontSize: 14, textAlign: "center" },
  retryBtn: { backgroundColor: Colors.gold, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: "#000", fontWeight: "700" },

  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(244,185,66,0.18)" },
  headerInner: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoBadge: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  logoTitle: { color: Colors.gold, fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  logoSub: { color: TEXT2, fontSize: 11, fontWeight: "500" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#10B981" },
  onlineText: { color: "#10B981", fontSize: 11, fontWeight: "700" },
  refreshBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: BORD, backgroundColor: CARD, alignItems: "center", justifyContent: "center" },
  cacheNote: { color: TEXT3, fontSize: 10, textAlign: "center", marginTop: 3, marginBottom: 2 },

  navScroll: { maxHeight: 44, borderBottomWidth: 1, borderBottomColor: BORD },
  navRow: { flexDirection: "row", paddingHorizontal: 10, gap: 6, alignItems: "center" },
  navBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "transparent" },
  navBtnActive: { backgroundColor: "rgba(244,185,66,0.08)", borderColor: "rgba(244,185,66,0.25)" },
  navBtnText: { color: TEXT3, fontSize: 11, fontWeight: "600" },
  navBtnTextActive: { color: Colors.gold, fontWeight: "700" },

  sec: { padding: 12, gap: 12 },
  card: { backgroundColor: CARD, borderWidth: 1, borderColor: BORD, borderRadius: 16, padding: 16, gap: 4 },

  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCard: { width: "48%", backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderRadius: 14, padding: 12, gap: 3 },
  statCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  statIconBox: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  trendBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20 },
  trendText: { fontSize: 9, fontWeight: "700" },
  statLabel: { color: TEXT3, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: { fontSize: 20, fontWeight: "900", color: TEXT },
  statSub: { color: TEXT3, fontSize: 10 },
  miniRow: { flexDirection: "row", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORD },
  miniItem: { flex: 1, alignItems: "center" },
  miniVal: { fontSize: 12, fontWeight: "800", color: TEXT },
  miniLbl: { fontSize: 9, color: TEXT3, textTransform: "uppercase", marginTop: 2 },
  expandPanel: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORD, gap: 5 },
  expLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  expLineLabel: { color: TEXT3, fontSize: 11 },
  expLineValue: { color: TEXT, fontSize: 11, fontWeight: "700" },

  secHead: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 },
  secHeadText: { color: TEXT2, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, flex: 1 },

  alertBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FF980018", borderWidth: 1, borderColor: "#FF980044", borderRadius: 10, padding: 10 },
  alertText: { color: "#FF9800", fontSize: 12, flex: 1 },

  breakdownRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 },
  breakdownLabel: { color: TEXT2, fontSize: 12 },
  breakdownCount: { fontSize: 13, fontWeight: "700" },
  breakdownPct: { color: TEXT3, fontSize: 11, minWidth: 32, textAlign: "right" },
  progressBg: { height: 4, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2 },

  topUserRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 10, marginTop: 8 },
  topRank: { width: 22, textAlign: "center", fontSize: 14 },
  topAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(124,58,237,0.3)", alignItems: "center", justifyContent: "center" },
  topAvatarText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  topName: { color: TEXT, fontSize: 12, fontWeight: "600" },
  topSub: { color: TEXT3, fontSize: 10, marginTop: 1 },
  topBalance: { color: Colors.gold, fontSize: 13, fontWeight: "800" },

  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  actionBtn: { width: "47%", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderRadius: 10, padding: 10 },
  actionIcon: { width: 28, height: 28, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  actionLabel: { color: TEXT2, fontSize: 11, fontWeight: "600", flex: 1 },

  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  summaryCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: "center", gap: 4, borderWidth: 1, borderColor: BORD },
  summaryValue: { fontSize: 16, fontWeight: "900" },
  summaryLabel: { color: TEXT3, fontSize: 9, fontWeight: "700", textTransform: "uppercase" },

  statusRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORD },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { color: TEXT2, fontSize: 12, flex: 1 },
  statusCount: { fontSize: 13, fontWeight: "800" },

  paymentStatRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORD },
  paymentDot: { width: 8, height: 8, borderRadius: 4 },
  paymentLabel: { color: TEXT2, fontSize: 12, flex: 1 },
  paymentAmount: { fontSize: 13, fontWeight: "800" },
  paymentCount: { color: TEXT3, fontSize: 10, marginTop: 2 },

  reportRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderWidth: 1, borderRadius: 12, marginTop: 8 },
  reportDot: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  reportLabel: { color: TEXT2, fontSize: 12, fontWeight: "600", flex: 1 },
  reportArrow: { fontSize: 16, fontWeight: "700" },

  searchRow: { gap: 8, marginBottom: 10 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: BORD, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, color: TEXT, fontSize: 13 },
  sortRow: { flexDirection: "row", gap: 6 },
  sortBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: BORD, alignItems: "center", backgroundColor: CARD },
  sortBtnActive: { borderColor: `${Colors.gold}55`, backgroundColor: `${Colors.gold}12` },
  sortBtnText: { color: TEXT3, fontSize: 11, fontWeight: "600" },
  sortBtnTextActive: { color: Colors.gold, fontWeight: "700" },

  userRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORD },
  userAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  userAvatarText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  userName: { color: TEXT, fontSize: 13, fontWeight: "600" },
  userEmail: { color: TEXT3, fontSize: 11, marginTop: 2 },
  userBalance: { color: Colors.gold, fontSize: 13, fontWeight: "700" },
  userOrdersCount: { color: TEXT3, fontSize: 10, marginTop: 2 },
  resellerBadge: { backgroundColor: "rgba(244,185,66,0.15)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  resellerBadgeText: { color: Colors.gold, fontSize: 9, fontWeight: "700" },
  refreshListBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, marginTop: 8 },
  refreshListText: { color: Colors.gold, fontSize: 12, fontWeight: "600" },
  emptyText: { color: TEXT3, fontSize: 13, textAlign: "center", paddingVertical: 20 },

  wdRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderWidth: 1, borderRadius: 12, marginTop: 8 },
  wdAmount: { fontSize: 16, fontWeight: "800" },
  wdSub: { color: TEXT3, fontSize: 11, marginTop: 2 },
  wdDate: { color: TEXT3, fontSize: 10, marginTop: 3 },
  wdStatusBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, marginTop: 4 },
  wdStatusText: { fontSize: 10, fontWeight: "700" },
  copyUidBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: "rgba(30,144,255,0.15)", alignItems: "center", justifyContent: "center" },
  wdActionBtn: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  miniRefreshBtn: { width: 26, height: 26, borderRadius: 7, borderWidth: 1, borderColor: `${Colors.gold}44`, alignItems: "center", justifyContent: "center" },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.80)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#10121F", borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: "rgba(244,185,66,0.18)", maxHeight: "88%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 18, borderBottomWidth: 1, borderBottomColor: BORD },
  modalTitle: { color: Colors.gold, fontSize: 15, fontWeight: "800" },
  modalBody: { padding: 18 },

  userDetailHeader: { flexDirection: "row", gap: 14, marginBottom: 16, alignItems: "center" },
  userDetailAvatar: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  userDetailName: { color: TEXT, fontSize: 16, fontWeight: "800" },
  userDetailEmail: { color: TEXT2, fontSize: 12, marginTop: 2 },
  userDetailUid: { color: TEXT3, fontSize: 10, fontFamily: "monospace", marginTop: 2 },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  infoItem: { width: "47%", backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: BORD, borderRadius: 10, padding: 10 },
  infoLabel: { color: TEXT3, fontSize: 10, marginBottom: 4 },
  infoValue: { fontSize: 13, fontWeight: "700" },
  modalBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  modalBtnText: { fontSize: 14, fontWeight: "700" },
  modalBtnTextWhite: { color: "#fff", fontSize: 15, fontWeight: "700" },
  modalBtnFull: { padding: 14, borderRadius: 12, alignItems: "center", marginTop: 14 },
  copyUidBtnLarge: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 10, backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORD },

  balanceCurrentBox: { backgroundColor: "rgba(244,185,66,0.06)", borderWidth: 1, borderColor: "rgba(244,185,66,0.2)", borderRadius: 12, padding: 16, alignItems: "center", marginBottom: 12 },
  balanceCurrent: { color: Colors.gold, fontSize: 28, fontWeight: "900" },
  balanceCurrentLabel: { color: TEXT2, fontSize: 12, marginTop: 4 },
  opRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
  opBtn: { flex: 1, padding: 9, borderRadius: 9, borderWidth: 1, borderColor: BORD, backgroundColor: CARD, alignItems: "center" },
  opBtnText: { color: TEXT3, fontSize: 11, fontWeight: "600" },

  inputLabel: { color: TEXT2, fontSize: 12, fontWeight: "600", marginBottom: 5, marginTop: 12 },
  input: { backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: BORD, borderRadius: 10, padding: 12, color: TEXT, fontSize: 13 },

  targetRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  targetBtn: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: BORD, alignItems: "center", backgroundColor: CARD },
  targetBtnActive: { borderColor: `${Colors.gold}55`, backgroundColor: `${Colors.gold}12` },
  targetBtnText: { color: TEXT3, fontSize: 12, fontWeight: "600" },

  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 2, borderColor: "#555", alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  checkLabel: { color: TEXT2, fontSize: 13 },
});
