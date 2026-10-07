import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { APP_VERSION } from "@/constants/version";
import { useAuth } from "@/context/AuthContext";
import { LOGO_URL } from "@/lib/firebase";
import { BASE_URL } from "@/services/api";

// ─────────────────────────────────────────────────────────────────
// Palette claire — professionnelle, minimaliste, style application
// ─────────────────────────────────────────────────────────────────
const PRIMARY      = "#7C3AED";   // Violet principal
const PRIMARY_DK   = "#6D28D9";   // Violet foncé (pressed)
const PRIMARY_SOFT = "#F5F3FF";   // Violet très clair (fonds légers)
const BG           = "#F7F8FB";   // Fond de page — gris ultra doux
const SURFACE      = "#FFFFFF";   // Cartes / surfaces
const TEXT         = "#0F172A";   // Texte principal (presque noir)
const TEXT_MUTED   = "#64748B";   // Texte secondaire (gris ardoise)
const TEXT_SOFT    = "#94A3B8";   // Placeholders
const BORDER       = "#E5E7EB";   // Bordures neutres
const INPUT_BG     = "#F3F4F6";   // Fond des inputs
const DANGER       = "#EF4444";
const SUCCESS      = "#10B981";
const WHATSAPP     = "#25D366";
const WHATSAPP_DK  = "#128C7E";

