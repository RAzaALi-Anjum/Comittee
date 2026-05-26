import { FontAwesome, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import apiClient from "../../services/apiClient";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";
import { formatDate } from "../../utils/date";
import { checkPaymentReminders } from "../../utils/notificationTriggers";

// ML API base URL is resolved dynamically from apiClient

export default function UserDashboard({ navigation, route }) {
  const { colors } = useTheme();
  const currentUserId = route?.params?.userId || "USER123";
  const [userName, setUserName] = useState("User");
  const [userEmail, setUserEmail] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [isInitiator, setIsInitiator] = useState(false);
  const [showNewDot, setShowNewDot] = useState(false);
  const [latestCreatedAt, setLatestCreatedAt] = useState(null);
  const [lastSeenKey, setLastSeenKey] = useState("lastSeenCommittees");
  const tr = (en) => en;
  const [initiators, setInitiators] = useState([]);
  const [recsLoading, setRecsLoading] = useState(true);


  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const stored = await AsyncStorage.getItem("userData");
        if (stored) {
          const parsed = JSON.parse(stored);
          const uid = parsed.userId || parsed.uid;
          const roleInitiator = parsed?.role === "initiator" || parsed?.initiatorStatus === "approved";
          setIsInitiator(!!roleInitiator);
          setUserEmail(parsed.email || "");
          if (parsed.fullName) {
            setUserName(parsed.fullName);
          }
          if (parsed.profilePicture) {
            setAvatar(parsed.profilePicture);
          }
          if (uid) {
            checkPaymentReminders(uid, []);
            // Get user's full name if available
            try {
              const profile = await userService.getProfileRTDB(uid);
              if (profile?.profilePicture) setAvatar(profile.profilePicture);
            } catch { }
          }
        }
      } catch (e) {
        console.log("Error running notification checks", e);
      }
    };
    fetchUserData();
  }, []);

  // Fetch ML-powered recommendations
  useEffect(() => {
    const fetchRecommendations = async () => {
      setRecsLoading(true);
      try {
        // Try ML FastAPI server first
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch(`${apiClient.getMlBaseUrl()}/recommend-initiators`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: "current", minRating: 0, minSuccessful: 0 }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (resp.ok) {
          const json = await resp.json();
          if (json.recommendations && json.recommendations.length > 0) {
            const avatars = [
              "https://randomuser.me/api/portraits/men/32.jpg",
              "https://randomuser.me/api/portraits/women/44.jpg",
              "https://randomuser.me/api/portraits/men/56.jpg",
              "https://randomuser.me/api/portraits/women/12.jpg",
              "https://randomuser.me/api/portraits/men/65.jpg",
              "https://randomuser.me/api/portraits/women/19.jpg",
              "https://randomuser.me/api/portraits/men/70.jpg",
              "https://randomuser.me/api/portraits/women/38.jpg",
            ];
            const mapped = json.recommendations.map((r, idx) => ({
              id: r.initiatorId || String(idx + 1),
              name: r.name || `Initiator ${r.initiatorId}`,
              rating: r.avg_rating || (r.score * 5) || 0,
              mlScore: r.score || 0,
              sentiment: r.sentiment_score || 0,
              totalFeedback: r.total_feedback || 0,
              image: avatars[idx % avatars.length],
            }));
            setInitiators(mapped);
            setRecsLoading(false);
            console.log(`[Dashboard] Loaded ${mapped.length} ML recommendations`);
            return;
          }
        }
      } catch (e) {
        console.warn("[Dashboard] ML API unreachable, trying backend:", e.message);
      }

      // Fallback: try Node.js backend via apiClient
      try {
        const json = await apiClient.backendGet("/feedback/recommend?limit=10");
        if (json.initiators && json.initiators.length > 0) {
          const avatars = [
            "https://randomuser.me/api/portraits/men/32.jpg",
            "https://randomuser.me/api/portraits/women/44.jpg",
            "https://randomuser.me/api/portraits/men/56.jpg",
            "https://randomuser.me/api/portraits/women/12.jpg",
          ];
          const mapped = json.initiators.map((r, idx) => ({
            id: r.id || String(idx + 1),
            name: r.name || "Unknown",
            rating: r.rating || 0,
            mlScore: r.mlSentimentScore || r.compositeScore || 0,
            totalFeedback: r.totalFeedback || 0,
            image: r.profilePicture || avatars[idx % avatars.length],
          }));
          setInitiators(mapped);
          setRecsLoading(false);
          console.log(`[Dashboard] Loaded ${mapped.length} backend recommendations`);
          return;
        }
      } catch (e) {
        console.warn("[Dashboard] Backend recommend failed:", e.message);
      }

      setRecsLoading(false);
    };
    fetchRecommendations();
  }, []);

  useEffect(() => {
    const loadCommitteesAndDetectNew = async () => {
      try {
        const data = await userService.getAllCommittees();
        if (!data) {
          setShowNewDot(false);
          return;
        }
        const items = Object.values(data);
        let latest = null;
        items.forEach((c) => {
          const ts = c?.createdAt ? new Date(c.createdAt).getTime() : null;
          if (ts && (!latest || ts > latest)) latest = ts;
        });
        if (latest) {
          setLatestCreatedAt(new Date(latest).toISOString());
          let uid = null;
          try {
            const stored = await AsyncStorage.getItem("userData");
            if (stored) {
              const parsed = JSON.parse(stored);
              uid = parsed.userId || parsed.uid || null;
            }
          } catch { }
          const key = `lastSeenCommittees:${uid || "anon"} `;
          setLastSeenKey(key);
          const lastSeenStr = await AsyncStorage.getItem(key);
          const lastSeen = lastSeenStr ? new Date(lastSeenStr).getTime() : 0;
          setShowNewDot(latest > lastSeen);
        } else {
          setShowNewDot(false);
        }
      } catch {
        setShowNewDot(false);
      }
    };
    loadCommitteesAndDetectNew();
  }, []);

  const renderStars = (rating) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    for (let i = 0; i < fullStars; i++) {
      stars.push(<FontAwesome key={`full - ${i} `} name="star" size={14} color="#F59E0B" />);
    }
    if (hasHalfStar) {
      stars.push(<FontAwesome key="half" name="star-half" size={14} color="#F59E0B" />);
    }
    const total = fullStars + (hasHalfStar ? 1 : 0);
    for (let i = total; i < 5; i++) {
      stars.push(<FontAwesome key={`empty - ${i} `} name="star-o" size={14} color="#F59E0B" />);
    }
    return <View style={{ flexDirection: "row", gap: 2 }}>{stars}</View>;
  };

  const openJoinCommittees = async () => {
    try {
      const seenVal = latestCreatedAt || new Date().toISOString();
      await AsyncStorage.setItem(lastSeenKey, seenVal);
      setShowNewDot(false);
    } catch { }
    navigation.navigate("JoinCommittee");
  };

  const DashboardCard = ({ title, icon, color, onPress, badge = false, lib = "Ionicons" }) => {
    const IconLib = lib === "Ionicons" ? Ionicons : MaterialCommunityIcons;
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={[styles.iconCircle, { backgroundColor: `${color} 15` }]}>
          <IconLib name={icon} size={28} color={color} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
        {badge && <View style={[styles.badge, { backgroundColor: colors.danger }]} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.background === "#0F172A" ? "light-content" : "dark-content"} />
      <View style={[styles.hero, { backgroundColor: colors.brand }]}>
        <View style={styles.heroBlob} />
        <View style={styles.heroInfo}>
          <View style={styles.heroHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>{tr("Welcome back,")}</Text>
              <Text style={styles.userName}>{userName}!</Text>
              <Text style={styles.userEmail}>{userEmail}</Text>
            </View>
            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() => navigation.navigate("ProfileUser")}
            >
              {avatar ? (
                <Image source={{ uri: avatar }} style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: "#ffffff55" }} />
              ) : (
                <Ionicons name="person-circle-outline" size={64} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.summaryBox}>
            <View style={styles.summaryItem}>
              <Ionicons name="calendar-outline" size={14} color="#FFF" opacity={0.8} />
              <Text style={styles.summaryText}>{formatDate(new Date(), "en")}</Text>
            </View>
            <View style={styles.vDivider} />
            <View style={styles.summaryItem}>
              <Ionicons name="shield-checkmark-outline" size={14} color="#FFF" opacity={0.8} />
              <Text style={styles.summaryText}>{tr("Member")}</Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={true}>

        <View style={styles.content}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{tr("Overview")}</Text>

          <View style={styles.grid}>
            <DashboardCard
              title={tr("Join Committees")}
              icon="add-circle-outline"
              color={colors.brand}
              onPress={openJoinCommittees}
              badge={showNewDot}
            />
            <DashboardCard
              title={tr("Turn Change Requests")}
              icon="swap-horizontal-outline"
              color="#3B82F6"
              onPress={() => navigation.navigate("TurnAdjustmentRequest", { userId: currentUserId })}
            />
            <DashboardCard
              title={tr("Payments")}
              icon="receipt-outline"
              color="#8B5CF6"
              onPress={() => navigation.navigate("PaymentHistory", { userId: currentUserId })}
            />
            <DashboardCard
              title={tr("My Committees")}
              icon="list-outline"
              color="#EF4444"
              onPress={() => navigation.navigate("UserCommittees")}
            />
          </View>

          <View style={[styles.recContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.recTitle, { color: colors.brand }]}>Recommended</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 11, marginLeft: 4, marginBottom: 8, fontWeight: "600" }}>
              ML-Powered | Rating 40% + Sentiment 60%
            </Text>
            <ScrollView style={styles.recScroll} nestedScrollEnabled showsVerticalScrollIndicator={true}>
              <View style={styles.recList}>
                {recsLoading ? (
                  <View style={{ alignItems: "center", paddingVertical: 30 }}>
                    <ActivityIndicator size="large" color={colors.brand} />
                    <Text style={{ color: colors.textSecondary, marginTop: 8, fontSize: 12 }}>Loading ML recommendations...</Text>
                  </View>
                ) : initiators.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 20 }}>
                    <Ionicons name="analytics-outline" size={36} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, marginTop: 8, fontSize: 13 }}>No recommendations yet</Text>
                  </View>
                ) : (
                  initiators.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.recCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                      activeOpacity={0.8}
                      onPress={() => navigation.navigate("InitiatorProfile", { initiator: item })}
                    >
                      <View style={[styles.recImage, { backgroundColor: colors.brandLight }]}>
                        <Image source={{ uri: item.image }} style={{ width: 56, height: 56, borderRadius: 14 }} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.recName, { color: colors.text }]}>{item.name}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                          <Text style={{ color: colors.textSecondary, marginRight: 6 }}>{item.rating.toFixed(1)}</Text>
                          {renderStars(item.rating)}
                        </View>
                        {item.totalFeedback > 0 && (
                          <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 2 }}>
                            {item.totalFeedback} reviews | ML Score: {(item.mlScore * 100).toFixed(0)}%
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContainer: { flexGrow: 1, paddingBottom: 30 },

  hero: {
    paddingTop: 40,
    paddingHorizontal: 24,
    paddingBottom: 40,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    overflow: "hidden",
  },
  heroBlob: {
    position: "absolute",
    right: -20,
    top: -20,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  heroHeader: { flexDirection: "row", alignItems: "center", width: "100%" },
  heroInfo: { flex: 1 },
  greeting: { color: "#FFF", fontSize: 13, opacity: 0.8, fontWeight: "600", marginBottom: 2 },
  userName: { color: "#FFF", fontSize: 26, fontWeight: "800" },
  userEmail: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600", marginTop: 2 },
  summaryBox: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    backgroundColor: "rgba(0,0,0,0.1)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  summaryItem: { flexDirection: "row", alignItems: "center" },
  summaryText: { color: "#FFF", fontSize: 13, marginLeft: 6, fontWeight: "600" },
  vDivider: { width: 1, height: 12, backgroundColor: "rgba(255,255,255,0.3)", marginHorizontal: 10 },
  profileBtn: { marginLeft: 16 },

  content: { paddingHorizontal: 20, paddingTop: 24 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16, marginLeft: 4 },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  card: {
    width: "48%",
    padding: 20,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    alignItems: "flex-start",
    // Shadow for iOS
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    // Elevation for Android
    elevation: 2,
  },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  badge: {
    position: "absolute",
    top: 15,
    right: 15,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  recTitle: { fontSize: 18, fontWeight: "700", marginTop: 8, marginBottom: 12, marginLeft: 4 },
  recContainer: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginTop: 10,
  },
  recScroll: { maxHeight: 260 },
  recList: { gap: 12 },
  recCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  recImage: {
    width: 56,
    height: 56,
    borderRadius: 14,
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  recName: { fontSize: 16, fontWeight: "700" },
});
