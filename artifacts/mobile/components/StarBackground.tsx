import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, StyleSheet, View } from "react-native";

const { width, height } = Dimensions.get("screen");

const NAVY = "#0F2A5C";
const GOLD = "#C9A961";
const WARM_BG = "#F7F5F0";

// ─────────────────────────────────────────────────────────────
//  Mode NUIT : starfield (inchangé)
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
//  Mode CLAIR premium : base chaude, halos doux, hairlines fines
// ─────────────────────────────────────────────────────────────
function LightLayer() {
  return (
    <>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: WARM_BG }]} />

      {/* Halos radiaux doux */}
      <View style={ss.glowTopRight} />
      <View style={ss.glowBottomLeft} />
      <View style={ss.glowCenter} />

      {/* Hairlines dorées et navy (élégance minimale) */}
      <View style={[ss.hairlineGold, { top: 130, left: 34, width: 58 }]} />
      <View style={[ss.hairlineGold, { top: "48%", right: 42, width: 46 }]} />
      <View style={[ss.hairlineNavy, { bottom: 180, left: 48, width: 38 }]} />

      {/* Points accent */}
      <View style={[ss.dotNavy, { top: 190, left: 44, width: 5, height: 5, opacity: 0.20 }]} />
      <View style={[ss.dotGold, { top: 360, right: 52, width: 6, height: 6, opacity: 0.28 }]} />
      <View style={[ss.dotNavy, { bottom: 240, left: 40, width: 4, height: 4, opacity: 0.18 }]} />
      <View style={[ss.dotGold, { bottom: 160, right: 44, width: 4, height: 4, opacity: 0.22 }]} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
//  Composant public
// ─────────────────────────────────────────────────────────────
export default function StarBackground({ dark = false }: { dark?: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {dark ? <DarkLayer /> : <LightLayer />}
    </View>
  );
}

const ss = StyleSheet.create({
  glowTopRight: {
    position: "absolute", top: -140, right: -120,
    width: 320, height: 320, borderRadius: 160,
    backgroundColor: NAVY, opacity: 0.045,
  },
  glowBottomLeft: {
    position: "absolute", bottom: -60, left: -140,
    width: 340, height: 340, borderRadius: 170,
    backgroundColor: GOLD, opacity: 0.07,
  },
  glowCenter: {
    position: "absolute", top: -80, left: "50%", marginLeft: -180,
    width: 320, height: 320, borderRadius: 160,
    backgroundColor: GOLD, opacity: 0.045,
  },
  hairlineGold: {
    position: "absolute", height: 1, backgroundColor: GOLD, opacity: 0.35,
  },
  hairlineNavy: {
    position: "absolute", height: 1, backgroundColor: NAVY, opacity: 0.12,
  },
  dotNavy: { position: "absolute", backgroundColor: NAVY, borderRadius: 99 },
  dotGold: { position: "absolute", backgroundColor: GOLD, borderRadius: 99 },
});