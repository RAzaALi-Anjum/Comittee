import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { Image, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import userService from "../../services/userService";
import { TOKENS, useTheme } from "../../theme/ThemeProvider";
import { checkInitiatorReminders } from "../../utils/notificationTriggers";

export default function InitiatorDashboard({ navigation }) {
  const { colors } = useTheme();

  const [requestCount, setRequestCount] = useState(0);
  const [avatar, setAvatar] = useState(null);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");

  useFocusEffect(
    useCallback(() => {
      const fetchCounts = async () => {
        try {
          const stored = await AsyncStorage.getItem("userData");
          if (!stored) return;
          const parsed = JSON.parse(stored);
          const uid = parsed.userId || parsed.uid;
          setUserName(parsed.fullName || parsed.name || "Initiator");
          setUserEmail(parsed.email || "");

          const res = await fetch("https://com1-e2378-default-rtdb.firebaseio.com/participationRequests.json");
          const data = await res.json();
          if (data) {
            const count = Object.values(data).filter(
              (r) => r.initiatorId === uid && r.status === "Pending"
            ).length;
            setRequestCount(count);
          } else {
            setRequestCount(0);
          }
        } catch (err) {
          console.log("Error fetching counts", err);
        }
      };
      fetchCounts();
    }, [])
  );

  useEffect(() => {
    const runChecks = async () => {
      try {
        const stored = await AsyncStorage.getItem("userData");
        if (stored) {
          const parsed = JSON.parse(stored);
          const uid = parsed.userId || parsed.uid;
          if (uid) checkInitiatorReminders(uid);
          try {
            const profile = await userService.getProfileRTDB(uid);
            if (profile?.profilePicture) setAvatar(profile.profilePicture);
          } catch (e) { }
        }
      } catch (e) {
        console.log("Error running notification checks", e);
      }
    };
    runChecks();
  }, []);

  const DashboardCard = ({ title, icon, color, onPress, badge = 0 }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconCircle, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={26} color={color} />
      </View>
      <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
      {badge > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.brand }]}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
      <View style={styles.cardArrow}>
        <Ionicons name="chevron-forward" size={14} color={colors.textSecondary + '60'} />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={true}>

        {/* Hero Section */}
        <View style={[styles.hero, { backgroundColor: colors.brand }]}>
          <View style={styles.heroBlob} />
          <View style={styles.heroBlobTwo} />
          <View style={styles.heroInfo}>
            <View style={styles.heroHeader}>
              <View>
                <Text style={styles.heroSmall}>{"Initiator Panel"}</Text>
                <Text style={styles.heroTitle}>{userName}</Text>
                <Text style={styles.heroEmail}>{userEmail}</Text>
              </View>
              <View style={styles.settingsBtn}>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: "#ffffff55" }} />
                ) : (
                  <Ionicons name="person-circle-outline" size={56} color="#FFF" />
                )}
              </View>
            </View>

            <View style={styles.summaryBox}>
              <View style={styles.statusDot} />
              <Text style={styles.summaryText}>Authorized Initiator</Text>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
            <View style={[styles.line, { backgroundColor: colors.brand + '20' }]} />
          </View>

          <View style={styles.grid}>
            <DashboardCard
              title={"Create Committee"}
              icon="add-circle"
              color={colors.brand}
              onPress={() => navigation.navigate("CreateCommittee")}
            />
            <DashboardCard
              title={"Committee Payments"}
              icon="cash"
              color="#F59E0B"
              onPress={() => navigation.navigate("Payments")}
            />
            <DashboardCard
              title={"Committees"}
              icon="layers"
              color="#3B82F6"
              onPress={() => navigation.navigate("ViewCommittees")}
            />
            <DashboardCard
              title={"Committee Participation Requests"}
              icon="people-circle"
              color="#10B981"
              onPress={() => navigation.navigate("ParticipationRequests")}
              badge={requestCount}
            />
            <DashboardCard
              title={"Members"}
              icon="id-card"
              color="#6366F1"
              onPress={() => navigation.navigate("MemberList")}
            />
            <DashboardCard
              title={"Committe Turn Requests"}
              icon="repeat"
              color="#EC4899"
              onPress={() => navigation.navigate("TurnAdjustmentRequest")}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContainer: { flexGrow: 1, paddingBottom: 40 },

  hero: {
    height: 240,
    paddingTop: 60,
    paddingHorizontal: 24,
    borderBottomLeftRadius: TOKENS.radius.xxl,
    borderBottomRightRadius: TOKENS.radius.xxl,
    overflow: "hidden",
    justifyContent: 'center',
  },
  heroBlob: {
    position: "absolute",
    right: -40,
    top: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  heroBlobTwo: {
    position: "absolute",
    left: -20,
    bottom: -60,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroInfo: { gap: 8 },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
  heroSmall: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "700",
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  heroTitle: {
    color: "#FFF",
    fontSize: 26,
    fontWeight: "900",
  },
  heroEmail: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
  settingsBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  summaryBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.15)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: TOKENS.radius.full,
    alignSelf: "flex-start",
    gap: 8,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  summaryText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
  },

  content: { paddingHorizontal: 20, paddingTop: 32 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "800" },
  line: { flex: 1, height: 2, borderRadius: 1 },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  card: {
    width: "48%",
    padding: 20,
    borderRadius: TOKENS.radius.xl,
    marginBottom: 16,
    borderWidth: 1,
    alignItems: "flex-start",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: TOKENS.spacing.md,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  badge: {
    position: "absolute",
    top: 12,
    right: 12,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
  },
  cardArrow: { position: 'absolute', bottom: 12, right: 12 },
});
