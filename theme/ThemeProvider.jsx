import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

const ThemeContext = createContext({
  preference: "system",
  setPreference: (_p) => { },
  language: "en",
  setLanguage: (_l) => { },
  colors: {
    background: "#FFF5EB",
    card: "#FFFFFF",
    text: "#111827",
    brand: "#800000",
    danger: "#800000",
    tabBg: "#FFF5EB",
  },
});

const LIGHT = {
  background: "#FFF9F0", // Creamy: Warm and soft background
  card: "#FFFFFF",
  text: "#0F172A", // Slate-900: Deep navy for high contrast
  textSecondary: "#64748B", // Slate-500: For labels and less important info
  brand: "#800000", // Maroon: Primary brand
  brandLight: "#FFF1F2", // Soft pinkish red for light tints
  border: "#E2E8F0", // Slate-200
  shadow: "rgba(0, 0, 0, 0.1)",
  danger: "#EF4444", // Modern Red
  success: "#10B981", // Emerald-500
  warning: "#F59E0B", // Amber-500
  info: "#3B82F6", // Blue-500
  tabBg: "#FFF9F0",
  inputBg: "#FFFFFF",
};

const DARK = {
  background: "#0F172A", // Slate-900
  card: "#1E293B", // Slate-800
  text: "#F1F5F9", // Slate-100
  textSecondary: "#94A3B8", // Slate-400
  brand: "#A52A2A", // Slightly brighter maroon for dark mode
  brandLight: "rgba(165, 42, 42, 0.2)",
  border: "#334155", // Slate-700
  shadow: "rgba(0, 0, 0, 0.3)",
  danger: "#FF4444",
  success: "#34D399",
  warning: "#FBBF24",
  info: "#60A5FA",
  tabBg: "#0F172A",
  inputBg: "#1E293B",
};

// Spacing & Radius Tokens — exported for direct use
export const TOKENS = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  radius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    xxl: 24,
    full: 9999,
  },
};

export function ThemeProvider({ children }) {
  const system = useColorScheme();
  const [preference, setPreference] = useState("system");
  const [language] = useState("en");

  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem("theme_pref");
        if (v === "system" || v === "light" || v === "dark") setPreference(v);
      } catch { }
    })();
  }, []);

  const colors = useMemo(() => {
    if (preference === "light") return LIGHT;
    if (preference === "dark") return DARK;
    return system === "dark" ? DARK : LIGHT;
  }, [preference, system]);

  const value = useMemo(
    () => ({
      preference,
      setPreference: async (p) => {
        setPreference(p);
        try {
          await AsyncStorage.setItem("theme_pref", p);
        } catch { }
      },
      language,
      setLanguage: async (_l) => { },
      colors,
    }),
    [preference, language, colors]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
