import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import React, { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

// ─── Palette charte ───
const NAVY       = "#0F2A5C";
const NAVY_LIGHT = "#1E3F7A";
const NAVY_DK    = "#0A1F44";
const GOLD       = "#C9A961";
const GOLD_DK    = "#B08D4A";
const GOLD_SOFT  = "#F7F1E1";

const LIGHT_BG    = "#FAF9F6";
const LIGHT_SURF  = "#FFFFFF";
const LIGHT_BORD  = "#E8E4DA";
const LIGHT_TEXT  = "#0F172A";
const LIGHT_MUTED = "#64748B";
const LIGHT_SOFT  = "#94A3B8";

const DARK_BG     = "#0A162B";
const DARK_SURF   = "#0F2A5C";
const DARK_BORD   = "rgba(255,255,255,0.08)";
const DARK_TEXT   = "#F1F5F9";
const DARK_MUTED  = "#94A3B8";
const DARK_SOFT   = "#64748B";

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

// ─── Services externes (nouveaux) ───
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
        "Disponible dans +205 pays — aucun pays exclu",
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

const MODAL_SERVICES = [
  { id: "website",  icon: "globe"      as const, label: "Site web",       sub: "Vitrine · E-commerce" },
  { id: "app",      icon: "smartphone" as const, label: "Application",    sub: "Android · iOS" },
  { id: "ads",      icon: "radio"      as const, label: "Campagnes pubs", sub: "Facebook · Instagram" },
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
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        serviceType,
        fields,
        whatsappCountryCode: waCode,
        whatsappPhone: waPhone,
      }),
    });
    const json = await res.json();
    return json;
  } catch (e: any) {
    console.error("[service-request] erreur réseau:", e?.message ?? e);
    return { success: false, error: "Erreur réseau. Vérifiez votre connexion." };
  }
}

// ─── Types partagés ───
type ModalBaseProps = {
  visible: boolean;
  onClose: () => void;
  theme: any;
  priceFmt: (fcfa: number) => string;
};

