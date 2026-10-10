import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { COUNTRIES, formatCurrency } from "@/lib/countries";
import { BASE_URL } from "@/services/api";
import { getFreshToken } from "@/services/tokenStore";

// ═══════════════════════════════════════════════════════════════
//  CHARTE GRAPHIQUE
// ═══════════════════════════════════════════════════════════════
const NAVY        = "#0A1C3A";
const NAVY_LIGHT  = "#152E54";
const GOLD        = "#D4AF37";
const GOLD_SOFT   = "#C6A15B";

const LIGHT_SURFACE   = "#FFFFFF";
const LIGHT_TEXT      = "#1A202C";
const LIGHT_TEXT_2    = "#718096";
const LIGHT_BORDER    = "rgba(10,28,58,0.08)";
const LIGHT_INPUT_BG  = "#F5F6F8";

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

// ─── Données ───
const PORTFOLIO_SITES = [
  { name: "Likéo Boost", country: "Cameroun", badge: "Agence", url: "https://likeo-boostsbh.vercel.app/" },
  { name: "Boosteph", country: "Cameroun", badge: "Agence", url: "https://boosteph-sbh.vercel.app/" },
  { name: "Madil Boost", country: "Cameroun", badge: "Agence", url: "https://madil-boost-sbh.netlify.app/" },
  { name: "Sedeck Boost", country: "RDC", badge: "Agence", url: "https://sedeck-boost-shb.netlify.app/" },
  { name: "Gramcharts", country: "France", badge: "Musique", url: "https://gram-charts-sbh.vercel.app/" },
  { name: "CINEXAU PRODUCTION", country: "Cameroun", badge: "Musique", url: "https://cinexau-production-sbh.netlify.app/" },
  { name: "Zone Muzik", country: "États-Unis", badge: "Musique", url: "https://zonemusik.netlify.app/" },
  { name: "BLOWEARN AGENCIES", country: "Cameroun", badge: "Affiliation", url: "https://blowearn-agencies.vercel.app/" },
  { name: "Earnesia Group", country: "Kenya", badge: "Affiliation", url: "https://earnesia-group.vercel.app/" },
  { name: "Mulaflowr AGENCIES", country: "Bénin", badge: "Affiliation", url: "https://mulaflowr-agencies.vercel.app/" },
  { name: "Maestro Speed", country: "Afrique", badge: "Livraison", url: "https://maestro-speed-watsh-scavengers-sbh.netlify.app/" },
  { name: "Maestro Food", country: "Cameroun", badge: "Restaurant", url: "https://maestro-food.netlify.app/" },
  { name: "Viralix", country: "Canada", badge: "Média", url: "https://viralix-sbh.netlify.app/" },
];

const SITE_TYPES = [
  { label: "Site vitrine simple", fcfa: 30000 },
  { label: "Site vitrine professionnel", fcfa: 50000 },
  { label: "E-commerce basique", fcfa: 100000 },
  { label: "E-commerce professionnel", fcfa: 200000 },
  { label: "E-commerce avancé", fcfa: 400000 },
  { label: "Site sur mesure / complexe", fcfa: 500000 },
];

const DEADLINES = ["2 semaines", "4 semaines", "6 semaines", "8 semaines", "3 mois+"];

const APP_PACKAGES = [
  { label: "Application simple", fcfa: 75000 },
  { label: "Application standard", fcfa: 100000 },
  { label: "Jeu vidéo simple", fcfa: 150000 },
  { label: "Application avancée", fcfa: 350000 },
  { label: "Application complexe", fcfa: 1000000 },
];

const APP_PLATFORMS = ["Android", "iOS", "Android + iOS"];

const AD_DURATIONS = [
  { label: "1 jour", fcfa: 2000 },
  { label: "3 jours", fcfa: 5500 },
  { label: "7 jours", fcfa: 12500 },
  { label: "1 mois", fcfa: 55000 },
];

const ACCOUNT_SERVICES = [
  { label: "Canva Pro", fcfa: 950 },
  { label: "Compte PayPal éligible", fcfa: 10000 },
  { label: "Page Facebook professionnelle", fcfa: 5500 },
  { label: "Compte TikTok monétisable", fcfa: 3500 },
  { label: "Compte Instagram", fcfa: 4500 },
  { label: "Chaîne YouTube", fcfa: 10000 },
  { label: "Badge vérifié", fcfa: 15500 },
];

const TIKTOK_COUNTRIES = [
  "États-Unis", "Royaume-Uni", "France", "Allemagne", "Canada",
  "Australie", "Brésil", "Mexique", "Espagne", "Italie",
  "Japon", "Corée du Sud", "Indonésie", "Thaïlande", "Vietnam",
];

const BADGE_PLATFORMS = ["Facebook", "Instagram", "TikTok", "YouTube", "Twitter/X"];

const FEATURED_EXTERNAL = [
  {
    id: "foreign-number",
    icon: "phone-call" as const,
    label: "Numéro étranger",
    sub: "WhatsApp · TikTok · +5000 services",
    badge: "Partenariat",
    url: "https://www.texerra.site/",
    info: {
      title: "Acheter un numéro étranger",
      description:
        "Via notre partenaire Texerra SMS, commandez un numéro de téléphone virtuel dans plus de 205 pays, pour WhatsApp, TikTok, Instagram, Facebook, YouTube et bien plus.",
      bullets: [
        "WhatsApp, TikTok, Instagram, Facebook, YouTube et +5000 services",
        "Disponible dans +205 pays, aucun pays exclu",
        "Rechargez votre compte et commandez sans restriction",
        "Utile pour le business, la vérification de comptes ou un usage personnel",
      ],
      cta: "Découvrir Texerra SMS",
    },
  },
  {
    id: "earn-online",
    icon: "trending-up" as const,
    label: "Gagner de l'argent",
    sub: "Affiliation · Formations offertes",
    badge: "Nouveau",
    url: "https://www.trixhub.store/?ref=EXA0001HJB",
    info: {
      title: "Gagner de l'argent en ligne",
      description:
        "Une plateforme d'affiliation complète : invitez des amis, accomplissez des missions simples et recevez des formations gratuites dès votre inscription.",
      bullets: [
        "Marketing d'affiliation : invitez et gagnez des commissions",
        "Regardez des vidéos, lisez des articles, partagez et gagnez",
        "Formations 100% gratuites offertes dès l'inscription",
        "Cadeau de bienvenue : abonnement Canal+ offert par la plateforme",
      ],
      cta: "Rejoindre TrixHub",
    },
  },
];

// ═══════════════════════════════════════════════════════════════
//  ABONNEMENTS À VIE — Textes nettoyés, plus de détails techniques
// ═══════════════════════════════════════════════════════════════
interface LifetimeSubscription {
  id: string;
  icon: any;
  label: string;
  sub: string;
  badge: string;
  fcfa: number;
  accent: string;
  info: {
    title: string;
    description: string;
    bullets: string[];
    note?: string;
  };
}

const LIFETIME_SUBSCRIPTIONS: LifetimeSubscription[] = [
  {
    id: "canal-lifetime",
    icon: "tv" as const,
    label: "Canal+ à vie",
    sub: "Toutes les chaînes · Séries · Films",
    badge: "À vie",
    fcfa: 3600,
    accent: "#E11D48",
    info: {
      title: "Canal+ à vie",
      description:
        "Profitez de toutes les chaînes Canal+ ainsi que Netflix, séries et films. À installer sur votre téléphone, votre ordinateur ou votre télévision.",
      bullets: [
        "Installable sur téléphone, ordinateur et télévision",
        "Toutes les chaînes Canal+ incluses",
        "Netflix, séries, films et bien plus encore",
        "Accès à vie, aucun renouvellement à payer",
      ],
      note:
        "Votre solde doit être suffisant pour lancer la commande. Le montant ne sera débité qu'à la réception de votre accès.",
    },
  },
  {
    id: "netflix-lifetime",
    icon: "play-circle" as const,
    label: "Netflix à vie",
    sub: "Android · Toutes les chaînes · Films",
    badge: "À vie",
    fcfa: 2500,
    accent: "#E50914",
    info: {
      title: "Netflix à vie",
      description:
        "Regardez toutes les chaînes Canal+, Netflix, séries et films sans aucune déconnexion. À installer directement sur votre téléphone Android.",
      bullets: [
        "Disponible sur Android (téléphone)",
        "Toutes les chaînes Canal+ et Netflix incluses",
        "Séries, films, contenus exclusifs",
        "Aucune déconnexion pendant le visionnage",
        "Accès à vie, aucun renouvellement à payer",
      ],
      note:
        "Votre solde doit être suffisant pour lancer la commande. Le montant ne sera débité qu'à la réception de votre accès.",
    },
  },
];

const MODAL_SERVICES = [
  { id: "website",  icon: "globe"      as const, label: "Site web",        sub: "Vitrine · E-commerce" },
  { id: "app",      icon: "smartphone" as const, label: "Application",     sub: "Android · iOS" },
  { id: "ads",      icon: "radio"      as const, label: "Campagnes pubs",  sub: "Facebook · Instagram" },
  { id: "accounts", icon: "award"      as const, label: "Comptes premium", sub: "Canva · PayPal · TikTok" },
];

