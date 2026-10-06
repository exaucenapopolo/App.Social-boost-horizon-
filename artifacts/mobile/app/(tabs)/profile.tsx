import AsyncStorage from "@react-native-async-storage/async-storage";
import Feather from "@expo/vector-icons/Feather";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AdminPanel from "@/components/AdminPanel";
import StarBackground from "@/components/StarBackground";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useUpdate } from "@/context/UpdateContext";
import { useOrders } from "@/context/OrdersContext";
import { COUNTRIES, formatCurrency } from "@/lib/countries";
import { BASE_URL, apiClient } from "@/services/api";
import { getFreshToken } from "@/services/tokenStore";
import { registerForPushNotifications } from "@/services/pushNotifications";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

type ProfileTab = "profil" | "developpeur" | "securite" | "parametres" | "admin";

const ADMIN_EMAIL = "mcexauofficiel@gmail.com";

const PROFILE_TABS: { key: ProfileTab; label: string; icon: string; adminOnly?: boolean }[] = [
  { key: "profil",      label: "Profil",    icon: "user" },
  { key: "developpeur", label: "API",       icon: "code" },
  { key: "securite",    label: "Sécurité",  icon: "shield" },
  { key: "parametres",  label: "Réglages",  icon: "settings" },
  { key: "admin",       label: "Admin",     icon: "shield", adminOnly: true },
];