// ─── Champs réutilisables ───
function FieldInput({
  label, value, onChange, placeholder, multiline, keyboardType, theme, secureTextEntry,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
  multiline?: boolean; keyboardType?: any; theme: any; secureTextEntry?: boolean;
}) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: theme.textSecondary }}>
        {label}
      </Text>
      <TextInput
        style={[
          ms.input,
          {
            color: theme.text,
            backgroundColor: theme.inputBg,
            borderColor: theme.inputBorder,
            ...(multiline ? { height: 80, textAlignVertical: "top", paddingTop: 10 } : {}),
          },
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        multiline={multiline}
        keyboardType={keyboardType ?? "default"}
        secureTextEntry={secureTextEntry}
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
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: theme.textSecondary }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((opt) => (
          <Pressable
            key={opt}
            onPress={() => onSelect(opt)}
            style={[
              ms.tag,
              {
                backgroundColor: value === opt ? theme.accent : theme.inputBg,
                borderColor: value === opt ? theme.accent : theme.inputBorder,
              },
            ]}
          >
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 12,
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
  visible, onClose, title, children, theme,
}: {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode; theme: any;
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
            <View style={[ms.sheetHeader, { borderBottomColor: theme.separator }]}>
              <Text style={[ms.sheetTitle, { color: theme.text }]}>{title}</Text>
              <Pressable
                onPress={onClose}
                style={[ms.closeBtn, { backgroundColor: theme.inputBg }]}
              >
                <Feather name="x" size={20} color={theme.text} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 30 }}
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
  return (
    <View style={{ alignItems: "center", gap: 16, paddingVertical: 30 }}>
      <Text style={{ fontSize: 56, textAlign: "center" }}>✅</Text>
      <Text
        style={{
          fontFamily: "Inter_700Bold",
          fontSize: 20,
          color: theme.success,
          textAlign: "center",
        }}
      >
        Demande envoyée !
      </Text>
      <Text
        style={{
          fontFamily: "Inter_400Regular",
          fontSize: 14,
          color: theme.textMuted,
          textAlign: "center",
          lineHeight: 21,
        }}
      >
        Notre équipe vous contactera sur WhatsApp très prochainement pour finaliser votre commande.
      </Text>
      <Pressable style={[ms.submitBtn, { marginTop: 6 }]} onPress={onClose}>
        <LinearGradient
          colors={[NAVY_LIGHT, NAVY]}
          style={ms.submitGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={ms.submitText}>Parfait, merci !</Text>
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
    <View style={{ gap: 5 }}>
      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: theme.textSecondary }}>
        Votre numéro WhatsApp *
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          style={[
            ms.input,
            { width: 72, color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
          ]}
          value={waCode}
          onChangeText={setWaCode}
          keyboardType="phone-pad"
          placeholder="+237"
          placeholderTextColor={theme.textMuted}
        />
        <TextInput
          style={[
            ms.input,
            { flex: 1, color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
          ]}
          value={waPhone}
          onChangeText={setWaPhone}
          keyboardType="phone-pad"
          placeholder="6XX XXX XXX"
          placeholderTextColor={theme.textMuted}
        />
      </View>
    </View>
  );
}

function SubmitButton({
  onPress, loading, theme,
}: {
  onPress: () => void; loading: boolean; theme: any;
}) {
  return (
    <Pressable
      style={({ pressed }) => [ms.submitBtn, pressed && { opacity: 0.85 }]}
      onPress={onPress}
      disabled={loading}
    >
      <LinearGradient
        colors={[NAVY_LIGHT, NAVY]}
        style={ms.submitGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Feather name="send" size={16} color={GOLD} />
            <Text style={ms.submitText}>Envoyer la demande</Text>
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}

// ─── Modal explicatif (nouveaux services) ───
function ServiceInfoModal({
  visible,
  onClose,
  service,
  theme,
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
            <View
              style={[
                ms.infoIconBox,
                { backgroundColor: theme.accent + "15", borderColor: theme.accent + "30" },
              ]}
            >
              <Feather name={service.icon} size={20} color={theme.accent} />
            </View>
            <Text style={[ms.infoTitle, { color: theme.text }]} numberOfLines={2}>
              {service.info.title}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={20} color={theme.textMuted} />
            </Pressable>
          </View>

          <Text style={[ms.infoDesc, { color: theme.textSecondary }]}>
            {service.info.description}
          </Text>

          <View style={{ gap: 10 }}>
            {service.info.bullets.map((b, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <Feather
                  name="check"
                  size={14}
                  color={theme.accent}
                  style={{ marginTop: 3 }}
                />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: "Inter_400Regular",
                    fontSize: 13,
                    color: theme.textSecondary,
                    lineHeight: 19,
                  }}
                >
                  {b}
                </Text>
              </View>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [ms.infoCta, pressed && { opacity: 0.9 }]}
            onPress={() => {
              onClose();
              Linking.openURL(service.url);
            }}
          >
            <LinearGradient
              colors={[NAVY_LIGHT, NAVY]}
              style={ms.infoCtaGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={ms.infoCtaText}>{service.info.cta}</Text>
              <Feather name="arrow-right" size={16} color={GOLD} />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Modaux services existants ───
const WebsiteModal = memo(({ visible, onClose, theme, priceFmt }: ModalBaseProps) => {
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
    if (!desc.trim()) { Alert.alert("Requis", "Veuillez décrire votre projet."); return; }
    if (!waPhone.trim()) { Alert.alert("WhatsApp requis", "Entrez votre numéro WhatsApp."); return; }
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
        Alert.alert("Erreur", r?.error ?? "Veuillez réessayer.");
      }
    } catch {
      Alert.alert("Erreur", "Vérifiez votre connexion internet.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell visible={visible} onClose={handleClose} title="🌐 Site web sur mesure" theme={theme}>
      {success ? (
        <SuccessScreen onClose={handleClose} theme={theme} />
      ) : (
        <>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: theme.textMuted, lineHeight: 19 }}>
            Nous créons votre site web professionnel depuis 2021. +50 sites réalisés dans 15 pays.
          </Text>

          <Pressable
            onPress={() => setShowPortfolio(!showPortfolio)}
            style={[ms.portfolioBtn, { borderColor: theme.accent + "60", backgroundColor: theme.accent + "10" }]}
          >
            <Feather name={showPortfolio ? "eye-off" : "eye"} size={15} color={theme.accent} />
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: theme.accent }}>
              {showPortfolio ? "Masquer nos réalisations" : "Voir nos réalisations (13 sites)"}
            </Text>
          </Pressable>

          {showPortfolio && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -18 }}
              contentContainerStyle={{ paddingHorizontal: 18, gap: 10 }}
            >
              {PORTFOLIO_SITES.map((site) => (
                <TouchableOpacity
                  key={site.url}
                  onPress={() => Linking.openURL(site.url)}
                  style={[ms.portfolioCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                >
                  <View style={[ms.portfolioBadge, { backgroundColor: theme.accent + "20" }]}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: theme.accent }}>
                      {site.badge}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: theme.text }} numberOfLines={2}>
                    {site.name}
                  </Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: theme.textMuted }}>
                    {site.country}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                    <Feather name="external-link" size={10} color={theme.accent} />
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: theme.accent }}>
                      Voir le site
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <View style={[ms.priceBox, { backgroundColor: theme.accent + "10", borderColor: theme.accent + "30" }]}>
            <Feather name="tag" size={14} color={theme.accent} />
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: theme.accent }}>
              {siteType.label} — {priceFmt(siteType.fcfa)}
            </Text>
          </View>

          <FieldInput label="Nom du site" value={siteName} onChange={setSiteName} placeholder="Ex: MonSiteWeb" theme={theme} />
          <FieldInput label="Nom entreprise / organisation" value={company} onChange={setCompany} placeholder="Ex: Social Boost Horizon" theme={theme} />

          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: theme.textSecondary }}>
              Type de site *
            </Text>
            {SITE_TYPES.map((t) => (
              <Pressable
                key={t.label}
                onPress={() => setSiteType(t)}
                style={[
                  ms.radioRow,
                  {
                    backgroundColor: siteType.label === t.label ? theme.accent + "18" : theme.inputBg,
                    borderColor: siteType.label === t.label ? theme.accent : theme.inputBorder,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: theme.text }}>
                    {t.label}
                  </Text>
                </View>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: GOLD }}>
                  {priceFmt(t.fcfa)}
                </Text>
                {siteType.label === t.label && (
                  <Feather name="check-circle" size={16} color={theme.accent} style={{ marginLeft: 6 }} />
                )}
              </Pressable>
            ))}
          </View>

          <FieldInput label="Budget envisagé" value={budget} onChange={setBudget} placeholder={`Ex: ${priceFmt(siteType.fcfa)}`} theme={theme} />
          <FieldInput label="Description du projet *" value={desc} onChange={setDesc} placeholder="Fonctionnalités souhaitées, public cible, objectif du site..." theme={theme} multiline />
          <FieldInput label="Couleurs / charte graphique" value={colors2} onChange={setColors2} placeholder="Ex: bleu et blanc, couleurs de mon logo..." theme={theme} />
          <FieldInput label="Sites d'inspiration / références" value={references} onChange={setReferences} placeholder="Ex: apple.com, airbnb.com..." theme={theme} />
          <FieldInput label="Fonctionnalités spécifiques" value={features} onChange={setFeatures} placeholder="Ex: formulaire de contact, blog, boutique..." theme={theme} multiline />
          <TagRow label="Délai souhaité" value={deadline} options={DEADLINES} onSelect={setDeadline} theme={theme} />
          <WaField waCode={waCode} setWaCode={setWaCode} waPhone={waPhone} setWaPhone={setWaPhone} theme={theme} />
          <SubmitButton onPress={submit} loading={loading} theme={theme} />
        </>
      )}
    </ModalShell>
  );
});

