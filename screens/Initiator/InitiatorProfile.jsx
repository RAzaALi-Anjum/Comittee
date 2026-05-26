import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import Card from "../../components/ui/Card";
import ScreenHeader from "../../components/ui/ScreenHeader";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";

const USERS_BASE = "https://com1-e2378-default-rtdb.firebaseio.com/users";

export default function InitiatorProfile() {
  const { colors, language: appLang } = useTheme();
  const tr = (en, ur) => (appLang === "ur" ? ur : en);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem("userData");
        const parsed = raw ? JSON.parse(raw) : null;
        const uid = parsed?.userId || parsed?.uid || null;
        if (!uid) {
          setProfile(null);
          return;
        }
        const data = await userService.getProfileRTDB(uid);
        setProfile(data || null);
      } catch {
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  const fullName = profile?.name || profile?.fullName || tr("Initiator", "انتظامی");

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={fullName}
        subtitle={profile?.email || "initiator@example.com"}
        height={260}
      >
        <View style={styles.headerContent}>
          <View style={styles.avatarWrapper}>
            {profile?.profilePicture ? (
              <Image source={{ uri: profile.profilePicture }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                <Text style={styles.avatarInitial}>
                  {fullName.slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={[styles.levelBadge, { backgroundColor: colors.success }]}>
              <Text style={styles.levelText}>Lvl {profile?.initiatorLevel ?? 1}</Text>
            </View>
          </View>
          <View style={styles.ratingBox}>
            <View style={styles.starRow}>
              {[1, 2, 3, 4].map((i) => (
                <Ionicons key={i} name="star" size={16} color="#fbbf24" />
              ))}
              <Ionicons name="star-outline" size={16} color="#fbbf24" />
            </View>
            <Text style={styles.ratingLabel}>{tr("Top Rated", "اعلی درجہ شدہ")}</Text>
          </View>
        </View>
      </ScreenHeader>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{tr("Profile Details", "پروفائل کی تفصیلات")}</Text>
        </View>

        <Card style={styles.profileCard}>
          <Field icon="person" label={tr("Father Name", "والد کا نام")} value={profile?.fatherName} colors={colors} />
          <Field icon="call" label={tr("Contact Number", "رابطہ نمبر")} value={profile?.contactNumber} colors={colors} />
          <Field icon="location" label={tr("Address", "پتہ")} value={profile?.address} colors={colors} />
          <Field icon="business" label={tr("City", "شہر")} value={profile?.city} colors={colors} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field icon="calendar" label={tr("Age", "عمر")} value={profile?.age} colors={colors} />
            </View>
            <View style={{ flex: 1 }}>
              <Field icon="male-female" label={tr("Gender", "جنس")} value={profile?.gender} colors={colors} />
            </View>
          </View>
          <Field icon="briefcase" label={tr("Occupation", "پیشہ")} value={profile?.occupation} colors={colors} />
        </Card>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{tr("Verification Status", "تصدیق کی صورتحال")}</Text>
        </View>

        <Card style={styles.statusCard}>
          <StatusRow label={tr("CNIC Verification", "شناختی کارڈ کی تصدیق")} status={profile?.cnic} colors={colors} />
          <StatusRow label={tr("Reference Check", "حوالہ جات کی جانچ")} status={profile?.referenceCnic} colors={colors} />
          <StatusRow label={tr("Bank Statement", "بینک سٹیٹمنٹ")} status={profile?.bankStatement} colors={colors} colors={colors} />
        </Card>
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

function StatusRow({ label, status, colors }) {
  const isOk = !!status;
  return (
    <View style={styles.statusRow}>
      <Text style={[styles.statusLabel, { color: colors.text }]}>{label}</Text>
      <View style={[styles.badge, { backgroundColor: isOk ? colors.success + '20' : colors.danger + '20' }]}>
        <Ionicons name={isOk ? "checkmark-circle" : "close-circle"} size={14} color={isOk ? colors.success : colors.danger} />
        <Text style={[styles.badgeText, { color: isOk ? colors.success : colors.danger }]}>
          {isOk ? "Verified" : "Pending"}
        </Text>
      </View>
    </View>
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
  ratingBox: {
    alignItems: 'flex-end',
  },
  starRow: {
    flexDirection: "row",
    gap: 4
  },
  ratingLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
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
  profileCard: {
    padding: 16,
  },
  statusCard: {
    padding: 16,
    gap: 12,
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
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
});

