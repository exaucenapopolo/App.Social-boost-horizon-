import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
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
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { LOGO_URL } from "@/lib/firebase";
import { COUNTRIES } from "@/lib/countries";
import { BASE_URL } from "@/services/api";

const ACCENT  = "#7C3AED";
const ACCENT2 = "#A855F7";
const SUCCESS = "#10B981";
const CARD_BG = "rgba(10,15,40,0.82)";
const BORDER  = "rgba(124,58,237,0.35)";
const MUTED   = "rgba(255,255,255,0.45)";

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ ref?: string }>();

  const [name, setName]               = useState("");
  const [email, setEmail]             = useState("");
  const [phone, setPhone]             = useState("");
  const [password, setPassword]       = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralCode, setReferralCode] = useState(params.ref ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const [referralValid, setReferralValid] = useState<boolean | null>(null);
  const [referralParrainName, setReferralParrainName] = useState("");
  const [checkingCode, setCheckingCode] = useState(false);

  // Entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start();
  }, []);

  // Reset referral validation when code changes
  useEffect(() => {
    if (!referralCode.trim()) {
      setReferralValid(null);
      setReferralParrainName("");
    } else {
      // Reset validation when user edits the code
      setReferralValid(null);
      setReferralParrainName("");
    }
  }, [referralCode]);

  const verifyReferralCode = async () => {
    const code = referralCode.trim().toUpperCase();
    if (!code || code.length < 4) return;
    setCheckingCode(true);
    try {
      const r = await fetch(`${BASE_URL}api/auth/check-referral?code=${encodeURIComponent(code)}`, {
        signal: AbortSignal.timeout(8000),
      });
      const data = await r.json() as { valid: boolean; name?: string };
      setReferralValid(data.valid === true);
      setReferralParrainName(data.name ?? "");
      if (data.valid) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setReferralValid(null);
      setReferralParrainName("");
    } finally {
      setCheckingCode(false);
    }
  };

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Veuillez remplir tous les champs obligatoires");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères");
      return;
    }
    const code = referralCode.trim();
    if (code && referralValid === false) {
      setError("Le code de parrainage est invalide. Corrigez-le ou laissez-le vide.");
      return;
    }
    setError("");
    setLoading(true);
    const fullPhone = phone.trim() ? `${selectedCountry.phoneCode} ${phone.trim()}` : "";
    const res = await register(name.trim(), email.trim(), password, fullPhone || undefined, code || undefined, selectedCountry.code);
    setLoading(false);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } else {
      setError(res.error ?? "Erreur lors de l'inscription");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const filteredCountries = COUNTRIES.filter(
    (c) => !countrySearch || c.name.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const referralBorderColor =
    referralValid === true ? SUCCESS :
    referralValid === false ? "#EF4444" :
    "rgba(255,255,255,0.1)";

  return (
    <View style={styles.root}>
      <StarBackground />

      {/* Back button */}
      <Pressable onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + 10 }]}>
        <Feather name="arrow-left" size={22} color="#fff" />
      </Pressable>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Animated.ScrollView
          contentContainerStyle={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={{ opacity: fadeAnim }}
        >
          {/* ── Logo area ── */}
          <Animated.View style={[styles.logoArea, { transform: [{ translateY: slideAnim }] }]}>
            <LinearGradient
              colors={[ACCENT, ACCENT2, "#EC4899"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.logoRingGradient}
            >
              <View style={styles.logoInner}>
                <Image source={{ uri: LOGO_URL }} style={styles.logoImage} contentFit="cover" />
              </View>
            </LinearGradient>
            <Text style={styles.appName}>Social Boost Horizon</Text>
            <View style={styles.sloganRow}>
              <View style={styles.sloganLine} />
              <Text style={styles.slogan}>Votre visibilité, notre horizon</Text>
              <View style={styles.sloganLine} />
            </View>
          </Animated.View>

          {/* ── Card ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <LinearGradient colors={[SUCCESS, "#34D399"]} style={styles.cardHeaderDot} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
              <Text style={styles.cardTitle}>Créer un compte</Text>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Nom */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Nom complet *</Text>
              <View style={[styles.inputRow, focusedField === "name" && styles.inputFocused]}>
                <Feather name="user" size={16} color={focusedField === "name" ? ACCENT2 : MUTED} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Votre nom complet"
                  placeholderTextColor={MUTED}
                  value={name} onChangeText={setName}
                  autoCapitalize="words"
                  onFocus={() => setFocusedField("name")}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email *</Text>
              <View style={[styles.inputRow, focusedField === "email" && styles.inputFocused]}>
                <Feather name="mail" size={16} color={focusedField === "email" ? ACCENT2 : MUTED} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="votre@email.com"
                  placeholderTextColor={MUTED}
                  value={email} onChangeText={setEmail}
                  keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>

            {/* Pays */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Pays</Text>
              <Pressable style={styles.inputRow} onPress={() => { setShowCountryModal(true); setCountrySearch(""); }}>
                <Text style={{ fontSize: 18, marginRight: 10 }}>{selectedCountry.flag}</Text>
                <Text style={[styles.input, { flex: 1 }]}>{selectedCountry.name}</Text>
                <Feather name="chevron-down" size={16} color={MUTED} />
              </Pressable>
            </View>

            {/* Téléphone */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Téléphone</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={[styles.inputRow, { width: 90 }]}>
                  <Text style={{ fontSize: 14, marginRight: 2 }}>{selectedCountry.flag}</Text>
                  <Text style={[styles.input, { color: ACCENT2, fontFamily: "Inter_700Bold", flex: 0 }]}>
                    {selectedCountry.phoneCode}
                  </Text>
                </View>
                <View style={[styles.inputRow, { flex: 1 }, focusedField === "phone" && styles.inputFocused]}>
                  <Feather name="phone" size={16} color={focusedField === "phone" ? ACCENT2 : MUTED} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="6XX XXX XXX"
                    placeholderTextColor={MUTED}
                    value={phone} onChangeText={setPhone}
                    keyboardType="phone-pad"
                    onFocus={() => setFocusedField("phone")}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>
            </View>

            {/* Mot de passe */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Mot de passe *</Text>
              <View style={[styles.inputRow, focusedField === "pwd" && styles.inputFocused]}>
                <Feather name="lock" size={16} color={focusedField === "pwd" ? ACCENT2 : MUTED} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Minimum 6 caractères"
                  placeholderTextColor={MUTED}
                  value={password} onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  onFocus={() => setFocusedField("pwd")}
                  onBlur={() => setFocusedField(null)}
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn} hitSlop={8}>
                  <Feather name={showPassword ? "eye-off" : "eye"} size={16} color={MUTED} />
                </Pressable>
              </View>
            </View>

            {/* Confirmer mot de passe */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Confirmer le mot de passe *</Text>
              <View style={[
                styles.inputRow,
                focusedField === "confirm" && styles.inputFocused,
                confirmPassword && password !== confirmPassword && { borderColor: "#EF4444", borderWidth: 1.5 },
              ]}>
                <Feather name="lock" size={16} color={focusedField === "confirm" ? ACCENT2 : MUTED} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Répétez votre mot de passe"
                  placeholderTextColor={MUTED}
                  value={confirmPassword} onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirm}
                  onFocus={() => setFocusedField("confirm")}
                  onBlur={() => setFocusedField(null)}
                />
                <Pressable onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeBtn} hitSlop={8}>
                  <Feather name={showConfirm ? "eye-off" : "eye"} size={16} color={MUTED} />
                </Pressable>
              </View>
              {confirmPassword && password !== confirmPassword && (
                <Text style={styles.hintError}>⚠️ Les mots de passe ne correspondent pas</Text>
              )}
            </View>

            {/* ── Code de parrainage + bouton Vérifier ── */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Code de parrainage (optionnel)</Text>

              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <View style={[
                  styles.inputRow,
                  { flex: 1, borderColor: referralBorderColor },
                  referralValid === true && { backgroundColor: "rgba(16,185,129,0.07)" },
                  referralValid === false && { backgroundColor: "rgba(239,68,68,0.07)" },
                ]}>
                  <Feather name="gift" size={16} color="#F59E0B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: SBH-ABCXYZ"
                    placeholderTextColor={MUTED}
                    value={referralCode}
                    onChangeText={(t) => setReferralCode(t.toUpperCase())}
                    autoCapitalize="characters"
                    onFocus={() => setFocusedField("referral")}
                    onBlur={() => setFocusedField(null)}
                  />
                  {checkingCode && <ActivityIndicator size="small" color={ACCENT2} style={{ marginLeft: 4 }} />}
                  {!checkingCode && referralValid === true && <Feather name="check-circle" size={18} color={SUCCESS} />}
                  {!checkingCode && referralValid === false && <Feather name="x-circle" size={18} color="#EF4444" />}
                </View>

                {/* Bouton Vérifier */}
                <Pressable
                  onPress={verifyReferralCode}
                  disabled={checkingCode || !referralCode.trim() || referralCode.trim().length < 4}
                  style={({ pressed }) => [
                    styles.verifyBtn,
                    (checkingCode || !referralCode.trim() || referralCode.trim().length < 4) && { opacity: 0.45 },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <LinearGradient
                    colors={[ACCENT, ACCENT2]}
                    style={styles.verifyBtnGradient}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  >
                    {checkingCode ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.verifyBtnText}>Vérifier</Text>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>

              {/* Feedback code parrainage */}
              {referralValid === true && referralParrainName ? (
                <View style={styles.parrainBanner}>
                  <Feather name="check-circle" size={14} color={SUCCESS} />
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: SUCCESS, flex: 1 }}>
                    Code valide — Vous serez parrainé par{" "}
                    <Text style={{ fontFamily: "Inter_700Bold" }}>{referralParrainName}</Text> 🎉
                  </Text>
                </View>
              ) : referralValid === true ? (
                <View style={styles.parrainBanner}>
                  <Feather name="check-circle" size={14} color={SUCCESS} />
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: SUCCESS }}>Code valide ✓</Text>
                </View>
              ) : referralValid === false ? (
                <Text style={styles.hintError}>❌ Code invalide ou inexistant.</Text>
              ) : (
                <Text style={styles.hintGold}>
                  Entrez le code d'un parrain et appuyez sur "Vérifier" pour valider.
                </Text>
              )}
            </View>

            {/* Bouton Inscription */}
            <Pressable
              style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.85 }]}
              onPress={handleRegister}
              disabled={loading}
            >
              <LinearGradient
                colors={[SUCCESS, "#059669"]}
                style={styles.submitGradient}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Feather name="user-check" size={18} color="#fff" />
                    <Text style={styles.submitText}>Créer mon compte</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable onPress={() => router.replace("/auth/login")} style={styles.loginLink}>
              <Text style={styles.loginLinkText}>
                Déjà inscrit ?{" "}
                <Text style={{ color: ACCENT2, fontFamily: "Inter_700Bold" }}>Se connecter</Text>
              </Text>
            </Pressable>
          </View>
        </Animated.ScrollView>
      </KeyboardAvoidingView>

      {/* Country Modal */}
      <Modal visible={showCountryModal} animationType="slide" transparent onRequestClose={() => setShowCountryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.separator }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Choisir votre pays</Text>
              <Pressable onPress={() => setShowCountryModal(false)} style={[styles.modalCloseBtn, { backgroundColor: colors.inputBg }]}>
                <Feather name="x" size={20} color={colors.text} />
              </Pressable>
            </View>
            <View style={[styles.searchBar, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
              <Feather name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Rechercher un pays..."
                placeholderTextColor={colors.textMuted}
                value={countrySearch} onChangeText={setCountrySearch}
                autoFocus
              />
            </View>
            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item.code}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 6 }}
              renderItem={({ item }) => {
                const isSelected = selectedCountry.code === item.code;
                return (
                  <Pressable
                    style={[styles.countryOption, { backgroundColor: isSelected ? colors.accent + "18" : colors.card, borderColor: isSelected ? colors.accent : colors.cardBorder }]}
                    onPress={() => { setSelectedCountry(item); setShowCountryModal(false); setCountrySearch(""); }}
                  >
                    <Text style={{ fontSize: 26 }}>{item.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.countryOptionName, { color: colors.text }]}>{item.name}</Text>
                      <Text style={[styles.countryOptionSub, { color: colors.textMuted }]}>{item.currency} · {item.phoneCode}</Text>
                    </View>
                    {isSelected && <Feather name="check-circle" size={18} color={colors.accent} />}
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
  root: { flex: 1, backgroundColor: "#080C1A" },
  container: { alignItems: "center", paddingHorizontal: 22, gap: 26 },

  backBtn: {
    position: "absolute", left: 16, zIndex: 10,
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },

  /* ── Logo ── */
  logoArea: { alignItems: "center", gap: 4, marginTop: 48 },
  logoRingGradient: { width: 88, height: 88, borderRadius: 44, padding: 3, marginBottom: 12 },
  logoInner: { flex: 1, borderRadius: 41, backgroundColor: "#0A0E1A", overflow: "hidden" },
  logoImage: { width: "100%", height: "100%" },
  appName: {
    fontFamily: "Inter_700Bold", fontSize: 22, color: "#fff", letterSpacing: 0.8,
    textShadowColor: ACCENT2, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12,
  },
  sloganRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  sloganLine: { flex: 1, height: 1, backgroundColor: "rgba(124,58,237,0.3)" },
  slogan: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4 },

  /* ── Card ── */
  card: {
    width: "100%",
    backgroundColor: CARD_BG,
    borderRadius: 20, borderWidth: 1, borderColor: BORDER,
    padding: 24, gap: 16,
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: -4 },
  cardHeaderDot: { width: 4, height: 22, borderRadius: 2 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#fff" },

  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(239,68,68,0.10)", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: "rgba(239,68,68,0.25)",
  },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#EF4444", flex: 1 },

  fieldGroup: { gap: 7 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.7)", letterSpacing: 0.3, marginLeft: 2 },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14, height: 52,
  },
  inputFocused: { borderColor: ACCENT2, backgroundColor: "rgba(124,58,237,0.08)" },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 15, color: "#fff" },
  eyeBtn: { padding: 4 },

  hintError: { fontFamily: "Inter_400Regular", fontSize: 11, color: "#EF4444", marginTop: 2 },
  hintGold:  { fontFamily: "Inter_400Regular", fontSize: 11, color: "#F59E0B", marginTop: 2 },

  /* ── Referral verify button ── */
  verifyBtn: { borderRadius: 12, overflow: "hidden" },
  verifyBtnGradient: {
    height: 52, paddingHorizontal: 16,
    alignItems: "center", justifyContent: "center",
  },
  verifyBtnText: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" },

  parrainBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(16,185,129,0.08)", borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(16,185,129,0.25)", padding: 10,
  },

  submitBtn: { borderRadius: 14, overflow: "hidden", marginTop: 4 },
  submitGradient: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  submitText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff", letterSpacing: 0.3 },

  loginLink: { alignItems: "center" },
  loginLinkText: { fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.55)" },

  /* ── Country modal ── */
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%" },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
  modalCloseBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
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
  countryOptionName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  countryOptionSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
});
