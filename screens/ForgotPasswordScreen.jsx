import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ThemedButton from "../components/ui/ThemedButton";
import ThemedInput from "../components/ui/ThemedInput";
import apiClient from "../services/apiClient";
import { useTheme } from "../theme/ThemeProvider";

export default function ForgotPasswordScreen({ navigation }) {
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [toastType, setToastType] = useState("error"); // 'error' | 'success'
  const [toastVisible, setToastVisible] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const showToast = (message, type = "error") => {
    setToastMsg(message);
    setToastType(type);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 4000);
  };

  const handleSendResetLink = async () => {
    if (!email) {
      showToast("Please enter your email address", "error");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showToast("Please enter a valid email address", "error");
      return;
    }

    setLoading(true);
    try {
      const result = await apiClient.backendPost("/password-reset/request", {
        email: email.trim().toLowerCase(),
      });

      if (result?.success) {
        setEmailSent(true);
        showToast("Password reset link sent to your email", "success");
      } else {
        showToast(result?.error || "Failed to send reset link", "error");
      }
    } catch (err) {
      const msg = err?.message || "Network error. Try again.";
      if (msg.includes("incorrect") || msg.includes("not found") || err?.status === 404) {
        showToast("Your email is incorrect", "error");
      } else {
        showToast(msg, "error");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Toast */}
      {toastVisible && (
        <View
          style={[
            styles.toast,
            {
              backgroundColor:
                toastType === "success" ? "#10B981" : "#EF4444",
            },
          ]}
        >
          <Ionicons
            name={toastType === "success" ? "checkmark-circle" : "alert-circle"}
            size={18}
            color="#fff"
          />
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.outerScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.hero, { backgroundColor: colors.brand }]}>
          <View style={styles.heroBlobOne} />
          <View style={styles.heroBlobTwo} />
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.heroTextContainer}>
            <Text style={styles.heroSmall}>Forgot your</Text>
            <Text style={styles.heroTitle}>Password?</Text>
          </View>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View style={styles.scrollContent}>
            <View style={[styles.panel, { backgroundColor: colors.card }]}>
              {/* Logo */}
              <View style={styles.logoContainer}>
                <Image
                  source={require("../assets/images/logo.png")}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>

              {!emailSent ? (
                <>
                  <Text style={[styles.description, { color: colors.textSecondary }]}>
                    Enter your registered email address. We'll send you a one-time link to reset your password.
                  </Text>

                  <ThemedInput
                    label="Email Address"
                    placeholder="Enter your email"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    placeholderTextColor={colors.textSecondary}
                  />

                  <ThemedButton
                    label={
                      loading ? (
                        <View style={styles.loadingRow}>
                          <ActivityIndicator size="small" color="#fff" />
                          <Text style={styles.loadingText}> Sending...</Text>
                        </View>
                      ) : (
                        "Send Reset Link"
                      )
                    }
                    onPress={handleSendResetLink}
                    style={{ marginTop: 16 }}
                    disabled={loading}
                  />

                  <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.backToLogin}
                  >
                    <Text style={[styles.backToLoginText, { color: colors.brand }]}>
                      ← Back to Sign In
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                /* Success state */
                <View style={styles.successContainer}>
                  <View style={[styles.successIconWrap, { backgroundColor: "#10B981" + "20" }]}>
                    <Ionicons name="mail-outline" size={40} color="#10B981" />
                  </View>
                  <Text style={[styles.successTitle, { color: colors.text }]}>
                    Check Your Email
                  </Text>
                  <Text style={[styles.successDesc, { color: colors.textSecondary }]}>
                    We've sent a password reset link to{"\n"}
                    <Text style={{ fontWeight: "700", color: colors.text }}>{email}</Text>
                  </Text>

                  <View style={[styles.infoBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Ionicons name="information-circle" size={16} color={colors.brand} />
                    <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                      The link expires in 15 minutes and can only be used once.
                    </Text>
                  </View>

                  <ThemedButton
                    label="Back to Sign In"
                    onPress={() => navigation.goBack()}
                    style={{ marginTop: 20 }}
                  />

                  <TouchableOpacity
                    onPress={() => {
                      setEmailSent(false);
                      setEmail("");
                    }}
                    style={styles.resendBtn}
                  >
                    <Text style={[styles.resendText, { color: colors.brand }]}>
                      Didn't receive it? Try again
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>

        <Text style={[styles.footer, { color: colors.text }]}>@ Digital Committee • 2026</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  outerScrollContent: { flexGrow: 1 },
  hero: {
    height: 240,
    paddingHorizontal: 28,
    paddingTop: 60,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    overflow: "hidden",
  },
  heroBlobOne: {
    position: "absolute", top: -40, right: -30,
    width: 160, height: 160,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 100,
  },
  heroBlobTwo: {
    position: "absolute", bottom: -60, left: -50,
    width: 200, height: 200,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 120,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center", alignItems: "center",
    marginBottom: 20,
  },
  heroTextContainer: { marginTop: 0 },
  heroSmall: {
    color: "#FFFFFF", fontSize: 18, fontWeight: "600", opacity: 0.9,
  },
  heroTitle: {
    color: "#FFFFFF", fontSize: 36, fontWeight: "900", marginTop: 4,
  },
  scrollContent: {
    flexGrow: 1, paddingHorizontal: 24, paddingTop: 30, paddingBottom: 20,
  },
  panel: {
    borderRadius: 24, padding: 24,
    shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 }, elevation: 5,
  },
  logoContainer: {
    alignItems: "center", marginBottom: 20,
  },
  logo: {
    width: 80, height: 80, borderRadius: 20,
  },
  description: {
    fontSize: 14, lineHeight: 22, textAlign: "center", marginBottom: 24,
  },
  loadingRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
  },
  loadingText: {
    color: "#fff", fontSize: 16, fontWeight: "700",
  },
  backToLogin: {
    marginTop: 20, alignItems: "center", paddingVertical: 8,
  },
  backToLoginText: {
    fontWeight: "700", fontSize: 14,
  },
  successContainer: {
    alignItems: "center", paddingVertical: 10,
  },
  successIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  successTitle: {
    fontSize: 22, fontWeight: "800", marginBottom: 8,
  },
  successDesc: {
    fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 16,
  },
  infoBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderRadius: 10, borderWidth: 1,
  },
  infoText: {
    fontSize: 12, flex: 1,
  },
  resendBtn: {
    marginTop: 14, paddingVertical: 8,
  },
  resendText: {
    fontWeight: "600", fontSize: 14,
  },
  toast: {
    position: "absolute", top: 50, left: 20, right: 20,
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 14, borderRadius: 12, zIndex: 999,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },
  toastText: {
    color: "#fff", fontSize: 14, fontWeight: "600", flex: 1,
  },
  footer: {
    textAlign: "center", fontSize: 12, marginBottom: 20, opacity: 0.5,
  },
});
