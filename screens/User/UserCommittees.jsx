import { FontAwesome5 } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import apiClient from "../../services/apiClient";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";
import { sendNotification } from "../../utils/notificationHelper";



export default function UserCommittees({ navigation }) {
  const { colors } = useTheme();
  const [committees, setCommittees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [searchName, setSearchName] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [reminders, setReminders] = useState({});
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settingsCommitteeId, setSettingsCommitteeId] = useState(null);
  const [tempLeadDays, setTempLeadDays] = useState("1");
  const [tempTimeOfDay, setTempTimeOfDay] = useState("09:00");

  // Rating modal state
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [ratingCommittee, setRatingCommittee] = useState(null);
  const [selectedRating, setSelectedRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [hasRated, setHasRated] = useState({}); // { committeeId: true }

  // Swap requests: { committeeId: swapRequest }
  const [swapRequests, setSwapRequests] = useState({});

  useFocusEffect(
    useCallback(() => {
      fetchUserCommittees();
      // Also load user reminder preferences
      (async () => {
        try {
          const stored = await AsyncStorage.getItem("userData");
          if (!stored) return;
          const u = JSON.parse(stored);
          const uid = u.userId || u.uid;
          if (!uid) return;
          const data = await userService.getRemindersByUser(uid);
          setReminders(data || {});
        } catch { }
      })();
      // Load user's pending swap requests
      (async () => {
        try {
          const result = await userService.getSwapRequests();
          if (result?.success && Array.isArray(result.requests)) {
            const map = {};
            result.requests.forEach((r) => {
              // Keep the latest active request per committee
              const active = ["PENDING_INITIATOR_APPROVAL", "PENDING_PAYMENT", "PENDING_ADMIN_VERIFICATION", "COMPLETED"];
              if (active.includes(r.status)) {
                if (!map[r.committeeId] || new Date(r.createdAt) > new Date(map[r.committeeId].createdAt)) {
                  map[r.committeeId] = r;
                }
              }
            });
            setSwapRequests(map);
          }
        } catch { }
      })();
    }, [])
  );

  const fetchUserCommittees = async () => {
    try {
      setLoading(true);
      const stored = await AsyncStorage.getItem("userData");
      if (!stored) {
        setLoading(false);
        return;
      }
      const user = JSON.parse(stored);
      const currentUserId = user.userId || user.uid;
      setUserId(currentUserId);
      const data = await userService.getAllCommittees();

      if (!data) {
        setCommittees([]);
        setLoading(false);
        return;
      }

      const committeesArray = Object.keys(data).map((key) => ({
        id: key,
        ...data[key],
      }));

      // Filter committees where the user is a participant
      const userCommittees = committeesArray.filter((c) => {
        if (!c.usersParticipated) return false;
        return c.usersParticipated.some(
          (u) => u && (u.userId === currentUserId || u.uid === currentUserId || u.id === currentUserId)
        );
      });

      setCommittees(userCommittees);
      setLoading(false);
      // After loading committees, run reminder checks
      try {
        const rData = await userService.getRemindersByUser(currentUserId);
        const myReminders = rData || {};
        await checkAndSendReminders(currentUserId, userCommittees, myReminders);
      } catch { }
    } catch (err) {
      console.error("Error fetching user committees:", err);
      setLoading(false);
      Alert.alert("Error", "Failed to fetch your committees");
    }
  };

  const checkAndSendReminders = async (uid, committeesList, myReminders) => {
    const now = new Date();
    for (const c of committeesList) {
      try {
        const pref = myReminders?.[c.id] || {};
        const leadDays = Number(pref.leadDays || 1);
        const enabled = pref.enabled !== false; // default true
        // Find user's turn info
        let dueDate = null;
        if (Array.isArray(c.turns)) {
          const t = c.turns.find((t) => t && (t.id === uid || t.userId === uid));
          if (t?.turnDate) dueDate = new Date(t.turnDate);
        }
        if (!dueDate) continue;
        const msPerDay = 86400000;
        const daysUntil = Math.floor((dueDate - now) / msPerDay);
        const isPaid = c?.usersParticipated?.find((u) => u && (u.userId === uid || u.uid === uid))?.paymentStatus === "Paid";
        // Pre-due reminder
        if (enabled && !isPaid && daysUntil >= 0 && daysUntil <= leadDays) {
          // Deduplicate by lastSent for this dueDate
          const lastForDate = pref?.lastForDate || "";
          if (lastForDate !== (tDateISO(dueDate))) {
            const ok = await sendNotification(
              uid,
              "Payment Reminder",
              `Your payment for "${c.name}" is due on ${tDateISO(dueDate)}.`,
              "warning",
              c.id
            );
            if (!ok) {
              await sendNotification(
                uid,
                "Payment Reminder",
                `Your payment for "${c.name}" is due on ${tDateISO(dueDate)}.`,
                "warning",
                c.id
              );
            }
            // Log (always log attempt)
            await userService.createReminderLog({
              userId: uid,
              committeeId: c.id,
              type: "pre",
              sentAt: new Date().toISOString(),
              dueDate: tDateISO(dueDate),
              success: ok ? true : false
            });
            // Update lastSent
            await userService.updateReminder(uid, c.id, { lastForDate: tDateISO(dueDate) });
          }
        }
        // Post-due reminder
        if (!isPaid && now > dueDate) {
          // Deduplicate: if lastPostForDate matches, skip
          const lastPostForDate = pref?.lastPostForDate || "";
          if (lastPostForDate !== tDateISO(dueDate)) {
            const ok = await sendNotification(
              uid,
              "Payment Overdue",
              `Your payment for "${c.name}" is overdue since ${tDateISO(dueDate)}.`,
              "error",
              c.id
            );
            if (!ok) {
              await sendNotification(
                uid,
                "Payment Overdue",
                `Your payment for "${c.name}" is overdue since ${tDateISO(dueDate)}.`,
                "error",
                c.id
              );
            }
            await userService.createReminderLog({
              userId: uid,
              committeeId: c.id,
              type: "post",
              sentAt: new Date().toISOString(),
              dueDate: tDateISO(dueDate),
              success: ok ? true : false
            });
            await userService.updateReminder(uid, c.id, { lastPostForDate: tDateISO(dueDate) });
          }
        }
      } catch { }
    }
  };

  const tDateISO = (d) => (d instanceof Date ? d.toISOString().split("T")[0] : d);

  const cycleReminder = (committeeId) => {
    const pref = reminders?.[committeeId] || {};
    setSettingsCommitteeId(committeeId);
    setTempLeadDays(String(pref.leadDays ?? 1));
    setTempTimeOfDay(pref.timeOfDay || "09:00");
    setSettingsVisible(true);
  };

  const saveReminderSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem("userData");
      if (!stored) return;
      const uid = JSON.parse(stored).userId || JSON.parse(stored).uid;
      const ld = Math.max(0, parseInt(String(tempLeadDays), 10) || 0);
      const t = String(tempTimeOfDay || "").trim();
      const valid = /^\d{2}:\d{2}$/.test(t);
      if (!valid) {
        Alert.alert("Invalid time", "Please enter time as HH:MM");
        return;
      }
      const enabled = ld !== 0;
      await userService.updateReminder(uid, settingsCommitteeId, { leadDays: ld, enabled, timeOfDay: t });
      setReminders((r) => ({ ...r, [settingsCommitteeId]: { ...(r?.[settingsCommitteeId] || {}), leadDays: ld, enabled, timeOfDay: t } }));
      setSettingsVisible(false);
      Alert.alert("Reminder", enabled ? `Reminder set: ${ld} day(s) at ${t}` : "Reminder turned off");
    } catch {
      Alert.alert("Error", "Failed to save settings");
    }
  };

  // ── Rating helpers ───────────────────────────────────────
  const openRatingModal = (committee) => {
    setRatingCommittee(committee);
    setSelectedRating(0);
    setRatingComment("");
    setRatingModalVisible(true);
  };

  const submitRating = async () => {
    if (selectedRating === 0) {
      Alert.alert("Rating Required", "Please select at least 1 star.");
      return;
    }
    if (!ratingCommittee) return;
    setRatingSubmitting(true);
    try {
      const result = await apiClient.backendPost("/feedback/rate-committee", {
        committeeId: ratingCommittee.id,
        initiatorId: ratingCommittee.createdBy,
        rating: selectedRating,
        comment: ratingComment.trim() || null,
      });
      if (result?.success) {
        setHasRated(prev => ({ ...prev, [ratingCommittee.id]: true }));
        setRatingModalVisible(false);
        Alert.alert("Thank you!", `Your ${selectedRating}-star rating has been saved.`);
      } else if (result?.error?.includes("already rated")) {
        setHasRated(prev => ({ ...prev, [ratingCommittee.id]: true }));
        setRatingModalVisible(false);
        Alert.alert("Already Rated", "You have already rated this committee.");
      } else {
        Alert.alert("Error", result?.error || "Failed to submit rating.");
      }
    } catch (err) {
      Alert.alert("Error", err.message || "Could not submit rating.");
    } finally {
      setRatingSubmitting(false);
    }
  };

  const renderStars = (count, onPress) =>
    [1, 2, 3, 4, 5].map((i) => (
      <TouchableOpacity key={i} onPress={() => onPress && onPress(i)} activeOpacity={0.7}>
        <FontAwesome5
          name="star"
          solid={i <= count}
          size={onPress ? 32 : 16}
          color={i <= count ? "#F59E0B" : "#D1D5DB"}
          style={{ marginHorizontal: 3 }}
        />
      </TouchableOpacity>
    ));

  const getFilteredCommittees = () => {
    const search = String(searchName || "").trim().toLowerCase();
    const statusTerm = String(statusFilter || "").trim().toLowerCase();
    return committees.filter((c) => {
      const statusVal = String(c.status || "").toLowerCase();
      const started = statusVal === "started" || c.active === true;
      let searchOk = true;
      if (search) {
        const hasStartedWord = ["started", "start", "active", "running", "live"].some((w) => search.includes(w));
        const hasNotStartedWord = ["not started", "pending", "approved", "inactive", "waiting"].some((w) => search.includes(w));
        if (hasStartedWord) searchOk = started;
        else if (hasNotStartedWord) searchOk = !started;
        else searchOk = c.name ? c.name.toLowerCase().includes(search) : false;
      }
      let statusOk = true;
      if (statusTerm) {
        if (["started", "start", "active", "running", "live"].includes(statusTerm)) statusOk = started;
        else if (["not started", "inactive", "waiting"].includes(statusTerm)) statusOk = !started;
        else statusOk = statusVal.includes(statusTerm);
      }
      return searchOk && statusOk;
    });
  };

  const filteredData = getFilteredCommittees();

  const renderCommittee = ({ item }) => {
    // Find current user's details in the committee
    const currentUser = item.usersParticipated.find(
      (u) => u && (u.userId === userId || u.uid === userId || u.id === userId)
    );

    const isPaid = currentUser?.paymentStatus === "Paid";
    const isPending = currentUser?.paymentStatus === "Pending Verification";
    const isStarted = String(item.status || "").toLowerCase() === "started" || item.active === true;
    const totalMembers = parseInt(item.members || 0, 10) || 0;
    const filledMembers = Array.isArray(item.usersParticipated) ? item.usersParticipated.filter(u => u).length : 0;
    const isFull = totalMembers > 0 ? filledMembers >= totalMembers : false;
    let myTurnIndex = null;
    let myTurnDate = null;
    if (Array.isArray(item?.turns) && item.turns.length) {
      const t = item.turns.find((t) => t && (t.id === userId || t.userId === userId));
      if (t) {
        myTurnIndex = t.index || t.turnIndex || null;
        myTurnDate = t.turnDate || null;
      }
    }
    if (myTurnIndex == null && Array.isArray(item.usersParticipated)) {
      const idx = item.usersParticipated.findIndex((u) => u && (u.userId === userId || u.uid === userId));
      if (idx >= 0) myTurnIndex = idx + 1;
    }
    const myMemberId = currentUser?.memberId || (Array.isArray(item.usersParticipated)
      ? (() => {
        const idx = item.usersParticipated.findIndex((u) => u && (u.userId === userId || u.uid === userId || u.id === userId));
        return idx >= 0 ? String(idx + 1) : null;
      })()
      : null);

    const isCompleted = String(item.status || "").toLowerCase() === "completed"
      || String(item.status || "").toLowerCase() === "finished"
      || String(item.status || "").toLowerCase() === "done";
    const alreadyRated = hasRated[item.id] === true;

    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.brand }]}>{item.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => cycleReminder(item.id)}
              style={{ marginRight: 8 }}
              accessibilityLabel="Reminder settings"
            >
              <FontAwesome5 name="bell" size={16} color={colors.brand} />
            </TouchableOpacity>
            <Text style={{ marginRight: 8, fontSize: 12, color: colors.textSecondary, fontWeight: "700" }}>
              {reminders?.[item.id]?.enabled === false ? "Off" : `${reminders?.[item.id]?.leadDays ?? 1}d @ ${(reminders?.[item.id]?.timeOfDay || "09:00")}`}
            </Text>
            <Text style={[styles.statusBadge, { backgroundColor: isStarted ? "#d4edda" : "#fff3cd", color: isStarted ? "#155724" : "#856404" }]}>
              {isStarted ? "Started" : "Not Started"}
            </Text>
            {/* side pay pill removed to match previous screen */}
          </View>
        </View>

        <Text style={[styles.detail, { color: colors.text }]}>Total Amount: {item.totalAmount} PKR</Text>
        <Text style={[styles.detail, { color: colors.text }]}>Contribution: {item.contributionPerCycle} PKR</Text>
        <Text style={[styles.detail, { color: colors.text }]}>Cycle: {item.cycleDuration} Days</Text>
        <View style={{ height: 10 }} />
        {myMemberId && (
          <View style={styles.turnRow}>
            <FontAwesome5 name="id-card" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
            <Text style={[styles.turnText, { color: colors.textSecondary }]}>Your ID: CM-{myMemberId}</Text>
          </View>
        )}

        {isStarted && isFull ? (
          <View>
            <TouchableOpacity
              style={[
                styles.payButton,
                { backgroundColor: colors.brand },
                isPaid ? styles.paidButton : null,
                isPending ? { backgroundColor: "#F59E0B" } : null,
              ]}
              disabled={isPaid || isPending}
              onPress={() =>
                navigation.navigate("PaymentScreen", {
                  committeeId: item.id,
                  userId: userId,
                  amount: item.contributionPerCycle,
                  committeeName: item.name,
                })
              }
            >
              <Text style={styles.payButtonText}>
                {isPaid ? "Paid" : isPending ? "Pending Verification" : "Pay Now"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.requestButton, { borderColor: colors.brand }]}
              onPress={() => navigation.navigate("TurnChangeRequestForm", {
                committeeId: item.id,
                committeeName: item.name,
                userId: userId
              })}
            >
              <Text style={[styles.requestButtonText, { color: colors.brand }]}>Request Turn Change</Text>
            </TouchableOpacity>

            {/* Swap Request Status Banner */}
            {(() => {
              const sr = swapRequests[item.id];
              if (!sr) return null;
              const statusConfig = {
                PENDING_INITIATOR_APPROVAL: { bg: "#FEF9C3", text: "#854D0E", label: "⏳ Swap: Awaiting Initiator Approval" },
                PENDING_PAYMENT: { bg: "#FEF3C7", text: "#92400E", label: "💳 Swap Approved! Payment Required" },
                PENDING_ADMIN_VERIFICATION: { bg: "#DBEAFE", text: "#1E40AF", label: "🔍 Swap: Payment Under Review" },
                COMPLETED: { bg: "#D1FAE5", text: "#065F46", label: "✅ Swap Completed!" },
                REJECTED: { bg: "#FEE2E2", text: "#991B1B", label: "❌ Swap Rejected by Initiator" },
                PAYMENT_REJECTED: { bg: "#FEE2E2", text: "#991B1B", label: "❌ Swap Payment Rejected" },
              };
              const cfg = statusConfig[sr.status];
              if (!cfg) return null;
              return (
                <View style={{ marginTop: 8 }}>
                  <View style={[styles.swapStatusBadge, { backgroundColor: cfg.bg }]}>
                    <Text style={[styles.swapStatusText, { color: cfg.text }]}>{cfg.label}</Text>
                  </View>
                  {sr.status === "PENDING_PAYMENT" && (
                    <TouchableOpacity
                      style={[styles.paySwapBtn, { backgroundColor: colors.brand }]}
                      onPress={() => navigation.navigate("TurnSwapPaymentScreen", {
                        requestId: sr.id,
                        committeeName: item.name,
                        amount: sr.amount || 500,
                      })}
                    >
                      <FontAwesome5 name="credit-card" size={14} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.paySwapBtnText}>Pay Swap Fee (Rs {sr.amount || 500})</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })()}

            <TouchableOpacity
              style={[styles.mapButton, { borderColor: colors.brand }]}
              onPress={() => navigation.navigate("UserMapScreen", {
                committeeId: item.id,
                committeeName: item.name
              })}
            >
              <FontAwesome5 name="map-marker-alt" size={14} color={colors.brand} style={{ marginRight: 8 }} />
              <Text style={[styles.mapButtonText, { color: colors.brand }]}>View Member Locales</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.waitingText}>Waiting for committee to start...</Text>
        )}

        {/* Rate Committee button — shown when committee is completed */}
        {isCompleted && (
          <TouchableOpacity
            style={[
              styles.rateButton,
              alreadyRated && { backgroundColor: "#6B7280", opacity: 0.7 },
            ]}
            onPress={() => !alreadyRated && openRatingModal(item)}
            disabled={alreadyRated}
          >
            <FontAwesome5 name="star" solid size={13} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.rateButtonText}>
              {alreadyRated ? "Already Rated" : "Rate this Committee"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.searchContainer, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TextInput
          style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg || colors.card, color: colors.text }]}
          placeholder="Search by Committee Name"
          placeholderTextColor={colors.textSecondary}
          value={searchName}
          onChangeText={setSearchName}
        />
        <TextInput
          style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg || colors.card, color: colors.text }]}
          placeholder="Filter by Status (e.g. Started)"
          placeholderTextColor={colors.textSecondary}
          value={statusFilter}
          onChangeText={setStatusFilter}
        />
      </View>
      <Modal visible={settingsVisible} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.3)" }}>
          <View style={{ width: "85%", backgroundColor: colors.card, borderRadius: 12, padding: 16 }}>
            <Text style={{ fontWeight: "700", fontSize: 16, color: colors.brand }}>Reminder Settings</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg || colors.card, color: colors.text }]}
              placeholder="Days before due (0 to disable)"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              value={String(tempLeadDays)}
              onChangeText={setTempLeadDays}
            />
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg || colors.card, color: colors.text }]}
              placeholder="Time of day (HH:MM)"
              placeholderTextColor={colors.textSecondary}
              value={tempTimeOfDay}
              onChangeText={setTempTimeOfDay}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 10 }}>
              <TouchableOpacity onPress={() => setSettingsVisible(false)} style={{ padding: 10, marginRight: 10 }}>
                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveReminderSettings} style={{ padding: 10, backgroundColor: colors.brand, borderRadius: 8 }}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Rating Modal ────────────────────────────────── */}
      <Modal visible={ratingModalVisible} transparent animationType="slide" onRequestClose={() => setRatingModalVisible(false)}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)" }}>
          <View style={{ width: "88%", backgroundColor: colors.card, borderRadius: 20, padding: 24 }}>
            <Text style={{ fontWeight: "800", fontSize: 18, color: colors.brand, marginBottom: 4 }}>
              Rate Committee
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 16 }}>
              {ratingCommittee?.name || ""}
            </Text>

            {/* Star selector */}
            <View style={{ flexDirection: "row", justifyContent: "center", marginBottom: 20 }}>
              {renderStars(selectedRating, setSelectedRating)}
            </View>

            {/* Comment box */}
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg || colors.background, color: colors.text, minHeight: 70, textAlignVertical: "top" }]}
              placeholder="Optional comment..."
              placeholderTextColor={colors.textSecondary}
              multiline
              value={ratingComment}
              onChangeText={setRatingComment}
            />

            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 14, gap: 10 }}>
              <TouchableOpacity onPress={() => setRatingModalVisible(false)} style={{ padding: 12 }}>
                <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitRating}
                disabled={ratingSubmitting}
                style={{ paddingVertical: 12, paddingHorizontal: 24, backgroundColor: colors.brand, borderRadius: 10 }}
              >
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>
                  {ratingSubmitting ? "Saving..." : "Submit Rating"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id}
        renderItem={renderCommittee}
        contentContainerStyle={{ padding: 20 }}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No matching committees found.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  searchContainer: {
    padding: 20,
    borderBottomWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  card: {
    padding: 20,
    borderRadius: 15,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: { fontSize: 18, fontWeight: "bold" },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 'bold',
    overflow: 'hidden'
  },
  detail: { fontSize: 14, color: "#333", marginBottom: 5 },
  turnRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  turnText: { fontSize: 14, fontWeight: "600" },
  payButton: {
    marginTop: 15,

    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  paidButton: {
    backgroundColor: "#28a745",
  },
  payButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  requestButton: {
    marginTop: 10,
    backgroundColor: "#fff",
    borderWidth: 1,

    padding: 10,
    borderRadius: 10,
    alignItems: "center"
  },
  requestButtonText: {

    fontWeight: "bold",
    fontSize: 14
  },
  mapButton: {
    marginTop: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center"
  },
  mapButtonText: {
    fontWeight: "bold",
    fontSize: 14
  },
  waitingText: {
    marginTop: 15,
    color: "#666",
    fontStyle: 'italic',
    textAlign: 'center'
  },
  emptyText: { textAlign: "center", marginTop: 20, color: "#666" },

  rateButton: {
    marginTop: 10,
    backgroundColor: "#F59E0B",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  rateButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  swapStatusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  swapStatusText: {
    fontSize: 13,
    fontWeight: "700",
  },
  paySwapBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    borderRadius: 10,
  },
  paySwapBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
});

