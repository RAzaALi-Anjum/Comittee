import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import SuccessModal from "../components/SuccessModal";
import ThemedButton from "../components/ui/ThemedButton";
import ThemedInput from "../components/ui/ThemedInput";
import authService from "../services/authService";
import storageService from "../services/storageService";
import userService from "../services/userService";
import { useTheme } from "../theme/ThemeProvider";

export default function LoginScreen({ navigation, route }) {
  const role = route?.params?.role || "user";
  const { language: appLang, colors } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [successNext, setSuccessNext] = useState(() => () => { });
  const [successTitle, setSuccessTitle] = useState("Success");
  const [lang, setLang] = useState("en");
  const tr = (en, ur) => (lang === "ur" ? ur : en);

  // ── Brute force protection state ──
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(null);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const lockoutTimer = useRef(null);

  useEffect(() => {
    if (appLang) setLang(appLang);
  }, [appLang]);

  // Countdown timer for lockout
  useEffect(() => {
    if (lockoutTimer.current) clearInterval(lockoutTimer.current);

    if (lockoutUntil && lockoutUntil > Date.now()) {
      setLockoutSeconds(Math.ceil((lockoutUntil - Date.now()) / 1000));

      lockoutTimer.current = setInterval(() => {
        const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
        if (remaining <= 0) {
          clearInterval(lockoutTimer.current);
          lockoutTimer.current = null;
          setLockoutUntil(null);
          setLockoutSeconds(0);
          setFailedAttempts(0);
        } else {
          setLockoutSeconds(remaining);
        }
      }, 1000);
    }

    return () => {
      if (lockoutTimer.current) clearInterval(lockoutTimer.current);
    };
  }, [lockoutUntil]);

  const handleForgotPassword = () => {
    navigation.navigate("ForgotPassword");
  };

  const handleLogin = async () => {
    // Check lockout
    if (lockoutUntil && lockoutUntil > Date.now()) {
      Alert.alert(
        tr("Account Locked", "اکاؤنٹ لاک"),
        tr(
          `Too many failed attempts. Try again after ${lockoutSeconds} seconds.`,
          `بہت زیادہ ناکام کوششیں۔ ${lockoutSeconds} سیکنڈ بعد دوبارہ کوشش کریں۔`
        )
      );
      return;
    }

    if (!email || !password) {
      Alert.alert(tr("Error", "خرابی"), tr("Email and Password are required", "ای میل اور پاس ورڈ درکار ہیں"));
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert(tr("Invalid Email", "غلط ای میل"), tr("Please enter a valid email address", "براہ کرم درست ای میل درج کریں"));
      return;
    }

    try {
      // 1. Authenticate
      const user = await authService.login(email, password);
      const userId = user.uid;
      const token = await user.getIdToken();

      // 2. Fetch User Profile (RTDB)
      let userData = await userService.getProfileRTDB(userId);

      if (!userData) {
        // Create basic profile if missing
        userData = {
          fullName: email.split("@")[0],
          email,
          isComplete: false,
        };
        await userService.createProfileRTDB(userId, userData);
      }

      // 3. Fetch/Sync Firestore Data (Role, status, systemId)
      let profileFs = await userService.getProfileFirestore(userId);
      if (!profileFs) {
        // Initial Firestore structure
        profileFs = {
          role: (email.includes("admin@") ? "admin" : "user"),
          initiatorStatus: "none",
          email: userData?.email || email,
        };
        await userService.updateProfileFirestore(userId, profileFs);
      }

      const roleFromFs = profileFs.role || "user";
      const initiatorStatus = profileFs.initiatorStatus || "none";
      let systemId = profileFs.systemId || userData?.systemId;

      if (!systemId) {
        systemId = `USR-${userId.slice(0, 6).toUpperCase()}`;
        await userService.updateProfileFirestore(userId, { systemId });
        await userService.updateProfileRTDB(userId, { systemId });
      }

      const displayName = userData?.fullName || profileFs?.fullName || email.split("@")[0];

      // 4. Save to storage
      const userStorage = {
        userId,
        fullName: displayName,
        email: userData.email || email,
        profilePicture: userData.profilePicture || null,
        token,
        role: roleFromFs,
        initiatorStatus,
        systemId,
      };
      await storageService.setUserData(userStorage);

      // 5. Navigate
      setSuccessTitle(tr(`Welcome back, ${displayName}!`, `خوش آمدید، ${displayName}!`));
      setSuccessNext(() => () => {
        if (roleFromFs === "admin") {
          navigation.replace("AdminDashboard");
        } else if (userData.isComplete || profileFs.isComplete) {
          navigation.replace("UserAuthWrapper");
        } else {
          navigation.replace("CompleteProfile", { userId, email: userData.email || email });
        }
      });
      setSuccessVisible(true);

      // Reset failed attempts on success
      setFailedAttempts(0);
      setLockoutUntil(null);

    } catch (err) {
      // Track failed attempts
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);

      if (newAttempts >= 3) {
        const lockUntil = Date.now() + 30000; // 30 seconds
        setLockoutUntil(lockUntil);
        Alert.alert(
          tr("Account Locked", "اکاؤنٹ لاک"),
          tr(
            "Too many failed attempts. Try again after 30 seconds.",
            "بہت زیادہ ناکام کوششیں۔ 30 سیکنڈ بعد دوبارہ کوشش کریں۔"
          )
        );
      } else {
        const remaining = 3 - newAttempts;
        Alert.alert(
          tr("Error", "خرابی"),
          `${err.message}\n\n${tr(
            `${remaining} attempt${remaining > 1 ? "s" : ""} remaining before lockout.`,
            `لاک آؤٹ سے پہلے ${remaining} کوششیں باقی ہیں۔`
          )}`
        );
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.outerScrollContent}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.hero, { backgroundColor: colors.brand }]}>
          <View style={styles.heroBlobOne} />
          <View style={styles.heroBlobTwo} />
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.heroTextContainer}>
            <Text style={styles.heroSmall}>{tr("Hello,", "ہیلو،")}</Text>
            <Text style={styles.heroTitle}>{tr("Sign in!", "سائن اِن!")}</Text>
          </View>
        </View>

        <View style={styles.scrollContent}>
          <View style={[styles.panel, { backgroundColor: colors.card }]}>
            {/* Lockout Banner */}
            {lockoutUntil && lockoutUntil > Date.now() && (
              <View style={styles.lockoutBanner}>
                <Ionicons name="lock-closed" size={18} color="#fff" />
                <Text style={styles.lockoutText}>
                  {tr(
                    `Too many failed attempts. Try again in ${lockoutSeconds}s`,
                    `بہت زیادہ ناکام کوششیں۔ ${lockoutSeconds} سیکنڈ میں دوبارہ کوشش کریں`
                  )}
                </Text>
              </View>
            )}

            <ThemedInput
              label={tr("Email Address", "ای میل ایڈریس")}
              placeholder={tr("Enter your email", "اپنی ای میل درج کریں")}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              placeholderTextColor={colors.textSecondary}
            />

            <View style={styles.passwordContainer}>
              <ThemedInput
                label={tr("Password", "پاس ورڈ")}
                placeholder={tr("Enter your password", "اپنا پاس ورڈ درج کریں")}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                placeholderTextColor={colors.textSecondary}
                style={{ flex: 1 }}
              />
              <TouchableOpacity onPress={() => setShowPassword((p) => !p)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotWrapper}>
              <Text style={[styles.forgotLink, { color: colors.brand }]}>{tr("Forgot password?", "پاس ورڈ بھول گئے؟")}</Text>
            </TouchableOpacity>

            <ThemedButton label="Sign In" onPress={handleLogin} style={{ marginTop: 10 }} />

            <View style={[styles.signupPrompt, { borderTopColor: colors.border }]}>
              <Text style={[styles.footerText, { color: colors.text }]}>
                {tr("Don't have an account?", "کیا آپ کا اکاؤنٹ نہیں؟")}{" "}
                <Text
                  style={[styles.footerLink, { color: colors.brand }]}
                  onPress={() => navigation.navigate("Signup", { role: "user" })}
                >
                  {tr("Sign Up", "سائن اپ")}
                </Text>
              </Text>
            </View>
          </View>
        </View>

        <Text style={[styles.footer, { color: colors.text }]}>@ Digital Committee • 2026</Text>
      </ScrollView>

      <SuccessModal
        visible={successVisible}
        title={successTitle}
        onClose={() => {
          setSuccessVisible(false);
          const next = successNext;
          next();
        }}
      />
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
    height: 240,
    paddingHorizontal: 28,
    paddingTop: 60,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    overflow: "hidden",
  },
  heroBlobOne: {
    position: "absolute",
    top: -40,
    right: -30,
    width: 160,
    height: 160,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 100,
  },
  heroBlobTwo: {
    position: "absolute",
    bottom: -60,
    left: -50,
    width: 200,
    height: 200,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 120,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  heroTextContainer: {
    marginTop: 0,
  },
  heroSmall: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    opacity: 0.9,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "900",
    marginTop: 4,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 20,
  },
  panel: {
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  eyeBtn: {
    padding: 14,
    marginBottom: 16,
    marginLeft: -50,
  },
  forgotWrapper: {
    alignItems: "flex-end",
    marginBottom: 20,
    marginTop: -8,
  },
  forgotLink: {
    fontWeight: "700",
    fontSize: 14,
  },
  signupPrompt: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  footerText: {
    textAlign: "center",
    fontSize: 15,
    fontWeight: "500",
  },
  footerLink: {
    fontWeight: "800",
    textDecorationLine: "underline",
  },
  footer: {
    textAlign: "center",
    fontSize: 12,
    marginBottom: 20,
    opacity: 0.5,
  },
  lockoutBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EF4444",
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  lockoutText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
});
