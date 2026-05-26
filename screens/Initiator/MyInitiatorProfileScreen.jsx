import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Card from "../../components/ui/Card";
import ScreenHeader from "../../components/ui/ScreenHeader";
import storageService from "../../services/storageService";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";

const isValidImageUrl = (uri) => {
  if (!uri || typeof uri !== "string") return false;
  return uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("data:image/");
};

export default function MyInitiatorProfileScreen({ navigation }) {
  const { colors, language: appLang } = useTheme();
  const tr = (en, ur) => (appLang === "ur" ? ur : en);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const parsed = await storageService.getUserData();
        if (!parsed) {
          setLoading(false);
          return;
        }
        const userId = parsed.userId || parsed.uid || parsed.id;
        if (!userId) {
          setLoading(false);
          return;
        }
        const p = await userService.getProfileRTDB(userId);
        setProfile(p || null);
      } catch (e) {
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, []);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>No profile data found.</Text>
      </View>
    );
  }

  const fullName = profile.name || profile.fullName || tr("Initiator", "انتظامی");

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={fullName}
        subtitle={profile.email || "initiator@example.com"}
        height={240}
        showBack={true}
        onBack={() => navigation.goBack()}
      >
        <View style={styles.headerContent}>
          <View style={styles.avatarWrapper}>
            {profile.profilePicture && isValidImageUrl(profile.profilePicture) ? (
              <Image source={{ uri: profile.profilePicture }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                <Text style={styles.avatarInitial}>
                  {fullName.slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={[styles.levelBadge, { backgroundColor: colors.success }]}>
              <Text style={styles.levelText}>Lvl {profile.initiatorLevel ?? 1}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.editBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
            onPress={() => navigation.navigate("CompleteProfile")}
          >
            <Ionicons name="create-outline" size={20} color="#FFF" />
            <Text style={styles.editText}>{tr("Edit", "ترمیم")}</Text>
          </TouchableOpacity>
        </View>
      </ScreenHeader>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{tr("Personal Information", "ذاتی معلومات")}</Text>
        </View>
        <Card style={styles.infoCard}>
          <Field icon="person" label={tr("Father Name", "والد کا نام")} value={profile.fatherName} colors={colors} />
          <Field icon="call" label={tr("Contact Number", "رابطہ نمبر")} value={profile.contactNumber} colors={colors} />
          <Field icon="location" label={tr("Address", "پتہ")} value={profile.address} colors={colors} />
          <Field icon="business" label={tr("City", "شہر")} value={profile.city} colors={colors} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field icon="calendar" label={tr("Age", "عمر")} value={profile.age} colors={colors} />
            </View>
            <View style={{ flex: 1 }}>
              <Field icon="male-female" label={tr("Gender", "جنس")} value={profile.gender} colors={colors} />
            </View>
          </View>
          <Field icon="briefcase" label={tr("Occupation", "پیشہ")} value={profile.occupation} colors={colors} />
        </Card>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{tr("Reference Details", "حوالہ جات کی تفصیل")}</Text>
        </View>
        <Card style={styles.infoCard}>
          <Field icon="people" label={tr("Reference Name", "حوالہ کا نام")} value={profile.referenceName} colors={colors} />
          <Field icon="map" label={tr("Reference Address", "حوالہ کا پتہ")} value={profile.referenceAddress} colors={colors} />
          <Field icon="call" label={tr("Reference Contact", "حوالہ کا رابطہ")} value={profile.referenceContact} colors={colors} />
        </Card>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{tr("Documents", "دستاویزات")}</Text>
        </View>
        <View style={styles.docRow}>
          {profile.cnic && isValidImageUrl(profile.cnic) ? (
            <DocCard label="CNIC" uri={profile.cnic} colors={colors} />
          ) : null}
          {profile.bankStatement && isValidImageUrl(profile.bankStatement) ? (
            <DocCard label="Bank Statement" uri={profile.bankStatement} colors={colors} />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function Field({ icon, label, value, colors }) {
  return (
    <View style={styles.fieldContainer}>
      <View style={[styles.fieldIcon, { backgroundColor: colors.brand + '10' }]}>
        <Ionicons name={icon} size={18} color={colors.brand} />
      </View>
      <View style={styles.fieldTexts}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.value, { color: colors.text }]}>{String(value ?? "—")}</Text>
      </View>
    </View>
  );
}

function DocCard({ label, uri, colors }) {
  return (
    <Card style={styles.docCard}>
      <Text style={[styles.docLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Image source={{ uri }} style={styles.docImage} />
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scrollView: { flex: 1, marginTop: -30 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },

  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)'
  },
  avatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)'
  },
  avatarInitial: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 32
  },
  levelBadge: {
    position: 'absolute',
    bottom: -5,
    right: -5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  levelText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900'
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  editText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14
  },

  sectionHeader: {
    marginTop: 24,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  infoCard: {
    padding: 16,
  },
  fieldContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  fieldIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  fieldTexts: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  value: {
    fontSize: 15,
    fontWeight: "600"
  },
  row: {
    flexDirection: 'row',
  },
  docRow: {
    flexDirection: 'row',
    gap: 12,
  },
  docCard: {
    flex: 1,
    padding: 12,
  },
  docLabel: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  docImage: {
    width: "100%",
    height: 120,
    borderRadius: 8,
  },
});

