import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, StyleSheet, View } from "react-native";

const { width, height } = Dimensions.get("screen");

const NAVY = "#0F2A5C";
const GOLD = "#C9A961";
const BG   = "#FAF9F6";

// ─────────────────────────────────────────────────────────────
//  Mode NUIT : ancien starfield (uniquement si dark = true)
// ─────────────────────────────────────────────────────────────
const STAR_POSITIONS = [
  { x: 0.12, y: 0.08 }, { x: 0.28, y: 0.14 }, { x: 0.45, y: 0.06 },
  { x: 0.63, y: 0.11 }, { x: 0.80, y: 0.05 }, { x: 0.05, y: 0.22 },
  { x: 0.35, y: 0.28 }, { x: 0.55, y: 0.19 }, { x: 0.75, y: 0.25 },
  { x: 0.90, y: 0.18 }, { x: 0.15, y: 0.38 }, { x: 0.40, y: 0.42 },
  { x: 0.60, y: 0.35 }, { x: 0.82, y: 0.40 }, { x: 0.08, y: 0.52 },
  { x: 0.25, y: 0.58 }, { x: 0.50, y: 0.50 }, { x: 0.70, y: 0.55 },
  { x: 0.92, y: 0.48 }, { x: 0.18, y: 0.68 }, { x: 0.42, y: 0.72 },
  { x: 0.65, y: 0.65 }, { x: 0.85, y: 0.70 }, { x: 0.10, y: 0.82 },
  { x: 0.32, y: 0.88 }, { x: 0.55, y: 0.80 }, { x: 0.78, y: 0.85 },
  { x: 0.95, y: 0.78 }, { x: 0.22, y: 0.95 }, { x: 0.68, y: 0.92 },
];

function Star({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  const opacity = useRef(new Animated.Value(0.2)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, { toValue: 0.9, duration: 1500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.2, duration: 1500, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: x * width,
        top: y * height,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "white",
        opacity,
      }}
    />
  );
}

function DarkLayer() {
  return (
    <>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0A162B" }]} />
      {STAR_POSITIONS.map((pos, i) => (
        <Star
          key={i}
          x={pos.x}
          y={pos.y}
          size={i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : 1.5}
          delay={(i * 300) % 3000}
        />
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
//  Mode CLAIR (par défaut) : fond identique à la page de connexion
//  (halos navy/or doux + points + anneaux fins)
// ─────────────────────────────────────────────────────────────
function LightLayer() {
  return (
    <>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: BG }]} />
      {/* Halos */}
      <View style={ss.blobTopRight} />
      <View style={ss.blobBottomLeft} />
      <View style={ss.blobOffsetRight} />
      <View style={ss.centerGlow} />
      {/* Points */}
      <View style={[ss.dot, ss.dot1]} />
      <View style={[ss.dot, ss.dot2]} />
      <View style={[ss.dot, ss.dot3]} />
      <View style={[ss.dotGold, ss.dot4]} />
      <View style={[ss.dotGold, ss.dot5]} />
      {/* Anneaux */}
      <View style={ss.ringGold} />
      <View style={ss.ringNavy} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
//  Composant public
//  - Par défaut : fond CLAIR (identique login) — pour toutes les pages
//  - dark = true : fond sombre (starfield) — utilisé par le toggle nuit
// ─────────────────────────────────────────────────────────────
export default function StarBackground({ dark = false }: { dark?: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {dark ? <DarkLayer /> : <LightLayer />}
    </View>
  );
}

const ss = StyleSheet.create({
  /* Halos (identiques AuthBackground) */
  blobTopRight: {
    position: "absolute", top: -120, right: -110,
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: NAVY, opacity: 0.05,
  },
  blobBottomLeft: {
    position: "absolute", bottom: 20, left: -150,
    width: 340, height: 340, borderRadius: 170,
    backgroundColor: GOLD, opacity: 0.07,
  },
  blobOffsetRight: {
    position: "absolute", top: "42%", right: -95,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: NAVY, opacity: 0.04,
  },
  centerGlow: {
    position: "absolute", top: -70, left: "50%", marginLeft: -190,
    width: 340, height: 340, borderRadius: 170,
    backgroundColor: GOLD, opacity: 0.045,
  },
  /* Points */
  dot: { position: "absolute", backgroundColor: NAVY, borderRadius: 99 },
  dotGold: { position: "absolute", backgroundColor: GOLD, borderRadius: 99 },
  dot1: { top: 110, left: 44, width: 6, height: 6, opacity: 0.18 },
  dot2: { top: 268, right: 52, width: 5, height: 5, opacity: 0.14 },
  dot3: { bottom: 220, left: 38, width: 4, height: 4, opacity: 0.16 },
  dot4: { bottom: 148, right: 40, width: 8, height: 8, opacity: 0.22 },
  dot5: { top: "58%", left: 30, width: 5, height: 5, opacity: 0.13 },
  /* Anneaux */
  ringGold: {
    position: "absolute", top: "32%", right: 28,
    width: 38, height: 38, borderRadius: 19,
    borderWidth: 1.2, borderColor: GOLD, opacity: 0.28,
  },
  ringNavy: {
    position: "absolute", top: "72%", left: 34,
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1, borderColor: NAVY, opacity: 0.15,
  },
});