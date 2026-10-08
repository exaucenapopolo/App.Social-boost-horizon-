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

import { AuthBackground } from "@/components/AuthBackground";
import { useAuth } from "@/context/AuthContext";
import { LOGO_URL } from "@/lib/firebase";
import { COUNTRIES } from "@/lib/countries";
import { BASE_URL } from "@/services/api";

// ─────────────────────────────────────────────────────────────────
// Palette alignée sur login.tsx — bleu nuit + or
// ─────────────────────────────────────────────────────────────────
const NAVY       = "#0F2A5C";
const NAVY_LIGHT = "#1E3F7A";
const GOLD       = "#C9A961";
const GOLD_DK    = "#B08D4A";
const BG         = "#FAF9F6";
const SURFACE    = "#FFFFFF";
const TEXT       = "#0F172A";
const TEXT_MUTED = "#64748B";
const TEXT_SOFT  = "#94A3B8";
const BORDER     = "#E8E4DA";
const DANGER     = "#EF4444";
const SUCCESS    = "#10B981";

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const params = useLocalSearchParams<{ ref?: string }>();

  const [name, setName]                             = useState("");
  const [email, setEmail]                           = useState("");
  const [phone, setPhone]                           = useState("");
  const [password, setPassword]                     = useState("");
  const [confirmPassword, setConfirmPassword]       = useState("");
  const [referralCode, setReferralCode]             = useState(params.ref ?? "");
  const [showPassword, setShowPassword]             = useState(false);
  const [showConfirm, setShowConfirm]               = useState(false);
  const [focusedField, setFocusedField]             = useState<string | null>(null);

  const [selectedCountry, setSelectedCountry]       = useState(COUNTRIES[0]);
  const [showCountryModal, setShowCountryModal]     = useState(false);
  const [countrySearch, setCountrySearch]           = useState("");

  const [error, setError]                           = useState("");
  const [loading, setLoading]                       = useState(false);

  const [referralValid, setReferralValid]           = useState<boolean | null>(null);
  const [referralParrainName, setReferralParrainName] = useState("");
  const [checkingCode, setCheckingCode]             = useState(false);

  // ── Animations ──
  const logoAnim     = useRef(new Animated.Value(0)).current;
  const titleAnim    = useRef(new Animated.Value(0)).current;
  const formAnim     = useRef(new Animated.Value(0)).current;
  const errorAnim    = useRef(new Animated.Value(0)).current;
  const shakeAnim    = useRef(new Animated.Value(0)).current;
  const btnScale     = useRef(new Animated.Value(1)).current;
  const btnGlow      = useRef(new Animated.Value(0)).current;
  const refSuccess   = useRef(new Animated.Value(0)).current;
  const strengthAnim = useRef(new Animated.Value(0)).current;

  const computePasswordStrength = (pwd: string): number => {
    if (!pwd) return 0;
    let score = 0;
    if (pwd.length >= 6) score++;
    if (pwd.length >= 10) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return Math.min(score, 5);
  };

  const getStrengthColor = (pwd: string): string => {
    const s = computePasswordStrength(pwd);
    if (!pwd) return TEXT_SOFT;
    if (s <= 1) return DANGER;
    if (s <= 2) return "#F59E0B";
    if (s <= 3) return "#FBBF24";
    if (s <= 4) return "#84CC16";
    return SUCCESS;
  };

  const getStrengthLabel = (pwd: string): string => {
    const s = computePasswordStrength(pwd);
    if (!pwd) return "";
    if (s <= 1) return "Faible";
    if (s <= 2) return "Moyen";
    if (s <= 3) return "Correct";
    if (s <= 4) return "Fort";
    return "Très fort";
  };

  useEffect(() => {
    Animated.stagger(140, [
      Animated.timing(logoAnim, {
        toValue: 1, duration: 650, useNativeDriver: true, easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(titleAnim, {
        toValue: 1, duration: 520, useNativeDriver: true, easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(formAnim, {
        toValue: 1, duration: 620, useNativeDriver: true, easing: Easing.out(Easing.cubic),
      }),
    ]).start();
  }, []);

  // Barre de force animée
  useEffect(() => {
    const strength = computePasswordStrength(password);
    Animated.timing(strengthAnim, {
      toValue: strength, duration: 260, useNativeDriver: false,
      easing: Easing.out(Easing.quad),
    }).start();
  }, [password]);

  // Reset validation du code parrainage
  useEffect(() => {
    if (!referralCode.trim()) {
      setReferralValid(null);
      setReferralParrainName("");
    } else {
      setReferralValid(null);
      setReferralParrainName("");
    }
  }, [referralCode]);

  const triggerError = (msg: string) => {
    setError(msg);
    errorAnim.setValue(0);
    Animated.timing(errorAnim, {
      toValue: 1, duration: 260, useNativeDriver: true, easing: Easing.out(Easing.quad),
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
      if (data.valid) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        refSuccess.setValue(0);
        Animated.spring(refSuccess, {
          toValue: 1, useNativeDriver: true, speed: 12, bounciness: 14,
        }).start();
      }
    } catch {
      setReferralValid(null);
      setReferralParrainName("");
    } finally {
      setCheckingCode(false);
    }
  };

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      triggerError("Veuillez remplir tous les champs obligatoires");
      return;
    }
    if (password !== confirmPassword) {
      triggerError("Les mots de passe ne correspondent pas");
      return;
    }
    if (password.length < 6) {
      triggerError("Le mot de passe doit contenir au moins 6 caractères");
      return;
    }
    const code = referralCode.trim();
    if (code && referralValid === false) {
      triggerError("Le code de parrainage est invalide. Corrigez-le ou laissez-le vide.");
      return;
    }
    setError("");
    setLoading(true);
    Animated.timing(btnGlow, {
      toValue: 1, duration: 300, useNativeDriver: false,
    }).start();
    const fullPhone = phone.trim() ? `${selectedCountry.phoneCode} ${phone.trim()}` : "";
    const res = await register(
      name.trim(),
      email.trim(),
      password,
      fullPhone || undefined,
      code || undefined,
      selectedCountry.code
    );
    setLoading(false);
    Animated.timing(btnGlow, {
      toValue: 0, duration: 300, useNativeDriver: false,
    }).start();
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } else {
      triggerError(res.error ?? "Erreur lors de l'inscription");
    }
  };

  const handlePressIn = () => {
    Animated.spring(btnScale, {
      toValue: 0.965, useNativeDriver: true, speed: 40, bounciness: 0,
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(btnScale, {
      toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6,
    }).start();
  };

  const filteredCountries = COUNTRIES.filter(
    (c) => !countrySearch || c.name.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const referralBorderColor =
    referralValid === true ? SUCCESS :
    referralValid === false ? DANGER :
    BORDER;

  // Interpolations
  const logoTranslate  = logoAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] });
  const logoScale      = logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
  const titleTranslate = titleAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  const formTranslate  = formAnim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });

  const btnGlowColor = btnGlow.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(201,169,97,0)", "rgba(201,169,97,0.35)"],
  });

  const refScale = refSuccess.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.6, 1.15, 1],
  });

  const strengthWidth = strengthAnim.interpolate({
    inputRange: [0, 5],
    outputRange: ["0%", "100%"],
  });

  const strengthBarColor = getStrengthColor(password);

  return (
    <View style={styles.root}>
      {/* Fond décoratif partagé (halos + points + anneaux) */}
      <AuthBackground />

      {/* Bouton retour */}
      <Pressable
        onPress={() => router.back()}
        style={[styles.backBtn, { top: insets.top + 12 }]}
      >
        <Feather name="arrow-left" size={20} color={NAVY} />
      </Pressable>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[
            styles.container,
            { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 40 },
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

          {/* ── Titre ── */}
          <Animated.View
            style={[
              styles.titleArea,
              { opacity: titleAnim, transform: [{ translateY: titleTranslate }] },
            ]}
          >
            <Text style={styles.appName}>Social Boost Horizon</Text>
            <View style={styles.sloganRow}>
              <View style={styles.sloganLine} />
              <Text style={styles.slogan}>Rejoignez notre communauté</Text>
              <View style={styles.sloganLine} />
            </View>
          </Animated.View>

          {/* ── Formulaire ── */}
          <Animated.View
            style={[
              styles.formSection,
              { opacity: formAnim, transform: [{ translateY: formTranslate }] },
            ]}
          >
            <Text style={styles.formTitle}>Créer un compte</Text>
            <Text style={styles.formSubtitle}>Commencez en quelques secondes</Text>

            {error ? (
              <Animated.View
                style={[
                  styles.errorBox,
                  { opacity: errorAnim, transform: [{ translateX: shakeAnim }] },
                ]}
              >
                <Feather name="alert-circle" size={15} color={DANGER} />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            ) : null}

            {/* Nom */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, focusedField === "name" && { color: NAVY }]}>
                Nom complet *
              </Text>
              <View style={[styles.inputRow, focusedField === "name" && styles.inputFocused]}>
                <Feather
                  name="user" size={18}
                  color={focusedField === "name" ? NAVY : TEXT_SOFT}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Votre nom complet"
                  placeholderTextColor={TEXT_SOFT}
                  value={name}
                  onChangeText={(v) => { setName(v); if (error) setError(""); }}
                  autoCapitalize="words"
                  onFocus={() => setFocusedField("name")}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, focusedField === "email" && { color: NAVY }]}>
                Email *
              </Text>
              <View style={[styles.inputRow, focusedField === "email" && styles.inputFocused]}>
                <Feather
                  name="mail" size={18}
                  color={focusedField === "email" ? NAVY : TEXT_SOFT}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="votre@email.com"
                  placeholderTextColor={TEXT_SOFT}
                  value={email}
                  onChangeText={(v) => { setEmail(v); if (error) setError(""); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>

            {/* Pays */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Pays</Text>
              <Pressable
                style={styles.inputRow}
                onPress={() => {
                  setShowCountryModal(true);
                  setCountrySearch("");
                  Haptics.selectionAsync();
                }}
              >
                <Text style={{ fontSize: 20, marginRight: 12 }}>{selectedCountry.flag}</Text>
                <Text style={[styles.input, { flex: 1 }]}>{selectedCountry.name}</Text>
                <Feather name="chevron-down" size={18} color={TEXT_SOFT} />
              </Pressable>
            </View>

            {/* Téléphone */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Téléphone</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={[styles.inputRow, { width: 104 }]}>
                  <Text style={{ fontSize: 16, marginRight: 6 }}>{selectedCountry.flag}</Text>
                  <Text style={styles.phoneCodeText}>{selectedCountry.phoneCode}</Text>
                </View>
                <View style={[styles.inputRow, { flex: 1 }, focusedField === "phone" && styles.inputFocused]}>
                  <Feather
                    name="phone" size={18}
                    color={focusedField === "phone" ? NAVY : TEXT_SOFT}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="6XX XXX XXX"
                    placeholderTextColor={TEXT_SOFT}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    onFocus={() => setFocusedField("phone")}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>
            </View>

            {/* Mot de passe */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, focusedField === "pwd" && { color: NAVY }]}>
                Mot de passe *
              </Text>
              <View style={[styles.inputRow, focusedField === "pwd" && styles.inputFocused]}>
                <Feather
                  name="lock" size={18}
                  color={focusedField === "pwd" ? NAVY : TEXT_SOFT}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Minimum 6 caractères"
                  placeholderTextColor={TEXT_SOFT}
                  value={password}
                  onChangeText={(v) => { setPassword(v); if (error) setError(""); }}
                  secureTextEntry={!showPassword}
                  onFocus={() => setFocusedField("pwd")}
                  onBlur={() => setFocusedField(null)}
                />
                <Pressable
                  onPress={() => { setShowPassword(!showPassword); Haptics.selectionAsync(); }}
                  style={styles.eyeBtn}
                  hitSlop={8}
                >
                  <Feather
                    name={showPassword ? "eye-off" : "eye"} size={18}
                    color={focusedField === "pwd" ? NAVY : TEXT_SOFT}
                  />
                </Pressable>
              </View>

              {password ? (
                <View style={styles.strengthWrap}>
                  <View style={styles.strengthTrack}>
                    <Animated.View
                      style={[
                        styles.strengthBar,
                        { width: strengthWidth, backgroundColor: strengthBarColor },
                      ]}
                    />
                  </View>
                  <Text style={[styles.strengthLabel, { color: strengthBarColor }]}>
                    {getStrengthLabel(password)}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Confirmer mot de passe */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, focusedField === "confirm" && { color: NAVY }]}>
                Confirmer le mot de passe *
              </Text>
              <View
                style={[
                  styles.inputRow,
                  focusedField === "confirm" && styles.inputFocused,
                  confirmPassword && password !== confirmPassword && { borderColor: DANGER },
                  confirmPassword && password === confirmPassword && { borderColor: SUCCESS },
                ]}
              >
                <Feather
                  name="lock" size={18}
                  color={
                    focusedField === "confirm"
                      ? NAVY
                      : confirmPassword && password !== confirmPassword
                      ? DANGER
                      : confirmPassword && password === confirmPassword
                      ? SUCCESS
                      : TEXT_SOFT
                  }
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Répétez votre mot de passe"
                  placeholderTextColor={TEXT_SOFT}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirm}
                  onFocus={() => setFocusedField("confirm")}
                  onBlur={() => setFocusedField(null)}
                />
                <Pressable
                  onPress={() => { setShowConfirm(!showConfirm); Haptics.selectionAsync(); }}
                  style={styles.eyeBtn}
                  hitSlop={8}
                >
                  <Feather
                    name={showConfirm ? "eye-off" : "eye"} size={18}
                    color={focusedField === "confirm" ? NAVY : TEXT_SOFT}
                  />
                </Pressable>
              </View>
              {confirmPassword && password !== confirmPassword ? (
                <Text style={styles.hintError}>Les mots de passe ne correspondent pas</Text>
              ) : confirmPassword && password === confirmPassword ? (
                <Text style={styles.hintSuccess}>Les mots de passe correspondent</Text>
              ) : null}
            </View>

            {/* Code de parrainage */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Code de parrainage (optionnel)</Text>

              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <View
                  style={[
                    styles.inputRow,
                    { flex: 1, borderColor: referralBorderColor },
                    referralValid === true && { backgroundColor: "rgba(16,185,129,0.06)" },
                    referralValid === false && { backgroundColor: "rgba(239,68,68,0.06)" },
                  ]}
                >
                  <Feather name="gift" size={18} color={GOLD_DK} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: SBH-ABCXYZ"
                    placeholderTextColor={TEXT_SOFT}
                    value={referralCode}
                    onChangeText={(t) => setReferralCode(t.toUpperCase())}
                    autoCapitalize="characters"
                    onFocus={() => setFocusedField("referral")}
                    onBlur={() => setFocusedField(null)}
                  />
                  {checkingCode ? (
                    <ActivityIndicator size="small" color={NAVY} style={{ marginLeft: 4 }} />
                  ) : referralValid === true ? (
                    <Animated.View style={{ transform: [{ scale: refScale }] }}>
                      <Feather name="check-circle" size={20} color={SUCCESS} />
                    </Animated.View>
                  ) : referralValid === false ? (
                    <Feather name="x-circle" size={20} color={DANGER} />
                  ) : null}
                </View>

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
                    colors={[GOLD, GOLD_DK]}
                    style={styles.verifyBtnGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {checkingCode ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.verifyBtnText}>Vérifier</Text>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>

              {referralValid === true && referralParrainName ? (
                <View style={styles.parrainBanner}>
                  <Feather name="check-circle" size={14} color={SUCCESS} />
                  <Text style={styles.parrainText}>
                    Code valide — Vous serez parrainé par{" "}
                    <Text style={{ fontFamily: "Inter_700Bold" }}>{referralParrainName}</Text>
                  </Text>
                </View>
              ) : referralValid === true ? (
                <View style={styles.parrainBanner}>
                  <Feather name="check-circle" size={14} color={SUCCESS} />
                  <Text style={styles.parrainText}>Code valide</Text>
                </View>
              ) : referralValid === false ? (
                <Text style={styles.hintError}>Code invalide ou inexistant.</Text>
              ) : (
                <Text style={styles.hintGold}>
                  Entrez le code d'un parrain et appuyez sur « Vérifier ».
                </Text>
              )}
            </View>

            {/* Bouton principal */}
            <Animated.View style={[styles.btnWrapper, { transform: [{ scale: btnScale }] }]}>
              <Pressable
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onPress={handleRegister}
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
                      <Feather name="user-check" size={18} color={GOLD} />
                      <Text style={styles.submitText}>Créer mon compte</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </Animated.View>

            {/* Lien connexion */}
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                router.replace("/auth/login");
              }}
              style={styles.loginLink}
            >
              <Text style={styles.loginLinkText}>
                Déjà inscrit ?{" "}
                <Text style={styles.loginLinkAccent}>Se connecter</Text>
              </Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal pays */}
      <Modal
        visible={showCountryModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCountryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choisir votre pays</Text>
              <Pressable
                onPress={() => setShowCountryModal(false)}
                style={styles.modalCloseBtn}
              >
                <Feather name="x" size={20} color={TEXT_MUTED} />
              </Pressable>
            </View>
            <View style={styles.searchBar}>
              <Feather name="search" size={16} color={TEXT_MUTED} />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher un pays..."
                placeholderTextColor={TEXT_SOFT}
                value={countrySearch}
                onChangeText={setCountrySearch}
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
                    style={[
                      styles.countryOption,
                      isSelected && styles.countryOptionSelected,
                    ]}
                    onPress={() => {
                      setSelectedCountry(item);
                      setShowCountryModal(false);
                      setCountrySearch("");
                      Haptics.selectionAsync();
                    }}
                  >
                    <Text style={{ fontSize: 26 }}>{item.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.countryOptionName}>{item.name}</Text>
                      <Text style={styles.countryOptionSub}>
                        {item.currency} · {item.phoneCode}
                      </Text>
                    </View>
                    {isSelected && <Feather name="check-circle" size={18} color={NAVY} />}
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
  root: { flex: 1, backgroundColor: BG },
  container: { alignItems: "center", paddingHorizontal: 26, gap: 22 },

  backBtn: {
    position: "absolute", left: 16, zIndex: 10,
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: SURFACE,
    borderWidth: 1, borderColor: BORDER,
    alignItems: "center", justifyContent: "center",
    shadowColor: NAVY, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 2,
  },

  logoArea: { alignItems: "center", marginTop: 4 },
  logoWrap: {
    width: 88, height: 88, borderRadius: 20,
    backgroundColor: SURFACE, overflow: "hidden",
    shadowColor: NAVY, shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 6,
  },
  logoImage: { width: "100%", height: "100%" },

  titleArea: { alignItems: "center", gap: 10 },
  appName: {
    fontFamily: "Inter_700Bold", fontSize: 24,
    color: NAVY, letterSpacing: 0.2,
  },
  sloganRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  sloganLine: { width: 20, height: 1, backgroundColor: GOLD, opacity: 0.7 },
  slogan: {
    fontFamily: "Inter_400Regular", fontSize: 12.5,
    color: GOLD_DK, letterSpacing: 0.4,
  },

  formSection: { width: "100%", gap: 16, marginTop: 6 },
  formTitle: {
    fontFamily: "Inter_700Bold", fontSize: 22,
    color: TEXT, letterSpacing: 0.1,
  },
  formSubtitle: {
    fontFamily: "Inter_400Regular", fontSize: 13,
    color: TEXT_MUTED, marginTop: -10, marginBottom: 4,
  },

  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(239,68,68,0.07)",
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: "rgba(239,68,68,0.22)",
    marginTop: 2,
  },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 13, color: DANGER, flex: 1 },

  fieldGroup: { gap: 7 },
  label: {
    fontFamily: "Inter_500Medium", fontSize: 13,
    color: TEXT, letterSpacing: 0.1, marginLeft: 2,
  },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: SURFACE,
    borderRadius: 14, borderWidth: 1.5, borderColor: BORDER,
    paddingHorizontal: 16, height: 56,
    shadowColor: NAVY, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  inputFocused: {
    borderColor: NAVY,
    shadowOpacity: 0.1, shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  inputIcon: { marginRight: 12 },
  input: {
    flex: 1, fontFamily: "Inter_400Regular",
    fontSize: 15, color: TEXT, paddingVertical: 0,
  },
  phoneCodeText: {
    fontFamily: "Inter_700Bold", fontSize: 14, color: NAVY,
  },
  eyeBtn: { padding: 4 },

  hintError: { fontFamily: "Inter_400Regular", fontSize: 11.5, color: DANGER, marginTop: 2, marginLeft: 2 },
  hintSuccess: { fontFamily: "Inter_400Regular", fontSize: 11.5, color: SUCCESS, marginTop: 2, marginLeft: 2 },
  hintGold: { fontFamily: "Inter_400Regular", fontSize: 11.5, color: GOLD_DK, marginTop: 2, marginLeft: 2 },

  strengthWrap: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  strengthTrack: {
    flex: 1, height: 4, borderRadius: 2,
    backgroundColor: "#EFEBE1", overflow: "hidden",
  },
  strengthBar: { height: "100%", borderRadius: 2 },
  strengthLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11 },

  verifyBtn: { borderRadius: 14, overflow: "hidden" },
  verifyBtnGradient: {
    height: 56, paddingHorizontal: 20,
    alignItems: "center", justifyContent: "center",
  },
  verifyBtnText: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" },

  parrainBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(16,185,129,0.08)",
    borderRadius: 10, borderWidth: 1,
    borderColor: "rgba(16,185,129,0.25)", padding: 10,
  },
  parrainText: {
    fontFamily: "Inter_400Regular", fontSize: 12,
    color: SUCCESS, flex: 1,
  },

  btnWrapper: {
    width: "100%", marginTop: 6,
    borderRadius: 16,
    shadowColor: NAVY, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28, shadowRadius: 16, elevation: 6,
  },
  btnGlow: { ...StyleSheet.absoluteFillObject, borderRadius: 16 },
  submitBtn: {
    borderRadius: 16, height: 56,
    flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 10,
  },
  submitText: {
    fontFamily: "Inter_700Bold", fontSize: 16,
    color: "#FFFFFF", letterSpacing: 0.3,
  },

  loginLink: { alignItems: "center", paddingVertical: 8, marginTop: 2 },
  loginLinkText: {
    fontFamily: "Inter_400Regular", fontSize: 14, color: TEXT_MUTED,
  },
  loginLinkAccent: {
    fontFamily: "Inter_700Bold", color: NAVY,
  },

  modalOverlay: {
    flex: 1, backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: SURFACE,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    padding: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: "#F1F5F9",
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: TEXT },
  modalCloseBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderColor: BORDER, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    margin: 16, marginTop: 12,
    backgroundColor: "#F9FAFB",
  },
  searchInput: {
    flex: 1, fontFamily: "Inter_400Regular",
    fontSize: 15, color: TEXT,
  },
  countryOption: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 12, borderWidth: 1,
    borderColor: BORDER, padding: 12,
    backgroundColor: SURFACE,
  },
  countryOptionSelected: {
    borderColor: NAVY, backgroundColor: "#EEF2FF",
  },
  countryOptionName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: TEXT },
  countryOptionSub: {
    fontFamily: "Inter_400Regular", fontSize: 12,
    color: TEXT_MUTED, marginTop: 2,
  },
});