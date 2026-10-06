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

import StarBackground from "@/components/StarBackground";
import { APP_VERSION } from "@/constants/version";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { LOGO_URL } from "@/lib/firebase";
import { BASE_URL } from "@/services/api";

const ACCENT   = "#7C3AED";
const ACCENT2  = "#A855F7";
const SUCCESS  = "#10B981";
const GOLD     = "#F59E0B";
const CARD_BG  = "rgba(10,15,40,0.82)";
const BORDER   = "rgba(124,58,237,0.35)";
const MUTED    = "rgba(255,255,255,0.45)";

const LOGIN_PROBLEMS = [
  {
    id: "connexion",
    icon: "log-in" as const,
    color: "#EF4444",
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
    color: "#10B981",
    title: "Autre problème",
    desc: "J'ai un autre problème à signaler",
    getMessage: (email: string) =>
      `Bonjour Support Social Boost Horizon,\n\nEmail: ${email || "[Précisez votre email]"}\n\nProblème: [Décrivez votre problème ici]\n\nMerci.`,
  },
];

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const { colors } = useTheme();

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

  // Entrance animations
  const logoAnim  = useRef(new Animated.Value(0)).current;
  const cardAnim  = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logoAnim, { toValue: 1, duration: 700, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(cardAnim, { toValue: 1, duration: 500, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1.18, duration: 2200, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(glowPulse, { toValue: 1, duration: 2200, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ])
    ).start();
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

  const logoTranslate = logoAnim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] });
  const cardTranslate = cardAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

  return (
    <View style={styles.root}>
      <StarBackground />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 30 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Logo area ── */}
          <Animated.View style={[styles.logoArea, { opacity: logoAnim, transform: [{ translateY: logoTranslate }] }]}>
            <View style={styles.logoGlowWrap}>
              <Animated.View style={[styles.logoGlow, { transform: [{ scale: glowPulse }] }]} />
              <LinearGradient
                colors={[ACCENT, ACCENT2, "#EC4899"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.logoRingGradient}
              >
                <View style={styles.logoInner}>
                  <Image source={{ uri: LOGO_URL }} style={styles.logoImage} contentFit="cover" />
                </View>
              </LinearGradient>
            </View>

            <Text style={styles.appName}>Social Boost Horizon</Text>

            <View style={styles.sloganRow}>
              <View style={styles.sloganLine} />
              <Text style={styles.slogan}>Votre visibilité, notre horizon</Text>
              <View style={styles.sloganLine} />
            </View>
          </Animated.View>

          {/* ── Login card ── */}
          <Animated.View style={[styles.card, { opacity: cardAnim, transform: [{ translateY: cardTranslate }] }]}>
            <View style={styles.cardHeader}>
              <LinearGradient colors={[ACCENT, ACCENT2]} style={styles.cardHeaderDot} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
              <Text style={styles.cardTitle}>Connexion</Text>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={[styles.inputRow, focusedField === "email" && styles.inputFocused]}>
                <Feather name="mail" size={16} color={focusedField === "email" ? ACCENT2 : MUTED} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="votre@email.com"
                  placeholderTextColor={MUTED}
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
                <Feather name="lock" size={16} color={focusedField === "password" ? ACCENT2 : MUTED} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="••••••••"
                  placeholderTextColor={MUTED}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn} hitSlop={8}>
                  <Feather name={showPassword ? "eye-off" : "eye"} size={16} color={MUTED} />
                </Pressable>
              </View>
            </View>

            {/* Login button */}
            <Pressable
              style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.85 }]}
              onPress={handleLogin}
              disabled={loading}
            >
              <LinearGradient
                colors={[ACCENT, ACCENT2]}
                style={styles.submitGradient}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Feather name="log-in" size={18} color="#fff" />
                    <Text style={styles.submitText}>Se connecter</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>ou</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable onPress={() => router.push("/auth/register")} style={styles.registerBtn}>
              <Feather name="user-plus" size={16} color={ACCENT2} />
              <Text style={styles.registerBtnText}>Créer un compte</Text>
            </Pressable>

            <Pressable onPress={openSupport} style={styles.supportBtn}>
              <Feather name="headphones" size={14} color="#25D366" />
              <Text style={styles.supportBtnText}>Problème de connexion ? Contacter le support</Text>
            </Pressable>
          </Animated.View>

          <Text style={styles.version}>v{APP_VERSION}</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Support Modal ── */}
      <Modal visible={showSupport} animationType="slide" transparent onRequestClose={() => setShowSupport(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.separator }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={styles.supportIconBadge}>
                  <Feather name="headphones" size={18} color="#25D366" />
                </View>
                <View>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>
                    {supportStep === 1 ? "Contacter le support" : supportStep === 2 ? supportCategory : supportSuccess ? "Message envoyé !" : "Erreur d'envoi"}
                  </Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textMuted }}>
                    Support WhatsApp
                  </Text>
                </View>
              </View>
              <Pressable onPress={() => setShowSupport(false)} style={[styles.modalCloseBtn, { backgroundColor: colors.inputBg }]}>
                <Feather name="x" size={20} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {supportStep === 1 && (
                <>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.textMuted, marginBottom: 4 }}>
                    Sélectionnez votre problème :
                  </Text>
                  {LOGIN_PROBLEMS.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => handleSelectCategory(p)}
                      style={({ pressed }) => [styles.problemCard, { backgroundColor: colors.card, borderColor: colors.cardBorder, opacity: pressed ? 0.75 : 1 }]}
                    >
                      <View style={[styles.problemIconBox, { backgroundColor: p.color + "22" }]}>
                        <Feather name={p.icon} size={22} color={p.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.problemTitle, { color: colors.text }]}>{p.title}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textMuted }}>{p.desc}</Text>
                      </View>
                      <Feather name="chevron-right" size={18} color={colors.textMuted} />
                    </Pressable>
                  ))}
                </>
              )}

              {supportStep === 2 && (
                <>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.textMuted }}>
                    Modifiez le message si nécessaire :
                  </Text>
                  <TextInput
                    style={[styles.messageInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                    multiline numberOfLines={10}
                    value={supportMessage} onChangeText={setSupportMessage}
                    textAlignVertical="top"
                    placeholder="Décrivez votre problème..."
                    placeholderTextColor={colors.textMuted}
                  />

                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.textMuted, marginTop: 4 }}>
                    Votre numéro WhatsApp *
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={[styles.waCodeInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                      <TextInput
                        style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.accent, textAlign: "center" }}
                        value={supportWaCode} onChangeText={setSupportWaCode} keyboardType="phone-pad"
                      />
                    </View>
                    <View style={[styles.waPhoneInput, { flex: 1, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                      <Feather name="smartphone" size={16} color="#25D366" style={{ marginRight: 8 }} />
                      <TextInput
                        style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 15, color: colors.text }}
                        placeholder="6XX XXX XXX" placeholderTextColor={colors.textMuted}
                        value={supportWaPhone} onChangeText={setSupportWaPhone} keyboardType="phone-pad"
                      />
                    </View>
                  </View>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textMuted }}>
                    Obligatoire — notre équipe vous contactera sur ce numéro
                  </Text>

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
                    <Pressable onPress={() => setSupportStep(1)} style={[styles.backStepBtn, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                      <Feather name="arrow-left" size={16} color={colors.text} />
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.text }}>Retour</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleSendSupport}
                      disabled={supportLoading || !supportMessage.trim() || !supportWaPhone.trim()}
                      style={[styles.sendBtnWrapper, { opacity: (supportLoading || !supportMessage.trim() || !supportWaPhone.trim()) ? 0.5 : 1 }]}
                    >
                      <LinearGradient colors={["#25D366", "#128C7E"]} style={styles.sendBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                        {supportLoading ? <ActivityIndicator color="#fff" /> : (
                          <>
                            <Feather name="send" size={16} color="#fff" />
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" }}>Envoyer</Text>
                          </>
                        )}
                      </LinearGradient>
                    </Pressable>
                  </View>
                </>
              )}

              {supportStep === 3 && (
                <View style={{ alignItems: "center", gap: 16, paddingVertical: 20 }}>
                  <View style={[styles.resultIcon, { backgroundColor: supportSuccess ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)" }]}>
                    <Feather name={supportSuccess ? "check-circle" : "alert-circle"} size={40} color={supportSuccess ? SUCCESS : "#EF4444"} />
                  </View>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text, textAlign: "center" }}>
                    {supportSuccess ? "Message envoyé !" : "Erreur d'envoi"}
                  </Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.textMuted, textAlign: "center", lineHeight: 20 }}>
                    {supportSuccess
                      ? `Notre équipe va vous contacter sur WhatsApp (${supportWaCode} ${supportWaPhone}) dès que possible.`
                      : "Une erreur s'est produite. Contactez-nous directement : +237 699 853 665"}
                  </Text>
                  <Pressable onPress={() => setShowSupport(false)} style={[styles.closeFinalBtn, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 15, color: colors.text }}>Fermer</Text>
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
  root: { flex: 1, backgroundColor: "#080C1A" },
  container: { alignItems: "center", paddingHorizontal: 22, gap: 28 },

  /* ── Logo ── */
  logoArea: { alignItems: "center", gap: 4 },
  logoGlowWrap: { position: "relative", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  logoGlow: {
    position: "absolute",
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: ACCENT,
    opacity: 0.22,
  },
  logoRingGradient: {
    width: 96, height: 96, borderRadius: 48,
    padding: 3,
  },
  logoInner: {
    flex: 1, borderRadius: 45,
    backgroundColor: "#0A0E1A",
    overflow: "hidden",
  },
  logoImage: { width: "100%", height: "100%" },

  appName: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: "#fff",
    letterSpacing: 0.8,
    textShadowColor: ACCENT2,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  sloganRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  sloganLine: { flex: 1, height: 1, backgroundColor: "rgba(124,58,237,0.3)" },
  slogan: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4 },

  /* ── Card ── */
  card: {
    width: "100%",
    backgroundColor: CARD_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 24,
    gap: 16,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: -4 },
  cardHeaderDot: { width: 4, height: 22, borderRadius: 2 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#fff" },

  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(239,68,68,0.10)",
    borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: "rgba(239,68,68,0.25)",
  },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#EF4444", flex: 1 },

  fieldGroup: { gap: 7 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.7)", letterSpacing: 0.3, marginLeft: 2 },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12, borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14, height: 52,
  },
  inputFocused: {
    borderColor: ACCENT2,
    backgroundColor: "rgba(124,58,237,0.08)",
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 15, color: "#fff" },
  eyeBtn: { padding: 4 },

  submitBtn: { borderRadius: 14, overflow: "hidden", marginTop: 4 },
  submitGradient: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  submitText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff", letterSpacing: 0.3 },

  divider: { flexDirection: "row", alignItems: "center", gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.08)" },
  dividerText: { fontFamily: "Inter_400Regular", fontSize: 12, color: MUTED },

  registerBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    paddingVertical: 13,
    backgroundColor: "rgba(124,58,237,0.08)",
  },
  registerBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: ACCENT2 },

  supportBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 8,
  },
  supportBtnText: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#25D366" },

  version: {
    fontFamily: "Inter_400Regular", fontSize: 11,
    color: "rgba(255,255,255,0.2)",
  },

  /* ── Support Modal ── */
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%" },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 17 },
  modalCloseBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  supportIconBadge: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(37,211,102,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  problemCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 14, borderWidth: 1,
    padding: 14,
  },
  problemIconBox: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  problemTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginBottom: 2 },
  messageInput: {
    borderRadius: 12, borderWidth: 1,
    padding: 14, minHeight: 160,
    fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 22,
  },
  waCodeInput: {
    width: 72, height: 50, borderRadius: 12, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  waPhoneInput: {
    height: 50, borderRadius: 12, borderWidth: 1,
    flexDirection: "row", alignItems: "center", paddingHorizontal: 14,
  },
  backStepBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, borderWidth: 1,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  sendBtnWrapper: { flex: 1, borderRadius: 12, overflow: "hidden" },
  sendBtnGradient: { height: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  resultIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  closeFinalBtn: {
    paddingVertical: 12, paddingHorizontal: 32,
    borderRadius: 12, borderWidth: 1,
  },
});