const LOGIN_PROBLEMS = [
  {
    id: "connexion",
    icon: "log-in" as const,
    color: DANGER,
    title: "Problème de connexion",
    desc: "Je n'arrive pas à me connecter à mon compte",
    getMessage: (email: string) =>
      `Bonjour Support Social Boost Horizon,\n\nJ'ai un PROBLÈME DE CONNEXION.\n\nEmail: ${email || "[Précisez votre email]"}\nDescription: [Décrivez ce qui se passe]\n\nMerci de m'aider.`,
  },
  {
    id: "mdp",
    icon: "lock" as const,
    color: "#F59E0B",
    title: "Mot de passe oublié",
    desc: "J'ai oublié mon mot de passe",
    getMessage: (email: string) =>
      `Bonjour Support Social Boost Horizon,\n\nJ'ai OUBLIÉ MON MOT DE PASSE.\n\nEmail: ${email || "[Précisez votre email]"}\nDernière connexion approximative: [À préciser]\n\nMerci de m'aider à réinitialiser mon accès.`,
  },
  {
    id: "autre",
    icon: "help-circle" as const,
    color: SUCCESS,
    title: "Autre problème",
    desc: "J'ai un autre problème à signaler",
    getMessage: (email: string) =>
      `Bonjour Support Social Boost Horizon,\n\nEmail: ${email || "[Précisez votre email]"}\n\nProblème: [Décrivez votre problème ici]\n\nMerci.`,
  },
];

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const [showSupport, setShowSupport]       = useState(false);
  const [supportStep, setSupportStep]       = useState<1 | 2 | 3>(1);
  const [supportCategory, setSupportCategory] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportWaCode, setSupportWaCode]   = useState("+237");
  const [supportWaPhone, setSupportWaPhone] = useState("");
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportSuccess, setSupportSuccess] = useState(false);

  // Entrance animations (subtiles, gardées)
  const logoAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logoAnim, {
        toValue: 1,
        duration: 550,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(cardAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
      }),
    ]).start();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Veuillez remplir tous les champs");
      return;
    }
    setError("");
    setLoading(true);
    const res = await login(email.trim(), password);
    setLoading(false);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } else {
      setError(res.error ?? "Erreur de connexion");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const openSupport = () => {
    setSupportStep(1);
    setSupportCategory("");
    setSupportMessage("");
    setSupportWaPhone("");
    setSupportSuccess(false);
    setShowSupport(true);
  };

  const handleSelectCategory = (p: typeof LOGIN_PROBLEMS[0]) => {
    setSupportCategory(p.title);
    setSupportMessage(p.getMessage(email));
    setSupportStep(2);
  };

  const handleSendSupport = async () => {
    if (!supportMessage.trim() || !supportWaPhone.trim()) return;
    setSupportLoading(true);
    try {
      const res = await fetch(`${BASE_URL}api/support/login-help`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim() || undefined,
          category: supportCategory,
          message: supportMessage.trim(),
          whatsappCountryCode: supportWaCode,
          whatsappPhone: supportWaPhone.trim(),
        }),
        signal: AbortSignal.timeout(15000),
      });
      setSupportSuccess(res.ok);
      setSupportStep(3);
      if (res.ok) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setSupportSuccess(false);
      setSupportStep(3);
    } finally {
      setSupportLoading(false);
    }
  };

  const logoTranslate = logoAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] });
  const cardTranslate = cardAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] });

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 30 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Logo area ── */}
          <Animated.View style={[styles.logoArea, { opacity: logoAnim, transform: [{ translateY: logoTranslate }] }]}>
            <View style={styles.logoWrap}>
              <Image source={{ uri: LOGO_URL }} style={styles.logoImage} contentFit="cover" />
            </View>

            <Text style={styles.appName}>Social Boost Horizon</Text>
            <Text style={styles.slogan}>Votre visibilité, notre horizon</Text>
          </Animated.View>

          {/* ── Login card ── */}
          <Animated.View style={[styles.card, { opacity: cardAnim, transform: [{ translateY: cardTranslate }] }]}>
            <Text style={styles.cardTitle}>Connexion</Text>
            <Text style={styles.cardSubtitle}>Accédez à votre espace</Text>

            {error ? (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color={DANGER} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={[styles.inputRow, focusedField === "email" && styles.inputFocused]}>
                <Feather
                  name="mail"
                  size={18}
                  color={focusedField === "email" ? PRIMARY : TEXT_SOFT}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="votre@email.com"
                  placeholderTextColor={TEXT_SOFT}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Mot de passe</Text>
              <View style={[styles.inputRow, focusedField === "password" && styles.inputFocused]}>
                <Feather
                  name="lock"
                  size={18}
                  color={focusedField === "password" ? PRIMARY : TEXT_SOFT}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="••••••••"
                  placeholderTextColor={TEXT_SOFT}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn} hitSlop={8}>
                  <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={TEXT_SOFT} />
                </Pressable>
              </View>
            </View>

            {/* Login button */}
            <Pressable
              style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.9 }]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Feather name="log-in" size={18} color="#fff" />
                  <Text style={styles.submitText}>Se connecter</Text>
                </>
              )}
            </Pressable>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>ou</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Register */}
            <Pressable
              onPress={() => router.push("/auth/register")}
              style={({ pressed }) => [styles.registerBtn, pressed && { opacity: 0.7 }]}
            >
              <Feather name="user-plus" size={16} color={PRIMARY} />
              <Text style={styles.registerBtnText}>Créer un compte</Text>
            </Pressable>

            {/* Support */}
            <Pressable onPress={openSupport} style={styles.supportBtn}>
              <Feather name="help-circle" size={14} color={WHATSAPP} />
              <Text style={styles.supportBtnText}>Problème de connexion ? Contacter le support</Text>
            </Pressable>
          </Animated.View>

          <Text style={styles.version}>v{APP_VERSION}</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Support Modal ── */}
      <Modal visible={showSupport} animationType="slide" transparent onRequestClose={() => setShowSupport(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {/* Handle bar */}
            <View style={styles.modalHandleWrap}>
              <View style={styles.modalHandle} />
            </View>

            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                <View style={styles.supportIconBadge}>
                  <Feather name="headphones" size={18} color={WHATSAPP} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>
                    {supportStep === 1 ? "Contacter le support" : supportStep === 2 ? "Votre message" : supportSuccess ? "Message envoyé !" : "Erreur d'envoi"}
                  </Text>
                  <Text style={styles.modalSubtitle}>Support WhatsApp</Text>
                </View>
              </View>
              <Pressable onPress={() => setShowSupport(false)} style={styles.modalCloseBtn}>
                <Feather name="x" size={20} color={TEXT_MUTED} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {supportStep === 1 && (
                <>
                  <Text style={styles.modalLabel}>Sélectionnez votre problème :</Text>
                  {LOGIN_PROBLEMS.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => handleSelectCategory(p)}
                      style={({ pressed }) => [styles.problemCard, pressed && { opacity: 0.75 }]}
                    >
                      <View style={[styles.problemIconBox, { backgroundColor: p.color + "18" }]}>
                        <Feather name={p.icon} size={22} color={p.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.problemTitle}>{p.title}</Text>
                        <Text style={styles.problemDesc}>{p.desc}</Text>
                      </View>
                      <Feather name="chevron-right" size={18} color={TEXT_SOFT} />
                    </Pressable>
                  ))}
                </>
              )}

              {supportStep === 2 && (
                <>
                  <Text style={styles.modalLabel}>Modifiez le message si nécessaire :</Text>
                  <TextInput
                    style={styles.messageInput}
                    multiline
                    numberOfLines={10}
                    value={supportMessage}
                    onChangeText={setSupportMessage}
                    textAlignVertical="top"
                    placeholder="Décrivez votre problème..."
                    placeholderTextColor={TEXT_SOFT}
                  />

                  <Text style={[styles.modalLabel, { marginTop: 4 }]}>Votre numéro WhatsApp *</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={styles.waCodeInput}>
                      <TextInput
                        style={styles.waCodeText}
                        value={supportWaCode}
                        onChangeText={setSupportWaCode}
                        keyboardType="phone-pad"
                      />
                    </View>
                    <View style={styles.waPhoneInput}>
                      <Feather name="smartphone" size={16} color={WHATSAPP} style={{ marginRight: 8 }} />
                      <TextInput
                        style={styles.waPhoneText}
                        placeholder="6XX XXX XXX"
                        placeholderTextColor={TEXT_SOFT}
                        value={supportWaPhone}
                        onChangeText={setSupportWaPhone}
                        keyboardType="phone-pad"
                      />
                    </View>
                  </View>
                  <Text style={styles.modalHint}>Obligatoire — notre équipe vous contactera sur ce numéro</Text>

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
                    <Pressable onPress={() => setSupportStep(1)} style={styles.backStepBtn}>
                      <Feather name="arrow-left" size={16} color={TEXT_MUTED} />
                      <Text style={styles.backStepText}>Retour</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleSendSupport}
                      disabled={supportLoading || !supportMessage.trim() || !supportWaPhone.trim()}
                      style={[
                        styles.sendBtnWrapper,
                        { opacity: supportLoading || !supportMessage.trim() || !supportWaPhone.trim() ? 0.5 : 1 },
                      ]}
                    >
                      <LinearGradient
                        colors={[WHATSAPP, WHATSAPP_DK]}
                        style={styles.sendBtnGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      >
                        {supportLoading ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <>
                            <Feather name="send" size={16} color="#fff" />
                            <Text style={styles.sendBtnText}>Envoyer</Text>
                          </>
                        )}
                      </LinearGradient>
                    </Pressable>
                  </View>
                </>
              )}

              {supportStep === 3 && (
                <View style={{ alignItems: "center", gap: 16, paddingVertical: 20 }}>
                  <View
                    style={[
                      styles.resultIcon,
                      { backgroundColor: supportSuccess ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)" },
                    ]}
                  >
                    <Feather
                      name={supportSuccess ? "check-circle" : "alert-circle"}
                      size={40}
                      color={supportSuccess ? SUCCESS : DANGER}
                    />
                  </View>
                  <Text style={styles.resultTitle}>{supportSuccess ? "Message envoyé !" : "Erreur d'envoi"}</Text>
                  <Text style={styles.resultDesc}>
                    {supportSuccess
                      ? `Notre équipe va vous contacter sur WhatsApp (${supportWaCode} ${supportWaPhone}) dès que possible.`
                      : "Une erreur s'est produite. Contactez-nous directement : +237 699 853 665"}
                  </Text>
                  <Pressable onPress={() => setShowSupport(false)} style={styles.closeFinalBtn}>
                    <Text style={styles.closeFinalText}>Fermer</Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  /* ── Root & container ── */
  root: { flex: 1, backgroundColor: BG },
  container: { alignItems: "center", paddingHorizontal: 24, gap: 32 },

  /* ── Logo area ── */
  logoArea: { alignItems: "center", gap: 10 },
  logoWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: SURFACE,
    padding: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  logoImage: {
    width: "100%",
    height: "100%",
    borderRadius: 40,
  },

  appName: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: TEXT,
    letterSpacing: 0.3,
    marginTop: 4,
  },
  slogan: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: TEXT_MUTED,
    letterSpacing: 0.2,
  },

  /* ── Card ── */
  card: {
    width: "100%",
    backgroundColor: SURFACE,
    borderRadius: 20,
    padding: 24,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 6,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  cardTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: TEXT,
    marginBottom: -4,
  },
  cardSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: TEXT_MUTED,
    marginBottom: 4,
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239,68,68,0.08)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.2)",
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: DANGER,
    flex: 1,
  },

  fieldGroup: { gap: 7 },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: TEXT,
    letterSpacing: 0.1,
    marginLeft: 2,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: INPUT_BG,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "transparent",
    paddingHorizontal: 14,
    height: 54,
  },
  inputFocused: {
    borderColor: PRIMARY,
    backgroundColor: SURFACE,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: TEXT,
  },
  eyeBtn: { padding: 4 },

  submitBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 14,
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 8,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  submitText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
    letterSpacing: 0.3,
  },

  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: BORDER },
  dividerText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: TEXT_SOFT,
  },

  registerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: PRIMARY,
    paddingVertical: 14,
    backgroundColor: PRIMARY_SOFT,
  },
  registerBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: PRIMARY,
  },

  supportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    marginTop: 2,
  },
  supportBtnText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: TEXT_MUTED,
  },

  version: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: TEXT_SOFT,
    marginTop: 8,
  },

  /* ── Support Modal ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: SURFACE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
  },
  modalHandleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: BORDER,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: TEXT,
  },
  modalSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 1,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: INPUT_BG,
  },
  supportIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(37,211,102,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: TEXT_MUTED,
    marginBottom: 4,
  },
  modalHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: TEXT_SOFT,
  },

  problemCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    backgroundColor: SURFACE,
  },
  problemIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  problemTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: TEXT,
    marginBottom: 2,
  },
  problemDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: TEXT_MUTED,
  },

  messageInput: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    padding: 14,
    minHeight: 160,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 22,
    color: TEXT,
    backgroundColor: SURFACE,
  },
  waCodeInput: {
    width: 72,
    height: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SURFACE,
  },
  waCodeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: PRIMARY,
    textAlign: "center",
  },
  waPhoneInput: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    backgroundColor: SURFACE,
    flex: 1,
  },
  waPhoneText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: TEXT,
  },

  backStepBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: SURFACE,
  },
  backStepText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: TEXT_MUTED,
  },
  sendBtnWrapper: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  sendBtnGradient: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sendBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#fff",
  },

  resultIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  resultTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: TEXT,
    textAlign: "center",
  },
  resultDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: TEXT_MUTED,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  closeFinalBtn: {
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: SURFACE,
  },
  closeFinalText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: TEXT,
  },
});