const AppModal = memo(({ visible, onClose, theme, priceFmt }: ModalBaseProps) => {
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
    if (!desc.trim() && !objective.trim()) { Alert.alert("Requis", "Veuillez décrire votre application."); return; }
    if (!waPhone.trim()) { Alert.alert("WhatsApp requis", "Entrez votre numéro WhatsApp."); return; }
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
        Alert.alert("Erreur", r?.error ?? "Veuillez réessayer.");
      }
    } catch {
      Alert.alert("Erreur", "Vérifiez votre connexion internet.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell visible={visible} onClose={handleClose} title="📱 Application mobile" theme={theme}>
      {success ? (
        <SuccessScreen onClose={handleClose} theme={theme} />
      ) : (
        <>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: theme.textMuted, lineHeight: 19 }}>
            Développons votre application mobile Android/iOS avec support 3 mois inclus.
          </Text>

          <View style={[ms.priceBox, { backgroundColor: theme.accent + "15", borderColor: theme.accent + "30" }]}>
            <Feather name="tag" size={14} color={theme.accent} />
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: theme.accent }}>
              {pkg.label} — {priceFmt(pkg.fcfa)}
            </Text>
          </View>

          <FieldInput label="Nom de l'application" value={appName} onChange={setAppName} placeholder="Ex: MyApp Pro" theme={theme} />
          <FieldInput label="Objectif principal *" value={objective} onChange={setObjective} placeholder="Ex: app e-commerce, application de livraison..." theme={theme} />
          <TagRow label="Plateforme *" value={platform} options={APP_PLATFORMS} onSelect={setPlatform} theme={theme} />
          <FieldInput label="Description complète *" value={desc} onChange={setDesc} placeholder="Décrivez votre application..." theme={theme} multiline />
          <FieldInput label="Fonctionnalités nécessaires" value={features} onChange={setFeatures} placeholder="Ex: authentification, paiement, carte GPS..." theme={theme} multiline />
          <FieldInput label="Écrans / pages souhaitées" value={screens} onChange={setScreens} placeholder="Ex: accueil, profil, boutique, panier..." theme={theme} />

          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: theme.textSecondary }}>
              Package *
            </Text>
            {APP_PACKAGES.map((p) => (
              <Pressable
                key={p.label}
                onPress={() => setPkg(p)}
                style={[
                  ms.radioRow,
                  {
                    backgroundColor: pkg.label === p.label ? theme.accent + "18" : theme.inputBg,
                    borderColor: pkg.label === p.label ? theme.accent : theme.inputBorder,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: theme.text }}>
                    {p.label}
                  </Text>
                </View>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: GOLD }}>
                  {priceFmt(p.fcfa)}
                </Text>
                {pkg.label === p.label && (
                  <Feather name="check-circle" size={16} color={theme.accent} style={{ marginLeft: 6 }} />
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
  );
});

const AdsModal = memo(({ visible, onClose, theme, priceFmt }: ModalBaseProps) => {
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
    if (!pageLink.trim()) { Alert.alert("Requis", "Entrez le lien de votre page/profil."); return; }
    if (!waPhone.trim()) { Alert.alert("WhatsApp requis", "Entrez votre numéro WhatsApp."); return; }
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
        Alert.alert("Erreur", r?.error ?? "Veuillez réessayer.");
      }
    } catch {
      Alert.alert("Erreur", "Vérifiez votre connexion internet.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell visible={visible} onClose={handleClose} title="📣 Campagne publicitaire" theme={theme}>
      {success ? (
        <SuccessScreen onClose={handleClose} theme={theme} />
      ) : (
        <>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: theme.textMuted, lineHeight: 19 }}>
            Boostez votre visibilité avec nos campagnes Facebook & Instagram ciblées.
          </Text>

          <TagRow
            label="Réseau *"
            value={adPlatform}
            options={["Facebook", "Instagram"]}
            onSelect={(v) => setAdPlatform(v as any)}
            theme={theme}
          />

          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: theme.textSecondary }}>
              Durée de la campagne *
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {AD_DURATIONS.map((d) => (
                <Pressable
                  key={d.label}
                  onPress={() => setDuration(d)}
                  style={[
                    ms.durationTag,
                    {
                      backgroundColor: duration.label === d.label ? theme.accent + "20" : theme.inputBg,
                      borderColor: duration.label === d.label ? theme.accent : theme.inputBorder,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 12,
                      color: duration.label === d.label ? theme.accent : theme.text,
                    }}
                  >
                    {d.label}
                  </Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: theme.textMuted }}>
                    {priceFmt(d.fcfa)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={[ms.priceBox, { backgroundColor: theme.accent + "12", borderColor: theme.accent + "30" }]}>
            <Feather name="tag" size={14} color={theme.accent} />
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: theme.accent }}>
              Total : {priceFmt(duration.fcfa)}
            </Text>
          </View>

          <FieldInput label="Lien page / profil *" value={pageLink} onChange={setPageLink} placeholder="https://facebook.com/votrepage" theme={theme} keyboardType="url" />
          <FieldInput label="Lien de la publication" value={postLink} onChange={setPostLink} placeholder="https://facebook.com/publication (optionnel)" theme={theme} keyboardType="url" />
          <FieldInput label="Observation / cible" value={observation} onChange={setObservation} placeholder="Cible visée, objectif, zones géographiques..." theme={theme} multiline />
          <WaField waCode={waCode} setWaCode={setWaCode} waPhone={waPhone} setWaPhone={setWaPhone} theme={theme} />
          <SubmitButton onPress={submit} loading={loading} theme={theme} />
        </>
      )}
    </ModalShell>
  );
});