async function postServiceRequest(
  serviceType: string,
  fields: Record<string, string>,
  waCode: string,
  waPhone: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getFreshToken();
    if (!token) return { success: false, error: "Non authentifié. Reconnectez-vous." };
    const res = await fetch(`${BASE_URL}api/support/service-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        serviceType, fields,
        whatsappCountryCode: waCode,
        whatsappPhone: waPhone,
      }),
    });
    return await res.json();
  } catch (e: any) {
    console.error("[service-request] erreur réseau:", e?.message ?? e);
    return { success: false, error: "Erreur réseau. Vérifiez votre connexion." };
  }
}

type ModalBaseProps = {
  visible: boolean;
  onClose: () => void;
  theme: any;
  priceFmt: (fcfa: number) => string;
};

// ═══════════════════════════════════════════════════════════════
//  AppModal — Modale personnalisée premium
// ═══════════════════════════════════════════════════════════════
type ModalKind = "info" | "success" | "warning" | "error";

interface AppModalButton {
  label: string;
  onPress?: () => void;
  style?: "primary" | "danger" | "cancel";
}

interface AppModalConfig {
  kind: ModalKind;
  title: string;
  message?: string;
  buttons?: AppModalButton[];
}

const APP_MODAL_META: Record<ModalKind, { icon: any; color: string; bg: string }> = {
  info:    { icon: "info",           color: INFO,    bg: "rgba(59,130,246,0.14)"  },
  success: { icon: "check-circle",   color: SUCCESS, bg: "rgba(16,185,129,0.14)"  },
  warning: { icon: "alert-triangle", color: WARNING, bg: "rgba(245,158,11,0.14)"  },
  error:   { icon: "x-circle",       color: DANGER,  bg: "rgba(239,68,68,0.14)"   },
};

function AppModal({
  config, onClose,
}: {
  config: AppModalConfig | null;
  onClose: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const visible = !!config;
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.9, duration: 150, useNativeDriver: true }),
      ]).start(() => setRendered(false));
    }
  }, [visible]);

  if (!rendered || !config) return null;

  const meta = APP_MODAL_META[config.kind] ?? APP_MODAL_META.info;
  const buttons: AppModalButton[] =
    config.buttons && config.buttons.length > 0
      ? config.buttons
      : [{ label: "OK", style: "primary" }];

  const stacked = buttons.length > 2;

  const handlePress = (btn: AppModalButton) => {
    Haptics.selectionAsync();
    onClose();
    if (btn.onPress) setTimeout(btn.onPress, 180);
  };

  return (
    <Modal transparent visible={rendered} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[amStyles.backdrop, { opacity: fadeAnim }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <Animated.View style={[amStyles.card, { transform: [{ scale: scaleAnim }] }]}>
          <View style={[amStyles.iconWrap, { backgroundColor: meta.bg }]}>
            <Feather name={meta.icon} size={30} color={meta.color} />
          </View>
          <Text style={amStyles.title}>{config.title}</Text>
          {config.message ? <Text style={amStyles.message}>{config.message}</Text> : null}
          <View style={[amStyles.actions, stacked && { flexDirection: "column" }]}>
            {buttons.map((btn, i) => {
              const st = btn.style ?? (buttons.length === 1 ? "primary" : i === 0 ? "primary" : "cancel");
              const bg =
                st === "primary" ? GOLD :
                st === "danger"  ? DANGER :
                "rgba(255,255,255,0.10)";
              const fg = st === "cancel" ? "#E2E8F0" : "#080E1A";
              return (
                <Pressable
                  key={i}
                  onPress={() => handlePress(btn)}
                  style={({ pressed }) => [
                    amStyles.btn,
                    stacked ? { width: "100%" } : { flex: 1 },
                    { backgroundColor: bg },
                    pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <Text style={[amStyles.btnText, { color: fg }]} numberOfLines={1}>
                    {btn.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function useAppModal() {
  const [config, setConfig] = useState<AppModalConfig | null>(null);
  const show = useCallback((c: AppModalConfig) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setConfig(c);
  }, []);
  const hide = useCallback(() => setConfig(null), []);
  const modalEl = <AppModal config={config} onClose={hide} />;
  return { show, hide, modalEl };
}

const amStyles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(4,10,22,0.72)",
    alignItems: "center", justifyContent: "center", padding: 24,
  },
  card: {
    width: "100%", maxWidth: 400,
    backgroundColor: "#0F1B33",
    borderRadius: 24, paddingVertical: 28, paddingHorizontal: 24,
    alignItems: "center",
    borderWidth: 1, borderColor: "rgba(212,175,55,0.22)",
    shadowColor: "#000", shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5, shadowRadius: 40, elevation: 20,
  },
  iconWrap: {
    width: 66, height: 66, borderRadius: 33,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  title: {
    fontFamily: "Inter_700Bold", fontSize: 18, color: "#FFFFFF",
    textAlign: "center", letterSpacing: -0.2, marginBottom: 8,
  },
  message: {
    fontFamily: "Inter_400Regular", fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center", lineHeight: 20, marginBottom: 22,
  },
  actions: { flexDirection: "row", gap: 10, width: "100%", marginTop: 4 },
  btn: { paddingVertical: 13, paddingHorizontal: 16, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnText: { fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 0.1 },
});

// ─── Animation press ───
function usePressSpring() {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = useCallback(() => {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  }, []);
  const onPressOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 6 }).start();
  }, []);
  return { scale, onPressIn, onPressOut };
}

// ─── Champs réutilisables ───
function FieldInput({
  label, value, onChange, placeholder, multiline, keyboardType, theme,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
  multiline?: boolean; keyboardType?: any; theme: any;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12.5, color: theme.textSecondary, letterSpacing: 0.1 }}>
        {label}
      </Text>
      <TextInput
        style={[
          ms.input,
          {
            color: theme.text,
            backgroundColor: theme.inputBg,
            borderColor: theme.inputBorder,
            ...(multiline ? { height: 88, textAlignVertical: "top", paddingTop: 12 } : {}),
          },
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        multiline={multiline}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize="none"
      />
    </View>
  );
}

function TagRow({
  label, value, options, onSelect, theme,
}: {
  label: string; value: string; options: string[]; onSelect: (v: string) => void; theme: any;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12.5, color: theme.textSecondary, letterSpacing: 0.1 }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((opt) => (
          <Pressable
            key={opt}
            onPress={() => onSelect(opt)}
            style={({ pressed }) => [
              ms.tag,
              {
                backgroundColor: value === opt ? theme.accent : theme.inputBg,
                borderColor: value === opt ? theme.accent : theme.inputBorder,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 12.5,
                color: value === opt ? "#fff" : theme.textSecondary,
              }}
            >
              {opt}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ModalShell({
  visible, onClose, title, icon, children, theme,
}: {
  visible: boolean; onClose: () => void; title: string; icon: any; children: React.ReactNode; theme: any;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={ms.overlay}>
          <View
            style={[
              ms.sheet,
              { backgroundColor: theme.surface, paddingBottom: insets.bottom + 10 },
            ]}
          >
            <View style={ms.grabber} />
            <View style={[ms.sheetHeader, { borderBottomColor: theme.separator }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                <View
                  style={[ms.sheetIconBox, { backgroundColor: theme.iconBg, borderColor: theme.iconBorder }]}
                >
                  <Feather name={icon} size={18} color={theme.accentIcon} />
                </View>
                <Text style={[ms.sheetTitle, { color: theme.text }]} numberOfLines={1}>
                  {title}
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                style={[ms.closeBtn, { backgroundColor: theme.inputBg }]}
              >
                <Feather name="x" size={18} color={theme.text} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SuccessScreen({ onClose, theme }: { onClose: () => void; theme: any }) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }),
      Animated.timing(opacity, { toValue: 1, duration: 320, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start();
  }, []);
  return (
    <View style={{ alignItems: "center", gap: 16, paddingVertical: 30 }}>
      <Animated.View
        style={[
          ms.successIcon,
          { backgroundColor: "rgba(16,185,129,0.10)", borderColor: "rgba(16,185,129,0.25)" },
          { transform: [{ scale }], opacity },
        ]}
      >
        <Feather name="check" size={32} color={SUCCESS} />
      </Animated.View>
      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 20, color: theme.text, textAlign: "center", letterSpacing: -0.2 }}>
        Demande envoyée
      </Text>
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: theme.textMuted, textAlign: "center", lineHeight: 21 }}>
        Notre équipe vous contactera très prochainement pour finaliser votre commande.
      </Text>
      <Pressable
        style={({ pressed }) => [ms.submitBtn, { marginTop: 6 }, pressed && { transform: [{ scale: 0.97 }] }]}
        onPress={onClose}
      >
        <LinearGradient colors={[NAVY_LIGHT, NAVY]} style={ms.submitGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          <Text style={ms.submitText}>Fermer</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

function WaField({
  waCode, setWaCode, waPhone, setWaPhone, theme,
}: {
  waCode: string; setWaCode: (v: string) => void;
  waPhone: string; setWaPhone: (v: string) => void; theme: any;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12.5, color: theme.textSecondary, letterSpacing: 0.1 }}>
        Votre numéro WhatsApp *
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          style={[ms.input, { width: 78, color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.inputBorder, textAlign: "center" }]}
          value={waCode} onChangeText={setWaCode} keyboardType="phone-pad"
          placeholder="+237" placeholderTextColor={theme.textMuted}
        />
        <TextInput
          style={[ms.input, { flex: 1, color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
          value={waPhone} onChangeText={setWaPhone} keyboardType="phone-pad"
          placeholder="6XX XXX XXX" placeholderTextColor={theme.textMuted}
        />
      </View>
    </View>
  );
}

function SubmitButton({ onPress, loading, theme }: { onPress: () => void; loading: boolean; theme: any }) {
  return (
    <Pressable
      style={({ pressed }) => [ms.submitBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
      onPress={onPress}
      disabled={loading}
    >
      <LinearGradient colors={[NAVY_LIGHT, NAVY]} style={ms.submitGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={ms.submitText}>Envoyer la demande</Text>
            <Feather name="chevron-right" size={18} color={GOLD} />
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Modal info service (externe)
// ═══════════════════════════════════════════════════════════════
function ServiceInfoModal({
  visible, onClose, service, theme,
}: {
  visible: boolean;
  onClose: () => void;
  service: (typeof FEATURED_EXTERNAL)[0] | null;
  theme: any;
}) {
  if (!service) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={ms.infoOverlay}>
        <View style={[ms.infoCard, { backgroundColor: theme.surface }]}>
          <View style={ms.infoHeader}>
            <View style={[ms.infoIconBox, { backgroundColor: theme.iconBg, borderColor: theme.iconBorder }]}>
              <Feather name={service.icon} size={22} color={theme.accentIcon} />
            </View>
            <Text style={[ms.infoTitle, { color: theme.text }]} numberOfLines={2}>
              {service.info.title}
            </Text>
            <Pressable onPress={onClose} hitSlop={10} style={{ padding: 4 }}>
              <Feather name="x" size={20} color={theme.textMuted} />
            </Pressable>
          </View>

          <Text style={[ms.infoDesc, { color: theme.textSecondary }]}>
            {service.info.description}
          </Text>

          <View style={{ gap: 12 }}>
            {service.info.bullets.map((b, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                <View style={[ms.bulletDot, { backgroundColor: theme.iconBg, borderColor: theme.iconBorder }]}>
                  <Feather name="check" size={11} color={theme.accentIcon} />
                </View>
                <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 13.5, color: theme.textSecondary, lineHeight: 20, marginTop: 2 }}>
                  {b}
                </Text>
              </View>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [ms.submitBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
            onPress={() => { onClose(); Linking.openURL(service.url); }}
          >
            <LinearGradient colors={[NAVY_LIGHT, NAVY]} style={ms.submitGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={ms.submitText}>{service.info.cta}</Text>
              <Feather name="chevron-right" size={18} color={GOLD} />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Modale info abonnement à vie — sans détails techniques
// ═══════════════════════════════════════════════════════════════
function LifetimeInfoModal({
  visible, onClose, sub, theme, priceFmt,
}: {
  visible: boolean;
  onClose: () => void;
  sub: LifetimeSubscription | null;
  theme: any;
  priceFmt: (fcfa: number) => string;
}) {
  if (!sub) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={ms.infoOverlay}>
        <View style={[ms.infoCard, { backgroundColor: theme.surface }]}>
          <View style={ms.infoHeader}>
            <View style={[ms.infoIconBox, { backgroundColor: sub.accent + "18", borderColor: sub.accent + "45" }]}>
              <Feather name={sub.icon} size={22} color={sub.accent} />
            </View>
            <Text style={[ms.infoTitle, { color: theme.text }]} numberOfLines={2}>
              {sub.info.title}
            </Text>
            <Pressable onPress={onClose} hitSlop={10} style={{ padding: 4 }}>
              <Feather name="x" size={20} color={theme.textMuted} />
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ backgroundColor: sub.accent + "18", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: sub.accent, letterSpacing: 0.4, textTransform: "uppercase" }}>
                {sub.badge}
              </Text>
            </View>
            <View style={{ backgroundColor: theme.iconBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: theme.iconBorder }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: theme.accentIcon }}>
                {priceFmt(sub.fcfa)}
              </Text>
            </View>
          </View>

          <Text style={[ms.infoDesc, { color: theme.textSecondary }]}>
            {sub.info.description}
          </Text>

          <View style={{ gap: 12 }}>
            {sub.info.bullets.map((b, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                <View style={[ms.bulletDot, { backgroundColor: sub.accent + "18", borderColor: sub.accent + "45" }]}>
                  <Feather name="check" size={11} color={sub.accent} />
                </View>
                <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 13.5, color: theme.textSecondary, lineHeight: 20, marginTop: 2 }}>
                  {b}
                </Text>
              </View>
            ))}
          </View>

          {sub.info.note ? (
            <View style={{ backgroundColor: WARNING + "12", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: WARNING + "28", flexDirection: "row", gap: 10 }}>
              <Feather name="info" size={14} color={WARNING} style={{ marginTop: 2 }} />
              <Text style={{ flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: WARNING, lineHeight: 17 }}>
                {sub.info.note}
              </Text>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [ms.submitBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
            onPress={onClose}
          >
            <LinearGradient colors={[NAVY_LIGHT, NAVY]} style={ms.submitGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={ms.submitText}>Compris</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Modale d'achat abonnement à vie — textes épurés
// ═══════════════════════════════════════════════════════════════
function LifetimePurchaseModal({
  visible, onClose, sub, theme, priceFmt, onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  sub: LifetimeSubscription | null;
  theme: any;
  priceFmt: (fcfa: number) => string;
  onSuccess: () => void;
}) {
  const { user, deductBalance, refreshUser } = useAuth();
  const { show: showModal, modalEl } = useAppModal();

  const [waCode, setWaCode] = useState("+237");
  const [waPhone, setWaPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (visible && user) {
      if (!fullName && user.name) setFullName(user.name);
      if (!waPhone && user.phone) {
        const p = String(user.phone).trim();
        const match = p.match(/^(\+\d{1,4})\s*(.+)$/);
        if (match) {
          setWaCode(match[1]);
          setWaPhone(match[2].replace(/\s+/g, ""));
        } else {
          setWaPhone(p.replace(/\s+/g, ""));
        }
      }
    }
  }, [visible, user]);

  const reset = () => {
    setWaCode("+237"); setWaPhone(""); setFullName("");
    setLoading(false); setSuccess(false);
  };
  const handleClose = () => { onClose(); setTimeout(reset, 400); };

  if (!sub) return null;

  const userBalance = user?.balance ?? 0;
  const canAfford = userBalance >= sub.fcfa;

  const submit = async () => {
    if (!fullName.trim()) {
      showModal({ kind: "warning", title: "Nom requis", message: "Entrez votre nom complet." });
      return;
    }
    if (!waPhone.trim()) {
      showModal({ kind: "warning", title: "Numéro requis", message: "Entrez votre numéro de contact." });
      return;
    }
    if (!canAfford) {
      showModal({
        kind: "warning",
        title: "Solde insuffisant",
        message: `Votre solde (${priceFmt(userBalance)}) est inférieur au prix (${priceFmt(sub.fcfa)}). Rechargez pour continuer.`,
        buttons: [
          { label: "Recharger", style: "primary", onPress: () => { handleClose(); router.push("/(tabs)/wallet" as any); } },
          { label: "Annuler", style: "cancel" },
        ],
      });
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const ok = await deductBalance(sub.fcfa, { server: true });
      if (!ok) {
        showModal({ kind: "error", title: "Échec de l'achat", message: "Votre solde n'a pas pu être débité. Réessayez." });
        setLoading(false);
        return;
      }

      const r = await postServiceRequest(
        "subscription",
        {
          "Service": sub.label,
          "Prix payé": priceFmt(sub.fcfa),
          "Nom complet": fullName,
          "Type": "Abonnement à vie",
          "Statut du paiement": "Payé via solde",
          "Date": new Date().toLocaleString("fr-FR"),
        },
        waCode,
        waPhone
      );

      if (!r?.success) {
        showModal({
          kind: "warning",
          title: "Commande enregistrée",
          message: `Votre paiement a été débité. Notre équipe vous contactera prochainement. Si vous ne recevez rien sous 24h, contactez le support.`,
        });
        setSuccess(true);
        refreshUser().catch(() => {});
        onSuccess();
        setLoading(false);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSuccess(true);
      refreshUser().catch(() => {});
      onSuccess();
    } catch (e: any) {
      showModal({ kind: "error", title: "Erreur", message: e?.message ?? "Veuillez réessayer." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {modalEl}
      <ModalShell visible={visible} onClose={handleClose} title={sub.label} icon={sub.icon} theme={theme}>
        {success ? (
          <SuccessScreen onClose={handleClose} theme={theme} />
        ) : (
          <>
            {/* Récap produit */}
            <View style={{ backgroundColor: theme.iconBg, borderRadius: 12, borderWidth: 1, borderColor: theme.iconBorder, padding: 14, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: sub.accent + "20", alignItems: "center", justifyContent: "center" }}>
                  <Feather name={sub.icon} size={20} color={sub.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: theme.text }}>{sub.label}</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{sub.sub}</Text>
                </View>
                <View style={{ backgroundColor: sub.accent + "20", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: sub.accent, letterSpacing: 0.4 }}>À VIE</Text>
                </View>
              </View>

              <View style={{ borderTopWidth: 1, borderTopColor: theme.separator, paddingTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: theme.textSecondary }}>Prix</Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: theme.accentIcon }}>{priceFmt(sub.fcfa)}</Text>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: theme.textSecondary }}>Votre solde</Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: canAfford ? SUCCESS : DANGER }}>
                  {priceFmt(userBalance)}
                </Text>
              </View>

              {!canAfford && (
                <View style={{ backgroundColor: DANGER + "15", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: DANGER + "30", flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Feather name="alert-circle" size={14} color={DANGER} />
                  <Text style={{ flex: 1, fontFamily: "Inter_500Medium", fontSize: 12, color: DANGER, lineHeight: 16 }}>
                    Il vous manque {priceFmt(sub.fcfa - userBalance)} pour finaliser cet achat.
                  </Text>
                </View>
              )}
            </View>

            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: theme.textMuted, lineHeight: 19 }}>
              Renseignez vos coordonnées pour que nous puissions vous contacter.
            </Text>

            <FieldInput
              label="Nom complet *"
              value={fullName}
              onChange={setFullName}
              placeholder="Ex: Jean Dupont"
              theme={theme}
            />

            <WaField waCode={waCode} setWaCode={setWaCode} waPhone={waPhone} setWaPhone={setWaPhone} theme={theme} />

            {canAfford ? (
              <Pressable
                style={({ pressed }) => [ms.submitBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                onPress={submit}
                disabled={loading}
              >
                <LinearGradient colors={[NAVY_LIGHT, NAVY]} style={ms.submitGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Feather name="shopping-cart" size={17} color={GOLD} />
                      <Text style={ms.submitText}>Acheter pour {priceFmt(sub.fcfa)}</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [ms.submitBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                onPress={() => { handleClose(); router.push("/(tabs)/wallet" as any); }}
              >
                <LinearGradient colors={[GOLD, GOLD_SOFT]} style={ms.submitGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Feather name="plus-circle" size={17} color="#080E1A" />
                  <Text style={[ms.submitText, { color: "#080E1A" }]}>Recharger mon solde</Text>
                </LinearGradient>
              </Pressable>
            )}

            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11.5, color: theme.textMuted, textAlign: "center", lineHeight: 16 }}>
              Le montant sera débité à la réception de votre accès.
            </Text>
          </>
        )}
      </ModalShell>
    </>
  );
}

// ─── Modal Site Web ───
const WebsiteModal = memo(({ visible, onClose, theme, priceFmt }: ModalBaseProps) => {
  const { show: showModal, modalEl } = useAppModal();
  const [siteName, setSiteName] = useState("");
  const [company, setCompany] = useState("");
  const [siteType, setSiteType] = useState(SITE_TYPES[0]);
  const [budget, setBudget] = useState("");
  const [desc, setDesc] = useState("");
  const [colors2, setColors2] = useState("");
  const [references, setReferences] = useState("");
  const [features, setFeatures] = useState("");
  const [deadline, setDeadline] = useState(DEADLINES[1]);
  const [waCode, setWaCode] = useState("+237");
  const [waPhone, setWaPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPortfolio, setShowPortfolio] = useState(false);

  const reset = () => {
    setSiteName(""); setCompany(""); setSiteType(SITE_TYPES[0]); setBudget("");
    setDesc(""); setColors2(""); setReferences(""); setFeatures("");
    setDeadline(DEADLINES[1]); setWaCode("+237"); setWaPhone("");
    setLoading(false); setSuccess(false); setShowPortfolio(false);
  };
  const handleClose = () => { onClose(); setTimeout(reset, 400); };

  const submit = async () => {
    if (!desc.trim()) {
      showModal({ kind: "warning", title: "Description requise", message: "Veuillez décrire votre projet." });
      return;
    }
    if (!waPhone.trim()) {
      showModal({ kind: "warning", title: "Numéro requis", message: "Entrez votre numéro de contact." });
      return;
    }
    setLoading(true);
    try {
      const r = await postServiceRequest("website", {
        "Nom du site": siteName,
        "Entreprise/Organisation": company,
        "Type de site": `${siteType.label} (${priceFmt(siteType.fcfa)})`,
        "Budget envisagé": budget || priceFmt(siteType.fcfa),
        "Délai souhaité": deadline,
        "Description du projet": desc,
        "Couleurs / charte graphique": colors2 || "(non précisé)",
        "Sites de référence / inspiration": references || "(non précisé)",
        "Fonctionnalités spécifiques": features || "(non précisé)",
      }, waCode, waPhone);
      if (r?.success) {
        setSuccess(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        showModal({ kind: "error", title: "Échec de l'envoi", message: r?.error ?? "Veuillez réessayer." });
      }
    } catch {
      showModal({ kind: "error", title: "Erreur de connexion", message: "Vérifiez votre connexion internet." });
    } finally { setLoading(false); }
  };

  return (
    <>
      {modalEl}
      <ModalShell visible={visible} onClose={handleClose} title="Site web sur mesure" icon="globe" theme={theme}>
        {success ? <SuccessScreen onClose={handleClose} theme={theme} /> : (
          <>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13.5, color: theme.textMuted, lineHeight: 20 }}>
              Nous créons votre site web professionnel depuis 2021. Plus de 50 sites réalisés dans 15 pays.
            </Text>

            <Pressable
              onPress={() => setShowPortfolio(!showPortfolio)}
              style={[ms.portfolioBtn, { borderColor: theme.iconBorder, backgroundColor: theme.iconBg }]}
            >
              <Feather name={showPortfolio ? "eye-off" : "eye"} size={15} color={theme.accentIcon} />
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: theme.accentIcon }}>
                {showPortfolio ? "Masquer nos réalisations" : "Voir nos réalisations (13 sites)"}
              </Text>
            </Pressable>

            {showPortfolio && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
                {PORTFOLIO_SITES.map((site) => (
                  <TouchableOpacity
                    key={site.url}
                    onPress={() => Linking.openURL(site.url)}
                    style={[ms.portfolioCard, { backgroundColor: theme.surface, borderColor: theme.inputBorder }]}
                  >
                    <View style={[ms.portfolioBadge, { backgroundColor: theme.iconBg }]}>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: theme.accentIcon, letterSpacing: 0.2 }}>
                        {site.badge}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12.5, color: theme.text, letterSpacing: -0.1 }} numberOfLines={2}>
                      {site.name}
                    </Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10.5, color: theme.textMuted }}>
                      {site.country}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                      <Feather name="external-link" size={11} color={theme.accentIcon} />
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10.5, color: theme.accentIcon }}>
                        Voir le site
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={[ms.priceBox, { backgroundColor: theme.iconBg, borderColor: theme.iconBorder }]}>
              <Feather name="tag" size={14} color={theme.accentIcon} />
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: theme.accentIcon, letterSpacing: 0.1 }}>
                {siteType.label} — {priceFmt(siteType.fcfa)}
              </Text>
            </View>

            <FieldInput label="Nom du site" value={siteName} onChange={setSiteName} placeholder="Ex: MonSiteWeb" theme={theme} />
            <FieldInput label="Nom entreprise / organisation" value={company} onChange={setCompany} placeholder="Ex: Social Boost Horizon" theme={theme} />

            <View style={{ gap: 8 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12.5, color: theme.textSecondary, letterSpacing: 0.1 }}>
                Type de site *
              </Text>
              {SITE_TYPES.map((t) => (
                <Pressable
                  key={t.label}
                  onPress={() => setSiteType(t)}
                  style={({ pressed }) => [
                    ms.radioRow,
                    {
                      backgroundColor: siteType.label === t.label ? theme.iconBg : theme.inputBg,
                      borderColor: siteType.label === t.label ? theme.accent : theme.inputBorder,
                    },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: theme.text, letterSpacing: -0.1 }}>{t.label}</Text>
                  </View>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12.5, color: GOLD_SOFT }}>{priceFmt(t.fcfa)}</Text>
                  {siteType.label === t.label && (
                    <Feather name="check-circle" size={17} color={theme.accent} style={{ marginLeft: 8 }} />
                  )}
                </Pressable>
              ))}
            </View>

            <FieldInput label="Budget envisagé" value={budget} onChange={setBudget} placeholder={`Ex: ${priceFmt(siteType.fcfa)}`} theme={theme} />
            <FieldInput label="Description du projet *" value={desc} onChange={setDesc} placeholder="Fonctionnalités souhaitées..." theme={theme} multiline />
            <FieldInput label="Couleurs / charte graphique" value={colors2} onChange={setColors2} placeholder="Ex: bleu et blanc..." theme={theme} />
            <FieldInput label="Sites d'inspiration / références" value={references} onChange={setReferences} placeholder="Ex: apple.com..." theme={theme} />
            <FieldInput label="Fonctionnalités spécifiques" value={features} onChange={setFeatures} placeholder="Ex: formulaire, blog..." theme={theme} multiline />
            <TagRow label="Délai souhaité" value={deadline} options={DEADLINES} onSelect={setDeadline} theme={theme} />
            <WaField waCode={waCode} setWaCode={setWaCode} waPhone={waPhone} setWaPhone={setWaPhone} theme={theme} />
            <SubmitButton onPress={submit} loading={loading} theme={theme} />
          </>
        )}
      </ModalShell>
    </>
  );
});

// ─── Modal Application ───
const AppModal2 = memo(({ visible, onClose, theme, priceFmt }: ModalBaseProps) => {
  const { show: showModal, modalEl } = useAppModal();
  const [appName, setAppName] = useState("");
  const [objective, setObjective] = useState("");
  const [platform, setPlatform] = useState(APP_PLATFORMS[0]);
  const [desc, setDesc] = useState("");
  const [features, setFeatures] = useState("");
  const [screens, setScreens] = useState("");
  const [pkg, setPkg] = useState(APP_PACKAGES[0]);
  const [deadline, setDeadline] = useState(DEADLINES[1]);
  const [waCode, setWaCode] = useState("+237");
  const [waPhone, setWaPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const reset = () => {
    setAppName(""); setObjective(""); setPlatform(APP_PLATFORMS[0]); setDesc("");
    setFeatures(""); setScreens(""); setPkg(APP_PACKAGES[0]); setDeadline(DEADLINES[1]);
    setWaCode("+237"); setWaPhone(""); setLoading(false); setSuccess(false);
  };
  const handleClose = () => { onClose(); setTimeout(reset, 400); };

  const submit = async () => {
    if (!desc.trim() && !objective.trim()) {
      showModal({ kind: "warning", title: "Description requise", message: "Veuillez décrire votre application." });
      return;
    }
    if (!waPhone.trim()) {
      showModal({ kind: "warning", title: "Numéro requis", message: "Entrez votre numéro de contact." });
      return;
    }
    setLoading(true);
    try {
      const r = await postServiceRequest("app", {
        "Nom de l'application": appName,
        "Objectif principal": objective,
        "Plateforme": platform,
        "Description": desc,
        "Fonctionnalités nécessaires": features || "(non précisé)",
        "Écrans / pages souhaités": screens || "(non précisé)",
        "Package sélectionné": `${pkg.label} — ${priceFmt(pkg.fcfa)}`,
        "Délai souhaité": deadline,
      }, waCode, waPhone);
      if (r?.success) {
        setSuccess(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        showModal({ kind: "error", title: "Échec de l'envoi", message: r?.error ?? "Veuillez réessayer." });
      }
    } catch {
      showModal({ kind: "error", title: "Erreur de connexion", message: "Vérifiez votre connexion internet." });
    } finally { setLoading(false); }
  };

  return (
    <>
      {modalEl}
      <ModalShell visible={visible} onClose={handleClose} title="Application mobile" icon="smartphone" theme={theme}>
        {success ? <SuccessScreen onClose={handleClose} theme={theme} /> : (
          <>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13.5, color: theme.textMuted, lineHeight: 20 }}>
              Développons votre application mobile Android / iOS avec support 3 mois inclus.
            </Text>

            <View style={[ms.priceBox, { backgroundColor: theme.iconBg, borderColor: theme.iconBorder }]}>
              <Feather name="tag" size={14} color={theme.accentIcon} />
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: theme.accentIcon, letterSpacing: 0.1 }}>
                {pkg.label} — {priceFmt(pkg.fcfa)}
              </Text>
            </View>

            <FieldInput label="Nom de l'application" value={appName} onChange={setAppName} placeholder="Ex: MyApp Pro" theme={theme} />
            <FieldInput label="Objectif principal *" value={objective} onChange={setObjective} placeholder="Ex: app e-commerce..." theme={theme} />
            <TagRow label="Plateforme *" value={platform} options={APP_PLATFORMS} onSelect={setPlatform} theme={theme} />
            <FieldInput label="Description complète *" value={desc} onChange={setDesc} placeholder="Décrivez votre application..." theme={theme} multiline />
            <FieldInput label="Fonctionnalités nécessaires" value={features} onChange={setFeatures} placeholder="Ex: authentification, paiement..." theme={theme} multiline />
            <FieldInput label="Écrans / pages souhaitées" value={screens} onChange={setScreens} placeholder="Ex: accueil, profil, boutique..." theme={theme} />

            <View style={{ gap: 8 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12.5, color: theme.textSecondary, letterSpacing: 0.1 }}>
                Package *
              </Text>
              {APP_PACKAGES.map((p) => (
                <Pressable
                  key={p.label}
                  onPress={() => setPkg(p)}
                  style={({ pressed }) => [
                    ms.radioRow,
                    {
                      backgroundColor: pkg.label === p.label ? theme.iconBg : theme.inputBg,
                      borderColor: pkg.label === p.label ? theme.accent : theme.inputBorder,
                    },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: theme.text, letterSpacing: -0.1 }}>{p.label}</Text>
                  </View>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12.5, color: GOLD_SOFT }}>{priceFmt(p.fcfa)}</Text>
                  {pkg.label === p.label && (
                    <Feather name="check-circle" size={17} color={theme.accent} style={{ marginLeft: 8 }} />
                  )}
                </Pressable>
              ))}
            </View>

            <TagRow label="Délai souhaité" value={deadline} options={DEADLINES} onSelect={setDeadline} theme={theme} />
            <WaField waCode={waCode} setWaCode={setWaCode} waPhone={waPhone} setWaPhone={setWaPhone} theme={theme} />
            <SubmitButton onPress={submit} loading={loading} theme={theme} />
          </>
        )}
      </ModalShell>
    </>
  );
});

// ─── Modal Pubs ───
const AdsModal = memo(({ visible, onClose, theme, priceFmt }: ModalBaseProps) => {
  const { show: showModal, modalEl } = useAppModal();
  const [adPlatform, setAdPlatform] = useState<"Facebook" | "Instagram">("Facebook");
  const [duration, setDuration] = useState(AD_DURATIONS[1]);
  const [pageLink, setPageLink] = useState("");
  const [postLink, setPostLink] = useState("");
  const [observation, setObservation] = useState("");
  const [waCode, setWaCode] = useState("+237");
  const [waPhone, setWaPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const reset = () => {
    setAdPlatform("Facebook"); setDuration(AD_DURATIONS[1]); setPageLink("");
    setPostLink(""); setObservation(""); setWaCode("+237"); setWaPhone("");
    setLoading(false); setSuccess(false);
  };
  const handleClose = () => { onClose(); setTimeout(reset, 400); };

  const submit = async () => {
    if (!pageLink.trim()) {
      showModal({ kind: "warning", title: "Lien requis", message: "Entrez le lien de votre page/profil." });
      return;
    }
    if (!waPhone.trim()) {
      showModal({ kind: "warning", title: "Numéro requis", message: "Entrez votre numéro de contact." });
      return;
    }
    setLoading(true);
    try {
      const r = await postServiceRequest("ads", {
        "Réseau": adPlatform,
        "Durée / Budget": `${duration.label} — ${priceFmt(duration.fcfa)}`,
        "Lien page / profil": pageLink,
        "Lien publication": postLink || "(non précisé)",
        "Observation": observation || "(aucune)",
      }, waCode, waPhone);
      if (r?.success) {
        setSuccess(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        showModal({ kind: "error", title: "Échec de l'envoi", message: r?.error ?? "Veuillez réessayer." });
      }
    } catch {
      showModal({ kind: "error", title: "Erreur de connexion", message: "Vérifiez votre connexion internet." });
    } finally { setLoading(false); }
  };

  return (
    <>
      {modalEl}
      <ModalShell visible={visible} onClose={handleClose} title="Campagne publicitaire" icon="radio" theme={theme}>
        {success ? <SuccessScreen onClose={handleClose} theme={theme} /> : (
          <>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13.5, color: theme.textMuted, lineHeight: 20 }}>
              Boostez votre visibilité avec nos campagnes Facebook et Instagram ciblées.
            </Text>

            <TagRow label="Réseau *" value={adPlatform} options={["Facebook", "Instagram"]} onSelect={(v) => setAdPlatform(v as any)} theme={theme} />

            <View style={{ gap: 8 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12.5, color: theme.textSecondary, letterSpacing: 0.1 }}>
                Durée de la campagne *
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {AD_DURATIONS.map((d) => (
                  <Pressable
                    key={d.label}
                    onPress={() => setDuration(d)}
                    style={({ pressed }) => [
                      ms.durationTag,
                      {
                        backgroundColor: duration.label === d.label ? theme.iconBg : theme.inputBg,
                        borderColor: duration.label === d.label ? theme.accent : theme.inputBorder,
                      },
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12.5, color: duration.label === d.label ? theme.accentIcon : theme.text }}>
                      {d.label}
                    </Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10.5, color: theme.textMuted }}>
                      {priceFmt(d.fcfa)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={[ms.priceBox, { backgroundColor: theme.iconBg, borderColor: theme.iconBorder }]}>
              <Feather name="tag" size={14} color={theme.accentIcon} />
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: theme.accentIcon, letterSpacing: 0.1 }}>
                Total : {priceFmt(duration.fcfa)}
              </Text>
            </View>

            <FieldInput label="Lien page / profil *" value={pageLink} onChange={setPageLink} placeholder="https://facebook.com/votrepage" theme={theme} keyboardType="url" />
            <FieldInput label="Lien de la publication" value={postLink} onChange={setPostLink} placeholder="https://facebook.com/publication (optionnel)" theme={theme} keyboardType="url" />
            <FieldInput label="Observation / cible" value={observation} onChange={setObservation} placeholder="Cible visée, objectif..." theme={theme} multiline />
            <WaField waCode={waCode} setWaCode={setWaCode} waPhone={waPhone} setWaPhone={setWaPhone} theme={theme} />
            <SubmitButton onPress={submit} loading={loading} theme={theme} />
          </>
        )}
      </ModalShell>
    </>
  );
});

// ─── Modal Comptes ───
const AccountsModal = memo(({ visible, onClose, theme, priceFmt }: ModalBaseProps) => {
  const { show: showModal, modalEl } = useAppModal();
  const [service, setService] = useState(ACCOUNT_SERVICES[0]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [waCode, setWaCode] = useState("+237");
  const [waPhone, setWaPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [tiktokCountry, setTiktokCountry] = useState(TIKTOK_COUNTRIES[0]);
  const [badgePlatform, setBadgePlatform] = useState(BADGE_PLATFORMS[0]);

  const setField = (key: string, val: string) =>
    setFields((prev) => ({ ...prev, [key]: val }));

  const reset = () => {
    setService(ACCOUNT_SERVICES[0]); setFields({}); setWaCode("+237"); setWaPhone("");
    setLoading(false); setSuccess(false); setTiktokCountry(TIKTOK_COUNTRIES[0]);
    setBadgePlatform(BADGE_PLATFORMS[0]);
  };
  const handleClose = () => { onClose(); setTimeout(reset, 400); };
  const handleServiceChange = (svc: typeof ACCOUNT_SERVICES[0]) => {
    setService(svc); setFields({});
  };

  const submit = async () => {
    if (!waPhone.trim()) {
      showModal({ kind: "warning", title: "Numéro requis", message: "Entrez votre numéro de contact." });
      return;
    }
    const allFields: Record<string, string> = {
      Service: `${service.label} (${priceFmt(service.fcfa)})`, ...fields,
    };
    if (service.label === "Compte TikTok monétisable") allFields["Pays de création"] = tiktokCountry;
    if (service.label === "Badge vérifié") allFields["Plateforme"] = badgePlatform;
    setLoading(true);
    try {
      const r = await postServiceRequest("accounts", allFields, waCode, waPhone);
      if (r?.success) {
        setSuccess(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        showModal({ kind: "error", title: "Échec de l'envoi", message: r?.error ?? "Veuillez réessayer." });
      }
    } catch {
      showModal({ kind: "error", title: "Erreur de connexion", message: "Vérifiez votre connexion internet." });
    } finally { setLoading(false); }
  };

  const renderFields = () => {
    const n = service.label;

    if (n === "Canva Pro") {
      return <FieldInput label="Votre adresse email *" value={fields.email ?? ""} onChange={(v) => setField("email", v)} placeholder="exemple@email.com" theme={theme} keyboardType="email-address" />;
    }

    if (n === "Compte PayPal éligible") {
      return (
        <>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <FieldInput label="Prénom *" value={fields.prenom ?? ""} onChange={(v) => setField("prenom", v)} placeholder="Ex: Jean" theme={theme} />
            </View>
            <View style={{ flex: 1 }}>
              <FieldInput label="Nom *" value={fields.nom ?? ""} onChange={(v) => setField("nom", v)} placeholder="Ex: Dupont" theme={theme} />
            </View>
          </View>
          <FieldInput label="Adresse email *" value={fields.email ?? ""} onChange={(v) => setField("email", v)} placeholder="exemple@email.com" theme={theme} keyboardType="email-address" />
          <FieldInput label="Téléphone *" value={fields.telephone ?? ""} onChange={(v) => setField("telephone", v)} placeholder="+237 6XX XXX XXX" theme={theme} keyboardType="phone-pad" />
          <FieldInput label="Date de naissance *" value={fields.dob ?? ""} onChange={(v) => setField("dob", v)} placeholder="JJ/MM/AAAA" theme={theme} />
          <FieldInput label="Ville *" value={fields.ville ?? ""} onChange={(v) => setField("ville", v)} placeholder="Ex: Douala" theme={theme} />
          <FieldInput label="Pays de résidence *" value={fields.pays ?? ""} onChange={(v) => setField("pays", v)} placeholder="Ex: Cameroun" theme={theme} />
          <FieldInput label="Adresse postale" value={fields.adresse ?? ""} onChange={(v) => setField("adresse", v)} placeholder="Ex: Rue des palmiers 12" theme={theme} />
        </>
      );
    }

    if (n === "Page Facebook professionnelle") {
      return (
        <>
          <FieldInput label="Nom de la page *" value={fields.nomPage ?? ""} onChange={(v) => setField("nomPage", v)} placeholder="Ex: Mon Business Pro" theme={theme} />
          <FieldInput label="Catégorie *" value={fields.categorie ?? ""} onChange={(v) => setField("categorie", v)} placeholder="Ex: Commerce, Restaurant..." theme={theme} />
          <FieldInput label="Description de la page" value={fields.desc ?? ""} onChange={(v) => setField("desc", v)} placeholder="Décrivez votre page" theme={theme} multiline />
          <FieldInput label="Email du compte admin *" value={fields.email ?? ""} onChange={(v) => setField("email", v)} placeholder="votre@email.com" theme={theme} keyboardType="email-address" />
        </>
      );
    }

    if (n === "Compte TikTok monétisable") {
      return (
        <>
          <FieldInput label="Nom d'utilisateur souhaité *" value={fields.username ?? ""} onChange={(v) => setField("username", v)} placeholder="Ex: @monpseudo" theme={theme} />
          <FieldInput label="Adresse email *" value={fields.email ?? ""} onChange={(v) => setField("email", v)} placeholder="exemple@email.com" theme={theme} keyboardType="email-address" />
          <FieldInput label="Mot de passe souhaité *" value={fields.mdp ?? ""} onChange={(v) => setField("mdp", v)} placeholder="Min. 8 caractères" theme={theme} />
          <FieldInput label="Numéro de téléphone *" value={fields.tel ?? ""} onChange={(v) => setField("tel", v)} placeholder="+237 6XX XXX XXX" theme={theme} keyboardType="phone-pad" />
          <FieldInput label="Date de naissance *" value={fields.dob ?? ""} onChange={(v) => setField("dob", v)} placeholder="JJ/MM/AAAA (18+)" theme={theme} />
          <View style={{ gap: 8 }}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12.5, color: theme.textSecondary, letterSpacing: 0.1 }}>
              Pays de création (éligibles monétisation) *
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {TIKTOK_COUNTRIES.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setTiktokCountry(c)}
                    style={({ pressed }) => [
                      ms.tag,
                      {
                        backgroundColor: tiktokCountry === c ? theme.accent : theme.inputBg,
                        borderColor: tiktokCountry === c ? theme.accent : theme.inputBorder,
                      },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12.5, color: tiktokCountry === c ? "#fff" : theme.textSecondary }}>
                      {c}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        </>
      );
    }

    if (n === "Compte Instagram") {
      return (
        <>
          <FieldInput label="Nom d'utilisateur souhaité *" value={fields.username ?? ""} onChange={(v) => setField("username", v)} placeholder="Ex: @monpseudo" theme={theme} />
          <FieldInput label="Adresse email *" value={fields.email ?? ""} onChange={(v) => setField("email", v)} placeholder="exemple@email.com" theme={theme} keyboardType="email-address" />
          <FieldInput label="Mot de passe souhaité *" value={fields.mdp ?? ""} onChange={(v) => setField("mdp", v)} placeholder="Min. 8 caractères" theme={theme} />
          <FieldInput label="Numéro de téléphone *" value={fields.tel ?? ""} onChange={(v) => setField("tel", v)} placeholder="+237 6XX XXX XXX" theme={theme} keyboardType="phone-pad" />
          <FieldInput label="Date de naissance *" value={fields.dob ?? ""} onChange={(v) => setField("dob", v)} placeholder="JJ/MM/AAAA" theme={theme} />
        </>
      );
    }

    if (n === "Chaîne YouTube") {
      return (
        <>
          <FieldInput label="Nom de la chaîne *" value={fields.nomChaine ?? ""} onChange={(v) => setField("nomChaine", v)} placeholder="Ex: Ma Chaîne YouTube" theme={theme} />
          <FieldInput label="Adresse email *" value={fields.email ?? ""} onChange={(v) => setField("email", v)} placeholder="exemple@email.com" theme={theme} keyboardType="email-address" />
          <FieldInput label="Mot de passe souhaité *" value={fields.mdp ?? ""} onChange={(v) => setField("mdp", v)} placeholder="Min. 8 caractères" theme={theme} />
          <FieldInput label="Numéro de téléphone *" value={fields.tel ?? ""} onChange={(v) => setField("tel", v)} placeholder="+237 6XX XXX XXX" theme={theme} keyboardType="phone-pad" />
          <FieldInput label="Date de naissance *" value={fields.dob ?? ""} onChange={(v) => setField("dob", v)} placeholder="JJ/MM/AAAA" theme={theme} />
          <FieldInput label="Pays de création *" value={fields.pays ?? ""} onChange={(v) => setField("pays", v)} placeholder="Ex: États-Unis..." theme={theme} />
        </>
      );
    }

    if (n === "Badge vérifié") {
      return (
        <>
          <View style={{ gap: 8 }}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12.5, color: theme.textSecondary, letterSpacing: 0.1 }}>
              Plateforme *
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {BADGE_PLATFORMS.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setBadgePlatform(p)}
                  style={({ pressed }) => [
                    ms.tag,
                    {
                      backgroundColor: badgePlatform === p ? theme.accent : theme.inputBg,
                      borderColor: badgePlatform === p ? theme.accent : theme.inputBorder,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12.5, color: badgePlatform === p ? "#fff" : theme.textSecondary }}>
                    {p}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <FieldInput label="Lien de votre profil *" value={fields.lienProfil ?? ""} onChange={(v) => setField("lienProfil", v)} placeholder="https://..." theme={theme} keyboardType="url" />
        </>
      );
    }

    return null;
  };

  return (
    <>
      {modalEl}
      <ModalShell visible={visible} onClose={handleClose} title="Comptes et monétisation" icon="award" theme={theme}>
        {success ? <SuccessScreen onClose={handleClose} theme={theme} /> : (
          <>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13.5, color: theme.textMuted, lineHeight: 20 }}>
              Choisissez le service et remplissez les informations requises.
            </Text>

            <View style={{ gap: 8 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12.5, color: theme.textSecondary, letterSpacing: 0.1 }}>
                Service souhaité *
              </Text>
              {ACCOUNT_SERVICES.map((svc) => (
                <Pressable
                  key={svc.label}
                  onPress={() => handleServiceChange(svc)}
                  style={({ pressed }) => [
                    ms.radioRow,
                    {
                      backgroundColor: service.label === svc.label ? theme.iconBg : theme.inputBg,
                      borderColor: service.label === svc.label ? theme.accent : theme.inputBorder,
                    },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Text style={{ flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: theme.text, letterSpacing: -0.1 }}>
                    {svc.label}
                  </Text>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12.5, color: GOLD_SOFT }}>{priceFmt(svc.fcfa)}</Text>
                  {service.label === svc.label && (
                    <Feather name="check-circle" size={17} color={theme.accent} style={{ marginLeft: 8 }} />
                  )}
                </Pressable>
              ))}
            </View>

            <View style={[ms.priceBox, { backgroundColor: theme.iconBg, borderColor: theme.iconBorder }]}>
              <Feather name="tag" size={14} color={theme.accentIcon} />
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: theme.accentIcon, letterSpacing: 0.1 }}>
                {service.label} — {priceFmt(service.fcfa)}
              </Text>
            </View>

            {renderFields()}

            <WaField waCode={waCode} setWaCode={setWaCode} waPhone={waPhone} setWaPhone={setWaPhone} theme={theme} />
            <SubmitButton onPress={submit} loading={loading} theme={theme} />
          </>
        )}
      </ModalShell>
    </>
  );
});

// ═══════════════════════════════════════════════════════════════
//  Carte service externe
// ═══════════════════════════════════════════════════════════════
function FeaturedCard({
  svc, theme, isDark, onPress, onInfo,
}: {
  svc: (typeof FEATURED_EXTERNAL)[0];
  theme: any; isDark: boolean;
  onPress: () => void; onInfo: () => void;
}) {
  const { scale, onPressIn, onPressOut } = usePressSpring();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => { onPressIn(); Haptics.selectionAsync(); }}
        onPressOut={onPressOut}
        style={[
          ms.featuredCard,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            shadowColor: isDark ? "#000" : NAVY,
            shadowOpacity: isDark ? 0.30 : 0.06,
          },
        ]}
      >
        <View style={[ms.featuredIconBox, { backgroundColor: theme.iconBg, borderColor: theme.iconBorder }]}>
          <Feather name={svc.icon} size={20} color={theme.accentIcon} />
        </View>

        <View style={ms.featuredRight}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Text style={[ms.featuredTitle, { color: theme.text }]} numberOfLines={1}>
              {svc.label}
            </Text>
            <View style={[ms.featuredBadge, { borderColor: theme.iconBorder }]}>
              <Text style={[ms.featuredBadgeText, { color: theme.accentIcon }]}>
                {svc.badge}
              </Text>
            </View>
          </View>
          <Text style={[ms.featuredSub, { color: theme.textMuted }]} numberOfLines={1}>
            {svc.sub}
          </Text>
        </View>

        <Pressable
          style={ms.infoBtn}
          hitSlop={12}
          onPress={(e) => { e.stopPropagation?.(); Haptics.selectionAsync(); onInfo(); }}
        >
          <Feather name="help-circle" size={18} color={theme.textMuted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Carte abonnement à vie — AVEC FOND DÉCORATIF SUBTIL
// ═══════════════════════════════════════════════════════════════
function LifetimeSubscriptionCard({
  sub, theme, isDark, onPress, onInfo, priceLabel,
}: {
  sub: LifetimeSubscription;
  theme: any;
  isDark: boolean;
  onPress: () => void;
  onInfo: () => void;
  priceLabel: string;
}) {
  const { scale, onPressIn, onPressOut } = usePressSpring();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <View
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: sub.accent + "35",
          backgroundColor: theme.surface,
          overflow: "hidden",
          position: "relative",
          shadowColor: isDark ? "#000" : NAVY,
          shadowOffset: { width: 0, height: 4 },
          shadowRadius: 14,
          shadowOpacity: isDark ? 0.30 : 0.06,
          elevation: 2,
        }}
      >
        {/* ─── Fond décoratif : dégradé diagonal subtil ─── */}
        <LinearGradient
          colors={[sub.accent + (isDark ? "18" : "0D"), sub.accent + (isDark ? "08" : "04"), "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        {/* ─── Fond décoratif : icône géante en filigrane ─── */}
        <View
          style={{
            position: "absolute",
            right: -38,
            bottom: -38,
            opacity: isDark ? 0.10 : 0.06,
          }}
          pointerEvents="none"
        >
          <Feather name={sub.icon} size={160} color={sub.accent} />
        </View>

        {/* ─── Contenu ─── */}
        <Pressable
          onPress={onPress}
          onPressIn={() => { onPressIn(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          onPressOut={onPressOut}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 16,
            paddingLeft: 16,
            paddingRight: 12,
            gap: 14,
          }}
        >
          <View style={[ms.featuredIconBox, { backgroundColor: sub.accent + "18", borderColor: sub.accent + "45" }]}>
            <Feather name={sub.icon} size={20} color={sub.accent} />
          </View>

          <View style={ms.featuredRight}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text style={[ms.featuredTitle, { color: theme.text }]} numberOfLines={1}>
                {sub.label}
              </Text>
              <View style={[ms.featuredBadge, { borderColor: sub.accent + "45", backgroundColor: sub.accent + "12" }]}>
                <Text style={[ms.featuredBadgeText, { color: sub.accent }]}>
                  {sub.badge}
                </Text>
              </View>
            </View>
            <Text style={[ms.featuredSub, { color: theme.textMuted }]} numberOfLines={1}>
              {sub.sub}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
              <Feather name="tag" size={11} color={theme.accentIcon} />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: theme.accentIcon }}>
                {priceLabel}
              </Text>
            </View>
          </View>

          <Pressable
            style={ms.infoBtn}
            hitSlop={12}
            onPress={(e) => { e.stopPropagation?.(); Haptics.selectionAsync(); onInfo(); }}
          >
            <Feather name="help-circle" size={18} color={theme.textMuted} />
          </Pressable>
        </Pressable>
      </View>
    </Animated.View>
  );
}

function ServiceCard({
  svc, theme, isDark, onPress,
}: {
  svc: (typeof MODAL_SERVICES)[0];
  theme: any; isDark: boolean;
  onPress: () => void;
}) {
  const { scale, onPressIn, onPressOut } = usePressSpring();
  return (
    <Animated.View style={{ width: "48%", transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => { onPressIn(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        onPressOut={onPressOut}
        style={[
          ms.serviceCard,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            shadowColor: isDark ? "#000" : NAVY,
            shadowOpacity: isDark ? 0.25 : 0.05,
          },
        ]}
      >
        <View style={[ms.serviceIconBox, { backgroundColor: theme.iconBg, borderColor: theme.iconBorder }]}>
          <Feather name={svc.icon} size={22} color={theme.accentIcon} />
        </View>

        <View style={{ gap: 4, marginTop: 14 }}>
          <Text style={[ms.serviceLabel, { color: theme.text }]} numberOfLines={2}>
            {svc.label}
          </Text>
          <Text style={[ms.serviceSub, { color: theme.textMuted }]} numberOfLines={2}>
            {svc.sub}
          </Text>
        </View>

        <View style={[ms.cardFooterArrow, { borderColor: theme.iconBorder, backgroundColor: theme.iconBg }]}>
          <Feather name="arrow-up-right" size={15} color={theme.accentIcon} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Composant principal
// ═══════════════════════════════════════════════════════════════
export default function OtherServicesSection() {
  const { user } = useAuth();
  const { isDark: ctxIsDark } = useTheme();
  const isDark = ctxIsDark === true;

  const theme = useMemo(() => ({
    text:          isDark ? DARK_TEXT     : LIGHT_TEXT,
    textSecondary: isDark ? DARK_TEXT_2   : LIGHT_TEXT_2,
    textMuted:     isDark ? DARK_TEXT_2   : LIGHT_TEXT_2,
    inputBg:       isDark ? DARK_INPUT_BG : LIGHT_INPUT_BG,
    inputBorder:   isDark ? DARK_BORDER   : LIGHT_BORDER,
    border:        isDark ? DARK_BORDER   : LIGHT_BORDER,
    accent:        isDark ? GOLD          : NAVY,
    accentIcon:    isDark ? GOLD          : NAVY,
    surface:       isDark ? DARK_SURFACE  : LIGHT_SURFACE,
    iconBg:        isDark ? DARK_ICON_BG  : "rgba(10,28,58,0.05)",
    iconBorder:    isDark ? DARK_ICON_BORD: "rgba(10,28,58,0.08)",
    separator:     isDark ? DARK_BORDER   : LIGHT_BORDER,
  }), [isDark]);

  const userCountry = user?.country
    ? COUNTRIES.find((co) => co.code === user.country?.toLowerCase())
    : null;

  const priceFmt = useCallback(
    (fcfa: number): string => {
      if (userCountry && userCountry.xafRate !== 1) return formatCurrency(fcfa, userCountry);
      return `${fcfa.toLocaleString("fr-FR")} FCFA`;
    },
    [userCountry]
  );

  const [openModal, setOpenModal] = useState<string | null>(null);
  const [infoService, setInfoService] = useState<(typeof FEATURED_EXTERNAL)[0] | null>(null);
  const [infoLifetime, setInfoLifetime] = useState<LifetimeSubscription | null>(null);
  const [purchaseLifetime, setPurchaseLifetime] = useState<LifetimeSubscription | null>(null);

  const close = useCallback(() => setOpenModal(null), []);

  const handleExternalTap = useCallback((svc: (typeof FEATURED_EXTERNAL)[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(svc.url);
  }, []);

  const handleInfoTap = useCallback((svc: (typeof FEATURED_EXTERNAL)[0]) => {
    setInfoService(svc);
  }, []);

  const handleLifetimeTap = useCallback((sub: LifetimeSubscription) => {
    setPurchaseLifetime(sub);
  }, []);

  const handleLifetimeInfo = useCallback((sub: LifetimeSubscription) => {
    setInfoLifetime(sub);
  }, []);

  return (
    <View style={{ gap: 20 }}>
      {/* En-tête section */}
      <View style={ms.sectionHeader}>
        <View style={ms.accentBar} />
        <View style={{ flex: 1 }}>
          <Text style={[ms.sectionTitle, { color: theme.text }]}>Nos services</Text>
          <Text style={[ms.sectionSub, { color: theme.textMuted }]}>
            Tout pour propulser votre activité
          </Text>
        </View>
      </View>

      {/* Services externes */}
      <View style={{ gap: 12 }}>
        {FEATURED_EXTERNAL.map((svc) => (
          <FeaturedCard
            key={svc.id}
            svc={svc}
            theme={theme}
            isDark={isDark}
            onPress={() => handleExternalTap(svc)}
            onInfo={() => handleInfoTap(svc)}
          />
        ))}

        {/* ─── Abonnements à vie (Canal+ et Netflix) ─── */}
        {LIFETIME_SUBSCRIPTIONS.map((sub) => (
          <LifetimeSubscriptionCard
            key={sub.id}
            sub={sub}
            theme={theme}
            isDark={isDark}
            priceLabel={priceFmt(sub.fcfa)}
            onPress={() => handleLifetimeTap(sub)}
            onInfo={() => handleLifetimeInfo(sub)}
          />
        ))}
      </View>

      {/* Grille services internes */}
      <View style={ms.grid}>
        {MODAL_SERVICES.map((svc) => (
          <ServiceCard
            key={svc.id}
            svc={svc}
            theme={theme}
            isDark={isDark}
            onPress={() => setOpenModal(svc.id)}
          />
        ))}
      </View>

      {/* Modales internes */}
      <WebsiteModal visible={openModal === "website"} onClose={close} theme={theme} priceFmt={priceFmt} />
      <AppModal2 visible={openModal === "app"} onClose={close} theme={theme} priceFmt={priceFmt} />
      <AdsModal visible={openModal === "ads"} onClose={close} theme={theme} priceFmt={priceFmt} />
      <AccountsModal visible={openModal === "accounts"} onClose={close} theme={theme} priceFmt={priceFmt} />

      {/* Modale info service externe */}
      <ServiceInfoModal
        visible={infoService !== null}
        onClose={() => setInfoService(null)}
        service={infoService}
        theme={theme}
      />

      {/* Modale info abonnement à vie */}
      <LifetimeInfoModal
        visible={infoLifetime !== null}
        onClose={() => setInfoLifetime(null)}
        sub={infoLifetime}
        theme={theme}
        priceFmt={priceFmt}
      />

      {/* Modale achat abonnement à vie */}
      <LifetimePurchaseModal
        visible={purchaseLifetime !== null}
        onClose={() => setPurchaseLifetime(null)}
        sub={purchaseLifetime}
        theme={theme}
        priceFmt={priceFmt}
        onSuccess={() => {}}
      />
    </View>
  );
}

const ms = StyleSheet.create({
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  accentBar: { width: 3, height: 28, borderRadius: 2, backgroundColor: GOLD },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17, letterSpacing: -0.2 },
  sectionSub: { fontFamily: "Inter_400Regular", fontSize: 12.5, marginTop: 3, letterSpacing: 0.1 },

  /* Cartes externes */
  featuredCard: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 18, borderWidth: 1,
    paddingVertical: 16, paddingLeft: 16, paddingRight: 12,
    gap: 14, position: "relative",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 14, elevation: 2,
  },
  featuredIconBox: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  featuredRight: { flex: 1, gap: 4 },
  featuredTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14.5, letterSpacing: -0.15 },
  featuredSub: { fontFamily: "Inter_400Regular", fontSize: 12, letterSpacing: 0.1 },
  featuredBadge: {
    borderRadius: 999, borderWidth: 1,
    paddingHorizontal: 9, paddingVertical: 2,
  },
  featuredBadgeText: {
    fontFamily: "Inter_600SemiBold", fontSize: 9,
    letterSpacing: 0.4, textTransform: "uppercase",
  },
  infoBtn: { padding: 8 },

  /* Grille */
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  serviceCard: {
    width: "100%", borderRadius: 18, borderWidth: 1,
    padding: 16, minHeight: 165, gap: 10, position: "relative",
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 10, elevation: 1,
  },
  serviceIconBox: {
    width: 46, height: 46, borderRadius: 14,
    borderWidth: 1, alignItems: "center", justifyContent: "center",
  },
  serviceLabel: {
    fontFamily: "Inter_600SemiBold", fontSize: 14.5,
    lineHeight: 19, letterSpacing: -0.15,
  },
  serviceSub: {
    fontFamily: "Inter_400Regular", fontSize: 12,
    lineHeight: 16, letterSpacing: 0.1,
  },
  cardFooterArrow: {
    position: "absolute", top: 16, right: 16,
    width: 30, height: 30, borderRadius: 10,
    borderWidth: 1, alignItems: "center", justifyContent: "center",
  },

  /* Modales */
  infoOverlay: {
    flex: 1, backgroundColor: "rgba(10,28,58,0.45)",
    justifyContent: "center", padding: 22,
  },
  infoCard: {
    borderRadius: 22, padding: 24, gap: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25, shadowRadius: 24, elevation: 12,
  },
  infoHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  infoIconBox: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  infoTitle: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 16, letterSpacing: -0.1 },
  infoDesc: { fontFamily: "Inter_400Regular", fontSize: 13.5, lineHeight: 21 },
  bulletDot: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, marginTop: 2,
  },
  overlay: { flex: 1, backgroundColor: "rgba(10,28,58,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: "94%" },
  grabber: {
    alignSelf: "center", width: 40, height: 4, borderRadius: 2,
    backgroundColor: "rgba(128,128,128,0.25)", marginTop: 8,
  },
  sheetHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", padding: 20, borderBottomWidth: 1,
  },
  sheetIconBox: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  sheetTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, flex: 1, letterSpacing: -0.1 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  input: {
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 13,
    fontFamily: "Inter_400Regular", fontSize: 14,
  },
  tag: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 10, borderWidth: 1,
  },
  radioRow: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 12, borderWidth: 1, padding: 14,
  },
  durationTag: {
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, alignItems: "center", minWidth: "47%", flex: 1, gap: 3,
  },
  priceBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 14, flexWrap: "wrap",
  },
  submitBtn: { borderRadius: 14, overflow: "hidden", marginTop: 4 },
  submitGradient: {
    height: 54, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  submitText: {
    fontFamily: "Inter_600SemiBold", fontSize: 15,
    color: "#fff", letterSpacing: 0.1,
  },
  portfolioBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 12,
  },
  portfolioCard: {
    width: 140, borderRadius: 12, borderWidth: 1, padding: 12, gap: 5,
  },
  portfolioBadge: {
    alignSelf: "flex-start", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4,
  },
  successIcon: {
    width: 76, height: 76, borderRadius: 38,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
});