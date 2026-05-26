import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";

const isValidImageUrl = (uri) => {
  if (!uri || typeof uri !== "string") return false;
  return uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("data:image/");
};

export default function ParticipationRequest({ route, navigation }) {
  const { colors } = useTheme();
  const requestParam = route?.params?.request || null;
  const requestIdParam =
    route?.params?.requestId ||
    requestParam?.requestId ||
    requestParam?.id ||
    null;
  const userIdParam = requestParam?.userId || null;
  const committeeIdParam = requestParam?.committeeId || null;
  const initiatorIdParam = requestParam?.initiatorId || null;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({});
  const [committee, setCommittee] = useState(null);
  const [requestId, setRequestId] = useState(requestIdParam || "");

  useEffect(() => {
    const load = async () => {
      if (!requestIdParam || !userIdParam) {
        setLoading(false);
        return;
      }

      try {
        const data = await userService.getProfileRTDB(userIdParam);
        setProfile(data || {});

        if (committeeIdParam) {
          const cData = await userService.getCommitteeById(committeeIdParam);
          setCommittee(cData || null);
        } else {
          setCommittee(null);
        }

        setRequestId(requestIdParam);
      } catch (e) {
        console.log(e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [requestIdParam, userIdParam, committeeIdParam]);

  const updateStatus = async (newStatus) => {
    if (!requestId) return;
    try {
      // 1. If Accepting, add user to committee's usersParticipated array
      if (newStatus === "Accepted" && committeeIdParam && userIdParam) {
        // Fetch latest committee data first to ensure we have latest array
        const cData = await userService.getCommitteeById(committeeIdParam);

        if (cData) {
          const totalMembers = parseInt(cData.members || 0, 10) || 0;
          let usersArray = cData.usersParticipated;
          // Normalize to fixed-length array with nulls
          if (!usersArray) {
            usersArray = new Array(totalMembers).fill(null);
          } else if (Array.isArray(usersArray)) {
            while (usersArray.length < totalMembers) usersArray.push(null);
          } else if (typeof usersArray === "object") {
            const newArr = new Array(totalMembers).fill(null);
            Object.entries(usersArray).forEach(([k, v]) => {
              const idx = parseInt(k, 10);
              if (idx >= 0 && idx < totalMembers) newArr[idx] = v;
            });
            usersArray = newArr;
          }

          // If already joined, skip
          const already = usersArray.some(u => u && (u.id === userIdParam || u.userId === userIdParam || u.uid === userIdParam));
          if (!already) {
            const emptyIndex = usersArray.findIndex(u => !u);
            if (emptyIndex === -1) {
              Alert.alert("Full", "Committee is already full.");
            } else {
              usersArray[emptyIndex] = {
                id: userIdParam,
                userId: userIdParam,
                name: profile.fullName || profile.name || "Unknown",
                email: profile.email || "Unknown",
                paymentStatus: "Unpaid",
                memberId: String(emptyIndex + 1),
                joinedAt: new Date().toISOString()
              };
            }
          }

          const shouldStart = !cData.active && usersArray.every(u => u);

          // Update Committee (users + maybe start)
          await userService.updateCommittee(committeeIdParam, shouldStart
            ? { usersParticipated: usersArray, active: true, status: "Started", activationDate: new Date().toISOString() }
            : { usersParticipated: usersArray }
          );
        }
      }

      // 2. Update Request Status
      const nowIso = new Date().toISOString();
      const nowTs = Date.now();
      const patch =
        newStatus === "Accepted"
          ? { status: newStatus, updatedAt: nowIso, updatedAtTs: nowTs, acceptedAt: nowIso, acceptedAtTs: nowTs }
          : newStatus === "Rejected"
          ? { status: newStatus, updatedAt: nowIso, updatedAtTs: nowTs, rejectedAt: nowIso, rejectedAtTs: nowTs }
          : { status: newStatus, updatedAt: nowIso, updatedAtTs: nowTs };
      await userService.updateParticipationRequest(requestId, patch);
      Alert.alert("Success", `Request ${newStatus}`);
      navigation.goBack();
    } catch (e) {
      console.log(e);
      Alert.alert("Error", "Failed to update request status");
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (!requestId) {
    return (
      <View style={styles.center}>
        <Text>No participation request selected</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.heading, { color: colors.brand }]}>PARTICIPATION REQUEST</Text>

      {committee && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Committee Details</Text>
          <View style={styles.item}>
            <Text style={styles.label}>Name</Text>
            <Text style={styles.value}>{committee.name || committeeIdParam || "—"}</Text>
          </View>
          <View style={styles.item}>
            <Text style={styles.label}>Status</Text>
            <Text style={[styles.value, { color: colors.info }]}>{committee.status || "—"}</Text>
          </View>
          {committee.startDate && (
            <View style={styles.item}>
              <Text style={styles.label}>Start Date</Text>
              <Text style={styles.value}>{committee.startDate}</Text>
            </View>
          )}
          {committee.endDate && (
            <View style={styles.item}>
              <Text style={styles.label}>End Date</Text>
              <Text style={styles.value}>{committee.endDate}</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>User Profile</Text>
        <View style={styles.item}>
          <Text style={styles.label}>Full Name</Text>
          <Text style={styles.value}>{profile.fullName || profile.name || "—"}</Text>
        </View>
        <View style={styles.item}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{profile.email || "—"}</Text>
        </View>
        <View style={styles.item}>
          <Text style={styles.label}>Phone</Text>
          <Text style={styles.value}>{profile.contactNumber || profile.phone || profile.contact || profile.mobile || "—"}</Text>
        </View>
        <View style={styles.item}>
          <Text style={styles.label}>Address</Text>
          <Text style={styles.value}>{profile.address || "—"}</Text>
        </View>
        {profile?.profilePicture && isValidImageUrl(profile.profilePicture) ? (
          <View style={[styles.item, { borderBottomColor: 'transparent' }]}>
            <Text style={styles.label}>Profile Picture</Text>
            <Image source={{ uri: profile.profilePicture }} style={{ width: 80, height: 80, borderRadius: 12 }} />
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Verification Documents</Text>
        <View style={styles.item}>
          <Text style={styles.label}>CNIC</Text>
          {profile?.cnic && isValidImageUrl(profile.cnic) ? (
            <Image source={{ uri: profile.cnic }} style={{ width: 120, height: 80, borderRadius: 8 }} />
          ) : (
            <Text style={styles.value}>Not uploaded</Text>
          )}
        </View>
        <View style={styles.item}>
          <Text style={styles.label}>Reference CNIC</Text>
          {profile?.referenceCnic && isValidImageUrl(profile.referenceCnic) ? (
            <Image source={{ uri: profile.referenceCnic }} style={{ width: 120, height: 80, borderRadius: 8 }} />
          ) : (
            <Text style={styles.value}>Not uploaded</Text>
          )}
        </View>
        <View style={[styles.item, { borderBottomColor: 'transparent' }]}>
          <Text style={styles.label}>Bank Statement (PDF)</Text>
          {profile?.bankStatement ? (
            <TouchableOpacity
              style={{ backgroundColor: "#0B57D0", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignSelf: 'flex-start' }}
              onPress={async () => {
                try {
                  const { default: WebBrowser } = await import("expo-web-browser");
                  await WebBrowser.openBrowserAsync(profile.bankStatement);
                } catch (e) {
                  Alert.alert("Preview Error", "Unable to preview PDF.");
                }
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>Preview Bank Statement</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.value}>Not uploaded</Text>
          )}
        </View>
      </View>

      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[styles.btn, styles.accept]}
          onPress={() => updateStatus("Accepted")}
        >
          <Text style={styles.btnText}>Accept Request</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.reject]}
          onPress={() => updateStatus("Rejected")}
        >
          <Text style={styles.btnText}>Reject</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  heading: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 8,
    textAlign: 'center'
  },
  section: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b"
  },
  value: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a"
  },
  btnRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    marginBottom: 40
  },
  btn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  accept: { backgroundColor: "#10b981" },
  reject: { backgroundColor: "#ef4444" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
