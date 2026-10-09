import Feather from "@expo/vector-icons/Feather";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/context/ThemeContext";

// ═══════════════════════════════════════════════════════════════
//  CHARTE GRAPHIQUE OFFICIELLE
// ═══════════════════════════════════════════════════════════════
const GOLD = "#D4AF37";

// Type des noms d'icônes Feather pour éviter les `any`
type FeatherName = React.ComponentProps<typeof Feather>["name"];

type TabIconProps = {
  color: string;
  focused: boolean;
  name: FeatherName;
  accent: string;
};

/**
 * Icône de tab avec indicateur doré sous l'icône active.
 * Le petit trait doré (3px de haut, 18px de large) signale
 * clairement l'onglet actif, sans casser l'harmonie.
 */
function TabIcon({ color, focused, name, accent }: TabIconProps) {
  return (
    <View style={styles.iconWrapper}>
      <View
        style={[
          styles.iconInner,
          focused && { backgroundColor: accent + "14" },
        ]}
      >
        <Feather name={name} size={22} color={color} />
      </View>
      {focused && <View style={styles.goldIndicator} />}
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { colors } = useTheme();

  const renderIcon = (name: FeatherName) => (props: {
    color: string;
    focused: boolean;
  }) => (
    <TabIcon
      color={props.color}
      focused={props.focused}
      name={name}
      accent={colors.accent}
    />
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopWidth: 1,
          borderTopColor: colors.separator,
          elevation: 20,
          paddingBottom: isWeb ? 8 : insets.bottom,
          height: isWeb ? 60 : 60 + insets.bottom,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: "Inter_500Medium",
          marginTop: 2,
        },
        tabBarBackground: () => (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.tabBar },
            ]}
          />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Accueil", tabBarIcon: renderIcon("home") }}
      />
      <Tabs.Screen
        name="new-order"
        options={{ title: "Commander", tabBarIcon: renderIcon("shopping-cart") }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: "Commandes", tabBarIcon: renderIcon("list") }}
      />
      <Tabs.Screen
        name="wallet"
        options={{ title: "Dépôt", tabBarIcon: renderIcon("credit-card") }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profil", tabBarIcon: renderIcon("user") }}
      />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrapper: {
    alignItems: "center",
    justifyContent: "center",
    height: 30,
    paddingTop: 2,
  },
  iconInner: {
    width: 34,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  goldIndicator: {
    position: "absolute",
    bottom: -5,
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: GOLD,
  },
});