const AccountsModal = memo(({ visible, onClose, theme, priceFmt }: ModalBaseProps) => {
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
    if (!waPhone.trim()) { Alert.alert("WhatsApp requis", "Entrez votre numéro WhatsApp."); return; }
    const allFields: Record<string, string> = {
      "Service": `${service.label} (${priceFmt(service.fcfa)})`,
      ...fields,
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
        Alert.alert("Erreur", r?.error ?? "Veuillez réessayer.");
      }
    } catch {
      Alert.alert("Erreur", "Vérifiez votre connexion internet.");
    } finally {
      setLoading(false);
    }
  };

  const renderFields = () => {
    const n = service.label;

    if (n === "Canva Pro") {
      return (
        <FieldInput
          label="Votre adresse email *"
          value={fields.email ?? ""}
          onChange={(v) => setField("email", v)}
          placeholder="exemple@email.com"
          theme={theme}
          keyboardType="email-address"
        />
      );
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
          <FieldInput label="Catégorie *" value={fields.categorie ?? ""} onChange={(v) => setField("categorie", v)} placeholder="Ex: Commerce, Restaurant, Musique..." theme={theme} />
          <FieldInput label="Description de la page" value={fields.desc ?? ""} onChange={(v) => setField("desc", v)} placeholder="Décrivez votre page / entreprise" theme={theme} multiline />
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
          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: theme.textSecondary }}>
              Pays de création (éligibles monétisation) *
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {TIKTOK_COUNTRIES.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setTiktokCountry(c)}
                    style={[
                      ms.tag,
                      {
                        backgroundColor: tiktokCountry === c ? theme.accent : theme.inputBg,
                        borderColor: tiktokCountry === c ? theme.accent : theme.inputBorder,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontFamily: "Inter_500Medium",
                        fontSize: 12,
                        color: tiktokCountry === c ? "#fff" : theme.textSecondary,
                      }}
                    >
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
          <FieldInput label="Pays de création *" value={fields.pays ?? ""} onChange={(v) => setField("pays", v)} placeholder="Ex: États-Unis, France..." theme={theme} />
        </>
      );
    }

    if (n === "Badge vérifié") {
      return (
        <>
          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: theme.textSecondary }}>
              Plateforme *
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {BADGE_PLATFORMS.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setBadgePlatform(p)}
                  style={[
                    ms.tag,
                    {
                      backgroundColor: badgePlatform === p ? GOLD : theme.inputBg,
                      borderColor: badgePlatform === p ? GOLD : theme.inputBorder,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: "Inter_500Medium",
                      fontSize: 12,
                      color: badgePlatform === p ? "#0F2A5C" : theme.textSecondary,
                    }}
                  >
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
    <ModalShell visible={visible} onClose={handleClose} title="💰 Comptes & Monétisation" theme={theme}>
      {success ? (
        <SuccessScreen onClose={handleClose} theme={theme} />
      ) : (
        <>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: theme.textMuted, lineHeight: 19 }}>
            Choisissez le service et remplissez les informations requises pour la création / livraison.
          </Text>

          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: theme.textSecondary }}>
              Service souhaité *
            </Text>
            {ACCOUNT_SERVICES.map((svc) => (
              <Pressable
                key={svc.label}
                onPress={() => handleServiceChange(svc)}
                style={[
                  ms.radioRow,
                  {
                    backgroundColor: service.label === svc.label ? theme.accent + "18" : theme.inputBg,
                    borderColor: service.label === svc.label ? theme.accent : theme.inputBorder,
                  },
                ]}
              >
                <Text style={{ flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 13, color: theme.text }}>
                  {svc.label}
                </Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: GOLD }}>
                  {priceFmt(svc.fcfa)}
                </Text>
                {service.label === svc.label && (
                  <Feather name="check-circle" size={16} color={theme.accent} style={{ marginLeft: 6 }} />
                )}
              </Pressable>
            ))}
          </View>

          <View style={[ms.priceBox, { backgroundColor: GOLD + "10", borderColor: GOLD + "30" }]}>
            <Feather name="tag" size={14} color={GOLD_DK} />
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: theme.text }}>
              {service.label} — {priceFmt(service.fcfa)}
            </Text>
          </View>

          {renderFields()}

          <WaField waCode={waCode} setWaCode={setWaCode} waPhone={waPhone} setWaPhone={setWaPhone} theme={theme} />
          <SubmitButton onPress={submit} loading={loading} theme={theme} />
        </>
      )}
    </ModalShell>
  );
});

