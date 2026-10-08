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

import { AuthBackground } from "@/components/AuthBackground";
import { APP_VERSION } from "@/constants/version";
import { useAuth } from "@/context/AuthContext";
import { LOGO_URL } from "@/lib/firebase";
import { BASE_URL } from "@/services/api";

// ─────────────────────────────────────────────────────────────────
// Palette alignée sur l'identité du logo : bleu nuit + or
// ─────────────────────────────────────────────────────────────────
const NAVY        = "#0F2A5C";
const NAVY_LIGHT  = "#1E3F7A";
const NAVY_DK     = "#0A1F44";
const GOLD        = "#C9A961";
const GOLD_DK     = "#B08D4A";
const GOLD_SOFT   = "#F7F1E1";
const BG          = "#FAF9F6";
const SURFACE     = "#FFFFFF";
const TEXT        = "#0F172A";
const TEXT_MUTED  = "#64748B";
const TEXT_SOFT   = "#94A3B8";
const BORDER      = "#E8E4DA";
const DANGER      = "#EF4444";
const SUCCESS     = "#10B981";
const WHATSAPP    = "#25D366";
const WHATSAPP_DK = "#128C7E";

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

  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const [showSupport, setShowSupport]         = useState(false);
  const [supportStep, setSupportStep]         = useState<1 | 2 | 3>(1);
  const [supportCategory, setSupportCategory] = useState("");
  const [supportMessage, setSupportMessage]   = useState("");
  const [supportWaCode, setSupportWaCode]     = useState("+237");
  const [supportWaPhone, setSupportWaPhone]   = useState("");
  const [supportLoading, setSupportLoading]   = useState(false);
  const [supportSuccess, setSupportSuccess]   = useState(false);

  // ── Animations ──
  const logoAnim   = useRef(new Animated.Value(0)).current;
  const titleAnim  = useRef(new Animated.Value(0)).current;
  const formAnim   = useRef(new Animated.Value(0)).current;
  const errorAnim  = useRef(new Animated.Value(0)).current;
  const shakeAnim  = useRef(new Animated.Value(0)).current;
  const btnScale   = useRef(new Animated.Value(1)).current;
  const btnGlow    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(140, [
      Animated.timing(logoAnim, {
        toValue: 1,
        duration: 650,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(titleAnim, {
        toValue: 1,
        duration: 520,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(formAnim, {
        toValue: 1,
        duration: 620,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    ]).start();
  }, []);

  const triggerError = (msg: string) => {
    setError(msg);
    errorAnim.setValue(0);
    Animated.timing(errorAnim, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
      easing: Easing.out(Easing.quad),
    }).start();
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 9,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -9, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,  duration: 55, useNativeDriver: true }),
    ]).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      triggerError("Veuillez remplir tous les champs");
      return;
    }
    setError("");
    setLoading(true);
    Animated.timing(btnGlow, {
      toValue: 1,
      duration: 300,
      useNativeDriver: false,
    }).start();
    const res = await login(email.trim(), password);
    setLoading(false);
    Animated.timing(btnGlow, {
      toValue: 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } else {
      triggerError(res.error ?? "Erreur de connexion");
    }
  };

  const handlePressIn = () => {
    Animated.spring(btnScale, {
      toValue: 0.965,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(btnScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
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

  // Interpolations
  const logoTranslate = logoAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] });
  const logoScale     = logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
  const titleTranslate = titleAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  const formTranslate = formAnim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });

  const btnGlowColor = btnGlow.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(201,169,97,0)", "rgba(201,169,97,0.35)"],
  });

  return (
    <View style={styles.root}>
      {/* Fond décoratif partagé (halos + points + anneaux) */}
      <AuthBackground />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[
            styles.container,
            { paddingTop: insets.top + 36, paddingBottom: insets.bottom + 28 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Logo ── */}
          <Animated.View
            style={[
              styles.logoArea,
              {
                opacity: logoAnim,
                transform: [{ translateY: logoTranslate }, { scale: logoScale }],
              },
            ]}
          >
            <View style={styles.logoWrap}>
              <Image source={{ uri: LOGO_URL }} style={styles.logoImage} contentFit="cover" />
            </View>
          </Animated.View>

          {/* ── Titre & slogan ── */}
          <Animated.View
            style={[
              styles.titleArea,
              { opacity: titleAnim, transform: [{ translateY: titleTranslate }] },
            ]}
          >
            <Text style={styles.appName}>Social Boost Horizon</Text>
            <View style={styles.sloganRow}>
              <View style={styles.sloganLine} />
              <Text style={styles.slogan}>Votre visibilité, notre horizon</Text>
              <View style={styles.sloganLine} />
            </View>
          </Animated.View>

          {/* ── Formulaire (inline, sans carte) ── */}
          <Animated.View
            style={[
              styles.formSection,
              { opacity: formAnim, transform: [{ translateY: formTranslate }] },
            ]}
          >
            <Text style={styles.formTitle}>Connexion</Text>
            <Text style={styles.formSubtitle}>Accédez à votre espace personnel SBH</Text>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text
                style={[
                  styles.label,
                  focusedField === "email" && { color: NAVY },
                ]}
              >
                Email
              </Text>
              <View
                style={[
                  styles.inputRow,
                  focusedField === "email" && styles.inputFocused,
                ]}
              >
                <Feather
                  name="mail"
                  size={18}
                  color={focusedField === "email" ? NAVY : TEXT_SOFT}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="votre@email.com"
                  placeholderTextColor={TEXT_SOFT}
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    if (error) setError("");
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>

            {/* Mot de passe */}
            <View style={styles.fieldGroup}>
              <Text
                style={[
                  styles.label,
                  focusedField === "password" && { color: NAVY },
                ]}
              >
                Mot de passe
              </Text>
              <View
                style={[
                  styles.inputRow,
                  focusedField === "password" && styles.inputFocused,
                ]}
              >
                <Feather
                  name="lock"
                  size={18}
                  color={focusedField === "password" ? NAVY : TEXT_SOFT}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="••••••••"
                  placeholderTextColor={TEXT_SOFT}
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    if (error) setError("");
                  }}
                  secureTextEntry={!showPassword}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                />
                <Pressable
                  onPress={() => {
                    setShowPassword(!showPassword);
                    Haptics.selectionAsync();
                  }}
                  style={styles.eyeBtn}
                  hitSlop={8}
                >
                  <Feather
                    name={showPassword ? "eye-off" : "eye"}
                    size={18}
                    color={focusedField === "password" ? NAVY : TEXT_SOFT}
                  />
                </Pressable>
              </View>
            </View>

            {/* Message d'erreur animé */}
            {error ? (
              <Animated.View
                style={[
                  styles.errorBox,
                  {
                    opacity: errorAnim,
                    transform: [{ translateX: shakeAnim }],
                  },
                ]}
              >
                <Feather name="alert-circle" size={15} color={DANGER} />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            ) : null}

            {/* Bouton principal */}
            <Animated.View style={[styles.btnWrapper, { transform: [{ scale: btnScale }] }]}>
              <Pressable
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onPress={handleLogin}
                disabled={loading}
                style={{ width: "100%" }}
              >
                <Animated.View style={[styles.btnGlow, { backgroundColor: btnGlowColor }]} />
                <LinearGradient
                  colors={[NAVY_LIGHT, NAVY]}
                  style={styles.submitBtn}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Feather name="log-in" size={18} color={GOLD} />
                      <Text style={styles.submitText}>Se connecter</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </Animated.View>

            {/* Séparateur "ou" */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>ou</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Bouton secondaire */}
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                router.push("/auth/register");
              }}
              style={({ pressed }) => [
                styles.registerBtn,
                pressed && { backgroundColor: GOLD_SOFT },
              ]}
            >
              <Feather name="user-plus" size={16} color={NAVY} />
              <Text style={styles.registerBtnText}>Créer un compte</Text>
            </Pressable>

            {/* Support */}
            <Pressable onPress={openSupport} style={styles.supportBtn}>
              <Feather name="help-circle" size={14} color={WHATSAPP} />
              <Text style={styles.supportBtnText}>
                Problème de connexion ? Contacter le support
              </Text>
            </Pressable>
          </Animated.View>

          {/* Version */}
          <Text style={styles.version}>v{APP_VERSION}</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Modal Support (inchangé fonctionnellement) ── */}
      <Modal visible={showSupport} animationType="slide" transparent onRequestClose={() => setShowSupport(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandleWrap}>
              <View style={styles.modalHandle} />
            </View>

            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                <View style={styles.supportIconBadge}>
                  <Feather name="headphones" size={18} color={WHATSAPP} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>
                    {supportStep === 1
                      ? "Contacter le support"
                      : supportStep === 2
                      ? "Votre message"
                      : supportSuccess
                      ? "Message envoyé !"
                      : "Erreur d'envoi"}
                  </Text>
                  <Text style={styles.modalSubtitle}>Support WhatsApp</Text>
                </View>
              </View>
              <Pressable onPress={() => setShowSupport(false)} style={styles.modalCloseBtn}>
                <Feather name="x" size={20} color={TEXT_MUTED} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={{ padding: 20, gap: 14 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
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

                  <Text style={[styles.modalLabel, { marginTop: 4 }]}>
                    Votre numéro WhatsApp *
                  </Text>
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
                  <Text style={styles.modalHint}>
                    Obligatoire — notre équipe vous contactera sur ce numéro
                  </Text>

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
                    <Pressable onPress={() => setSupportStep(1)} style={styles.backStepBtn}>
                      <Feather name="arrow-left" size={16} color={TEXT_MUTED} />
                      <Text style={styles.backStepText}>Retour</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleSendSupport}
                      disabled={
                        supportLoading || !supportMessage.trim() || !supportWaPhone.trim()
                      }
                      style={[
                        styles.sendBtnWrapper,
                        {
                          opacity:
                            supportLoading || !supportMessage.trim() || !supportWaPhone.trim()
                              ? 0.5
                              : 1,
                        },
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
                      {
                        backgroundColor: supportSuccess
                          ? "rgba(16,185,129,0.12)"
                          : "rgba(239,68,68,0.12)",
                      },
                    ]}
                  >
                    <Feather
                      name={supportSuccess ? "check-circle" : "alert-circle"}
                      size={40}
                      color={supportSuccess ? SUCCESS : DANGER}
                    />
                  </View>
                  <Text style={styles.resultTitle}>
                    {supportSuccess ? "Message envoyé !" : "Erreur d'envoi"}
                  </Text>
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
  container: { alignItems: "center", paddingHorizontal: 26, gap: 22 },

  /* ── Logo ── */
  logoArea: { alignItems: "center", marginTop: 4 },
  logoWrap: {
    width: 92,
    height: 92,
    borderRadius: 22,
    backgroundColor: SURFACE,
    overflow: "hidden",
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 6,
  },
  logoImage: { width: "100%", height: "100%" },

  /* ── Titre & slogan ── */
  titleArea: { alignItems: "center", gap: 10 },
  appName: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: NAVY,
    letterSpacing: 0.2,
  },
  sloganRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sloganLine: {
    width: 20,
    height: 1,
    backgroundColor: GOLD,
    opacity: 0.7,
  },
  slogan: {
    fontFamily: "Inter_400Regular",
    fontSize: 12.5,
    color: GOLD_DK,
    letterSpacing: 0.4,
  },

  /* ── Form (inline) ── */
  formSection: {
    width: "100%",
    gap: 16,
    marginTop: 6,
  },
  formTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: TEXT,
    letterSpacing: 0.1,
  },
  formSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: TEXT_MUTED,
    marginTop: -10,
    marginBottom: 4,
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
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingHorizontal: 16,
    height: 56,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  inputFocused: {
    borderColor: NAVY,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  inputIcon: { marginRight: 12 },
  input: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: TEXT,
    paddingVertical: 0,
  },
  eyeBtn: { padding: 4 },

  /* ── Erreur animée ── */
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239,68,68,0.07)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.22)",
    marginTop: 2,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: DANGER,
    flex: 1,
  },

  /* ── Bouton principal ── */
  btnWrapper: {
    width: "100%",
    marginTop: 6,
    borderRadius: 16,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
  },
  btnGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
  },
  submitBtn: {
    borderRadius: 16,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  submitText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },

  /* ── Séparateur ── */
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: BORDER },
  dividerText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: TEXT_SOFT,
  },

  /* ── Bouton secondaire ── */
  registerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: NAVY,
    paddingVertical: 15,
    backgroundColor: SURFACE,
  },
  registerBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: NAVY,
  },

  /* ── Support ── */
  supportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    marginTop: 2,
  },
  supportBtnText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12.5,
    color: TEXT_MUTED,
  },

  version: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: TEXT_SOFT,
    marginTop: 6,
  },

  /* ── Modal Support ── */
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
  modalHandleWrap: { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
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
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 17, color: TEXT },
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
    backgroundColor: "#F3F4F6",
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
  modalHint: { fontFamily: "Inter_400Regular", fontSize: 11, color: TEXT_SOFT },

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
    color: NAVY,
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
  backStepText: { fontFamily: "Inter_500Medium", fontSize: 14, color: TEXT_MUTED },
  sendBtnWrapper: { flex: 1, borderRadius: 12, overflow: "hidden" },
  sendBtnGradient: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sendBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" },

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
  closeFinalText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: TEXT },
});