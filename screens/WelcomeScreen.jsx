import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { StatusBar, ScrollView, StyleSheet, Text, View } from "react-native";
import ThemedButton from "../components/ui/ThemedButton";
import { useTheme } from "../theme/ThemeProvider";

export default function WelcomeScreen({ navigation }) {
  const { colors } = useTheme();

  useEffect(() => {}, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.outerScrollContent}
        showsVerticalScrollIndicator={true}
      >
        <View style={[styles.hero, { backgroundColor: colors.brand }]}>
          <View style={[styles.heroBlob, styles.blobOne]} />
          <View style={[styles.heroBlob, styles.blobTwo]} />

          <View style={styles.content}>
            <View style={styles.logoContainer}>
              <Ionicons name="people-circle-outline" size={80} color="#FFFFFF" />
            </View>
            <Text style={styles.title}>Digital Committee</Text>
            <Text style={styles.subtitle}>Secure and transparent committee management</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <ThemedButton
            label="SIGN IN"
            onPress={() => navigation.navigate("Login")}
            style={styles.mainBtn}
          />
          <ThemedButton
            label="SIGN UP"
            variant="outline"
            onPress={() => navigation.navigate("Signup")}
            style={styles.mainBtn}
          />
        </View>

        <Text style={[styles.footer, { color: colors.text }]}>@ Digital Committee • 2026</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  outerScrollContent: {
    flexGrow: 1,
  },
  hero: {
    height: "65%",
    justifyContent: "center",
    alignItems: "center",
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: "hidden",
    paddingHorizontal: 30,
  },
  heroBlob: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.15,
  },
  blobOne: {
    width: 300,
    height: 300,
    backgroundColor: "#FFFFFF",
    top: -100,
    right: -100,
  },
  blobTwo: {
    width: 250,
    height: 250,
    backgroundColor: "#FFFFFF",
    bottom: -80,
    left: -80,
  },
  langIcon: {},
  content: {
    alignItems: "center",
  },
  logoContainer: {
    marginBottom: 20,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 30,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 1,
  },
  subtitle: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 16,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 24,
  },
  actions: {
    flex: 1,
    paddingHorizontal: 30,
    justifyContent: "center",
    marginTop: -40,
  },
  mainBtn: {
    marginBottom: 16,
  },
  footer: {
    textAlign: "center",
    fontSize: 12,
    marginBottom: 30,
    opacity: 0.6,
  },
  modalBackdrop: {},
  modalCard: {},
  modalTitle: {},
  langList: {},
  langItem: {},
  langText: {},
});
