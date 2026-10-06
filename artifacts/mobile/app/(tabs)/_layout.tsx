import Feather from "@expo/vector-icons/Feather";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/context/ThemeContext";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { colors } = useTheme();

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
          height: isWeb ? 60 : 52 + insets.bottom,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: "Inter_500Medium",
          marginTop: 2,
        },
        tabBarBackground: () => (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.tabBar }]} />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Accueil",
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? [styles.activeTab, { backgroundColor: colors.accent + "22" }] : undefined}>
              <Feather name="home" size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="new-order"
        options={{
          title: "Commander",
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? [styles.activeTab, { backgroundColor: colors.accent + "22" }] : undefined}>
              <Feather name="shopping-cart" size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Commandes",
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? [styles.activeTab, { backgroundColor: colors.accent + "22" }] : undefined}>
              <Feather name="list" size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: "Dépôt",
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? [styles.activeTab, { backgroundColor: colors.accent + "22" }] : undefined}>
              <Feather name="credit-card" size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? [styles.activeTab, { backgroundColor: colors.accent + "22" }] : undefined}>
              <Feather name="user" size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  activeTab: {
    borderRadius: 10,
    padding: 4,
  },
});