const SETTINGS_KEY = "@sbh_settings";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout, updateUser } = useAuth();
  const { orders } = useOrders();
  const { colors, isDark, toggleTheme } = useTheme();
  const { updateAvailable, openModal, currentVersion } = useUpdate();

  const [activeTab, setActiveTab] = useState<ProfileTab>("profil");
  const [copiedCode, setCopiedCode] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState(user?.name ?? "");
  const [editPhone, setEditPhone] = useState(user?.phone ?? "");
  const [editCountry, setEditCountry] = useState(user?.country ?? "cm");
  const [savingProfile, setSavingProfile] = useState(false);

  const [showCountryModal, setShowCountryModal] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  // Developer API state
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [copiedApiKey, setCopiedApiKey] = useState(false);

  // Settings state
  const [notifPush, setNotifPush] = useState(true);
  const [notifEmail, setNotifEmail] = useState(false);
  const [notifSecurity, setNotifSecurity] = useState(true);
  const [pushTokenActive, setPushTokenActive] = useState<boolean | null>(null);
  const [notifRegistering, setNotifRegistering] = useState(false);

  // Multi-step support modal
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportStep, setSupportStep] = useState<1|2|3>(1);
  const [supportCategory, setSupportCategory] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportWaCode, setSupportWaCode] = useState("+237");
  const [supportWaPhone, setSupportWaPhone] = useState("");
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportSuccess, setSupportSuccess] = useState(false);

  // Site request modal
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [siteHasWebsite, setSiteHasWebsite] = useState<boolean | null>(null);
  const [siteUrl, setSiteUrl] = useState("");
  const [siteRequestType, setSiteRequestType] = useState("");
  const [siteDescription, setSiteDescription] = useState("");
  const [siteWaCode, setSiteWaCode] = useState("+237");
  const [siteWaPhone, setSiteWaPhone] = useState("");
  const [siteLoading, setSiteLoading] = useState(false);
  const [siteSuccess, setSiteSuccess] = useState(false);

  // Referrals + Leaderboard
  const [referrals, setReferrals] = useState<{ id: string; name: string; photoURL: string | null; totalOrders: number; joinedAt: string | null; country: string | null }[]>([]);
  const [referralTotalEarned, setReferralTotalEarned] = useState(0);
  const [leaderboard, setLeaderboard] = useState<{ id: string; name: string; photoURL: string | null; referralCount: number; country: string | null }[]>([]);
  const [referralLoading, setReferralLoading] = useState(false);

  const SUPPORT_PHONE = "237699853665";

  const SUPPORT_PROBLEMS = [
    {
      id: "depot",
      icon: "credit-card" as const,
      color: "#1E90FF",
      title: "Solde non mis à jour",
      desc: "J'ai effectué un dépôt mais mon solde n'a pas été crédité",
      getMessage: () =>
        `Bonjour Support Social Boost Horizon,\n\nJ'ai un problème de SOLDE NON MIS À JOUR.\n\nJ'ai effectué un dépôt mais mon solde n'a pas été crédité.\n\nDétails:\n- Email du compte: ${user?.email ?? "Non connecté"}\n- Date du dépôt: [À préciser]\n- Montant déposé: [À préciser]\n- Mode de paiement utilisé: [À préciser]\n\nMerci de bien vouloir vérifier et corriger ce problème.`,
    },
    {
      id: "commande",
      icon: "package" as const,
      color: "#FF9800",
      title: "Commande non livrée",
      desc: "Ma commande est terminée mais je n'ai pas reçu les services",
      getMessage: () =>
        `Bonjour Support Social Boost Horizon,\n\nJ'ai un problème de COMMANDE NON LIVRÉE.\n\nMa commande est marquée comme terminée mais je n'ai pas reçu les services.\n\nDétails:\n- Email du compte: ${user?.email ?? "Non connecté"}\n- Numéro de commande: [À préciser]\n- Service commandé: [À préciser]\n- Lien concerné: [À préciser]\n\nMerci de bien vouloir vérifier et résoudre ce problème.`,
    },
    {
      id: "remboursement",
      icon: "refresh-cw" as const,
      color: "#9C27B0",
      title: "Demande de remboursement",
      desc: "Je souhaite être remboursé pour une commande annulée",
      getMessage: () =>
        `Bonjour Support Social Boost Horizon,\n\nJe souhaite faire une DEMANDE DE REMBOURSEMENT.\n\nDétails:\n- Email du compte: ${user?.email ?? "Non connecté"}\n- Numéro de commande: [À préciser]\n- Montant: [À préciser]\n- Raison: [À préciser]\n\nMerci de traiter ma demande.`,
    },
    {
      id: "compte",
      icon: "user-x" as const,
      color: "#F44336",
      title: "Problème de compte",
      desc: "J'ai un problème d'accès ou de connexion à mon compte",
      getMessage: () =>
        `Bonjour Support Social Boost Horizon,\n\nJ'ai un PROBLÈME DE COMPTE.\n\nDétails:\n- Email du compte: ${user?.email ?? "Non connecté"}\n- Description du problème: [À préciser]\n\nMerci de m'aider à résoudre ce problème.`,
    },
    {
      id: "autre",
      icon: "help-circle" as const,
      color: "#607D8B",
      title: "Autre problème",
      desc: "J'ai un autre problème à signaler",
      getMessage: () =>
        `Bonjour Support Social Boost Horizon,\n\nJ'ai besoin d'aide concernant un problème.\n\nEmail du compte: ${user?.email ?? "Non connecté"}\n\nMon problème: `,
    },
  ];

  const openSupportModal = () => {
    setSupportStep(1);
    setSupportCategory("");
    setSupportMessage("");
    setSupportWaCode("+237");
    setSupportWaPhone("");
    setSupportSuccess(false);
    setShowSupportModal(true);
  };

  const handleSupportSubmit = async () => {
    if (!supportCategory || !supportMessage.trim()) {
      Alert.alert("Champs requis", "Veuillez sélectionner une catégorie et entrer votre message.");
      return;
    }
    if (!supportWaPhone.trim()) {
      Alert.alert("WhatsApp requis", "Veuillez entrer votre numéro WhatsApp pour que notre équipe puisse vous recontacter.");
      return;
    }
    setSupportLoading(true);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BASE_URL}api/support/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          category: supportCategory,
          message: supportMessage,
          whatsappCountryCode: supportWaCode,
          whatsappPhone: supportWaPhone,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSupportSuccess(true);
        setSupportStep(3);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("Erreur", data.error ?? "Impossible d'envoyer votre message.");
      }
    } catch {
      Alert.alert("Erreur", "Vérifiez votre connexion internet.");
    } finally {
      setSupportLoading(false);
    }
  };

  const handleSiteRequestSubmit = async () => {
    if (siteHasWebsite === null) {
      Alert.alert("Requis", "Veuillez indiquer si vous avez déjà un site web.");
      return;
    }
    if (!siteDescription.trim() && !siteRequestType.trim()) {
      Alert.alert("Requis", "Veuillez décrire votre projet ou les services souhaités.");
      return;
    }
    if (!siteWaPhone.trim()) {
      Alert.alert("WhatsApp requis", "Veuillez entrer votre numéro WhatsApp pour que nous puissions vous recontacter.");
      return;
    }
    setSiteLoading(true);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BASE_URL}api/support/site-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          hasWebsite: siteHasWebsite,
          siteUrl,
          requestType: siteRequestType,
          description: siteDescription,
          whatsappCountryCode: siteWaCode,
          whatsappPhone: siteWaPhone,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSiteSuccess(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("Erreur", data.error ?? "Impossible d'envoyer votre demande.");
      }
    } catch {
      Alert.alert("Erreur", "Vérifiez votre connexion internet.");
    } finally {
      setSiteLoading(false);
    }
  };

  const topPad = Platform.OS === "web" ? insets.top + 64 : insets.top;
  const completedOrders = orders.filter(o => o.status === "succès" || (o.status as string) === "completed").length;
  const totalSpent = orders.reduce((sum, o) => sum + o.price, 0);

  const userCountry = COUNTRIES.find((c) => c.code === (user?.country ?? "cm").toLowerCase());

  const filteredCountries = COUNTRIES.filter(
    (c) => !countrySearch || c.name.toLowerCase().includes(countrySearch.toLowerCase())
  );

  // Load push token status from API
  const loadPushTokenStatus = async () => {
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BASE_URL}api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json?.data) {
        const hasToken = !!json.data.hasPushToken;
        setPushTokenActive(hasToken);
        setNotifPush(hasToken);
        // Auto-register if not yet active — notifications must be ON by default
        if (!hasToken) {
          registerForPushNotifications()
            .then((newToken) => {
              if (newToken) {
                setPushTokenActive(true);
                setNotifPush(true);
              }
            })
            .catch(() => {});
        }
      }
    } catch {}
  };

  // Load settings
  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then((val) => {
      if (val) {
        const s = JSON.parse(val);
        if (s.notifEmail !== undefined) setNotifEmail(s.notifEmail);
        if (s.notifSecurity !== undefined) setNotifSecurity(s.notifSecurity);
      }
    }).catch(() => {});
    fetchReferrals();
    loadApiKeyFromServer();
    loadPushTokenStatus();
  }, []);

  const saveSetting = async (key: string, value: boolean) => {
    try {
      const current = await AsyncStorage.getItem(SETTINGS_KEY);
      const settings = current ? JSON.parse(current) : {};
      settings[key] = value;
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  };

  const toggleNotifPush = async (v: boolean) => {
    if (notifRegistering) return;
    setNotifRegistering(true);
    if (v) {
      // Enable: register push token
      const token = await registerForPushNotifications();
      if (token) {
        setNotifPush(true);
        setPushTokenActive(true);
      } else {
        Alert.alert(
          "Notifications désactivées",
          "Veuillez autoriser les notifications dans les paramètres de votre téléphone, puis réessayez.",
          [{ text: "OK" }]
        );
      }
    } else {
      // Disable: remove push token from server
      await apiClient.notifications.unregisterPushToken().catch(() => {});
      setNotifPush(false);
      setPushTokenActive(false);
    }
    setNotifRegistering(false);
  };
  const toggleNotifEmail = (v: boolean) => { setNotifEmail(v); saveSetting("notifEmail", v); };
  const toggleNotifSecurity = (v: boolean) => { setNotifSecurity(v); saveSetting("notifSecurity", v); };

  const handleSaveProfile = async () => {
    if (!editName.trim()) { Alert.alert("Nom requis", "Veuillez entrer votre nom."); return; }
    setSavingProfile(true);
    try {
      await updateUser({ name: editName.trim(), phone: editPhone.trim() || undefined, country: editCountry });
      setEditMode(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Succès", "Profil mis à jour !");
    } catch { Alert.alert("Erreur", "Impossible de mettre à jour le profil."); }
    finally { setSavingProfile(false); }
  };

  const handleLogout = () => {
    Alert.alert("Déconnexion", "Voulez-vous vraiment vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Déconnecter", style: "destructive", onPress: async () => { await logout(); router.replace("/auth/login"); } },
    ]);
  };

  const handleCopyReferral = async () => {
    if (!user?.referralCode) return;
    await Clipboard.setStringAsync(user.referralCode);
    setCopiedCode(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleShare = async () => {
    if (!user?.referralCode) return;
    await Share.share({
      message: `🚀 Rejoins Social Boost Horizon !\n\nMon code parrainage : ${user.referralCode}\n\nhttps://socialboosthorizon.com`,
    });
  };

  const fetchReferrals = async () => {
    if (referralLoading) return;
    setReferralLoading(true);
    try {
      const token = await getFreshToken();
      if (!token) return;
      const [rRef, rLead] = await Promise.all([
        fetch(`${BASE_URL}api/referrals`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${BASE_URL}api/leaderboard`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const jRef = await rRef.json();
      const jLead = await rLead.json();
      if (jRef.success && jRef.data) {
        setReferrals(jRef.data.referrals ?? []);
        setReferralTotalEarned(jRef.data.totalEarned ?? 0);
      }
      if (jLead.success && Array.isArray(jLead.data)) {
        setLeaderboard(jLead.data);
      }
    } catch (e) {
      console.error("[profile] fetchReferrals error:", e);
    } finally {
      setReferralLoading(false);
    }
  };

  const handlePickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      await updateUser({ photoURL: result.assets[0].uri });
    }
  };

  // API key functions
  const loadApiKeyFromServer = async () => {
    try {
      const token = await getFreshToken();
      if (!token) return;
      const res = await fetch(`${BASE_URL}api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.data?.apiKeyMasked) {
        setApiKey(data.data.apiKeyMasked);
      }
    } catch {}
  };

  const handleGenerateApiKey = async () => {
    setApiLoading(true);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BASE_URL}api/generate-api-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.apiKey) {
        const key = data.apiKey;
        if (data.isNew) {
          setNewApiKey(key);
        }
        const masked = "sbh_" + "*".repeat(8) + key.slice(-6);
        setApiKey(masked);
      } else {
        Alert.alert("Erreur", data.error ?? "Impossible de générer la clé.");
      }
    } catch (e: any) {
      Alert.alert("Erreur", e?.message ?? "Impossible de contacter le serveur.");
    } finally {
      setApiLoading(false);
    }
  };

  const handleCopyApiKey = async (key: string) => {
    await Clipboard.setStringAsync(key);
    setCopiedApiKey(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopiedApiKey(false), 2000);
  };

  const handleRevokeApiKey = () => {
    Alert.alert("Révoquer la clé", "Êtes-vous sûr ? Vos intégrations cesseront de fonctionner.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Révoquer", style: "destructive", onPress: async () => {
          try {
            const token = await getFreshToken();
            await fetch(`${BASE_URL}api/revoke-api-key`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
            });
          } catch {}
          setApiKey(null);
          setNewApiKey(null);
        }
      },
    ]);
  };

  const c = colors;

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StarBackground />

      {/* Header gradient */}
      <LinearGradient
        colors={[c.gradientStart, c.gradientEnd]}
        style={[styles.header, { paddingTop: topPad + 12 }]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      >
        {/* Theme + admin badges row */}
        <View style={styles.headerTopRow}>
          <Pressable onPress={toggleTheme} style={styles.themeBtnHeader}>
            <Feather name={isDark ? "sun" : "moon"} size={18} color="#fff" />
          </Pressable>
          {user?.email === "mcexauofficiel@gmail.com" && (
            <View style={styles.adminBadge}>
              <Feather name="shield" size={12} color="#FFD700" />
              <Text style={styles.adminBadgeText}>Admin</Text>
            </View>
          )}
        </View>

        {/* Profile hero */}
        <View style={styles.profileHero}>
          <Pressable style={styles.avatarWrap} onPress={handlePickPhoto}>
            {user?.photoURL ? (
              <Image source={{ uri: user.photoURL }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: c.gradientStart }]}>
                <Text style={styles.avatarInitial}>{(user?.name ?? "U").charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={[styles.editBadge, { backgroundColor: c.accent }]}>
              <Feather name="camera" size={12} color="#fff" />
            </View>
          </Pressable>
          <Text style={styles.profileName}>{user?.name ?? "Utilisateur"}</Text>
          <Text style={styles.profileEmail}>{user?.email ?? ""}</Text>
          <View style={styles.memberBadgeRow}>
            <View style={styles.memberBadge}>
              <Feather name="star" size={11} color="#FFD700" />
              <Text style={styles.memberBadgeText}>Membre actif</Text>
            </View>
            {userCountry && (
              <View style={[styles.memberBadge, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
                <Text>{userCountry.flag}</Text>
                <Text style={styles.memberBadgeText}>{userCountry.name}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.heroStats}>
          {[
            { value: orders.length, label: "Commandes" },
            { value: completedOrders, label: "Terminées" },
            {
              value: userCountry && userCountry.xafRate !== 1
                ? Math.round(totalSpent * userCountry.xafRate).toLocaleString("fr-FR")
                : totalSpent.toLocaleString(),
              label: userCountry && userCountry.xafRate !== 1 ? `${userCountry.currencySymbol} dépensé` : "FCFA dépensé"
            },
          ].map((s, i) => (
            <View key={i} style={[styles.heroStat, i < 2 && styles.heroStatBorder]}>
              <Text style={styles.heroStatValue}>{s.value}</Text>
              <Text style={styles.heroStatLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* Tab Bar */}
      <View style={[styles.tabBar, { backgroundColor: c.surface, borderBottomColor: c.separator }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {PROFILE_TABS.filter(tab => !tab.adminOnly || user?.email === ADMIN_EMAIL).map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.tabBtn, isActive && { borderBottomColor: tab.adminOnly ? "#FF6B35" : c.accent, borderBottomWidth: 2 }]}
                onPress={() => { setActiveTab(tab.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Feather
                  name={tab.icon as any}
                  size={15}
                  color={isActive ? (tab.adminOnly ? "#FF6B35" : c.accent) : c.textMuted}
                />
                <Text style={[styles.tabLabel, { color: isActive ? (tab.adminOnly ? "#FF6B35" : c.accent) : c.textMuted }]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── PROFIL ── */}
        {activeTab === "profil" && (
          <>
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.cardTitle, { color: c.text }]}>
                  Informations personnelles
                </Text>
                <Pressable
                  style={[styles.editBtn, { borderColor: editMode ? c.error : c.accent, backgroundColor: editMode ? c.error + "12" : c.accent + "12" }]}
                  onPress={() => {
                    if (editMode) { setEditMode(false); setEditName(user?.name ?? ""); setEditPhone(user?.phone ?? ""); }
                    else { setEditName(user?.name ?? ""); setEditPhone(user?.phone ?? ""); setEditCountry(user?.country ?? "cm"); setEditMode(true); }
                  }}
                >
                  <Feather name={editMode ? "x" : "edit-2"} size={13} color={editMode ? c.error : c.accent} />
                  <Text style={[styles.editBtnText, { color: editMode ? c.error : c.accent }]}>{editMode ? "Annuler" : "Modifier"}</Text>
                </Pressable>
              </View>

              {editMode ? (
                <View style={{ gap: 12 }}>
                  <View style={styles.editField}>
                    <Text style={[styles.editFieldLabel, { color: c.textSecondary }]}>Nom complet</Text>
                    <View style={[styles.editInputRow, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
                      <Feather name="user" size={15} color={c.textMuted} />
                      <TextInput style={[styles.editInput, { color: c.text }]} value={editName} onChangeText={setEditName} placeholder="Votre nom" placeholderTextColor={c.textMuted} />
                    </View>
                  </View>
                  <View style={styles.editField}>
                    <Text style={[styles.editFieldLabel, { color: c.textSecondary }]}>Téléphone</Text>
                    <View style={[styles.editInputRow, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
                      <Feather name="phone" size={15} color={c.textMuted} />
                      <TextInput style={[styles.editInput, { color: c.text }]} value={editPhone} onChangeText={setEditPhone} placeholder="+237 6XX XXX XXX" placeholderTextColor={c.textMuted} keyboardType="phone-pad" />
                    </View>
                  </View>
                  <View style={styles.editField}>
                    <Text style={[styles.editFieldLabel, { color: c.textSecondary }]}>Pays</Text>
                    <Pressable
                      style={[styles.editInputRow, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}
                      onPress={() => { setShowCountryModal(true); setCountrySearch(""); }}
                    >
                      <Text style={{ fontSize: 18 }}>
                        {COUNTRIES.find((cc) => cc.code === editCountry)?.flag ?? "🌍"}
                      </Text>
                      <Text style={[styles.editInput, { color: c.text }]}>
                        {COUNTRIES.find((cc) => cc.code === editCountry)?.name ?? "Sélectionner"}
                      </Text>
                      <Feather name="chevron-down" size={15} color={c.textMuted} />
                    </Pressable>
                  </View>
                  <Pressable style={[styles.saveBtn, savingProfile && { opacity: 0.65 }]} onPress={handleSaveProfile} disabled={savingProfile}>
                    <LinearGradient colors={[c.gradientStart, c.gradientEnd]} style={styles.saveBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                      {savingProfile ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="check" size={16} color="#fff" />}
                      <Text style={styles.saveBtnText}>{savingProfile ? "Enregistrement..." : "Sauvegarder"}</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  {[
                    { icon: "user" as const, label: "Nom complet", value: user?.name ?? "—" },
                    { icon: "mail" as const, label: "Email", value: user?.email ?? "—" },
                    { icon: "phone" as const, label: "Téléphone", value: user?.phone ?? "Non renseigné" },
                    { icon: "map-pin" as const, label: "Pays", value: userCountry ? `${userCountry.flag} ${userCountry.name}` : "Non renseigné" },
                  ].map((item, i) => (
                    <View key={i} style={[styles.infoRow, { borderBottomColor: c.separator }]}>
                      <View style={[styles.infoIconCircle, { backgroundColor: c.accent + "18" }]}>
                        <Feather name={item.icon} size={15} color={c.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.infoLabel, { color: c.textMuted }]}>{item.label}</Text>
                        <Text style={[styles.infoValue, { color: c.text }]}>{item.value}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Balance */}
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>Soldes</Text>
              <View style={styles.balanceRow2}>
                <View style={styles.balanceItem2}>
                  <Feather name="credit-card" size={18} color={c.accent} />
                  <Text style={[styles.balanceLbl2, { color: c.textMuted }]}>Principal</Text>
                  <Text style={[styles.balanceVal2, { color: c.text }]}>
                    {userCountry && userCountry.xafRate !== 1
                      ? formatCurrency(user?.balance ?? 0, userCountry)
                      : `${(user?.balance ?? 0).toLocaleString("fr-FR")} FCFA`}
                  </Text>
                </View>
                <View style={[styles.balanceDivider2, { backgroundColor: c.separator }]} />
                <View style={styles.balanceItem2}>
                  <Feather name="gift" size={18} color="#FFD700" />
                  <Text style={[styles.balanceLbl2, { color: c.textMuted }]}>Parrainage</Text>
                  <Text style={[styles.balanceVal2, { color: "#FFD700" }]}>
                    {userCountry && userCountry.xafRate !== 1
                      ? formatCurrency(user?.referralBalance ?? 0, userCountry)
                      : `${(user?.referralBalance ?? 0).toLocaleString("fr-FR")} FCFA`}
                  </Text>
                </View>
              </View>
            </View>

            {/* Referral */}
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>Code de parrainage</Text>
              <View style={[styles.codeBox, { backgroundColor: "rgba(255,215,0,0.06)", borderColor: "rgba(255,215,0,0.2)" }]}>
                <Text style={[styles.codeValue, { color: "#FFD700" }]}>{user?.referralCode ?? "—"}</Text>
                <View style={styles.codeActions}>
                  <Pressable style={[styles.codeBtn, { backgroundColor: copiedCode ? c.success + "20" : c.inputBg, borderColor: c.inputBorder }]} onPress={handleCopyReferral}>
                    <Feather name={copiedCode ? "check" : "copy"} size={14} color={copiedCode ? c.success : c.accent} />
                    <Text style={[styles.codeBtnText, { color: copiedCode ? c.success : c.accent }]}>{copiedCode ? "Copié !" : "Copier"}</Text>
                  </Pressable>
                  <Pressable style={[styles.codeBtn, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]} onPress={handleShare}>
                    <Feather name="share-2" size={14} color={c.accentLight} />
                    <Text style={[styles.codeBtnText, { color: c.accentLight }]}>Partager</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Classement des Meilleurs Parrains */}
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
              <View style={styles.cardHeaderRow}>
                <Feather name="award" size={15} color="#FFD700" />
                <Text style={[styles.cardTitle, { color: c.text }]}>Classement des Meilleurs Parrains</Text>
              </View>

              {referralLoading ? (
                <ActivityIndicator color={c.accent} style={{ marginVertical: 16 }} />
              ) : leaderboard.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: 20, gap: 8 }}>
                  <Feather name="award" size={32} color={c.textMuted} />
                  <Text style={[styles.devHint, { color: c.textMuted, textAlign: "center" }]}>
                    Partagez votre code pour gagner 10% sur chaque dépôt de vos filleuls.
                  </Text>
                </View>
              ) : (
                <>
                  {/* Podium top 3 */}
                  {leaderboard.length >= 1 && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: c.textMuted, letterSpacing: 1, textAlign: "center", marginBottom: 16 }}>
                        TOP 3 PARRAINEURS
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 10 }}>
                        {/* 2ème */}
                        {leaderboard[1] ? (
                          <View style={styles.podiumColumn}>
                            <View style={[styles.podiumAvatar, { backgroundColor: "#C0C0C020", borderColor: "#C0C0C0" }]}>
                              {leaderboard[1].photoURL ? (
                                <Image source={{ uri: leaderboard[1].photoURL }} style={{ width: 44, height: 44, borderRadius: 22 }} contentFit="cover" />
                              ) : (
                                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#C0C0C0" }}>
                                  {(leaderboard[1].name || "U").charAt(0).toUpperCase()}
                                </Text>
                              )}
                            </View>
                            <Text style={[styles.podiumName, { color: c.text }]} numberOfLines={1}>{leaderboard[1].name || "—"}</Text>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: c.textMuted, textAlign: "center" }}>{leaderboard[1].referralCount ?? 0} filleul{(leaderboard[1].referralCount ?? 0) !== 1 ? "s" : ""}</Text>
                            <View style={[styles.podiumBase, { height: 55, backgroundColor: "#C0C0C020", borderColor: "#C0C0C030" }]}>
                              <Text style={{ fontSize: 20 }}>🥈</Text>
                              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#C0C0C0" }}>2</Text>
                            </View>
                          </View>
                        ) : <View style={styles.podiumColumn} />}
                        {/* 1er */}
                        <View style={styles.podiumColumn}>
                          <View style={[styles.podiumAvatar, { backgroundColor: "#FFD70020", borderColor: "#FFD700", width: 60, height: 60, borderRadius: 30 }]}>
                            {leaderboard[0].photoURL ? (
                              <Image source={{ uri: leaderboard[0].photoURL }} style={{ width: 56, height: 56, borderRadius: 28 }} contentFit="cover" />
                            ) : (
                              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFD700" }}>
                                {(leaderboard[0].name || "U").charAt(0).toUpperCase()}
                              </Text>
                            )}
                          </View>
                          <Text style={[styles.podiumName, { color: c.text, fontSize: 12 }]} numberOfLines={1}>{leaderboard[0].name || "—"}</Text>
                          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: c.textMuted, textAlign: "center" }}>{leaderboard[0].referralCount ?? 0} filleul{(leaderboard[0].referralCount ?? 0) !== 1 ? "s" : ""}</Text>
                          <View style={[styles.podiumBase, { height: 75, backgroundColor: "#FFD70020", borderColor: "#FFD70030" }]}>
                            <Text style={{ fontSize: 26 }}>🥇</Text>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#FFD700" }}>1</Text>
                          </View>
                        </View>
                        {/* 3ème */}
                        {leaderboard[2] ? (
                          <View style={styles.podiumColumn}>
                            <View style={[styles.podiumAvatar, { backgroundColor: "#CD7F3220", borderColor: "#CD7F32" }]}>
                              {leaderboard[2].photoURL ? (
                                <Image source={{ uri: leaderboard[2].photoURL }} style={{ width: 44, height: 44, borderRadius: 22 }} contentFit="cover" />
                              ) : (
                                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#CD7F32" }}>
                                  {(leaderboard[2].name || "U").charAt(0).toUpperCase()}
                                </Text>
                              )}
                            </View>
                            <Text style={[styles.podiumName, { color: c.text }]} numberOfLines={1}>{leaderboard[2].name || "—"}</Text>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: c.textMuted, textAlign: "center" }}>{leaderboard[2].referralCount ?? 0} filleul{(leaderboard[2].referralCount ?? 0) !== 1 ? "s" : ""}</Text>
                            <View style={[styles.podiumBase, { height: 45, backgroundColor: "#CD7F3220", borderColor: "#CD7F3230" }]}>
                              <Text style={{ fontSize: 18 }}>🥉</Text>
                              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#CD7F32" }}>3</Text>
                            </View>
                          </View>
                        ) : <View style={styles.podiumColumn} />}
                      </View>
                    </View>
                  )}

                  {/* Mon rang & progression */}
                  {(() => {
                    const myIdx = leaderboard.findIndex(e => e.id === user?.id);
                    const myRank = myIdx >= 0 ? myIdx + 1 : null;
                    const top1Count = leaderboard[0]?.referralCount ?? 0;
                    const top10Count = leaderboard.length >= 10
                      ? (leaderboard[9]?.referralCount ?? 0)
                      : (leaderboard[leaderboard.length - 1]?.referralCount ?? 0);
                    const myCount = referrals.length;

                    if (myRank === 1) {
                      return (
                        <View style={{ backgroundColor: "#FFD70018", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#FFD70050", flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <Text style={{ fontSize: 22 }}>🏆</Text>
                          <Text style={{ flex: 1, fontFamily: "Inter_700Bold", fontSize: 13, color: "#FFD700" }}>
                            Vous êtes #1 ! Vous êtes le meilleur parrain de Social Boost Horizon !
                          </Text>
                        </View>
                      );
                    }
                    if (myRank !== null && myRank > 1) {
                      const gapToFirst = Math.max(0, top1Count - myCount + 1);
                      return (
                        <View style={{ backgroundColor: c.accent + "12", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: c.accent + "30", flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <Feather name="trending-up" size={16} color={c.accent} />
                          <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: c.text }}>
                            Vous êtes <Text style={{ fontFamily: "Inter_700Bold", color: c.accent }}>#{myRank}</Text>.{gapToFirst > 0 ? ` Encore ${gapToFirst} filleul${gapToFirst > 1 ? "s" : ""} pour être #1 !` : " Vous êtes très proche du sommet !"}
                          </Text>
                        </View>
                      );
                    }
                    if (myRank === null && myCount > 0) {
                      const gapToTop10 = Math.max(0, top10Count - myCount + 1);
                      const gapToTop1 = Math.max(0, top1Count - myCount + 1);
                      return (
                        <View style={{ backgroundColor: "#FFD70012", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#FFD70030", flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <Feather name="star" size={16} color="#FFD700" />
                          <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: c.text }}>
                            Vous avez <Text style={{ fontFamily: "Inter_700Bold", color: "#FFD700" }}>{myCount} filleul{myCount > 1 ? "s" : ""}</Text>.{" "}
                            {gapToTop10 > 0
                              ? `Encore ${gapToTop10} filleul${gapToTop10 > 1 ? "s" : ""} pour le top 10`
                              : "Vous pouvez entrer dans le top 10"
                            }
                            {gapToTop1 > 0
                              ? `, et ${gapToTop1} de plus pour être #1 !`
                              : " !"
                            }
                          </Text>
                        </View>
                      );
                    }
                    if (myRank === null && myCount === 0) {
                      return (
                        <View style={{ backgroundColor: "#FFD70008", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#FFD70020", flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <Feather name="star" size={16} color="#FFD700" />
                          <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: c.text }}>
                            Partagez votre code pour obtenir des filleuls et grimper dans le classement !
                          </Text>
                        </View>
                      );
                    }
                    return null;
                  })()}

                  {/* Liste rang 4-10 */}
                  {leaderboard.length > 3 && (
                    <View style={{ gap: 8, marginTop: 4 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={{ flex: 1, height: 1, backgroundColor: c.separator }} />
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: c.textMuted, letterSpacing: 1 }}>
                          CLASSEMENT 4-10
                        </Text>
                        <View style={{ flex: 1, height: 1, backgroundColor: c.separator }} />
                      </View>
                      {leaderboard.slice(3, 10).map((entry, i) => (
                        <View key={entry.id} style={[styles.rankRow, { backgroundColor: entry.id === user?.id ? c.accent + "15" : c.card, borderColor: entry.id === user?.id ? c.accent + "40" : c.cardBorder }]}>
                          <View style={[styles.rankBadge, { backgroundColor: entry.id === user?.id ? c.accent + "20" : c.inputBg }]}>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: entry.id === user?.id ? c.accent : c.textMuted }}>#{i + 4}</Text>
                          </View>
                          <View style={[styles.rankAvatar, { backgroundColor: entry.id === user?.id ? c.accent + "20" : c.accent + "12" }]}>
                            {entry.photoURL ? (
                              <Image source={{ uri: entry.photoURL }} style={{ width: 34, height: 34, borderRadius: 17 }} contentFit="cover" />
                            ) : (
                              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: c.accent }}>
                                {(entry.name || "U").charAt(0).toUpperCase()}
                              </Text>
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: c.text }} numberOfLines={1}>
                              {entry.id === user?.id ? `${entry.name} (Vous)` : entry.name}
                            </Text>
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: c.textMuted }}>
                              {entry.referralCount ?? 0} filleul{(entry.referralCount ?? 0) !== 1 ? "s" : ""}
                            </Text>
                          </View>
                          <View style={{ backgroundColor: "#FFD70015", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignItems: "center" }}>
                            <Text style={{ fontSize: 14 }}>👥</Text>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#FFD700" }}>{entry.referralCount ?? 0}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>

            {/* Admin Section — visible uniquement pour mcexauofficiel@gmail.com */}
            {user?.email === "mcexauofficiel@gmail.com" && (
              <View style={[styles.card, { backgroundColor: c.card, borderColor: "#FFD70040" }]}>
                <View style={styles.cardHeaderRow}>
                  <Feather name="shield" size={15} color="#FFD700" />
                  <Text style={[styles.cardTitle, { color: "#FFD700" }]}>Administration</Text>
                </View>
                <Text style={[styles.adminHint, { color: c.textMuted }]}>
                  Vous avez un accès administrateur à cette plateforme.
                </Text>
                {/* Broadcast notifications — real screen */}
                <Pressable
                  style={[styles.adminRow, { backgroundColor: "rgba(108,58,245,0.12)", borderColor: "rgba(108,58,245,0.35)" }]}
                  onPress={() => router.push("/admin-notifications" as any)}
                >
                  <Feather name="send" size={16} color="#6C3AF5" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.adminRowText, { color: c.text }]}>Diffusion de notifications</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: c.textMuted, marginTop: 1 }}>
                      Envoyer un message push à vos utilisateurs
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={c.textMuted} />
                </Pressable>

                {[
                  { label: "Tableau de bord admin", icon: "bar-chart-2" as const },
                  { label: "Gérer les utilisateurs", icon: "users" as const },
                  { label: "Gérer les commandes", icon: "shopping-bag" as const },
                ].map((item, i) => (
                  <Pressable
                    key={i}
                    style={[styles.adminRow, { backgroundColor: "rgba(255,215,0,0.06)", borderColor: "rgba(255,215,0,0.15)" }]}
                    onPress={() => Alert.alert("Administration", "Section disponible dans la version web.")}
                  >
                    <Feather name={item.icon} size={16} color="#FFD700" />
                    <Text style={[styles.adminRowText, { color: c.text }]}>{item.label}</Text>
                    <Feather name="chevron-right" size={16} color={c.textMuted} />
                  </Pressable>
                ))}
              </View>
            )}

            <Pressable style={[styles.logoutBtn, { backgroundColor: c.card, borderColor: c.error + "30" }]} onPress={handleLogout}>
              <Feather name="log-out" size={18} color={c.error} />
              <Text style={[styles.logoutText, { color: c.error }]}>Se déconnecter</Text>
            </Pressable>
          </>
        )}

        {/* ── DEVELOPPEUR ── */}
        {activeTab === "developpeur" && (
          <>
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
              <View style={styles.cardHeaderRow}>
                <Feather name="code" size={16} color="#FFD700" />
                <Text style={[styles.cardTitle, { color: c.text }]}>Clé API</Text>
              </View>
              <Text style={[styles.devHint, { color: c.textMuted }]}>
                Utilisez votre clé API pour intégrer nos services dans vos applications.
              </Text>

              {!apiKey && !newApiKey ? (
                <View style={{ alignItems: "center", gap: 16, paddingVertical: 20 }}>
                  <View style={[styles.devKeyEmpty, { borderColor: c.cardBorder }]}>
                    <Feather name="key" size={36} color={c.textMuted} />
                  </View>
                  <Text style={[styles.devKeyEmptyText, { color: c.textMuted }]}>Aucune clé API générée</Text>
                  <Pressable
                    style={[styles.generateBtn, apiLoading && { opacity: 0.65 }]}
                    onPress={handleGenerateApiKey}
                    disabled={apiLoading}
                  >
                    <LinearGradient colors={[c.gradientStart, c.gradientEnd]} style={styles.generateBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                      {apiLoading ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="key" size={18} color="#fff" />}
                      <Text style={styles.generateBtnText}>Générer une clé API</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              ) : (
                <View style={{ gap: 12 }}>
                  {/* Show new key once with warning */}
                  {newApiKey && (
                    <View style={[styles.newKeyAlert, { backgroundColor: "rgba(255,215,0,0.08)", borderColor: "rgba(255,215,0,0.3)" }]}>
                      <View style={styles.newKeyAlertHeader}>
                        <Feather name="alert-triangle" size={16} color="#FFD700" />
                        <Text style={[styles.newKeyAlertTitle, { color: "#FFD700" }]}>Copiez maintenant !</Text>
                      </View>
                      <Text style={[styles.newKeyAlertText, { color: c.textSecondary }]}>
                        Cette clé ne sera plus affichée en clair. Copiez-la maintenant.
                      </Text>
                      <View style={[styles.newKeyBox, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
                        <Text style={[styles.newKeyValue, { color: "#4CAF50" }]} numberOfLines={2} selectable>
                          {newApiKey}
                        </Text>
                      </View>
                      <Pressable
                        style={[styles.copyKeyBtn, { backgroundColor: copiedApiKey ? c.success + "20" : c.accent + "18", borderColor: copiedApiKey ? c.success : c.accent }]}
                        onPress={() => handleCopyApiKey(newApiKey)}
                      >
                        <Feather name={copiedApiKey ? "check" : "copy"} size={16} color={copiedApiKey ? c.success : c.accent} />
                        <Text style={[styles.copyKeyBtnText, { color: copiedApiKey ? c.success : c.accent }]}>
                          {copiedApiKey ? "Clé copiée !" : "Copier la clé complète"}
                        </Text>
                      </Pressable>
                    </View>
                  )}

                  {/* Masked key display */}
                  <View style={[styles.keyDisplay, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
                    <Feather name="key" size={16} color={c.accent} />
                    <Text style={[styles.keyDisplayText, { color: c.text }]} numberOfLines={1}>
                      {apiKey}
                    </Text>
                  </View>

                  <View style={styles.keyActions}>
                    <Pressable
                      style={[styles.keyActionBtn, { backgroundColor: c.accent + "15", borderColor: c.accent }]}
                      onPress={handleGenerateApiKey}
                      disabled={apiLoading}
                    >
                      {apiLoading ? <ActivityIndicator size="small" color={c.accent} /> : <Feather name="refresh-cw" size={15} color={c.accent} />}
                      <Text style={[styles.keyActionText, { color: c.accent }]}>Régénérer</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.keyActionBtn, { backgroundColor: c.error + "15", borderColor: c.error }]}
                      onPress={handleRevokeApiKey}
                    >
                      <Feather name="trash-2" size={15} color={c.error} />
                      <Text style={[styles.keyActionText, { color: c.error }]}>Révoquer</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            {/* API Docs link */}
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>Documentation API</Text>
              <Text style={[styles.devHint, { color: c.textMuted }]}>
                Intégrez nos services SMM dans vos applications avec notre API RESTful.{"\n"}Documentation disponible sur <Text style={{ color: c.accent }}>socialboosthorizon.com/api-docs.html</Text>
              </Text>
              <Pressable
                style={[styles.docRow, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}
                onPress={() => WebBrowser.openBrowserAsync("https://socialboosthorizon.com/api-docs.html")}
              >
                <Feather name="book-open" size={16} color={c.accent} />
                <Text style={[styles.docRowText, { color: c.text }]}>Consulter la documentation</Text>
                <Feather name="external-link" size={14} color={c.textMuted} />
              </Pressable>
              <Pressable
                style={[styles.docRow, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}
                onPress={() => {
                  setSupportCategory("autre");
                  setSupportMessage(`Bonjour équipe Social Boost Horizon,\n\nJ'ai besoin d'aide pour l'intégration de l'API.\n\nEmail du compte : ${user?.email ?? ""}\n\nDescription du problème : `);
                  setSupportWaCode("+237");
                  setSupportWaPhone("");
                  setSupportSuccess(false);
                  setSupportStep(2);
                  setShowSupportModal(true);
                }}
              >
                <Feather name="headphones" size={16} color={c.accent} />
                <Text style={[styles.docRowText, { color: c.text }]}>Support API</Text>
                <Feather name="chevron-right" size={14} color={c.textMuted} />
              </Pressable>
            </View>

            {/* Site / Intégration SMM Request */}
            <View style={[styles.card, { backgroundColor: c.card, borderColor: "#1E90FF30" }]}>
              <View style={styles.cardHeaderRow}>
                <Feather name="globe" size={15} color="#1E90FF" />
                <Text style={[styles.cardTitle, { color: c.text }]}>Créer votre propre site SMM</Text>
              </View>
              <Text style={[styles.devHint, { color: c.textMuted, marginBottom: 12 }]}>
                Vous souhaitez votre propre plateforme SMM ou intégrer notre API dans votre site existant ? Nous vous accompagnons !
              </Text>
              <View style={{ gap: 8, marginBottom: 12 }}>
                {[
                  { icon: "layout" as const, text: "Site SMM complet personnalisé", color: "#4CAF50" },
                  { icon: "code" as const, text: "Intégration API dans votre site", color: "#1E90FF" },
                  { icon: "shopping-bag" as const, text: "Panel revendeur white-label", color: "#FFD700" },
                  { icon: "headphones" as const, text: "Support et maintenance inclus", color: "#9C27B0" },
                ].map((f, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: f.color + "20", alignItems: "center", justifyContent: "center" }}>
                      <Feather name={f.icon} size={13} color={f.color} />
                    </View>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: c.textSecondary, flex: 1 }}>{f.text}</Text>
                  </View>
                ))}
              </View>
              <Pressable
                style={[{ borderRadius: 12, overflow: "hidden" }]}
                onPress={() => {
                  setSiteHasWebsite(null);
                  setSiteUrl("");
                  setSiteRequestType("");
                  setSiteDescription("");
                  setSiteWaCode("+237");
                  setSiteWaPhone("");
                  setSiteSuccess(false);
                  setShowSiteModal(true);
                }}
              >
                <LinearGradient colors={["#1E90FF", "#0066CC"]} style={{ height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Feather name="send" size={16} color="#fff" />
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" }}>Faire une demande</Text>
                </LinearGradient>
              </Pressable>
            </View>

          </>
        )}

        {/* ── SECURITE ── */}
        {activeTab === "securite" && (
          <>
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>Sécurité du compte</Text>
              {[
                { icon: "mail" as const, label: "Email de connexion", value: user?.email ?? "—", action: null },
                { icon: "lock" as const, label: "Mot de passe", value: "••••••••", action: "Modifier" },
                { icon: "smartphone" as const, label: "Vérification 2FA", value: "Non activée", action: "Activer" },
              ].map((item, i) => (
                <View key={i} style={[styles.infoRow, { borderBottomColor: c.separator }]}>
                  <View style={[styles.infoIconCircle, { backgroundColor: c.accent + "18" }]}>
                    <Feather name={item.icon} size={15} color={c.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoLabel, { color: c.textMuted }]}>{item.label}</Text>
                    <Text style={[styles.infoValue, { color: c.text }]}>{item.value}</Text>
                  </View>
                  {item.action && (
                    <Pressable style={[styles.securityActionBtn, { borderColor: c.accent, backgroundColor: c.accent + "12" }]}>
                      <Text style={[styles.securityActionText, { color: c.accent }]}>{item.action}</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── PARAMETRES ── */}
        {activeTab === "parametres" && (
          <>
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>Thème de l'application</Text>
              <Pressable
                style={[styles.themeToggleRow, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}
                onPress={toggleTheme}
              >
                <View style={[styles.themeToggleIcon, { backgroundColor: isDark ? "rgba(255,215,0,0.15)" : "rgba(106,13,173,0.15)" }]}>
                  <Feather name={isDark ? "sun" : "moon"} size={20} color={isDark ? "#FFD700" : "#6a0dad"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoValue, { color: c.text }]}>Mode {isDark ? "sombre" : "clair"}</Text>
                  <Text style={[styles.infoLabel, { color: c.textMuted }]}>Appuyez pour basculer</Text>
                </View>
                <View style={[styles.themeIndicator, { backgroundColor: isDark ? "#FFD700" : "#6a0dad" }]}>
                  <Text style={styles.themeIndicatorText}>{isDark ? "🌙" : "☀️"}</Text>
                </View>
              </Pressable>
            </View>

            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>Notifications</Text>

              {/* Push notifications row with real status */}
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoValue, { color: c.text }]}>Notifications push</Text>
                  <Text style={[styles.infoLabel, { color: pushTokenActive === false ? c.error : pushTokenActive === true ? "#4CAF50" : c.textMuted }]}>
                    {notifRegistering
                      ? "Activation en cours..."
                      : pushTokenActive === true
                      ? "✅ Actives — commandes et solde"
                      : pushTokenActive === false
                      ? "❌ Inactives — appuyez pour activer"
                      : "Chargement..."}
                  </Text>
                </View>
                {notifRegistering ? (
                  <ActivityIndicator size="small" color={c.accent} />
                ) : (
                  <Switch
                    value={notifPush}
                    onValueChange={toggleNotifPush}
                    trackColor={{ false: c.inputBorder, true: c.accent + "80" }}
                    thumbColor={notifPush ? c.accent : c.textMuted}
                  />
                )}
              </View>

              {[
                { label: "Emails promotionnels", sub: "Offres et nouveautés", value: notifEmail, onChange: toggleNotifEmail },
                { label: "Alertes de sécurité", sub: "Connexions inhabituelles", value: notifSecurity, onChange: toggleNotifSecurity },
              ].map((s, i) => (
                <View key={i} style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoValue, { color: c.text }]}>{s.label}</Text>
                    <Text style={[styles.infoLabel, { color: c.textMuted }]}>{s.sub}</Text>
                  </View>
                  <Switch
                    value={s.value}
                    onValueChange={s.onChange}
                    trackColor={{ false: c.inputBorder, true: c.accent + "80" }}
                    thumbColor={s.value ? c.accent : c.textMuted}
                  />
                </View>
              ))}
            </View>

            {/* Support WhatsApp */}
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder, marginBottom: 8 }]}>
              <Text style={[styles.sectionLabel, { color: c.textMuted, marginBottom: 10 }]}>ASSISTANCE</Text>
              <Pressable
                style={[styles.settingsRow, { borderBottomWidth: 0 }]}
                onPress={openSupportModal}
              >
                <View style={[styles.settingsIcon, { backgroundColor: "#25D36620" }]}>
                  <Feather name="message-circle" size={16} color="#25D366" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingsLabel, { color: c.text }]}>Contacter le support</Text>
                  <Text style={[styles.settingsDesc, { color: c.textMuted }]}>WhatsApp · Réponse rapide</Text>
                </View>
                <Feather name="chevron-right" size={16} color={c.textMuted} />
              </Pressable>
            </View>

            {/* Social Media Links */}
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>Nos Réseaux Sociaux</Text>
              <Text style={[styles.devHint, { color: c.textMuted, marginBottom: 8 }]}>Suivez-nous pour les dernières actualités et offres</Text>
              {[
                { label: "Canal WhatsApp", icon: "message-circle", color: "#25D366", url: "https://whatsapp.com/channel/0029Vb7A88V5q08c9iIrnP32", badge: "Rejoindre" },
                { label: "Facebook", icon: "facebook", color: "#1877F2", url: "https://www.facebook.com/share/1ACQ14Cg9h/" },
                { label: "Instagram", icon: "instagram", color: "#E1306C", url: "https://www.instagram.com/social.boost.horizon" },
                { label: "Twitter / X", icon: "twitter", color: "#1DA1F2", url: "https://x.com/mcexau?s=21" },
                { label: "TikTok", icon: "music", color: "#010101", url: "https://www.tiktok.com/@social.boost.hori" },
                { label: "YouTube", icon: "youtube", color: "#FF0000", url: "http://www.youtube.com/@SocialBoostHorizon-d7t" },
              ].map((item, i, arr) => (
                <Pressable
                  key={item.label}
                  style={({ pressed }) => [styles.settingsRow, {
                    borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                    borderBottomColor: c.separator,
                    opacity: pressed ? 0.75 : 1,
                  }]}
                  onPress={() => Linking.openURL(item.url)}
                >
                  <View style={[styles.settingsIcon, { backgroundColor: item.color + "20" }]}>
                    <Feather name={item.icon as any} size={16} color={item.color} />
                  </View>
                  <Text style={[styles.settingsLabel, { flex: 1, color: c.text }]}>{item.label}</Text>
                  {(item as any).badge ? (
                    <View style={{ backgroundColor: item.color + "22", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6 }}>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: item.color }}>{(item as any).badge}</Text>
                    </View>
                  ) : null}
                  <Feather name="external-link" size={14} color={c.textMuted} />
                </Pressable>
              ))}
            </View>

            <Pressable style={[styles.logoutBtn, { backgroundColor: c.card, borderColor: c.error + "30" }]} onPress={handleLogout}>
              <Feather name="log-out" size={18} color={c.error} />
              <Text style={[styles.logoutText, { color: c.error }]}>Se déconnecter</Text>
            </Pressable>

            <Text style={[styles.version, { color: c.textMuted }]}>
              Social Boost Horizon v{currentVersion}
            </Text>
            {updateAvailable && (
              <Pressable onPress={openModal} style={{ marginTop: 4, alignItems: "center" }}>
                <Text style={{ color: "#6C63FF", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                  ↑ Mise à jour disponible — Appuyer pour télécharger
                </Text>
              </Pressable>
            )}
          </>
        )}

        {/* ── ADMIN ── */}
        {activeTab === "admin" && user?.email === ADMIN_EMAIL && (
          <AdminPanel />
        )}
      </ScrollView>

      {/* Multi-step Support Modal */}
      <Modal visible={showSupportModal} animationType="slide" transparent onRequestClose={() => setShowSupportModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: c.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: c.separator }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: c.text }]}>
                  {supportStep === 1 ? "Contacter le Support" : supportStep === 2 ? "Votre message" : "Message envoyé !"}
                </Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: c.textMuted, marginTop: 2 }}>
                  {supportStep < 3 ? `Étape ${supportStep} sur 2` : "Notre équipe reviendra vers vous"}
                </Text>
              </View>
              <Pressable onPress={() => setShowSupportModal(false)} style={[styles.modalCloseBtn, { backgroundColor: c.inputBg }]}>
                <Feather name="x" size={20} color={c.text} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">

              {/* STEP 1 – Category */}
              {supportStep === 1 && (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#25D36615", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#25D36630" }}>
                    <Feather name="message-circle" size={18} color="#25D366" />
                    <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: c.text }}>
                      Choisissez la catégorie correspondant à votre problème pour obtenir une aide rapide.
                    </Text>
                  </View>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: c.textMuted, letterSpacing: 0.8 }}>
                    QUELLE EST VOTRE CATÉGORIE ?
                  </Text>
                  {SUPPORT_PROBLEMS.map((p) => (
                    <Pressable
                      key={p.id}
                      style={[{
                        flexDirection: "row", alignItems: "center", gap: 14,
                        padding: 14, borderRadius: 12, borderWidth: 1.5,
                        backgroundColor: supportCategory === p.id ? p.color + "15" : c.card,
                        borderColor: supportCategory === p.id ? p.color : c.cardBorder,
                      }]}
                      onPress={() => setSupportCategory(p.id)}
                    >
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: p.color + "20", alignItems: "center", justifyContent: "center" }}>
                        <Feather name={p.icon} size={18} color={p.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.text }}>{p.title}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: c.textMuted, marginTop: 2 }}>{p.desc}</Text>
                      </View>
                      {supportCategory === p.id && <Feather name="check-circle" size={18} color={p.color} />}
                    </Pressable>
                  ))}
                  <Pressable
                    style={[{ borderRadius: 12, overflow: "hidden", marginTop: 4, opacity: supportCategory ? 1 : 0.5 }]}
                    onPress={() => {
                      if (!supportCategory) return;
                      const problem = SUPPORT_PROBLEMS.find(p => p.id === supportCategory);
                      if (problem && !supportMessage.trim()) setSupportMessage(problem.getMessage());
                      setSupportStep(2);
                    }}
                    disabled={!supportCategory}
                  >
                    <LinearGradient colors={[c.gradientStart, c.gradientEnd]} style={{ height: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" }}>Continuer</Text>
                      <Feather name="arrow-right" size={17} color="#fff" />
                    </LinearGradient>
                  </Pressable>
                </>
              )}

              {/* STEP 2 – Message + WhatsApp */}
              {supportStep === 2 && (
                <>
                  <Pressable onPress={() => setSupportStep(1)} style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}>
                    <Feather name="arrow-left" size={15} color={c.accent} />
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: c.accent }}>Retour</Text>
                  </Pressable>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.card, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: c.cardBorder }}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: (SUPPORT_PROBLEMS.find(p => p.id === supportCategory)?.color ?? c.accent) + "20", alignItems: "center", justifyContent: "center" }}>
                      <Feather name={(SUPPORT_PROBLEMS.find(p => p.id === supportCategory)?.icon ?? "help-circle") as any} size={16} color={SUPPORT_PROBLEMS.find(p => p.id === supportCategory)?.color ?? c.accent} />
                    </View>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: c.text }}>
                      {SUPPORT_PROBLEMS.find(p => p.id === supportCategory)?.title ?? supportCategory}
                    </Text>
                  </View>
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: c.textSecondary }}>Décrivez votre problème *</Text>
                    <TextInput
                      style={[{
                        backgroundColor: c.inputBg, borderColor: c.inputBorder,
                        borderWidth: 1, borderRadius: 12, padding: 14,
                        fontFamily: "Inter_400Regular", fontSize: 14, color: c.text,
                        minHeight: 120, textAlignVertical: "top",
                      }]}
                      placeholder="Décrivez votre problème en détail : date, montant, numéro de commande, lien concerné..."
                      placeholderTextColor={c.textMuted}
                      value={supportMessage}
                      onChangeText={setSupportMessage}
                      multiline
                      numberOfLines={5}
                    />
                  </View>
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: c.textSecondary }}>Votre WhatsApp <Text style={{ color: c.error }}>*</Text> (obligatoire)</Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <View style={[{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.inputBg, borderColor: c.inputBorder, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 50, minWidth: 100 }]}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: c.accent }}>{supportWaCode}</Text>
                      </View>
                      <TextInput
                        style={[{ flex: 1, backgroundColor: c.inputBg, borderColor: c.inputBorder, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 50, fontFamily: "Inter_400Regular", fontSize: 14, color: c.text }]}
                        placeholder="6XX XXX XXX"
                        placeholderTextColor={c.textMuted}
                        value={supportWaPhone}
                        onChangeText={setSupportWaPhone}
                        keyboardType="phone-pad"
                      />
                    </View>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: c.error + "CC" }}>Obligatoire — notre équipe vous contactera sur ce numéro</Text>
                  </View>
                  <Pressable
                    style={[{ borderRadius: 12, overflow: "hidden", opacity: supportLoading ? 0.7 : 1 }]}
                    onPress={handleSupportSubmit}
                    disabled={supportLoading}
                  >
                    <LinearGradient colors={["#25D366", "#128C7E"]} style={{ height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                      {supportLoading ? <ActivityIndicator color="#fff" /> : <>
                        <Feather name="send" size={17} color="#fff" />
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" }}>Envoyer au support</Text>
                      </>}
                    </LinearGradient>
                  </Pressable>
                </>
              )}

              {/* STEP 3 – Success */}
              {supportStep === 3 && (
                <View style={{ alignItems: "center", paddingVertical: 20, gap: 16 }}>
                  <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "#4CAF5020", alignItems: "center", justifyContent: "center" }}>
                    <Feather name="check-circle" size={42} color="#4CAF50" />
                  </View>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: c.text, textAlign: "center" }}>
                    Message envoyé !
                  </Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: c.textMuted, textAlign: "center", lineHeight: 21 }}>
                    Votre message a bien été envoyé à notre équipe. Nous vous recontacterons sur votre numéro WhatsApp dans les meilleurs délais.
                  </Text>
                  <Pressable onPress={() => setShowSupportModal(false)} style={{ alignSelf: "stretch" }}>
                    <View style={{ height: 48, alignItems: "center", justifyContent: "center", backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.cardBorder }}>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.text }}>Fermer</Text>
                    </View>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Site Request Modal */}
      <Modal visible={showSiteModal} animationType="slide" transparent onRequestClose={() => setShowSiteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: c.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: c.separator }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: c.text }]}>Demande de site / API</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: c.textMuted, marginTop: 2 }}>
                  Nous construisons des sites SMM & intégrations API
                </Text>
              </View>
              <Pressable onPress={() => setShowSiteModal(false)} style={[styles.modalCloseBtn, { backgroundColor: c.inputBg }]}>
                <Feather name="x" size={20} color={c.text} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
              {siteSuccess ? (
                <View style={{ alignItems: "center", paddingVertical: 20, gap: 16 }}>
                  <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "#4CAF5020", alignItems: "center", justifyContent: "center" }}>
                    <Feather name="check-circle" size={42} color="#4CAF50" />
                  </View>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: c.text, textAlign: "center" }}>Demande envoyée !</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: c.textMuted, textAlign: "center", lineHeight: 21 }}>
                    Notre équipe analysera votre projet et vous contactera rapidement pour un devis personnalisé.
                  </Text>
                  <Pressable onPress={() => { setShowSiteModal(false); setSiteSuccess(false); }} style={{ alignSelf: "stretch" }}>
                    <View style={{ height: 48, alignItems: "center", justifyContent: "center", backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.cardBorder }}>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.text }}>Fermer</Text>
                    </View>
                  </Pressable>
                </View>
              ) : (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.accent + "12", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: c.accent + "30" }}>
                    <Feather name="globe" size={18} color={c.accent} />
                    <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: c.text }}>
                      Nous créons des sites SMM complets ou intégrons notre API dans vos plateformes existantes.
                    </Text>
                  </View>

                  <View style={{ gap: 8 }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: c.textSecondary }}>Avez-vous déjà un site web ?</Text>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      {[{ val: false, label: "🆕 Non, je veux un site complet", color: "#4CAF50" }, { val: true, label: "✅ Oui, intégrer l'API", color: "#1E90FF" }].map((opt) => (
                        <Pressable
                          key={String(opt.val)}
                          style={[{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 1.5, alignItems: "center", gap: 4,
                            backgroundColor: siteHasWebsite === opt.val ? opt.color + "15" : c.card,
                            borderColor: siteHasWebsite === opt.val ? opt.color : c.cardBorder,
                          }]}
                          onPress={() => setSiteHasWebsite(opt.val)}
                        >
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: siteHasWebsite === opt.val ? opt.color : c.textSecondary, textAlign: "center" }}>
                            {opt.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  {siteHasWebsite === true && (
                    <View style={{ gap: 6 }}>
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: c.textSecondary }}>URL de votre site actuel</Text>
                      <View style={[{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.inputBg, borderColor: c.inputBorder, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 50 }]}>
                        <Feather name="link" size={15} color={c.accent} />
                        <TextInput
                          style={[{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: c.text }]}
                          placeholder="https://monsite.com"
                          placeholderTextColor={c.textMuted}
                          value={siteUrl}
                          onChangeText={setSiteUrl}
                          keyboardType="url"
                          autoCapitalize="none"
                        />
                      </View>
                    </View>
                  )}

                  <View style={{ gap: 8 }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: c.textSecondary }}>Type de services souhaités</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {[
                        { key: "Standard", label: "Standard", color: "#4CAF50", icon: "star" as const },
                        { key: "Auto", label: "Automatique", color: "#1E90FF", icon: "refresh-cw" as const },
                        { key: "Advanced", label: "Avancée", color: "#9C27B0", icon: "zap" as const },
                        { key: "Revendeur", label: "Revendeur", color: "#FFD700", icon: "shopping-bag" as const },
                      ].map((opt) => {
                        const selected = siteRequestType.split(",").map(s => s.trim()).includes(opt.key);
                        return (
                          <Pressable
                            key={opt.key}
                            style={[{
                              flexDirection: "row", alignItems: "center", gap: 6,
                              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5,
                              backgroundColor: selected ? opt.color + "18" : c.card,
                              borderColor: selected ? opt.color : c.cardBorder,
                            }]}
                            onPress={() => {
                              const current = siteRequestType.split(",").map(s => s.trim()).filter(Boolean);
                              const newList = selected ? current.filter(k => k !== opt.key) : [...current, opt.key];
                              setSiteRequestType(newList.join(", "));
                              if (!siteDescription.trim() && !selected) {
                                setSiteDescription(`Je souhaite un site SMM avec des commandes de type ${opt.label}.\n\nDétails:\n- Budget estimé : [À préciser]\n- Audience cible : [À préciser]\n- Fonctionnalités souhaitées : [À préciser]`);
                              }
                            }}
                          >
                            <Feather name={selected ? "check-square" : "square"} size={14} color={selected ? opt.color : c.textMuted} />
                            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: selected ? opt.color : c.textSecondary }}>{opt.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View style={{ gap: 6 }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: c.textSecondary }}>Description du projet *</Text>
                    <TextInput
                      style={[{ backgroundColor: c.inputBg, borderColor: c.inputBorder, borderWidth: 1, borderRadius: 12, padding: 14, fontFamily: "Inter_400Regular", fontSize: 14, color: c.text, minHeight: 100, textAlignVertical: "top" }]}
                      placeholder="Décrivez votre projet, vos objectifs, votre audience cible, budget estimé..."
                      placeholderTextColor={c.textMuted}
                      value={siteDescription}
                      onChangeText={setSiteDescription}
                      multiline
                      numberOfLines={4}
                    />
                  </View>

                  <View style={{ gap: 6 }}>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: c.textSecondary }}>Votre WhatsApp <Text style={{ color: c.error }}>*</Text> (obligatoire)</Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <View style={[{ flexDirection: "row", alignItems: "center", backgroundColor: c.inputBg, borderColor: c.inputBorder, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 50, minWidth: 90 }]}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: c.accent }}>{siteWaCode}</Text>
                      </View>
                      <TextInput
                        style={[{ flex: 1, backgroundColor: c.inputBg, borderColor: c.inputBorder, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 50, fontFamily: "Inter_400Regular", fontSize: 14, color: c.text }]}
                        placeholder="6XX XXX XXX"
                        placeholderTextColor={c.textMuted}
                        value={siteWaPhone}
                        onChangeText={setSiteWaPhone}
                        keyboardType="phone-pad"
                      />
                    </View>
                  </View>

                  <Pressable
                    style={[{ borderRadius: 12, overflow: "hidden", opacity: siteLoading ? 0.7 : 1 }]}
                    onPress={handleSiteRequestSubmit}
                    disabled={siteLoading}
                  >
                    <LinearGradient colors={[c.gradientStart, c.gradientEnd]} style={{ height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                      {siteLoading ? <ActivityIndicator color="#fff" /> : <>
                        <Feather name="send" size={17} color="#fff" />
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" }}>Envoyer ma demande</Text>
                      </>}
                    </LinearGradient>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Country Modal */}
      <Modal visible={showCountryModal} animationType="slide" transparent onRequestClose={() => setShowCountryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: c.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: c.separator }]}>
              <Text style={[styles.modalTitle, { color: c.text }]}>Choisir un pays</Text>
              <Pressable onPress={() => setShowCountryModal(false)} style={[styles.modalCloseBtn, { backgroundColor: c.inputBg }]}>
                <Feather name="x" size={20} color={c.text} />
              </Pressable>
            </View>
            <View style={[styles.searchBar, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
              <Feather name="search" size={16} color={c.textMuted} />
              <TextInput style={[styles.searchInput, { color: c.text }]} placeholder="Rechercher..." placeholderTextColor={c.textMuted} value={countrySearch} onChangeText={setCountrySearch} />
            </View>
            <FlatList
              data={filteredCountries}
              keyExtractor={(cc) => cc.code}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 6 }}
              renderItem={({ item }) => {
                const isSelected = editCountry === item.code;
                return (
                  <Pressable
                    style={[styles.countryOption, { backgroundColor: isSelected ? c.accent + "18" : c.card, borderColor: isSelected ? c.accent : c.cardBorder }]}
                    onPress={() => { setEditCountry(item.code); setShowCountryModal(false); }}
                  >
                    <Text style={styles.countryOptionFlag}>{item.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.countryOptionName, { color: c.text }]}>{item.name}</Text>
                      <Text style={[styles.countryOptionSub, { color: c.textMuted }]}>{item.currency} · {item.phoneCode}</Text>
                    </View>
                    {isSelected && <Feather name="check-circle" size={18} color={c.accent} />}
                  </Pressable>
                );
              }}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  header: { paddingBottom: 16, paddingHorizontal: 16 },
  headerTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  themeBtnHeader: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  adminBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,215,0,0.2)",
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: "rgba(255,215,0,0.4)",
  },
  adminBadgeText: { fontFamily: "Inter_700Bold", fontSize: 12, color: "#FFD700" },
  profileHero: { alignItems: "center", gap: 5, paddingTop: 4 },
  avatarWrap: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 3, borderColor: "#FFD700",
    overflow: "hidden", position: "relative", marginBottom: 4,
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarFallback: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontFamily: "Inter_700Bold", fontSize: 28, color: "#fff" },
  editBadge: {
    position: "absolute", bottom: 0, right: 0,
    borderRadius: 10, width: 22, height: 22,
    alignItems: "center", justifyContent: "center",
  },
  profileName: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#fff" },
  profileEmail: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.65)" },
  memberBadgeRow: { flexDirection: "row", gap: 8 },
  memberBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,215,0,0.15)",
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
  },
  memberBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#FFD700" },
  heroStats: {
    flexDirection: "row", marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 14, paddingVertical: 12,
  },
  heroStat: { flex: 1, alignItems: "center", gap: 2 },
  heroStatBorder: { borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.15)" },
  heroStatValue: { fontFamily: "Inter_700Bold", fontSize: 18, color: "#fff" },
  heroStatLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.65)" },
  tabBar: { borderBottomWidth: 1 },
  tabScroll: { paddingHorizontal: 8 },
  tabBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  content: { padding: 14, gap: 14 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 15, flex: 1 },
  editBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
  },
  editBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  editField: { gap: 6 },
  editFieldLabel: { fontFamily: "Inter_500Medium", fontSize: 13 },
  editInputRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
  },
  editInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 15 },
  saveBtn: { overflow: "hidden", borderRadius: 12, marginTop: 4 },
  saveBtnGradient: { height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10, borderBottomWidth: 1 },
  infoIconCircle: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontFamily: "Inter_400Regular", fontSize: 12 },
  infoValue: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  balanceRow2: { flexDirection: "row", alignItems: "center" },
  balanceItem2: { flex: 1, alignItems: "center", gap: 6, padding: 10 },
  balanceDivider2: { width: 1, height: 50 },
  balanceLbl2: { fontFamily: "Inter_400Regular", fontSize: 12 },
  balanceVal2: { fontFamily: "Inter_700Bold", fontSize: 18 },
  codeBox: {
    borderRadius: 14, borderWidth: 1, padding: 16, gap: 12, alignItems: "center",
  },
  codeValue: { fontFamily: "Inter_700Bold", fontSize: 22, letterSpacing: 2 },
  codeActions: { flexDirection: "row", gap: 8 },
  codeBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  codeBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  adminHint: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20 },
  adminRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 10, borderWidth: 1, padding: 12,
  },
  adminRowText: { fontFamily: "Inter_500Medium", fontSize: 14, flex: 1 },
  devHint: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20 },
  devKeyEmpty: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 2, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center",
  },
  devKeyEmptyText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  generateBtn: { overflow: "hidden", borderRadius: 12, width: "100%" },
  generateBtnGradient: { height: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  generateBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" },
  newKeyAlert: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  newKeyAlertHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  newKeyAlertTitle: { fontFamily: "Inter_700Bold", fontSize: 15 },
  newKeyAlertText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  newKeyBox: { borderRadius: 10, borderWidth: 1, padding: 12 },
  newKeyValue: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20 },
  copyKeyBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderRadius: 10, padding: 10, justifyContent: "center",
  },
  copyKeyBtnText: { fontFamily: "Inter_700Bold", fontSize: 14 },
  keyDisplay: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderRadius: 12, padding: 14,
  },
  keyDisplayText: { fontFamily: "Inter_400Regular", fontSize: 14, flex: 1 },
  keyActions: { flexDirection: "row", gap: 10 },
  keyActionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1, borderRadius: 12, padding: 12,
  },
  keyActionText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  docRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 10, borderWidth: 1, padding: 12,
  },
  docRowText: { fontFamily: "Inter_500Medium", fontSize: 14, flex: 1 },
  devInfoRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 10, borderBottomWidth: 1,
  },
  devInfoLabel: { fontFamily: "Inter_400Regular", fontSize: 13 },
  devInfoValue: { fontFamily: "Inter_600SemiBold", fontSize: 13, flex: 1, textAlign: "right", marginLeft: 10 },
  securityRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  securityActionBtn: {
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  securityActionText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  themeToggleRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 12, borderWidth: 1, padding: 12,
  },
  themeToggleIcon: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: "center", justifyContent: "center",
  },
  themeIndicator: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  themeIndicatorText: { fontSize: 18 },
  switchRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderRadius: 14, borderWidth: 1, padding: 16,
  },
  logoutText: { fontFamily: "Inter_700Bold", fontSize: 15 },
  version: { textAlign: "center", fontFamily: "Inter_400Regular", fontSize: 12 },
  settingsRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  settingsIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  settingsLabel: { fontFamily: "Inter_500Medium", fontSize: 14 },
  settingsDesc: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%" },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
  modalCloseBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    margin: 16, marginTop: 12,
  },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 15 },
  countryOption: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 12, borderWidth: 1, padding: 12,
  },
  countryOptionFlag: { fontSize: 26 },
  countryOptionName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  countryOptionSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },

  // Referral section
  referralStatBox: {
    flex: 1, alignItems: "center", gap: 4, padding: 12,
    borderRadius: 12, borderWidth: 1,
  },
  referralStatNum: { fontFamily: "Inter_700Bold", fontSize: 20 },
  referralStatLbl: { fontFamily: "Inter_400Regular", fontSize: 11 },
  referralRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10,
  },
  referralAvatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  referralName: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  referralSub: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  referralBadge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },

  // Leaderboard podium
  podiumColumn: {
    flex: 1, alignItems: "center", gap: 4,
    maxWidth: 110,
  },
  podiumAvatar: {
    width: 48, height: 48, borderRadius: 24, borderWidth: 2,
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  podiumName: { fontFamily: "Inter_600SemiBold", fontSize: 11, textAlign: "center", marginTop: 2 },
  podiumBase: {
    width: "100%", borderRadius: 8, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
    marginTop: 4, gap: 2, paddingVertical: 4,
  },

  // Ranked list
  rankRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 10,
  },
  rankBadge: {
    width: 34, height: 34, borderRadius: 8,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  rankAvatar: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
});
