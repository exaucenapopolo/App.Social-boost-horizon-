import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { BASE_URL } from "@/services/api";
import { getFreshToken } from "@/services/tokenStore";

type Target = "all" | "user";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  photoURL: string | null;
  hasPushToken: boolean;
  totalOrders: number;
  balance: number;
}

// All app screens — visual cards for the picker
const APP_SCREENS = [
  {
    value: "",
    label: "Aucune redirection",
    desc: "L'app s'ouvre simplement",
    icon: "smartphone" as const,
    color: "#607D8B",
    emoji: "📱",
  },
  {
    value: "home",
    label: "Accueil",
    desc: "Page principale",
    icon: "home" as const,
    color: "#6C3AF5",
    emoji: "🏠",
  },
  {
    value: "orders",
    label: "Commandes",
    desc: "Suivi & historique",
    icon: "package" as const,
    color: "#FF9800",
    emoji: "📦",
  },
  {
    value: "wallet",
    label: "Portefeuille",
    desc: "Solde & dépôts",
    icon: "credit-card" as const,
    color: "#2196F3",
    emoji: "💰",
  },
  {
    value: "notifications",
    label: "Notifications",
    desc: "Centre de notifications",
    icon: "bell" as const,
    color: "#9C27B0",
    emoji: "🔔",
  },
  {
    value: "profile",
    label: "Profil",
    desc: "Compte & réglages",
    icon: "user" as const,
    color: "#4CAF50",
    emoji: "👤",
  },
  {
    value: "parrainage",
    label: "Parrainage",
    desc: "Programme & leaderboard",
    icon: "users" as const,
    color: "#FFD700",
    emoji: "🤝",
  },
  {
    value: "new-order",
    label: "Commander",
    desc: "Passer une commande",
    icon: "shopping-cart" as const,
    color: "#F44336",
    emoji: "🛒",
  },
];

// Pre-made notification templates
const NOTIF_TEMPLATES = [
  {
    emoji: "🎉",
    label: "Promo",
    title: "Offre spéciale !",
    message: "Profitez d'une réduction exceptionnelle sur tous nos services aujourd'hui seulement !",
    screen: "home",
  },
  {
    emoji: "⚠️",
    label: "Alerte",
    title: "Information importante",
    message: "Une mise à jour importante concerne votre compte. Veuillez vérifier vos informations.",
    screen: "",
  },
  {
    emoji: "💰",
    label: "Bonus",
    title: "Bonus crédité !",
    message: "Un bonus a été ajouté sur votre compte. Consultez votre portefeuille.",
    screen: "wallet",
  },
  {
    emoji: "📦",
    label: "Commande",
    title: "Mise à jour commande",
    message: "Votre commande a été mise à jour. Consultez vos commandes pour plus de détails.",
    screen: "orders",
  },
  {
    emoji: "🤝",
    label: "Parrain",
    title: "Programme de parrainage",
    message: "Invitez vos amis et gagnez 10% de commission sur chacune de leurs commandes !",
    screen: "parrainage",
  },
  {
    emoji: "✏️",
    label: "Libre",
    title: "",
    message: "",
    screen: "",
  },
];

const ADMIN_EMAIL = "mcexauofficiel@gmail.com";

