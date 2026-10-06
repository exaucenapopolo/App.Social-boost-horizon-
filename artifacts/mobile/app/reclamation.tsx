import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
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

import { useTheme } from "@/context/ThemeContext";
import { BASE_URL } from "@/services/api";
import { getFreshToken } from "@/services/tokenStore";

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
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>(1);
  const [orderInput, setOrderInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifiedOrder, setVerifiedOrder] = useState<VerifiedOrder | null>(null);
  const [verifyError, setVerifyError] = useState("");

  const [quantityLost, setQuantityLost] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reclamationId, setReclamationId] = useState("");

  const c = colors;

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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* ── Header ── */}
      <LinearGradient
        colors={[c.gradientStart ?? "#1A237E", c.gradientEnd ?? "#6C3AF5"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Réclamation</Text>
          <Text style={styles.headerSub}>Remplissage gratuit · Haute qualité</Text>
        </View>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>{step}/3</Text>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Conditions card ── */}
        {step === 1 && (
          <View style={[styles.condCard, { backgroundColor: "#10A37F12", borderColor: "#10A37F35" }]}>
            <View style={styles.condHeader}>
              <Feather name="check-circle" size={16} color="#10A37F" />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#10A37F" }}>
                Conditions pour une réclamation
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
                <Feather name="check" size={13} color="#10A37F" style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: c.text, lineHeight: 18 }}>{cond}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ══════════════════════════════════════════════
            STEP 1 — Verify order
        ══════════════════════════════════════════════ */}
        {step === 1 && (
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
            <Text style={[styles.stepTitle, { color: c.text }]}>
              <Text style={{ color: c.accent }}>Étape 1</Text> — Vérifier votre commande
            </Text>
            <Text style={[styles.fieldLabel, { color: c.textMuted }]}>Numéro de commande</Text>
            <View style={[styles.inputRow, { backgroundColor: c.inputBg, borderColor: c.cardBorder }]}>
              <Feather name="hash" size={16} color={c.textMuted} />
              <TextInput
                style={[styles.input, { color: c.text }]}
                placeholder="Ex : SBH-STD-01700"
                placeholderTextColor={c.textMuted}
                value={orderInput}
                onChangeText={(t) => {
                  // Strip invisible chars, normalize spaces, uppercase
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
              <View style={[styles.errorBox, { backgroundColor: "#FF572210", borderColor: "#FF572240" }]}>
                <Feather name="alert-circle" size={14} color="#FF5722" />
                <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: "#FF5722", lineHeight: 17 }}>
                  {verifyError}
                </Text>
              </View>
            ) : null}

            {verifiedOrder && !verifyError && (
              <View style={[styles.orderDetails, { backgroundColor: "#2196F310", borderColor: "#2196F340" }]}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#2196F3", marginBottom: 10 }}>
                  ✅ Commande éligible au remplissage
                </Text>
                {[
                  { label: "Plateforme", value: verifiedOrder.platform },
                  { label: "Service", value: verifiedOrder.service },
                  { label: "Quantité", value: String(verifiedOrder.quantity) },
                  { label: "Qualité", value: verifiedOrder.quality ?? "Haute qualité" },
                  { label: "Ancienneté", value: `${verifiedOrder.daysSinceOrder} jour(s)` },
                  { label: "Lien", value: verifiedOrder.link },
                ].map(({ label, value }) => (
                  <View key={label} style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: c.textMuted }]}>{label}</Text>
                    <Text style={[styles.detailValue, { color: c.text }]} numberOfLines={1} ellipsizeMode="middle">
                      {value}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <Pressable
              style={[styles.primaryBtn, { backgroundColor: c.accent, opacity: verifying ? 0.7 : 1 }]}
              onPress={handleVerify}
              disabled={verifying}
            >
              {verifying ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="search" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>Vérifier ma commande</Text>
                </>
              )}
            </Pressable>

            {verifiedOrder && !verifyError && (
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: "#10A37F", marginTop: 10 }]}
                onPress={() => setStep(2)}
              >
                <Feather name="arrow-right" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>Continuer la réclamation</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════════
            STEP 2 — Claim details
        ══════════════════════════════════════════════ */}
        {step === 2 && verifiedOrder && (
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
            <Text style={[styles.stepTitle, { color: c.text }]}>
              <Text style={{ color: c.accent }}>Étape 2</Text> — Détails de la réclamation
            </Text>

            <View style={[styles.summaryBox, { backgroundColor: "#2196F310", borderColor: "#2196F340" }]}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#2196F3", marginBottom: 6 }}>
                Résumé de votre commande
              </Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: c.text }}>
                {verifiedOrder.orderId} · {verifiedOrder.platform} · {verifiedOrder.quantity} unités
              </Text>
            </View>

            <Text style={[styles.fieldLabel, { color: c.textMuted }]}>
              Combien avez-vous perdu ? <Text style={{ color: c.accent }}>*</Text>
            </Text>
            <View style={[styles.inputRow, { backgroundColor: c.inputBg, borderColor: c.cardBorder }]}>
              <Feather name="trending-down" size={16} color={c.textMuted} />
              <TextInput
                style={[styles.input, { color: c.text }]}
                placeholder="Ex : 500"
                placeholderTextColor={c.textMuted}
                value={quantityLost}
                onChangeText={setQuantityLost}
                keyboardType="numeric"
              />
            </View>
            <Text style={[styles.hint, { color: c.textMuted }]}>
              Entrez le nombre exact d'abonnés / likes / vues perdus.
            </Text>

            <Text style={[styles.fieldLabel, { color: c.textMuted, marginTop: 14 }]}>
              Description (optionnel)
            </Text>
            <View style={[styles.textAreaRow, { backgroundColor: c.inputBg, borderColor: c.cardBorder }]}>
              <TextInput
                style={[styles.textArea, { color: c.text }]}
                placeholder="Décrivez votre situation si nécessaire…"
                placeholderTextColor={c.textMuted}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable
                style={[styles.secondaryBtn, { borderColor: c.cardBorder, flex: 1 }]}
                onPress={() => setStep(1)}
              >
                <Feather name="arrow-left" size={15} color={c.textMuted} />
                <Text style={[styles.secondaryBtnText, { color: c.textMuted }]}>Retour</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: "#10A37F", flex: 2, opacity: submitting ? 0.7 : 1 }]}
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

        {/* ══════════════════════════════════════════════
            STEP 3 — Success
        ══════════════════════════════════════════════ */}
        {step === 3 && (
          <View style={[styles.successCard, { backgroundColor: "#10A37F10", borderColor: "#10A37F40" }]}>
            <View style={styles.successIcon}>
              <Feather name="check-circle" size={48} color="#10A37F" />
            </View>
            <Text style={[styles.successTitle, { color: c.text }]}>Réclamation envoyée !</Text>
            <Text style={[styles.successSub, { color: c.textMuted }]}>
              Notre équipe va traiter votre demande dans les 24 à 72 heures.
            </Text>
            {reclamationId ? (
              <View style={[styles.recIdBox, { backgroundColor: c.inputBg }]}>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: c.textMuted }}>
                  ID Réclamation
                </Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: c.text }}>
                  {reclamationId}
                </Text>
              </View>
            ) : null}
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: c.accent, marginTop: 20 }]}
              onPress={() => router.replace("/(tabs)/new-order")}
            >
              <Feather name="home" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>Retour aux commandes</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: "#fff" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 1 },
  stepBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  stepBadgeText: { fontFamily: "Inter_700Bold", fontSize: 13, color: "#fff" },

  content: { padding: 14, gap: 14 },

  condCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  condHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  stepTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    marginBottom: 4,
  },
  fieldLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    marginBottom: 4,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  input: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
    marginTop: -6,
  },
  textAreaRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 80,
  },
  textArea: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 20,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  orderDetails: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  detailLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    flex: 1,
  },
  detailValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    flex: 2,
    textAlign: "right",
  },
  summaryBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 13,
  },
  primaryBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#fff",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 13,
  },
  secondaryBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  successCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    gap: 12,
    marginTop: 20,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#10A37F18",
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    textAlign: "center",
  },
  successSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  recIdBox: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: "center",
    gap: 2,
  },
});
