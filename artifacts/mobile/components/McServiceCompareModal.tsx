import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

type Props = {
  visible: boolean;
  allServices: any[];
  initialService?: any | null;
  onClose: () => void;
  onCompare: (first: any, second: any) => void;
  C: any;
  isDark: boolean;
  fmt: (n: number) => string;
};

function norm(value: unknown): string {
  return String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}
function publicName(value: unknown): string {
  return String(value ?? "")
    .replace(/\b(?:smm\s*wiz|smmwiz|mtp|exo|afrique\s*boost|afriqueboost|africa\s*boost|africaboost)\b/gi, "")
    .replace(/[|·:—–-]{2,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
function serviceIdentity(svc: any): string {
  return [svc?._provider ?? svc?.provider ?? "", svc?._platformKey ?? svc?._platformLabel ?? "", svc?.id ?? svc?.serviceId ?? svc?.name ?? ""]
    .map((v) => String(v).trim().toLowerCase()).join("::");
}

export default function McServiceCompareModal({ visible, allServices, initialService, onClose, onCompare, C, isDark, fmt }: Props) {
  const [query, setQuery] = useState("");
  const [first, setFirst] = useState<any | null>(null);
  const [second, setSecond] = useState<any | null>(null);
  const [slot, setSlot] = useState<"first" | "second">("first");

  useEffect(() => {
    if (!visible) return;
    setFirst(initialService ?? null);
    setSecond(null);
    setQuery("");
    setSlot(initialService ? "second" : "first");
  }, [visible, initialService]);

  const results = useMemo(() => {
    const needle = norm(query);
    if (needle.length < 2) return [];
    const tokens = needle.split(/\s+/).filter(Boolean);
    const scored: Array<{ svc: any; score: number }> = [];
    for (const svc of allServices ?? []) {
      const name = norm(svc?.name);
      const platform = norm(svc?._platformLabel ?? svc?.platform ?? svc?._platformKey);
      const category = norm(svc?.category ?? svc?.type);
      const haystack = name + " " + platform + " " + category;
      let score = 0;
      if (name === needle) score += 100;
      else if (name.startsWith(needle)) score += 50;
      else if (name.includes(needle)) score += 30;
      if (platform.includes(needle)) score += 20;
      if (tokens.every((token) => haystack.includes(token))) score += 10;
      if (score > 0) scored.push({ svc, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 35).map((entry) => entry.svc);
  }, [allServices, query]);

  const choose = (svc: any) => {
    Haptics.selectionAsync().catch(() => {});
    if (slot === "first") {
      if (second && serviceIdentity(second) === serviceIdentity(svc)) return;
      setFirst(svc);
      setSlot("second");
    } else {
      if (first && serviceIdentity(first) === serviceIdentity(svc)) return;
      setSecond(svc);
    }
    setQuery("");
  };

  const renderSelected = (label: string, svc: any | null, target: "first" | "second") => (
    <Pressable
      key={target}
      onPress={() => setSlot(target)}
      style={{
        flex: 1, minWidth: 0, borderWidth: 1.5, borderRadius: 12, padding: 10,
        borderColor: slot === target ? C.accent : C.border,
        backgroundColor: slot === target ? C.accent + "12" : C.inputBg,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 5 }}>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: C.accent }}>{label}</Text>
        {svc ? <Pressable onPress={(event: any) => { event?.stopPropagation?.(); target === "first" ? setFirst(null) : setSecond(null); setSlot(target); }} hitSlop={8}><Feather name="x-circle" size={15} color={C.textMuted} /></Pressable> : null}
      </View>
      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: C.text, marginTop: 6 }} numberOfLines={3}>
        {svc ? publicName(svc.name) || "Service sélectionné" : "Touchez ici pour le choisir"}
      </Text>
      {svc ? <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted, marginTop: 4 }} numberOfLines={2}>
        {svc._platformLabel ?? svc.platform ?? svc._platformKey ?? "Plateforme non précisée"} · {fmt(Number(svc.priceXAF) || 0)}
      </Text> : null}
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable onPress={onClose} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(4,10,22,0.65)" }}>
          <View
            onStartShouldSetResponder={() => true}
            style={{
              maxHeight: "94%", minHeight: "70%", borderTopLeftRadius: 24, borderTopRightRadius: 24,
              paddingTop: 12, paddingHorizontal: 16, paddingBottom: 12,
              backgroundColor: isDark ? "#0F1B33" : "#FFFFFF",
            }}
          >
            <View style={{ width: 40, height: 4, borderRadius: 3, backgroundColor: C.border, alignSelf: "center", marginBottom: 12 }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.accent + "16", alignItems: "center", justifyContent: "center" }}>
                <Feather name="git-merge" size={19} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Inter_800ExtraBold", fontSize: 18, color: C.text }}>Comparer deux services</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11.5, color: C.textMuted, marginTop: 2 }}>Choisissez deux offres du catalogue SBH.</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={8} style={{ padding: 6 }}><Feather name="x" size={20} color={C.textMuted} /></Pressable>
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginVertical: 12 }}>
              {renderSelected("SERVICE 1", first, "first")}
              {renderSelected("SERVICE 2", second, "second")}
            </View>

            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: C.text, marginBottom: 7 }}>
              {slot === "first" ? "1. Rechercher le premier service" : "2. Rechercher le deuxième service"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, backgroundColor: C.inputBg }}>
              <Feather name="search" size={16} color={C.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Nom du service ou plateforme…"
                placeholderTextColor={C.textMuted}
                style={{ flex: 1, minHeight: 46, color: C.text, fontFamily: "Inter_400Regular", fontSize: 13, paddingVertical: 8 }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {query.length > 0 ? <Pressable onPress={() => setQuery("")} hitSlop={8}><Feather name="x-circle" size={15} color={C.textMuted} /></Pressable> : null}
            </View>

            <ScrollView
              style={{ flex: 1, marginTop: 8, minHeight: 90 }}
              contentContainerStyle={{ paddingBottom: 10 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              {query.trim().length < 2 ? (
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: C.textMuted, textAlign: "center", paddingVertical: 22 }}>
                  Tapez au moins deux caractères pour rechercher un service.
                </Text>
              ) : results.length === 0 ? (
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: C.textMuted, textAlign: "center", paddingVertical: 22 }}>
                  Aucun résultat. Essayez un autre mot ou le nom de la plateforme.
                </Text>
              ) : results.map((svc: any, index: number) => {
                const selected = (first && serviceIdentity(first) === serviceIdentity(svc)) || (second && serviceIdentity(second) === serviceIdentity(svc));
                return (
                  <Pressable
                    key={serviceIdentity(svc) + "::" + index}
                    onPress={() => choose(svc)}
                    style={({ pressed }) => ({
                      flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 9,
                      borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: selected ? C.accent + "10" : "transparent", opacity: pressed ? 0.78 : 1,
                    })}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12.5, color: C.text }} numberOfLines={2}>{publicName(svc.name) || "Service du catalogue"}</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10.5, color: C.textMuted, marginTop: 3 }} numberOfLines={1}>
                        {svc._platformLabel ?? svc.platform ?? svc._platformKey ?? "Plateforme"} · Min {Number(svc.min ?? 0).toLocaleString("fr-FR")} · Max {Number(svc.max ?? 0).toLocaleString("fr-FR")}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 3 }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12.5, color: C.success ?? "#10B981" }}>{fmt(Number(svc.priceXAF) || 0)}</Text>
                      <Feather name={selected ? "check-circle" : "plus-circle"} size={17} color={selected ? C.accent : C.textMuted} />
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {first && second && serviceIdentity(first) !== serviceIdentity(second) ? (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                onCompare(first, second);
              }}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9,
                backgroundColor: first && second && serviceIdentity(first) !== serviceIdentity(second) ? C.accent : C.border,
                borderRadius: 14, paddingVertical: 14, marginTop: 10, opacity: pressed ? 0.86 : 1,
              })}
            >
              <Feather name="git-merge" size={17} color={first && second && serviceIdentity(first) !== serviceIdentity(second) ? (isDark ? "#0F1B33" : "#FFFFFF") : C.textMuted} />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13.5, color: first && second && serviceIdentity(first) !== serviceIdentity(second) ? (isDark ? "#0F1B33" : "#FFFFFF") : C.textMuted }}>
                Comparer avec Mč
              </Text>
            </Pressable>
            ) : (
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11.5, textAlign: "center", color: C.textMuted, paddingVertical: 10, marginTop: 8 }}>
                Choisissez deux services différents pour activer la comparaison.
              </Text>
            )}
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