export default function AdminNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors: c, isDark } = useTheme();

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<Target>("all");
  const [selectedTemplate, setSelectedTemplate] = useState(5);
  const [redirectMode, setRedirectMode] = useState<"screen" | "url">("screen");
  const [selectedScreen, setSelectedScreen] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [saveToInbox, setSaveToInbox] = useState(true);

  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalWithToken, setTotalWithToken] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [showUserPicker, setShowUserPicker] = useState(false);

  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ sent: number; failed: number } | null>(null);

  const titleInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (user && user.email !== ADMIN_EMAIL) {
      router.back();
    }
  }, [user]);

  const loadUsers = async () => {
    if (allUsers.length > 0) return;
    setUsersLoading(true);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BASE_URL}api/admin/users?sort=name`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setAllUsers(json.data);
        setTotalUsers(json.total ?? json.data.length);
        setTotalWithToken(json.totalWithToken ?? json.data.filter((u: AdminUser) => u.hasPushToken).length);
      }
    } catch {}
    setUsersLoading(false);
  };

  const applyTemplate = (idx: number) => {
    setSelectedTemplate(idx);
    const t = NOTIF_TEMPLATES[idx];
    if (t.title) setTitle(t.title);
    if (t.message) setMessage(t.message);
    setSelectedScreen(t.screen);
  };

  const filteredUsers = allUsers.filter(
    (u) =>
      !userSearch ||
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  // totalWithToken vient du serveur (tous les utilisateurs, pas seulement ceux chargés)
  const usersWithToken = totalWithToken > 0 ? totalWithToken : allUsers.filter((u) => u.hasPushToken).length;

  const canSend =
    title.trim().length > 0 &&
    message.trim().length > 0 &&
    (target === "all" || (target === "user" && selectedUser !== null));

  const selectedScreenInfo = APP_SCREENS.find((s) => s.value === selectedScreen) ?? APP_SCREENS[0];

  const handleSend = () => {
    if (!canSend) return;
    const targetLabel =
      target === "all"
        ? `tous les utilisateurs (${usersWithToken} tokens actifs)`
        : `${selectedUser!.name}`;
    const redirectLabel =
      redirectMode === "url" && externalUrl.trim()
        ? `\n🔗 Ouvre l'URL : ${externalUrl.trim()}`
        : selectedScreen
        ? `\n🔗 Redirige vers : ${selectedScreenInfo.label}`
        : "\n📱 Aucune redirection";

    Alert.alert(
      "Confirmer l'envoi",
      `Envoyer à ${targetLabel} ?\n\n📣 ${title}\n${message}${redirectLabel}`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Envoyer ✓", onPress: doSend },
      ]
    );
  };

  const doSend = async () => {
    setSending(true);
    setLastResult(null);
    try {
      const token = await getFreshToken();
      const body: Record<string, unknown> = {
        title: title.trim(),
        message: message.trim(),
        target,
        saveToInbox,
      };
      if (redirectMode === "url" && externalUrl.trim()) {
        body.externalUrl = externalUrl.trim();
      } else if (selectedScreen) {
        body.screen = selectedScreen;
      }
      if (imageUrl.trim()) body.imageUrl = imageUrl.trim();
      if (target === "user") body.userId = selectedUser!.id;

      const res = await fetch(`${BASE_URL}api/admin/notifications/broadcast`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setLastResult({ sent: json.sent, failed: json.failed });
        Alert.alert(
          "✅ Envoyée !",
          target === "all"
            ? `${json.sent} notification(s) envoyée(s)\n${json.failed} sans token`
            : "Notification envoyée !"
        );
      } else {
        Alert.alert("Erreur", json.error ?? "Erreur lors de l'envoi");
      }
    } catch (e: any) {
      Alert.alert("Erreur réseau", e?.message ?? "Vérifiez votre connexion");
    }
    setSending(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <LinearGradient
        colors={["#3b0e8c", "#6C3AF5"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Diffusion Admin</Text>
          <Text style={styles.headerSub}>Notifications push · {usersWithToken > 0 ? `${usersWithToken} tokens actifs` : "Chargement..."}</Text>
        </View>
        <View style={styles.adminBadge}>
          <Feather name="shield" size={11} color="#FFD700" />
          <Text style={styles.adminBadgeText}>ADMIN</Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ─── STEP 1: MODÈLE ─── */}
        <View style={styles.stepHeader}>
          <View style={[styles.stepBadge, { backgroundColor: c.accent }]}>
            <Text style={styles.stepNum}>1</Text>
          </View>
          <Text style={[styles.stepTitle, { color: c.text }]}>Choisir un modèle</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 4, paddingHorizontal: 2 }}
          style={{ marginBottom: 20 }}
        >
          {NOTIF_TEMPLATES.map((t, i) => {
            const active = selectedTemplate === i;
            return (
              <Pressable
                key={i}
                style={[
                  styles.templateChip,
                  {
                    backgroundColor: active ? c.accent : c.card,
                    borderColor: active ? c.accent : c.cardBorder,
                  },
                ]}
                onPress={() => applyTemplate(i)}
              >
                <Text style={styles.templateEmoji}>{t.emoji}</Text>
                <Text style={[styles.templateLabel, { color: active ? "#fff" : c.text }]}>
                  {t.label}
                </Text>
                {active && <Feather name="check" size={13} color="#fff" />}
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ─── STEP 2: CONTENU ─── */}
        <View style={styles.stepHeader}>
          <View style={[styles.stepBadge, { backgroundColor: c.accent }]}>
            <Text style={styles.stepNum}>2</Text>
          </View>
          <Text style={[styles.stepTitle, { color: c.text }]}>Rédiger le message</Text>
        </View>

        {/* Title */}
        <View style={[styles.inputCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <Text style={[styles.inputLabel, { color: c.textMuted }]}>TITRE</Text>
          <View style={[styles.inputRow, { borderColor: c.inputBorder, backgroundColor: c.inputBg }]}>
            <Feather name="bell" size={16} color={c.accent} />
            <TextInput
              ref={titleInputRef}
              style={[styles.inputField, { color: c.text }]}
              placeholder="Ex: Offre exclusive pour vous 🎁"
              placeholderTextColor={c.textMuted}
              value={title}
              onChangeText={setTitle}
              maxLength={80}
              returnKeyType="next"
            />
            <Text style={[styles.charCount, { color: c.textMuted }]}>{title.length}/80</Text>
          </View>

          <Text style={[styles.inputLabel, { color: c.textMuted, marginTop: 14 }]}>MESSAGE</Text>
          <View style={[styles.inputRow, styles.textareaRow, { borderColor: c.inputBorder, backgroundColor: c.inputBg }]}>
            <TextInput
              style={[styles.inputField, styles.textarea, { color: c.text }]}
              placeholder="Écrivez ici votre message complet..."
              placeholderTextColor={c.textMuted}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
              maxLength={300}
              textAlignVertical="top"
            />
          </View>
          <Text style={[styles.charCountRight, { color: c.textMuted }]}>{message.length}/300</Text>

          {/* Optional image URL */}
          <Text style={[styles.inputLabel, { color: c.textMuted, marginTop: 14 }]}>IMAGE (OPTIONNEL)</Text>
          <View style={[styles.inputRow, { borderColor: c.inputBorder, backgroundColor: c.inputBg }]}>
            <Feather name="image" size={16} color={imageUrl.trim() ? "#4CAF50" : c.textMuted} />
            <TextInput
              style={[styles.inputField, { color: c.text }]}
              placeholder="https://... (URL de l'image)"
              placeholderTextColor={c.textMuted}
              value={imageUrl}
              onChangeText={setImageUrl}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {imageUrl.trim() ? (
              <Pressable onPress={() => setImageUrl("")}>
                <Feather name="x" size={16} color={c.textMuted} />
              </Pressable>
            ) : null}
          </View>
          <Text style={[styles.charCountRight, { color: c.textMuted, marginBottom: 0 }]}>
            {imageUrl.trim() ? "✓ Image ajoutée" : "Laissez vide si pas d'image"}
          </Text>
        </View>

        {/* Preview */}
        {(title.trim() || message.trim()) && (
          <View style={[styles.previewCard, {
            backgroundColor: isDark ? "#1a1f35" : "#f0f4ff",
            borderColor: c.accent + "50",
          }]}>
            <View style={styles.previewTop}>
              <View style={[styles.previewIcon, { backgroundColor: c.accent }]}>
                <Feather name="bell" size={10} color="#fff" />
              </View>
              <Text style={[styles.previewAppName, { color: c.textMuted }]}>Social Boost Horizon</Text>
              <Text style={[styles.previewTime, { color: c.textMuted }]}>maintenant</Text>
            </View>
            <Text style={[styles.previewTitle, { color: c.text }]} numberOfLines={1}>
              {title || "Titre de la notification"}
            </Text>
            <Text style={[styles.previewBody, { color: c.textMuted }]} numberOfLines={2}>
              {message || "Corps du message..."}
            </Text>
            {redirectMode === "url" && externalUrl.trim() ? (
              <View style={[styles.previewLink, { backgroundColor: "#FF980020" }]}>
                <Text style={styles.previewLinkEmoji}>🌐</Text>
                <Text style={[styles.previewLinkText, { color: "#FF9800" }]} numberOfLines={1}>
                  {externalUrl.trim()}
                </Text>
              </View>
            ) : selectedScreen ? (
              <View style={[styles.previewLink, { backgroundColor: c.accent + "20" }]}>
                <Text style={styles.previewLinkEmoji}>{selectedScreenInfo.emoji}</Text>
                <Text style={[styles.previewLinkText, { color: c.accent }]}>
                  Ouvre : {selectedScreenInfo.label}
                </Text>
              </View>
            ) : null}
            {imageUrl.trim() ? (
              <View style={[styles.previewLink, { backgroundColor: "#4CAF5020", marginTop: 4 }]}>
                <Text style={styles.previewLinkEmoji}>🖼️</Text>
                <Text style={[styles.previewLinkText, { color: "#4CAF50" }]} numberOfLines={1}>
                  Image : {imageUrl.trim()}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {/* ─── STEP 3: DESTINATION ─── */}
        <View style={styles.stepHeader}>
          <View style={[styles.stepBadge, { backgroundColor: c.accent }]}>
            <Text style={styles.stepNum}>3</Text>
          </View>
          <Text style={[styles.stepTitle, { color: c.text }]}>Où envoyer l'utilisateur ?</Text>
        </View>

        {/* Toggle screen vs external URL */}
        <View style={[styles.redirectToggleRow, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <Pressable
            style={[styles.redirectToggleBtn, redirectMode === "screen" && { backgroundColor: c.accent }]}
            onPress={() => setRedirectMode("screen")}
          >
            <Feather name="smartphone" size={14} color={redirectMode === "screen" ? "#fff" : c.textMuted} />
            <Text style={[styles.redirectToggleText, { color: redirectMode === "screen" ? "#fff" : c.textMuted }]}>
              Page de l'app
            </Text>
          </Pressable>
          <Pressable
            style={[styles.redirectToggleBtn, redirectMode === "url" && { backgroundColor: "#FF9800" }]}
            onPress={() => setRedirectMode("url")}
          >
            <Feather name="external-link" size={14} color={redirectMode === "url" ? "#fff" : c.textMuted} />
            <Text style={[styles.redirectToggleText, { color: redirectMode === "url" ? "#fff" : c.textMuted }]}>
              Lien externe
            </Text>
          </Pressable>
        </View>

        {redirectMode === "url" ? (
          /* External URL input */
          <View style={[styles.inputCard, { backgroundColor: c.card, borderColor: c.cardBorder, marginBottom: 20 }]}>
            <Text style={[styles.inputLabel, { color: c.textMuted }]}>URL DE REDIRECTION</Text>
            <View style={[styles.inputRow, { borderColor: c.inputBorder, backgroundColor: c.inputBg }]}>
              <Feather name="link" size={16} color="#FF9800" />
              <TextInput
                style={[styles.inputField, { color: c.text }]}
                placeholder="https://exemple.com/page"
                placeholderTextColor={c.textMuted}
                value={externalUrl}
                onChangeText={setExternalUrl}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {externalUrl.trim() ? (
                <Pressable onPress={() => setExternalUrl("")}>
                  <Feather name="x" size={16} color={c.textMuted} />
                </Pressable>
              ) : null}
            </View>
            <Text style={[styles.hintText, { color: c.textMuted, marginTop: 8, marginBottom: 0 }]}>
              Quand l'utilisateur tape la notification, le lien s'ouvre dans son navigateur.
            </Text>
          </View>
        ) : (
          /* Screen grid — 2 columns */
          <>
            <Text style={[styles.hintText, { color: c.textMuted }]}>
              Quand l'utilisateur appuie sur la notification, il arrive directement sur la page choisie.
            </Text>
            <View style={styles.screenGrid}>
              {APP_SCREENS.map((screen) => {
                const active = selectedScreen === screen.value;
                return (
                  <Pressable
                    key={screen.value}
                    style={[
                      styles.screenCard,
                      {
                        backgroundColor: active ? c.accent + "18" : c.card,
                        borderColor: active ? c.accent : c.cardBorder,
                        borderWidth: active ? 2 : 1,
                      },
                    ]}
                    onPress={() => setSelectedScreen(screen.value)}
                  >
                    <View
                      style={[
                        styles.screenIconWrap,
                        { backgroundColor: active ? screen.color : screen.color + "25" },
                      ]}
                    >
                      <Text style={styles.screenEmoji}>{screen.emoji}</Text>
                    </View>
                    <Text
                      style={[styles.screenName, { color: active ? c.accent : c.text }]}
                      numberOfLines={1}
                    >
                      {screen.label}
                    </Text>
                    <Text style={[styles.screenDesc, { color: c.textMuted }]} numberOfLines={1}>
                      {screen.desc}
                    </Text>
                    {active && (
                      <View style={[styles.screenCheck, { backgroundColor: c.accent }]}>
                        <Feather name="check" size={10} color="#fff" />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {/* ─── STEP 4: DESTINATAIRES ─── */}
        <View style={styles.stepHeader}>
          <View style={[styles.stepBadge, { backgroundColor: c.accent }]}>
            <Text style={styles.stepNum}>4</Text>
          </View>
          <Text style={[styles.stepTitle, { color: c.text }]}>Choisir les destinataires</Text>
        </View>

        <View style={{ gap: 10, marginBottom: 16 }}>
          {/* All users */}
          <Pressable
            style={[
              styles.targetBtn,
              {
                backgroundColor: target === "all" ? c.accent + "12" : c.card,
                borderColor: target === "all" ? c.accent : c.cardBorder,
                borderWidth: target === "all" ? 2 : 1,
              },
            ]}
            onPress={() => { setTarget("all"); loadUsers(); }}
          >
            <View style={[styles.targetIconWrap, { backgroundColor: target === "all" ? c.accent : c.inputBg }]}>
              <Feather name="users" size={20} color={target === "all" ? "#fff" : c.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.targetName, { color: c.text }]}>Tous les utilisateurs</Text>
              <Text style={[styles.targetSub, { color: usersWithToken > 0 ? "#4CAF50" : c.textMuted }]}>
                {usersWithToken > 0
                  ? `${usersWithToken} utilisateur(s) recevront la notification`
                  : "Appuyez pour charger..."}
              </Text>
            </View>
            <View style={[styles.radioCircle, { borderColor: target === "all" ? c.accent : c.cardBorder }]}>
              {target === "all" && <View style={[styles.radioDot, { backgroundColor: c.accent }]} />}
            </View>
          </Pressable>

          {/* Specific user */}
          <Pressable
            style={[
              styles.targetBtn,
              {
                backgroundColor: target === "user" ? c.accent + "12" : c.card,
                borderColor: target === "user" ? c.accent : c.cardBorder,
                borderWidth: target === "user" ? 2 : 1,
              },
            ]}
            onPress={() => { setTarget("user"); loadUsers(); setShowUserPicker(true); }}
          >
            <View style={[styles.targetIconWrap, { backgroundColor: target === "user" ? c.accent : c.inputBg }]}>
              <Feather name="user" size={20} color={target === "user" ? "#fff" : c.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.targetName, { color: c.text }]}>Utilisateur spécifique</Text>
              {selectedUser ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <View style={[styles.userMiniAvatar, { backgroundColor: c.accent }]}>
                    <Text style={styles.userMiniAvatarText}>
                      {selectedUser.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[styles.targetSub, { color: "#4CAF50" }]} numberOfLines={1}>
                    {selectedUser.name} · {selectedUser.email}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.targetSub, { color: c.textMuted }]}>
                  Appuyez pour choisir un utilisateur
                </Text>
              )}
            </View>
            <View style={[styles.radioCircle, { borderColor: target === "user" ? c.accent : c.cardBorder }]}>
              {target === "user" && <View style={[styles.radioDot, { backgroundColor: c.accent }]} />}
            </View>
          </Pressable>

          {/* Change user button */}
          {target === "user" && selectedUser && (
            <Pressable
              style={[styles.changeUserBtn, { borderColor: c.accent + "50", backgroundColor: c.card }]}
              onPress={() => setShowUserPicker(true)}
            >
              <Feather name="refresh-cw" size={14} color={c.accent} />
              <Text style={[styles.changeUserText, { color: c.accent }]}>
                Changer d'utilisateur
              </Text>
            </Pressable>
          )}
        </View>

        {/* Save to inbox toggle */}
        <Pressable
          style={[styles.inboxRow, { backgroundColor: c.card, borderColor: c.cardBorder }]}
          onPress={() => setSaveToInbox(!saveToInbox)}
        >
          <View style={[styles.inboxIconWrap, { backgroundColor: saveToInbox ? "#4CAF5020" : c.inputBg }]}>
            <Feather name="inbox" size={16} color={saveToInbox ? "#4CAF50" : c.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.inboxLabel, { color: c.text }]}>Enregistrer dans l'historique</Text>
            <Text style={[styles.inboxSub, { color: c.textMuted }]}>
              Apparaît dans le centre de notifications de l'app
            </Text>
          </View>
          <View
            style={[
              styles.toggleTrack,
              { backgroundColor: saveToInbox ? "#4CAF50" : c.inputBorder },
            ]}
          >
            <View
              style={[
                styles.toggleThumb,
                { transform: [{ translateX: saveToInbox ? 18 : 2 }] },
              ]}
            />
          </View>
        </Pressable>

        {/* Last result */}
        {lastResult && (
          <View style={[styles.resultBanner, { backgroundColor: "#4CAF5015", borderColor: "#4CAF5040" }]}>
            <Feather name="check-circle" size={18} color="#4CAF50" />
            <Text style={[styles.resultText, { color: "#4CAF50" }]}>
              Dernier envoi : {lastResult.sent} reçue(s) · {lastResult.failed} sans token
            </Text>
          </View>
        )}

        {/* Send button */}
        <Pressable
          style={[styles.sendBtn, { opacity: canSend && !sending ? 1 : 0.45 }]}
          onPress={handleSend}
          disabled={!canSend || sending}
        >
          <LinearGradient
            colors={["#6C3AF5", "#4F46E5"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.sendGradient}
          >
            {sending ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.sendText}>Envoi en cours...</Text>
              </>
            ) : (
              <>
                <Feather name="send" size={19} color="#fff" />
                <Text style={styles.sendText}>
                  {target === "all" ? `Envoyer à tous (${usersWithToken})` : "Envoyer à l'utilisateur"}
                </Text>
              </>
            )}
          </LinearGradient>
        </Pressable>

        {!canSend && (
          <Text style={[styles.sendHint, { color: c.textMuted }]}>
            {!title.trim() || !message.trim()
              ? "⚠️ Titre et message requis"
              : "⚠️ Sélectionnez un utilisateur"}
          </Text>
        )}
      </ScrollView>

      {/* ─── User picker modal ─── */}
      <Modal
        visible={showUserPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowUserPicker(false)}
      >
        <View style={[styles.modalWrap, { backgroundColor: c.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: c.separator }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Choisir un utilisateur</Text>
            <Pressable
              style={[styles.modalCloseBtn, { backgroundColor: c.card }]}
              onPress={() => setShowUserPicker(false)}
            >
              <Feather name="x" size={18} color={c.textMuted} />
            </Pressable>
          </View>

          <View style={[styles.searchBox, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
            <Feather name="search" size={16} color={c.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: c.text }]}
              placeholder="Nom ou email..."
              placeholderTextColor={c.textMuted}
              value={userSearch}
              onChangeText={setUserSearch}
              autoFocus
            />
            {userSearch.length > 0 && (
              <Pressable onPress={() => setUserSearch("")}>
                <Feather name="x-circle" size={16} color={c.textMuted} />
              </Pressable>
            )}
          </View>

          <Text style={[styles.userCount, { color: c.textMuted }]}>
            {userSearch ? `${filteredUsers.length} résultat(s)` : `${totalUsers || allUsers.length} utilisateur(s) au total`} · {usersWithToken} avec token actif
          </Text>

          {usersLoading ? (
            <ActivityIndicator style={{ marginTop: 50 }} color={c.accent} size="large" />
          ) : (
            <FlatList
              data={filteredUsers}
              keyExtractor={(u) => u.id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
              renderItem={({ item }) => {
                const isSelected = selectedUser?.id === item.id;
                return (
                  <TouchableOpacity
                    style={[
                      styles.userCard,
                      {
                        backgroundColor: isSelected ? c.accent + "12" : c.card,
                        borderColor: isSelected ? c.accent : c.cardBorder,
                        borderWidth: isSelected ? 2 : 1,
                      },
                    ]}
                    onPress={() => {
                      setSelectedUser(item);
                      setShowUserPicker(false);
                    }}
                  >
                    {/* Avatar */}
                    <View style={[styles.userAvatar, { backgroundColor: item.hasPushToken ? c.accent : "#607D8B" }]}>
                      <Text style={styles.userAvatarLetter}>
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>

                    {/* Info */}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.userName, { color: c.text }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={[styles.userEmail, { color: c.textMuted }]} numberOfLines={1}>
                        {item.email}
                      </Text>
                    </View>

                    {/* Token badge + check */}
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <View
                        style={[
                          styles.tokenBadge,
                          { backgroundColor: item.hasPushToken ? "#4CAF5020" : "#F4433620" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.tokenText,
                            { color: item.hasPushToken ? "#4CAF50" : "#F44336" },
                          ]}
                        >
                          {item.hasPushToken ? "✓ Token" : "✗ No token"}
                        </Text>
                      </View>
                      {isSelected && (
                        <Feather name="check-circle" size={16} color={c.accent} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={{ alignItems: "center", marginTop: 60 }}>
                  <Text style={{ fontSize: 40 }}>🔍</Text>
                  <Text style={[styles.emptyText, { color: c.textMuted }]}>
                    Aucun utilisateur trouvé
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 18,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: "#fff",
  },
  headerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.65)",
    marginTop: 1,
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,215,0,0.18)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.4)",
  },
  adminBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: "#FFD700",
  },
  content: {
    padding: 16,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    marginTop: 8,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNum: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: "#fff",
  },
  stepTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  templateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1.5,
  },
  templateEmoji: { fontSize: 16 },
  templateLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  inputCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
    gap: 0,
  },
  inputLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10,
  },
  textareaRow: {
    alignItems: "flex-start",
    paddingTop: 10,
  },
  inputField: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  textarea: {
    minHeight: 90,
  },
  charCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  charCountRight: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    textAlign: "right",
    marginTop: 4,
  },
  previewCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 20,
  },
  previewTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 7,
  },
  previewIcon: {
    width: 18,
    height: 18,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  previewAppName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    flex: 1,
  },
  previewTime: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  previewTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    marginBottom: 3,
  },
  previewBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 18,
  },
  previewLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  previewLinkEmoji: { fontSize: 13 },
  previewLinkText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  hintText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  screenGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  screenCard: {
    width: "47%",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    position: "relative",
  },
  screenIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  screenEmoji: {
    fontSize: 24,
  },
  screenName: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    textAlign: "center",
  },
  screenDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    textAlign: "center",
    marginTop: 2,
  },
  screenCheck: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  redirectToggleRow: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 14,
    padding: 4,
    gap: 4,
  },
  redirectToggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 9,
  },
  redirectToggleText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  targetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
  },
  targetIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  targetName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  targetSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  userMiniAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  userMiniAvatarText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    color: "#fff",
  },
  changeUserBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    justifyContent: "center",
  },
  changeUserText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  inboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  inboxIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  inboxLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  inboxSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    position: "absolute",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  resultBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 14,
  },
  resultText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    flex: 1,
  },
  sendBtn: {
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 4,
  },
  sendGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 17,
  },
  sendText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
  },
  sendHint: {
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginTop: 10,
  },
  // Modal
  modalWrap: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    margin: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  userCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarLetter: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: "#fff",
  },
  userName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  userEmail: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  tokenBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tokenText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    marginTop: 10,
  },
});
