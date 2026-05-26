import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Image, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { TOKENS, useTheme } from "../../theme/ThemeProvider";
import { checkAdminReminders } from "../../utils/notificationTriggers";

export default function AdminDashboard({ navigation }) {
  const { colors } = useTheme();
  const [userName, setUserName] = useState("Admin");
  const [userEmail, setUserEmail] = useState("");
  const [avatar, setAvatar] = useState(null);

  useEffect(() => {
    const fetchAdminData = async () => {
      try {
        const stored = await AsyncStorage.getItem("userData");
        if (stored) {
          const parsed = JSON.parse(stored);
          setUserName(parsed.fullName || parsed.name || "Administrator");
          setUserEmail(parsed.email || "");
          setAvatar(parsed.profilePicture || null);
        }
        checkAdminReminders();
      } catch (e) {
        console.log("Admin dashboard initialization failed", e);
      }
    };
    fetchAdminData();
  }, []);

  const DashboardCard = ({ title, icon, color, onPress, lib = "Ionicons" }) => {
    const IconLib = lib === "Ionicons" ? Ionicons : MaterialCommunityIcons;
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={[styles.iconCircle, { backgroundColor: `${color}15` }]}>
          <IconLib name={icon} size={26} color={color} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
        <View style={styles.cardArrow}>
          <Ionicons name="chevron-forward" size={12} color={colors.textSecondary + '40'} />
        </View>
      </TouchableOpacity>
    );
  };

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
              <View style={{ flex: 1 }}>
                <Text style={styles.heroSmall}>{"Admin Panel"}</Text>
                <Text style={styles.heroTitle}>{userName}</Text>
                <Text style={styles.heroEmail}>{userEmail}</Text>
              </View>
              <TouchableOpacity onPress={() => navigation.getParent()?.toggleDrawer()} style={styles.settingsBtn}>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: "#ffffff55" }} />
                ) : (
                  <Ionicons name="person-circle-outline" size={56} color="#FFF" />
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.summaryBox}>
              <Ionicons name="shield-checkmark" size={14} color="#FFF" style={{ opacity: 0.9 }} />
              <Text style={styles.summaryText}>Root Administrator</Text>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Admin Tools</Text>
            <View style={[styles.line, { backgroundColor: colors.brand + '20' }]} />
          </View>

          <View style={styles.grid}>
            <DashboardCard
              title={"Initiators"}
              icon="people"
              color={colors.brand}
              onPress={() => navigation.navigate("AdminViewAllInitiators")}
            />
            <DashboardCard
              title={"Loans"}
              icon="stats-chart"
              color="#F59E0B"
              onPress={() => navigation.navigate("MonitorLoanScreen")}
            />
            <DashboardCard
              title={"Payments"}
              icon="receipt"
              color="#8B5CF6"
              onPress={() => navigation.navigate("AdminPaymentHistoryScreen")}
            />
            <DashboardCard
              title={"Recover Loans"}
              icon="wallet"
              color="#10B981"
              onPress={() => navigation.navigate("RecoverLoanScreen")}
            />
            <DashboardCard
              title={"Committees"}
              icon="layers"
              color="#3B82F6"
              onPress={() => navigation.navigate("AdminViewAllCommittees")}
            />
            <DashboardCard
              title={"Approvals"}
              icon="checkmark-circle"
              color="#10B981"
              onPress={() => navigation.navigate("ApproveRequests")}
            />
            <DashboardCard
              title={"Users"}
              icon="person"
              color="#6366F1"
              onPress={() => navigation.navigate("AdminViewAllUsers")}
            />
            <DashboardCard
              title={"Documents"}
              icon="document-text"
              color="#EC4899"
              onPress={() => navigation.navigate("LoanDetailsScreen")}
            />
            <DashboardCard
              title={"Warnings"}
              icon="warning"
              color="#F59E0B"
              onPress={() => navigation.navigate("AdminWarningScreen")}
            />
            <DashboardCard
              title={"Complaints"}
              icon="chatbubbles"
              color="#EF4444"
              onPress={() => navigation.navigate("AdminComplaintsScreen")}
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
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  heroBlobTwo: {
    position: "absolute",
    left: -30,
    bottom: -50,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroInfo: { gap: 8 },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
  heroSmall: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontWeight: "700",
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  heroTitle: {
    color: "#FFF",
    fontSize: 28,
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
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  summaryBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.18)",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: TOKENS.radius.full,
    alignSelf: "flex-start",
    gap: 8,
  },
  summaryText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "800",
  },

  content: { paddingHorizontal: 20, paddingTop: 32 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "900" },
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
    shadowOpacity: 0.1,
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
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    letterSpacing: 0.2,
  },
  cardArrow: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
});
