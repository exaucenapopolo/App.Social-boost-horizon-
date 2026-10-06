import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  colors: typeof darkColors;
}

const darkColors = {
  background: "#0A162B",
  surface: "#111E38",
  card: "rgba(17,32,58,0.85)",
  cardBorder: "rgba(255,255,255,0.09)",
  text: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.65)",
  textMuted: "rgba(255,255,255,0.38)",
  accent: "#1E90FF",
  accentLight: "#4DA6FF",
  success: "#4CAF50",
  error: "#FF6B6B",
  warning: "#FFD700",
  gradientStart: "#1e3c72",
  gradientEnd: "#6a0dad",
  tabBar: "#0A162B",
  headerBg: "#0A162B",
  inputBg: "rgba(255,255,255,0.06)",
  inputBorder: "rgba(255,255,255,0.12)",
  separator: "rgba(255,255,255,0.08)",
};

const lightColors = {
  background: "#F0F4FF",
  surface: "#FFFFFF",
  card: "rgba(255,255,255,0.95)",
  cardBorder: "rgba(30,60,114,0.12)",
  text: "#0A162B",
  textSecondary: "rgba(10,22,43,0.65)",
  textMuted: "rgba(10,22,43,0.40)",
  accent: "#1E90FF",
  accentLight: "#4DA6FF",
  success: "#2E7D32",
  error: "#C62828",
  warning: "#E65100",
  gradientStart: "#1e3c72",
  gradientEnd: "#6a0dad",
  tabBar: "#FFFFFF",
  headerBg: "#FFFFFF",
  inputBg: "rgba(30,60,114,0.05)",
  inputBorder: "rgba(30,60,114,0.15)",
  separator: "rgba(30,60,114,0.1)",
};

const THEME_KEY = "@sbh_theme";

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((val) => {
      if (val === "light" || val === "dark") setTheme(val);
    }).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const isDark = theme === "dark";
  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export { darkColors, lightColors };
