import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useUpdate } from "@/context/UpdateContext";
import { useTheme } from "@/context/ThemeContext";

export default function UpdateModal() {
  const { modalVisible, forceUpdate, info, currentVersion, dismiss } = useUpdate();
  const { colors: c } = useTheme();
  const [loading, setLoading] = React.useState(false);

  if (!modalVisible || !info) return null;

  const changelogItems = info.changelog
    ? info.changelog.split("\n").filter((l) => l.trim())
    : [];

  const handleDownload = async () => {
    if (!info.downloadUrl) return;
    setLoading(true);
    try {
      await Linking.openURL(info.downloadUrl);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={forceUpdate ? undefined : dismiss}
    >
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          {/* Header */}
          <LinearGradient
            colors={["#6C63FF", "#4F46E5"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <View style={styles.iconWrap}>
              <Feather name="download-cloud" size={28} color="#fff" />
            </View>
            <Text style={styles.headerTitle}>
              {forceUpdate ? "Mise à jour requise" : "Mise à jour disponible"}
            </Text>
            <Text style={styles.headerSub}>
              {forceUpdate
                ? "Cette version n'est plus supportée. Mettez à jour pour continuer."
                : "Une nouvelle version de l'application est disponible !"}
            </Text>
          </LinearGradient>

          {/* Version badges */}
          <View style={[styles.versionRow, { borderBottomColor: c.separator }]}>
            <View style={styles.versionBadge}>
              <Text style={[styles.versionLabel, { color: c.textMuted }]}>VERSION ACTUELLE</Text>
              <Text style={[styles.versionNum, { color: c.textMuted }]}>v{currentVersion}</Text>
            </View>
            <Feather name="arrow-right" size={16} color={c.textMuted} />
            <View style={styles.versionBadge}>
              <Text style={[styles.versionLabel, { color: "#6C63FF" }]}>NOUVELLE VERSION</Text>
              <Text style={[styles.versionNum, { color: "#6C63FF", fontFamily: "Inter_700Bold" }]}>
                v{info.latestVersion}
              </Text>
            </View>
          </View>

          {/* Changelog */}
          {changelogItems.length > 0 && (
            <ScrollView
              style={styles.changelog}
              contentContainerStyle={styles.changelogContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.changelogTitle, { color: c.text }]}>Nouveautés</Text>
              {changelogItems.map((item, i) => (
                <View key={i} style={styles.changelogItem}>
                  <View style={[styles.changelogDot, { backgroundColor: "#6C63FF" }]} />
                  <Text style={[styles.changelogText, { color: c.textSecondary }]}>
                    {item.replace(/^[-•*]\s*/, "")}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Actions */}
          <View style={[styles.actions, { borderTopColor: c.separator }]}>
            {info.downloadUrl ? (
              <Pressable
                style={({ pressed }) => [styles.downloadBtn, { opacity: pressed ? 0.85 : 1 }]}
                onPress={handleDownload}
              >
                <LinearGradient
                  colors={["#6C63FF", "#4F46E5"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.downloadGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Feather name="download" size={18} color="#fff" />
                      <Text style={styles.downloadText}>Télécharger la mise à jour</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            ) : (
              <View style={[styles.downloadBtn, { backgroundColor: c.card, alignItems: "center", justifyContent: "center", height: 50, borderRadius: 14 }]}>
                <Text style={[styles.changelogText, { color: c.textMuted }]}>Lien de téléchargement bientôt disponible</Text>
              </View>
            )}

            {!forceUpdate && (
              <Pressable
                style={({ pressed }) => [styles.laterBtn, { opacity: pressed ? 0.7 : 1 }]}
                onPress={dismiss}
              >
                <Text style={[styles.laterText, { color: c.textMuted }]}>Plus tard</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 20,
    overflow: "hidden",
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  header: {
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    textAlign: "center",
  },
  headerSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    lineHeight: 19,
  },
  versionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
  },
  versionBadge: {
    alignItems: "center",
    gap: 2,
  },
  versionLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
  },
  versionNum: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  changelog: {
    maxHeight: 160,
    paddingHorizontal: 20,
  },
  changelogContent: {
    paddingVertical: 16,
    gap: 8,
  },
  changelogTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  changelogItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  changelogDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 5,
  },
  changelogText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  actions: {
    padding: 20,
    gap: 10,
    borderTopWidth: 1,
  },
  downloadBtn: {
    borderRadius: 14,
    overflow: "hidden",
  },
  downloadGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  downloadText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  laterBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  laterText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
