import React from "react";
import { StyleSheet, View } from "react-native";

const NAVY = "#0F2A5C";
const GOLD = "#C9A961";
const WARM_BG = "#F7F5F0";

/**
 * Fond décoratif partagé par les écrans d'authentification.
 * Mode clair premium : base chaude, halos doux, hairlines fines.
 */
export function AuthBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Base chaude */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: WARM_BG }]} />

      {/* Halos radiaux très doux */}
      <View style={styles.glowTopRight} />
      <View style={styles.glowBottomLeft} />
      <View style={styles.glowCenter} />

      {/* Hairlines dorées élégantes */}
      <View style={[styles.hairline, styles.hairline1]} />
      <View style={[styles.hairline, styles.hairline2]} />
      <View style={[styles.hairlineNavy, styles.hairline3]} />

      {/* Points accent minimalistes */}
      <View style={[styles.dotNavy, { top: 140, left: 44, width: 5, height: 5, opacity: 0.22 }]} />
      <View style={[styles.dotGold, { top: 300, right: 52, width: 6, height: 6, opacity: 0.30 }]} />
      <View style={[styles.dotNavy, { bottom: 200, left: 38, width: 4, height: 4, opacity: 0.18 }]} />
      <View style={[styles.dotGold, { bottom: 150, right: 46, width: 4, height: 4, opacity: 0.24 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  glowTopRight: {
    position: "absolute",
    top: -140,
    right: -120,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: NAVY,
    opacity: 0.045,
  },
  glowBottomLeft: {
    position: "absolute",
    bottom: -60,
    left: -140,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: GOLD,
    opacity: 0.07,
  },
  glowCenter: {
    position: "absolute",
    top: -80,
    left: "50%",
    marginLeft: -180,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: GOLD,
    opacity: 0.05,
  },
  hairline: {
    position: "absolute",
    height: 1,
    backgroundColor: GOLD,
    opacity: 0.35,
  },
  hairlineNavy: {
    position: "absolute",
    height: 1,
    backgroundColor: NAVY,
    opacity: 0.12,
  },
  hairline1: { top: 120, left: 32, width: 56 },
  hairline2: { top: "62%", right: 40, width: 44 },
  hairline3: { bottom: 160, left: 48, width: 36 },

  dotNavy: {
    position: "absolute",
    backgroundColor: NAVY,
    borderRadius: 99,
  },
  dotGold: {
    position: "absolute",
    backgroundColor: GOLD,
    borderRadius: 99,
  },
});