import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
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

import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useOrders } from "@/context/OrdersContext";
import { SERVICES, Service, ServiceOption, formatPrice, getServiceById } from "@/data/services";
import type { FeatherName } from "@/types/icons";

const PLATFORM_ICON_MAP: Record<string, FeatherName> = {
  instagram: "instagram",
  tiktok: "music",
  youtube: "youtube",
  facebook: "facebook",
  twitter: "twitter",
  telegram: "send",
  whatsapp: "message-circle",
  spotify: "headphones",
};

export default function OrderServiceScreen() {
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { createOrder } = useOrders();

  const service = getServiceById(serviceId ?? "");

  const [selectedOption, setSelectedOption] = useState<ServiceOption | null>(
    service?.options[0] ?? null
  );
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!service) {
    return (
      <View style={styles.errorContainer}>
        <Feather name="alert-circle" size={40} color={Colors.error} />
        <Text style={styles.errorMsg}>Service introuvable</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Retour</Text>
        </Pressable>
      </View>
    );
  }

  const handleOrder = async () => {
    if (!link.trim()) {
      setError("Veuillez entrer le lien vers votre compte ou contenu");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (!selectedOption) {
      setError("Veuillez sélectionner une quantité");
      return;
    }
    if (!user) {
      router.push("/auth/login");
      return;
    }

    setError("");
    setLoading(true);
    try {
      await createOrder({
        serviceId: service.id,
        serviceName: service.name,
        platform: service.platform,
        platformColor: service.platformColor,
        type: service.type,
        quantity: selectedOption.quantity,
        price: selectedOption.price,
        link: link.trim(),
        userId: user.id,
      });
      setLoading(false);
      setSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => {
        router.replace("/(tabs)/orders");
      }, 2000);
    } catch (e: unknown) {
      setLoading(false);
      const msg = e instanceof Error ? e.message : "Erreur lors de la création de la commande";
      setError(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  if (success) {
    return (
      <View style={[styles.successContainer, { backgroundColor: Colors.background }]}>
        <LinearGradient
          colors={[Colors.success + "22", Colors.background]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
        <View style={styles.successIconCircle}>
          <Feather name="check-circle" size={56} color={Colors.success} />
        </View>
        <Text style={styles.successTitle}>Commande passée !</Text>
        <Text style={styles.successText}>
          Votre commande de {selectedOption?.quantity.toLocaleString()} {service.type.toLowerCase()} a été enregistrée.{"\n"}Livraison : {service.deliveryTime}
        </Text>
        <View style={styles.successPrice}>
          <Text style={styles.successPriceText}>{formatPrice(selectedOption?.price ?? 0)}</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <LinearGradient
        colors={[...service.gradient] as [string, string]}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Feather name="x" size={20} color="#fff" />
        </Pressable>
        <View style={styles.headerContent}>
          <View style={styles.headerIconCircle}>
            <Feather name={PLATFORM_ICON_MAP[service.platform] ?? "star"} size={28} color="#fff" />
          </View>
          <Text style={styles.headerName}>{service.name}</Text>
          <View style={styles.headerBadgeRow}>
            <View style={styles.headerBadge}>
              <Feather name="clock" size={12} color="rgba(255,255,255,0.9)" />
              <Text style={styles.headerBadgeText}>{service.deliveryTime}</Text>
            </View>
            <View style={styles.headerBadge}>
              <Feather name="shield" size={12} color="rgba(255,255,255,0.9)" />
              <Text style={styles.headerBadgeText}>Sécurisé</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>Choisissez la quantité</Text>
        <View style={styles.optionsGrid}>
          {service.options.map((option) => (
            <Pressable
              key={option.quantity}
              style={[
                styles.optionCard,
                selectedOption?.quantity === option.quantity && styles.optionCardSelected,
              ]}
              onPress={() => {
                setSelectedOption(option);
                Haptics.selectionAsync();
              }}
            >
              {option.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>Populaire</Text>
                </View>
              )}
              <Text
                style={[
                  styles.optionQuantity,
                  selectedOption?.quantity === option.quantity && { color: Colors.accent },
                ]}
              >
                {option.quantity.toLocaleString()}
              </Text>
              <Text style={styles.optionType}>{service.type}</Text>
              <Text
                style={[
                  styles.optionPrice,
                  selectedOption?.quantity === option.quantity && { color: Colors.warning },
                ]}
              >
                {formatPrice(option.price)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Lien de votre compte / contenu</Text>
        <View style={styles.inputWrapper}>
          <Feather name="link" size={18} color={Colors.textMuted} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="ex: https://instagram.com/votrecompte"
            placeholderTextColor={Colors.textMuted}
            value={link}
            onChangeText={(v) => { setLink(v); setError(""); }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>
        <Text style={styles.inputHint}>
          Entrez l'URL de votre profil, page ou contenu spécifique
        </Text>

        {error ? (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={14} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {selectedOption && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Récapitulatif</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryKey}>Service</Text>
              <Text style={styles.summaryValue}>{service.name}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryKey}>Quantité</Text>
              <Text style={styles.summaryValue}>{selectedOption.quantity.toLocaleString()} {service.type}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryKey}>Livraison</Text>
              <Text style={styles.summaryValue}>{service.deliveryTime}</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryTotalRow]}>
              <Text style={styles.summaryKey}>Total</Text>
              <Text style={styles.summaryTotal}>{formatPrice(selectedOption.price)}</Text>
            </View>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.orderBtn,
            pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
            loading && { opacity: 0.7 },
          ]}
          onPress={handleOrder}
          disabled={loading}
        >
          <LinearGradient
            colors={[...service.gradient] as [string, string]}
            style={styles.orderBtnGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Feather name="shopping-cart" size={18} color="#fff" />
            <Text style={styles.orderBtnText}>
              {loading ? "Traitement..." : "Commander maintenant"}
            </Text>
          </LinearGradient>
        </Pressable>

        <View style={styles.paymentInfo}>
          <Feather name="info" size={14} color={Colors.textMuted} />
          <Text style={styles.paymentInfoText}>
            Le paiement s'effectue via WhatsApp après confirmation. Notre équipe vous contactera rapidement.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: 24,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 20,
    marginBottom: 12,
  },
  headerContent: {
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 8,
  },
  headerIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerName: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: "#fff",
    textAlign: "center",
  },
  headerBadgeRow: {
    flexDirection: "row",
    gap: 8,
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headerBadgeText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.9)",
  },
  content: {
    padding: 20,
    gap: 16,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: Colors.text,
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  optionCard: {
    width: "47%",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    alignItems: "center",
    gap: 4,
    position: "relative",
  },
  optionCardSelected: {
    borderColor: Colors.accent,
    backgroundColor: "rgba(30,144,255,0.08)",
  },
  popularBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: Colors.warning,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  popularBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    color: "#000",
  },
  optionQuantity: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  optionType: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  optionPrice: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  inputHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: -8,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,107,107,0.12)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,107,107,0.3)",
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.error,
    flex: 1,
  },
  summaryCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 10,
  },
  summaryTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.text,
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryTotalRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.separator,
  },
  summaryKey: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  summaryTotal: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.warning,
  },
  orderBtn: {
    borderRadius: 16,
    overflow: "hidden",
  },
  orderBtnGradient: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  orderBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
  },
  paymentInfo: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  paymentInfoText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    flex: 1,
    lineHeight: 18,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  errorMsg: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: Colors.text,
  },
  backBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
  successContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 40,
  },
  successIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(76,175,80,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(76,175,80,0.3)",
  },
  successTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    color: Colors.text,
    textAlign: "center",
  },
  successText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },
  successPrice: {
    backgroundColor: "rgba(255,215,0,0.12)",
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.3)",
  },
  successPriceText: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.warning,
  },
});