// ─── Composant principal ───
export default function OtherServicesSection() {
  const { user } = useAuth();
  const { isDark } = useTheme();

  // Palette locale (clair / sombre propre)
  const theme = useMemo(
    () => ({
      text:           isDark ? DARK_TEXT : LIGHT_TEXT,
      textSecondary:  isDark ? DARK_MUTED : LIGHT_MUTED,
      textMuted:      isDark ? DARK_SOFT : LIGHT_SOFT,
      inputBg:        isDark ? "rgba(255,255,255,0.04)" : GOLD_SOFT,
      inputBorder:    isDark ? DARK_BORD : LIGHT_BORD,
      accent:         isDark ? GOLD : NAVY,
      accentLight:    isDark ? GOLD : NAVY_LIGHT,
      surface:        isDark ? DARK_SURF : LIGHT_SURF,
      card:           isDark ? DARK_SURF : LIGHT_SURF,
      cardBorder:     isDark ? DARK_BORD : LIGHT_BORD,
      separator:      isDark ? DARK_BORD : LIGHT_BORD,
      success:        "#10B981",
    }),
    [isDark]
  );

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

  const close = useCallback(() => setOpenModal(null), []);

  const handleExternalTap = (svc: (typeof FEATURED_EXTERNAL)[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(svc.url);
  };

  const handleInfoTap = (svc: (typeof FEATURED_EXTERNAL)[0]) => {
    Haptics.selectionAsync();
    setInfoService(svc);
  };

  // Style commun des cartes services
  const cardStyle = [
    ms.serviceCard,
    { backgroundColor: theme.card, borderColor: theme.cardBorder },
  ];

  const iconBoxStyle = [
    ms.serviceIconBox,
    {
      backgroundColor: isDark ? "rgba(201,169,97,0.10)" : "rgba(15,42,92,0.05)",
      borderColor: isDark ? "rgba(201,169,97,0.20)" : "rgba(15,42,92,0.10)",
    },
  ];

  return (
    <View style={{ gap: 14 }}>
      <View style={ms.sectionHeader}>
        <Text style={[ms.sectionTitle, { color: theme.text }]}>Nos services</Text>
        <Text style={[ms.sectionSub, { color: theme.textMuted }]}>
          Tout pour propulser votre activité
        </Text>
      </View>

      {/* Grille : 2 services externes + 4 services internes */}
      <View style={ms.grid}>
        {FEATURED_EXTERNAL.map((svc) => (
          <Pressable
            key={svc.id}
            style={({ pressed }) => [...cardStyle, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
            onPress={() => handleExternalTap(svc)}
          >
            {/* Badge Nouveau / Partenariat */}
            <View style={ms.featuredBadge}>
              <Text style={ms.featuredBadgeText}>{svc.badge}</Text>
            </View>

            {/* Info "?" */}
            <Pressable
              style={ms.infoBtn}
              hitSlop={10}
              onPress={(e) => {
                e.stopPropagation?.();
                handleInfoTap(svc);
              }}
            >
              <Feather name="help-circle" size={15} color={theme.textMuted} />
            </Pressable>

            <View style={iconBoxStyle}>
              <Feather name={svc.icon} size={20} color={isDark ? GOLD : NAVY} />
            </View>

            <Text style={[ms.serviceLabel, { color: theme.text }]} numberOfLines={2}>
              {svc.label}
            </Text>
            <Text style={[ms.serviceSub, { color: theme.textMuted }]} numberOfLines={2}>
              {svc.sub}
            </Text>
          </Pressable>
        ))}

        {MODAL_SERVICES.map((svc) => (
          <Pressable
            key={svc.id}
            style={({ pressed }) => [...cardStyle, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setOpenModal(svc.id);
            }}
          >
            <View style={iconBoxStyle}>
              <Feather name={svc.icon} size={20} color={isDark ? GOLD : NAVY} />
            </View>
            <Text style={[ms.serviceLabel, { color: theme.text }]} numberOfLines={2}>
              {svc.label}
            </Text>
            <Text style={[ms.serviceSub, { color: theme.textMuted }]} numberOfLines={2}>
              {svc.sub}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Modaux services existants */}
      <WebsiteModal visible={openModal === "website"} onClose={close} theme={theme} priceFmt={priceFmt} />
      <AppModal visible={openModal === "app"} onClose={close} theme={theme} priceFmt={priceFmt} />
      <AdsModal visible={openModal === "ads"} onClose={close} theme={theme} priceFmt={priceFmt} />
      <AccountsModal visible={openModal === "accounts"} onClose={close} theme={theme} priceFmt={priceFmt} />

      {/* Modal explicatif nouveaux services */}
      <ServiceInfoModal
        visible={infoService !== null}
        onClose={() => setInfoService(null)}
        service={infoService}
        theme={theme}
      />
    </View>
  );
}

const ms = StyleSheet.create({
  sectionHeader: { gap: 3 },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: 0.1,
  },
  sectionSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12.5,
  },

  /* Grille services */
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  serviceCard: {
    width: "47.8%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 8,
    minHeight: 132,
    position: "relative",
  },
  serviceIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 13.5,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  serviceSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 15,
  },
  featuredBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: GOLD,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 2,
  },
  featuredBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    color: NAVY,
    letterSpacing: 0.3,
  },
  infoBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 2,
    padding: 2,
  },

  /* Modal explicatif */
  infoOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 22,
  },
  infoCard: {
    borderRadius: 20,
    padding: 22,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  infoIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  infoTitle: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: 0.1,
  },
  infoDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13.5,
    lineHeight: 20,
  },
  infoCta: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 4,
  },
  infoCtaGradient: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  infoCtaText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },

  /* Modaux internes */
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "94%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 18,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  tag: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  durationTag: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    minWidth: "47%",
    flex: 1,
  },
  priceBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    flexWrap: "wrap",
  },
  submitBtn: {
    borderRadius: 12,
    overflow: "hidden",
  },
  submitGradient: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  submitText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#fff",
  },
  portfolioBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  portfolioCard: {
    width: 130,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    gap: 4,
  },
  portfolioBadge: {
    alignSelf: "flex-start",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
  },
});