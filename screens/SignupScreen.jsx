import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
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

export default function SignupScreen({ navigation }) {
  const { language: appLang, colors } = useTheme();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [lang, setLang] = useState("en");
  const [agree, setAgree] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);

  const tr = (en, ur) => (lang === "ur" ? ur : en);

  useEffect(() => {
    if (appLang) setLang(appLang);
  }, [appLang]);

  const handleSignup = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!fullName || !email || !password || !confirmPassword) {
      Alert.alert(tr("Error", "خرابی"), tr("All fields are required", "تمام فیلڈز ضروری ہیں"));
      return;
    }

    if (!emailRegex.test(email)) {
      Alert.alert(tr("Invalid Email", "غلط ای میل"), tr("Please enter a valid email address", "براہ کرم ایک درست ای میل درج کریں"));
      return;
    }

    if (password.length < 8) {
      Alert.alert(tr("Invalid Password", "غلط پاس ورڈ"), tr("Password must be at least 8 characters", "پاس ورڈ کم از کم 8 حروف کا ہونا چاہیے"));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(tr("Password Mismatch", "پاس ورڈ مماثل نہیں"), tr("Password and Confirm Password must match", "پاس ورڈ اور تصدیق پاس ورڈ ایک جیسے ہونے چاہئیں"));
      return;
    }
    if (!agree) {
      setTermsVisible(true);
      return;
    }

    try {
      // 1. Authenticate / Create Firebase User AND initial backend profile setup
      // This combined step handles Firebase Auth + Bcrypt hashing + initial RTDB entry
      const user = await authService.signup(email, password, fullName);
      const userId = user.uid;

      // 2. Parallel tasks: Firestore sync and local storage
      // We skip RTDB sync here because the backend /auth/signup already handled it
      const [token, profile] = await Promise.all([
        user.getIdToken(),
        userService.syncUserProfile(userId, user, {
          fullName,
          isComplete: false,
          role: "user",
          initiatorStatus: "none"
        }, { skipRTDB: true })
      ]);

      // 3. Save to local storage
      const userStorage = {
        userId: userId,
        fullName: fullName,
        email: email,
        token: token,
        role: "user",
        initiatorStatus: null,
        systemId: profile.systemId,
        language: lang,
        agreedToTerms: true,
      };
      await storageService.setUserData(userStorage);

      setSuccessVisible(true);
    } catch (error) {
      Alert.alert(tr("Error", "خرابی"), error.message);
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
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtnHero}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.heroTitle}>{tr("Create Your Account", "اپنا اکاؤنٹ بنائیں")}</Text>
        </View>

        <View style={styles.scrollContent}>
          <View style={[styles.panel, { backgroundColor: colors.card }]}>
            <ThemedInput
              label={tr("Full Name", "پورا نام")}
              placeholder={tr("Enter your full name", "اپنا پورا نام درج کریں")}
              value={fullName}
              onChangeText={setFullName}
            />

            <ThemedInput
              label={tr("Email Address", "ای میل ایڈریس")}
              placeholder={tr("example@gmail.com", "مثال@gmail.com")}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />

            <View style={styles.passwordRow}>
              <ThemedInput
                label={tr("Password (8 characters)", "پاس ورڈ (8 حروف)")}
                placeholder={tr("••••••••", "••••••••")}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                style={{ flex: 1 }}
              />
              <TouchableOpacity onPress={() => setShowPassword((p) => !p)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.passwordRow}>
              <ThemedInput
                label={tr("Confirm Password", "پاس ورڈ کی تصدیق کریں")}
                placeholder={tr("••••••••", "••••••••")}
                secureTextEntry={!showConfirm}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                style={{ flex: 1 }}
              />
              <TouchableOpacity onPress={() => setShowConfirm((p) => !p)} style={styles.eyeBtn}>
                <Ionicons name={showConfirm ? "eye-off-outline" : "eye-outline"} size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.termsRow}
              activeOpacity={0.7}
              onPress={() => setAgree((a) => !a)}
            >
              <View style={[styles.checkbox, agree && { backgroundColor: colors.brand, borderColor: colors.brand }]}>
                {agree && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
              </View>
              <Text style={[styles.termsText, { color: colors.text }]}>
                {tr("I agree to", "میں متفق ہوں")}{" "}
                <Text style={[styles.link, { color: colors.brand }]} onPress={() => setTermsVisible(true)}>
                  {tr("Terms & Privacy", "شرائط و رازداری")}
                </Text>
              </Text>
            </TouchableOpacity>

            <ThemedButton label="Sign Up" onPress={handleSignup} style={{ marginTop: 10 }} />

            <View style={styles.loginPrompt}>
              <Text style={[styles.footerText, { color: colors.text }]}>
                {tr("Already have an account?", "کیا آپ کا اکاؤنٹ پہلے سے موجود ہے؟")}{" "}
                <Text
                  style={[styles.footerLink, { color: colors.brand }]}
                  onPress={() => navigation.navigate("Login")}
                >
                  {tr("Log In", "لاگ ان")}
                </Text>
              </Text>
            </View>
          </View>
        </View>

        <Text style={[styles.footer, { color: colors.text }]}>
          @ Digital Committee • 2026
        </Text>
      </ScrollView>

      <SuccessModal
        visible={successVisible}
        title={tr("Account created successfully!", "اکاؤنٹ کامیابی سے بن گیا!")}
        onClose={() => {
          setSuccessVisible(false);
          navigation.replace("CompleteProfile");
        }}
      />

      <Modal visible={termsVisible} transparent animationType="slide" onRequestClose={() => setTermsVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{tr("Terms & Privacy", "شرائط و رازداری")}</Text>
              <TouchableOpacity onPress={() => setTermsVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBodyScroll}>
              <Text style={[styles.modalBody, { color: colors.text }]}>
                {tr(
                  "1. Data Usage: We collect minimal data for committee management.\n\n2. Payments: All transactions are secure and recorded transparently.\n\n3. Notifications: You will receive updates about committee turns and payments.",
                  "1. ڈیٹا کا استعمال: ہم کمیٹی مینجمنٹ کے لیے محدود ڈیٹا اکٹھا کرتے ہیں۔\n\n2. ادائیگیاں: تمام ادائیگیاں محفوظ اور شفاف طریقے سے ریکارڈ کی جاتی ہیں۔\n\n3. نوٹیفکیشن: آپ کو کمیٹی ٹرنز اور ادائیگیوں کے بارے میں اپ ڈیٹس موصول ہوں گی۔"
                )}
              </Text>
            </ScrollView>
            <ThemedButton label="I Agree" onPress={() => { setAgree(true); setTermsVisible(false); }} style={{ marginTop: 20 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  outerScrollContent: {
    flexGrow: 1,
  },
  hero: {
    height: 180,
    paddingHorizontal: 28,
    paddingTop: 50,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    overflow: "hidden",
  },
  heroBlobOne: {
    position: "absolute",
    top: -30,
    right: -20,
    width: 140,
    height: 140,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 70,
  },
  heroBlobTwo: {
    position: "absolute",
    bottom: -40,
    left: -30,
    width: 160,
    height: 160,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 80,
  },
  backBtnHero: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
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
  passwordRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  eyeBtn: {
    padding: 14,
    marginBottom: 16,
    marginLeft: -50,
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    marginTop: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#ccc",
    marginRight: 10,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  termsText: {
    fontSize: 14,
    fontWeight: "500",
  },
  link: {
    fontWeight: "700",
    textDecorationLine: "underline"
  },
  loginPrompt: {
    marginTop: 20,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 28,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "900",
  },
  modalBodyScroll: {
    marginBottom: 10,
  },
  modalBody: {
    fontSize: 16,
    lineHeight: 24,
  },
});
