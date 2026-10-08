import React from "react";
import { StyleSheet, View } from "react-native";

const NAVY = "#0F2A5C";
const GOLD = "#C9A961";

/**
 * Fond décoratif partagé par les écrans d'authentification (login + register).
 *
 * Composition volontairement organique :
 *  - 2 halos ancrés dans les coins (profondeur)
 *  - 1 halo "débordant" à mi-hauteur sur la droite (asymétrie naturelle)
 *  - 1 glow diffus derrière le logo, légèrement décalé
 *  - Quelques points et anneaux fins dispersés sans grille
 *
 * Toutes les opacités restent faibles (0.03 → 0.28) pour ne jamais
 * détourner l'attention du formulaire.
 */
export function AuthBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* ── 1. Grands halos de profondeur (coins) ── */}
      <View style={styles.blobTopRight} />
      <View style={styles.blobBottomLeft} />

      {/* ── 2. Halo "débordant" volontairement décalé (asymétrie) ── */}
      <View style={styles.blobOffsetRight} />

      {/* ── 3. Glow diffus derrière le logo, décalé vers la gauche ── */}
      <View style={styles.centerGlow} />

      {/* ── 4. Petits points d'accent (dispersion sans grille) ── */}
      <View style={[styles.dot, styles.dot1]} />
      <View style={[styles.dot, styles.dot2]} />
      <View style={[styles.dot, styles.dot3]} />
      <View style={[styles.dotGold, styles.dot4]} />
      <View style={[styles.dotGold, styles.dot5]} />

      {/* ── 5. Anneaux fins (élégance) ── */}
      <View style={styles.ringGold} />
      <View style={styles.ringNavy} />
    </View>
  );
}

const styles = StyleSheet.create({
  /* — Grands halos ancrés — */
  blobTopRight: {
    position: "absolute",
    top: -120,
    right: -110,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: NAVY,
    opacity: 0.05,
  },
  blobBottomLeft: {
    position: "absolute",
    bottom: 20,
    left: -150,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: GOLD,
    opacity: 0.07,
  },

  /* — Halo débordant, volontairement non-aligné sur un coin —
     Positionné à ~42% de la hauteur, à moitié sorti sur la droite.
     Il crée une respiration asymétrique : l'œil le perçoit comme un
     débordement naturel, pas comme un élément posé. */
  blobOffsetRight: {
    position: "absolute",
    top: "42%",
    right: -95,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: NAVY,
    opacity: 0.04,
  },

  /* — Glow central derrière le logo (légèrement décalé à gauche) — */
  centerGlow: {
    position: "absolute",
    top: -70,
    left: "50%",
    marginLeft: -190,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: GOLD,
    opacity: 0.045,
  },

  /* — Points — */
  dot: {
    position: "absolute",
    backgroundColor: NAVY,
    borderRadius: 99,
  },
  dotGold: {
    position: "absolute",
    backgroundColor: GOLD,
    borderRadius: 99,
  },
  dot1: { top: 110, left: 44, width: 6, height: 6, opacity: 0.18 },
  dot2: { top: 268, right: 52, width: 5, height: 5, opacity: 0.14 },
  dot3: { bottom: 220, left: 38, width: 4, height: 4, opacity: 0.16 },
  dot4: { bottom: 148, right: 40, width: 8, height: 8, opacity: 0.22 },
  dot5: { top: "58%", left: 30, width: 5, height: 5, opacity: 0.13 },

  /* — Anneaux — */
  ringGold: {
    position: "absolute",
    top: "32%",
    right: 28,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.2,
    borderColor: GOLD,
    opacity: 0.28,
  },
  ringNavy: {
    position: "absolute",
    top: "72%",
    left: 34,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: NAVY,
    opacity: 0.15,
  },
});