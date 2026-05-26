import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import ThemedButton from "../components/ui/ThemedButton";
import { useTheme } from "../theme/ThemeProvider";

export default function HomeScreen({ navigation }) {
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" />

      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: colors.brand }]}>
        <View style={styles.heroBlob} />
        <View style={styles.heroBlobTwo} />
        <View style={styles.logoContainer}>
          <Ionicons name="people-circle-outline" size={64} color="#FFFFFF" />
        </View>
        <Text style={styles.heroTitle}>Digital Committee</Text>
        <Text style={styles.heroSubtitle}>Select your access point</Text>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <ThemedButton
          label="Open App (Role-Based)"
          onPress={() => navigation.navigate("UserAuthWrapper")}
          style={styles.mainBtn}
        />
        <ThemedButton
          label="Initiator Dashboard"
          variant="outline"
          onPress={() => navigation.navigate("InitiatorDashboard")}
          style={styles.mainBtn}
        />
        <ThemedButton
          label="Login / Signup"
          variant="secondary"
          onPress={() => navigation.navigate("Login", { role: "user" })}
          style={styles.mainBtn}
        />
      </View>

      <Text style={[styles.footer, { color: colors.textSecondary }]}>@ Digital Committee • 2026</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: {
    height: "45%",
    justifyContent: "center",
    alignItems: "center",
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: "hidden",
    paddingHorizontal: 30,
  },
  heroBlob: {
    position: "absolute",
    width: 250,
    height: 250,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 125,
    top: -80,
    right: -60,
  },
  heroBlobTwo: {
    position: "absolute",
    width: 200,
    height: 200,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 100,
    bottom: -60,
    left: -40,
  },
  logoContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 24,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 15,
    textAlign: "center",
    marginTop: 6,
    fontWeight: "500",
  },
  actions: {
    flex: 1,
    paddingHorizontal: 30,
    justifyContent: "center",
    marginTop: -20,
  },
  mainBtn: {
    marginBottom: 14,
  },
  footer: {
    textAlign: "center",
    fontSize: 12,
    marginBottom: 24,
    opacity: 0.6,
  },
});
