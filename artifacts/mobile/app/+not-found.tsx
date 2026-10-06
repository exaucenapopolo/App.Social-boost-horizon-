import Feather from "@expo/vector-icons/Feather";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";

export default function NotFoundScreen() {
  return (
    <View style={styles.container}>
      <Feather name="alert-circle" size={48} color={Colors.textMuted} />
      <Text style={styles.title}>Page introuvable</Text>
      <Pressable style={styles.btn} onPress={() => router.replace("/(tabs)")}>
        <Text style={styles.btnText}>Retour à l'accueil</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: Colors.text,
  },
  btn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  btnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});
