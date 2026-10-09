import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { useTheme } from "@/context/ThemeContext";
import { BASE_URL } from "@/services/api";
import { getFreshToken } from "@/services/tokenStore";

// Palette
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
const DANGER  = "#EF4444";
const INFO    = "#3B82F6";

type Step = 1 | 2 | 3;

interface VerifiedOrder {
  orderId: string;
  platform: string;
  service: string;
  quantity: number;
  link: string;
  daysSinceOrder: number;
  quality: string;
}

export default function ReclamationScreen() {
  const { isDark: ctxIsDark, toggleTheme } = useTheme();
  const isDark = ctxIsDark === true;
  const insets = useSafeAreaInsets();

  const C = useMemo(() => ({
    bg:            isDark ? DARK_BG         : LIGHT_BG,
    surface:       isDark ? DARK_SURFACE    : LIGHT_SURFACE,
    border:        isDark ? DARK_BORDER     : LIGHT_BORDER,
    separator:     isDark ? DARK_BORDER     : LIGHT_BORDER,
    text:          isDark ? DARK_TEXT       : LIGHT_TEXT,
    textSecondary: isDark ? DARK_TEXT_2     : LIGHT_TEXT_2,
    textMuted:     isDark ? DARK_TEXT_2     : LIGHT_TEXT_2,
    inputBg:       isDark ? DARK_INPUT_BG   : LIGHT_INPUT_BG,
    inputBorder:   isDark ? DARK_BORDER     : LIGHT_BORDER,
    iconBg:        isDark ? DARK_ICON_BG    : LIGHT_ICON_BG,
    iconBorder:    isDark ? DARK_ICON_BORD  : LIGHT_ICON_BORD,
    accent:        isDark ? GOLD            : NAVY,
    accentIcon:    isDark ? GOLD            : NAVY,
  }), [isDark]);

  const [step, setStep] = useState<Step>(1);
  const [orderInput, setOrderInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifiedOrder, setVerifiedOrder] = useState<VerifiedOrder | null>(null);
  const [verifyError, setVerifyError] = useState("");

  const [quantityLost, setQuantityLost] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reclamationId, setReclamationId] = useState("");

  async function handleVerify() {
    const id = orderInput.trim();
    if (!id) {
      setVerifyError("Veuillez entrer votre numéro de commande.");
      return;
    }
    setVerifying(true);
    setVerifyError("");
    setVerifiedOrder(null);

    try {
      const token = await getFreshToken();
      const r = await fetch(`${BASE_URL}api/claims/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: id }),
      });
      const data = await r.json();

      if (data.eligible) {
        setVerifiedOrder(data.order);
      } else {
        setVerifyError(data.reason ?? "Commande non éligible.");
        if (data.order) setVerifiedOrder(data.order);
      }
    } catch {
      setVerifyError("Impossible de joindre le serveur. Réessayez.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleSubmit() {
    const qty = Number(quantityLost);
    if (!qty || qty < 1) {
      Alert.alert("Champ requis", "Entrez le nombre d'éléments perdus.");
      return;
    }
    if (verifiedOrder && qty > verifiedOrder.quantity) {
      Alert.alert("Erreur", "La quantité perdue ne peut pas dépasser la quantité commandée.");
      return;
    }

    setSubmitting(true);
    try {
      const token = await getFreshToken();
      const r = await fetch(`${BASE_URL}api/claims/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orderId: verifiedOrder!.orderId,
          quantityLost: qty,
          description: description.trim(),
        }),
      });
      const data = await r.json();

      if (data.success) {
        setReclamationId(data.reclamationId ?? "");
        setStep(3);
      } else {
        Alert.alert("Erreur", data.error ?? "L'envoi a échoué. Réessayez.");
      }
    } catch {
      Alert.alert("Erreur", "Impossible de joindre le serveur. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  const goBack = () => {
    if (router.canGoBack?.()) router.back();
    else router.push("/(tabs)" as any);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style={isDark ? "light" : "dark"} />
      <StarBackground dark={isDark} />

      {/* Header */}
      <LinearGradient
        colors={isDark ? ["#132C57", "#0A1C3A"] : ["#FFFFFF", "#FBF8F1"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        {!isDark && <View style={styles.headerGoldLine} />}

        <Pressable
          onPress={goBack}
          style={({ pressed }) => [
            styles.backBtn,
            {
              backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(10,28,58,0.05)",
              borderColor: isDark ? "transparent" : LIGHT_BORDER,
              borderWidth: isDark ? 0 : 1,
            },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Feather name="chevron-left" size={20} color={isDark ? "#fff" : NAVY} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: isDark ? "#fff" : NAVY }]}>Réclamation</Text>
          <Text style={[styles.headerSub, { color: isDark ? "rgba(255,255,255,0.7)" : LIGHT_TEXT_2 }]}>
            Remplissage gratuit · Qualité premium
          </Text>
        </View>

        <Pressable
          onPress={() => { require("expo-haptics").selectionAsync(); toggleTheme(); }}
          style={({ pressed }) => [
            styles.backBtn,
            {
              backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(10,28,58,0.05)",
              borderColor: isDark ? "transparent" : LIGHT_BORDER,
              borderWidth: isDark ? 0 : 1,
            },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Feather name={isDark ? "sun" : "moon"} size={18} color={isDark ? GOLD : NAVY} />
        </Pressable>
      </LinearGradient>

      {/* Steps indicator */}
      <View style={[styles.stepsBar, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        {[
          { num: 1, label: "Vérifier" },
          { num: 2, label: "Détails" },
          { num: 3, label: "Envoyé" },
        ].map((s, i) => {
          const active = step === s.num;
          const done = step > s.num;
          const color = active ? C.accentIcon : done ? SUCCESS : C.textMuted;
          return (
            <View key={s.num} style={styles.stepItem}>
              <View style={[
                styles.stepDot,
                {
                  backgroundColor: active ? color : C.iconBg,
                  borderColor: color,
                },
              ]}>
                {done ? (
                  <Feather name="check" size={12} color="#fff" />
                ) : (
                  <Text style={{
                    fontFamily: "Inter_700Bold", fontSize: 12,
                    color: active ? (isDark ? "#0A1C3A" : "#FFFFFF") : color,
                  }}>
                    {s.num}
                  </Text>
                )}
              </View>
              <Text style={[styles.stepLabel, { color }]}>{s.label}</Text>
              {i < 2 && (
                <View style={[styles.stepLine, {
                  backgroundColor: done ? SUCCESS : C.border,
                }]} />
              )}
            </View>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Conditions */}
        {step === 1 && (
          <View style={[styles.condCard, {
            backgroundColor: SUCCESS + "10",
            borderColor: SUCCESS + "30",
          }]}>
            <View style={styles.condHeader}>
              <View style={[styles.condIconBox, { backgroundColor: SUCCESS + "18" }]}>
                <Feather name="check-circle" size={14} color={SUCCESS} />
              </View>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: SUCCESS }}>
                Conditions de réclamation
              </Text>
            </View>
            {[
              "Commande en qualité HQ, Élite, Premium ou Non-drop",
              "Réclamation dans les 30 jours après livraison",
              "Perte supérieure à 10% de la quantité commandée",
              "Remplissage effectué en 24–72 heures",
              "Une seule réclamation par commande",
            ].map((cond, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                <Feather name="check" size={13} color={SUCCESS} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: C.text, lineHeight: 18 }}>
                  {cond}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* STEP 1 */}
        {step === 1 && (
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.stepBadge, { backgroundColor: C.iconBg, borderColor: C.iconBorder }]}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: C.accentIcon }}>1</Text>
              </View>
              <Text style={[styles.stepTitle, { color: C.text }]}>Vérifier votre commande</Text>
            </View>

            <Text style={[styles.hint, { color: C.textMuted }]}>
              Entrez votre numéro de commande pour vérifier si elle est éligible au remplissage gratuit.
            </Text>

            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Numéro de commande</Text>
            <View style={[styles.inputRow, { backgroundColor: C.inputBg, borderColor: C.border }]}>
              <Feather name="hash" size={16} color={C.textMuted} />
              <TextInput
                style={[styles.input, { color: C.text }]}
                placeholder="Ex : SBH-STD-01700"
                placeholderTextColor={C.textMuted}
                value={orderInput}
                onChangeText={(t) => {
                  const clean = t
                    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
                    .replace(/\s+/g, "")
                    .toUpperCase();
                  setOrderInput(clean);
                  setVerifyError("");
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                spellCheck={false}
                keyboardType="default"
                textContentType="none"
              />
            </View>

            {verifyError ? (
              <View style={[styles.errorBox, {
                backgroundColor: DANGER + "10",
                borderColor: DANGER + "35",
              }]}>
                <Feather name="alert-circle" size={14} color={DANGER} />
                <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: DANGER, lineHeight: 17 }}>
                  {verifyError}
                </Text>
              </View>
            ) : null}

            {verifiedOrder && !verifyError && (
              <View style={[styles.orderDetails, {
                backgroundColor: INFO + "10",
                borderColor: INFO + "35",
              }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <Feather name="check-circle" size={16} color={INFO} />
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: INFO }}>
                    Commande éligible
                  </Text>
                </View>
                {[
                  { label: "Plateforme", value: verifiedOrder.platform },
                  { label: "Service", value: verifiedOrder.service },
                  { label: "Quantité", value: String(verifiedOrder.quantity) },
                  { label: "Qualité", value: verifiedOrder.quality ?? "Haute qualité" },
                  { label: "Ancienneté", value: `${verifiedOrder.daysSinceOrder} jour(s)` },
                  { label: "Lien", value: verifiedOrder.link },
                ].map(({ label, value }) => (
                  <View key={label} style={[styles.detailRow, { borderBottomColor: C.separator }]}>
                    <Text style={[styles.detailLabel, { color: C.textMuted }]}>{label}</Text>
                    <Text style={[styles.detailValue, { color: C.text }]} numberOfLines={1} ellipsizeMode="middle">
                      {value}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: isDark ? GOLD : NAVY, opacity: verifying ? 0.7 : 1 },
                pressed && { opacity: 0.9 },
              ]}
              onPress={handleVerify}
              disabled={verifying}
            >
              {verifying ? (
                <ActivityIndicator size="small" color={isDark ? "#000" : "#fff"} />
              ) : (
                <>
                  <Feather name="search" size={16} color={isDark ? "#000" : GOLD} />
                  <Text style={[styles.primaryBtnText, { color: isDark ? "#000" : "#fff" }]}>
                    Vérifier ma commande
                  </Text>
                </>
              )}
            </Pressable>

            {verifiedOrder && !verifyError && (
              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: SUCCESS, marginTop: 10 },
                  pressed && { opacity: 0.9 },
                ]}
                onPress={() => setStep(2)}
              >
                <Feather name="arrow-right" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>Continuer la réclamation</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* STEP 2 */}
        {step === 2 && verifiedOrder && (
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.stepBadge, { backgroundColor: C.iconBg, borderColor: C.iconBorder }]}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: C.accentIcon }}>2</Text>
              </View>
              <Text style={[styles.stepTitle, { color: C.text }]}>Détails de la réclamation</Text>
            </View>

            <View style={[styles.summaryBox, {
              backgroundColor: INFO + "10",
              borderColor: INFO + "35",
            }]}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: INFO, marginBottom: 6 }}>
                Résumé de votre commande
              </Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: C.text }}>
                {verifiedOrder.orderId} · {verifiedOrder.platform} · {verifiedOrder.quantity} unités
              </Text>
            </View>

            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
              Combien avez-vous perdu ? <Text style={{ color: DANGER }}>*</Text>
            </Text>
            <View style={[styles.inputRow, { backgroundColor: C.inputBg, borderColor: C.border }]}>
              <Feather name="trending-down" size={16} color={C.textMuted} />
              <TextInput
                style={[styles.input, { color: C.text }]}
                placeholder="Ex : 500"
                placeholderTextColor={C.textMuted}
                value={quantityLost}
                onChangeText={setQuantityLost}
                keyboardType="numeric"
              />
            </View>
            <Text style={[styles.hint, { color: C.textMuted, marginTop: -6 }]}>
              Entrez le nombre exact d'abonnés / likes / vues perdus.
            </Text>

            <Text style={[styles.fieldLabel, { color: C.textSecondary, marginTop: 14 }]}>
              Description (optionnel)
            </Text>
            <View style={[styles.textAreaRow, { backgroundColor: C.inputBg, borderColor: C.border }]}>
              <TextInput
                style={[styles.textArea, { color: C.text }]}
                placeholder="Décrivez votre situation si nécessaire…"
                placeholderTextColor={C.textMuted}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { borderColor: C.border, flex: 1 },
                  pressed && { opacity: 0.9 },
                ]}
                onPress={() => setStep(1)}
              >
                <Feather name="arrow-left" size={15} color={C.textMuted} />
                <Text style={[styles.secondaryBtnText, { color: C.textMuted }]}>Retour</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: SUCCESS, flex: 2, opacity: submitting ? 0.7 : 1 },
                  pressed && { opacity: 0.9 },
                ]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Feather name="send" size={15} color="#fff" />
                    <Text style={styles.primaryBtnText}>Envoyer la réclamation</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <View style={[styles.successCard, {
            backgroundColor: SUCCESS + "10",
            borderColor: SUCCESS + "40",
          }]}>
            <View style={[styles.successIcon, { backgroundColor: SUCCESS + "18" }]}>
              <Feather name="check-circle" size={48} color={SUCCESS} />
            </View>
            <Text style={[styles.successTitle, { color: C.text }]}>Réclamation envoyée !</Text>
            <Text style={[styles.successSub, { color: C.textMuted }]}>
              Notre équipe va traiter votre demande dans les 24 à 72 heures.
            </Text>
            {reclamationId ? (
              <View style={[styles.recIdBox, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: C.textMuted }}>
                  ID Réclamation
                </Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: C.text }}>
                  {reclamationId}
                </Text>
              </View>
            ) : null}
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: isDark ? GOLD : NAVY, marginTop: 20 },
                pressed && { opacity: 0.9 },
              ]}
              onPress={() => router.replace("/(tabs)/new-order")}
            >
              <Feather name="shopping-cart" size={16} color={isDark ? "#000" : GOLD} />
              <Text style={[styles.primaryBtnText, { color: isDark ? "#000" : "#fff" }]}>
                Retour aux commandes
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
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
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 18, letterSpacing: -0.2 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },

  stepsBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  stepItem: { flexDirection: "row", alignItems: "center", flex: 1 },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center", borderWidth: 1.5,
  },
  stepLabel: {
    fontFamily: "Inter_600SemiBold", fontSize: 11,
    marginLeft: 8,
  },
  stepLine: { flex: 1, height: 1.5, marginHorizontal: 8 },

  content: { padding: 14, gap: 14 },

  condCard: {
    borderRadius: 16, borderWidth: 1.5, padding: 14,
  },
  condHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  condIconBox: {
    width: 26, height: 26, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },

  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepBadge: {
    width: 26, height: 26, borderRadius: 9,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  stepTitle: {
    fontFamily: "Inter_700Bold", fontSize: 15,
    letterSpacing: -0.1,
  },
  fieldLabel: {
    fontFamily: "Inter_500Medium", fontSize: 13, marginBottom: 4,
  },
  inputRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 12,
  },
  input: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 11.5, lineHeight: 16 },
  textAreaRow: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    minHeight: 90,
  },
  textArea: {
    fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20,
  },
  errorBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderWidth: 1, borderRadius: 10, padding: 10,
  },
  orderDetails: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  detailRow: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailLabel: { fontFamily: "Inter_400Regular", fontSize: 12, flex: 1 },
  detailValue: {
    fontFamily: "Inter_600SemiBold", fontSize: 12,
    flex: 2, textAlign: "right",
  },
  summaryBox: { borderWidth: 1, borderRadius: 10, padding: 12 },

  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 12, paddingVertical: 14,
  },
  primaryBtnText: {
    fontFamily: "Inter_700Bold", fontSize: 14,
    color: "#fff", letterSpacing: 0.1,
  },
  secondaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, borderRadius: 12, borderWidth: 1, paddingVertical: 14,
  },
  secondaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  successCard: {
    borderWidth: 1, borderRadius: 20, padding: 28,
    alignItems: "center", gap: 12, marginTop: 20,
  },
  successIcon: {
    width: 84, height: 84, borderRadius: 42,
    alignItems: "center", justifyContent: "center",
  },
  successTitle: {
    fontFamily: "Inter_700Bold", fontSize: 20,
    textAlign: "center", letterSpacing: -0.2,
  },
  successSub: {
    fontFamily: "Inter_400Regular", fontSize: 14,
    textAlign: "center", lineHeight: 20,
  },
  recIdBox: {
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 10,
    alignItems: "center", gap: 2, marginTop: 6,
  },
});