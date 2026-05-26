import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";

const isValidImageUrl = (uri) => {
  if (!uri || typeof uri !== "string") return false;
  return uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("data:image/");
};

const STATUS_CONFIG = {
  PENDING_INITIATOR_APPROVAL: { bg: "#FEF9C3", text: "#854D0E", label: "Awaiting Your Review" },
  PENDING_PAYMENT: { bg: "#DCFCE7", text: "#14532D", label: "Awaiting Payment" },
  PENDING_ADMIN_VERIFICATION: { bg: "#DBEAFE", text: "#1E40AF", label: "Admin Verifying" },
  COMPLETED: { bg: "#D1FAE5", text: "#065F46", label: "Completed ✅" },
  REJECTED: { bg: "#FEE2E2", text: "#991B1B", label: "Rejected" },
  PAYMENT_REJECTED: { bg: "#FEE2E2", text: "#991B1B", label: "Payment Rejected" },
};

export default function InitiatorTurnRequests({ navigation }) {
  const { colors } = useTheme();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState({});
  const [committees, setCommittees] = useState({});
  const [activeTab, setActiveTab] = useState("swap"); // 'swap' | 'legacy'
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);

      // Load both new swap requests and legacy turn requests in parallel
      const [swapResult, legacyData] = await Promise.all([
        userService.getSwapRequests(),
        userService.getTurnRequests(),
      ]);

      // New swap requests
      const swapArr = swapResult?.success && Array.isArray(swapResult.requests)
        ? swapResult.requests.map(r => ({ ...r, _source: "swap" }))
        : [];

      // Legacy turn requests
      const legacyArr = legacyData
        ? Array.isArray(legacyData)
          ? legacyData
          : Object.keys(legacyData).map((k) => ({ id: k, ...legacyData[k] }))
        : [];
      const legacyMapped = legacyArr.map(r => ({ ...r, _source: "legacy" }));

      const allRequests = [...swapArr, ...legacyMapped]
        .sort((a, b) => String(b.createdAt || b.date || "").localeCompare(String(a.createdAt || a.date || "")));

      setRequests(allRequests);

      // Enrich with profiles and committees
      const allUserIds = new Set();
      const allCommitteeIds = new Set();
      allRequests.forEach(r => {
        if (r.fromUserId) allUserIds.add(r.fromUserId);
        if (r.toUserId) allUserIds.add(r.toUserId);
        if (r.userId) allUserIds.add(r.userId);
        if (r.committeeId) allCommitteeIds.add(r.committeeId);
      });

      const [profEntries, commEntries] = await Promise.all([
        Promise.all([...allUserIds].map(async uid => {
          try { return [uid, await userService.getProfileRTDB(uid) || null]; } catch { return [uid, null]; }
        })),
        Promise.all([...allCommitteeIds].map(async cid => {
          try { return [cid, await userService.getCommitteeById(cid) || null]; } catch { return [cid, null]; }
        })),
      ]);

      setProfiles(Object.fromEntries(profEntries));
      setCommittees(Object.fromEntries(commEntries));
    } catch {
      Alert.alert("Error", "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const swapRequests = useMemo(() =>
    requests.filter(r => r._source === "swap"), [requests]);
  const legacyRequests = useMemo(() =>
    requests.filter(r => r._source === "legacy"), [requests]);

  // ── Handle NEW swap requests (via swap-initiator-handle) ──
  const handleSwap = async (req, action) => {
    if (action === "reject") {
      setRejectModal(req);
      return;
    }
    setActionLoading(req.id);
    try {
      const result = await userService.handleSwapAsInitiator(req.id, "approve");
      if (result?.success) {
        Alert.alert("Approved ✅", "Swap request approved. User A will now be notified to submit payment.");
        load();
      } else {
        Alert.alert("Error", result?.error || "Failed to approve.");
      }
    } catch (err) {
      Alert.alert("Error", err.message || "Action failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const confirmReject = async () => {
    if (!rejectModal) return;
    setActionLoading(rejectModal.id);
    try {
      const result = await userService.handleSwapAsInitiator(rejectModal.id, "reject", rejectReason || null);
      if (result?.success) {
        Alert.alert("Rejected", "Swap request has been rejected.");
        setRejectModal(null);
        setRejectReason("");
        load();
      } else {
        Alert.alert("Error", result?.error || "Failed to reject.");
      }
    } catch (err) {
      Alert.alert("Error", err.message || "Action failed.");
    } finally {
      setActionLoading(null);
    }
  };

  // ── Handle LEGACY turn requests ──
  const updateLegacyStatus = async (req, status) => {
    try {
      await userService.updateTurnRequestStatus(req.id || req.requestId, status);
      Alert.alert("Success", `Request ${status}`);
      load();
    } catch {
      Alert.alert("Error", "Failed to update status");
    }
  };

  // ── Swap Request Card ─────────────────────────────────
  const renderSwapCard = ({ item }) => {
    const fromProfile = profiles[item.fromUserId] || {};
    const toProfile = profiles[item.toUserId] || {};
    const committee = committees[item.committeeId] || {};
    const statusCfg = STATUS_CONFIG[item.status] || { bg: "#F3F4F6", text: "#374151", label: item.status };
    const isPending = item.status === "PENDING_INITIATOR_APPROVAL";

    // Find turn numbers
    const turns = Array.isArray(committee.turns) ? committee.turns : [];
    const fromTurn = turns.find(t => t && (t.userId || t.uid) === item.fromUserId);
    const toTurn = turns.find(t => t && (t.userId || t.uid) === item.toUserId);

    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={[styles.committeeLabel, { color: colors.brand }]}>
              {committee?.name || item.committeeId || "—"}
            </Text>
            <Text style={[styles.cardSubLabel, { color: colors.textSecondary }]}>
              Turn Swap Request
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
            <Text style={[styles.statusText, { color: statusCfg.text }]}>{statusCfg.label}</Text>
          </View>
        </View>

        {/* Users involved */}
        <View style={styles.usersRow}>
          <View style={styles.userCol}>
            {fromProfile?.profilePicture && isValidImageUrl(fromProfile.profilePicture) ? (
              <Image source={{ uri: fromProfile.profilePicture }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: colors.brand + "20" }]}>
                <Text style={[styles.avatarInitial, { color: colors.brand }]}>
                  {(fromProfile?.name || fromProfile?.fullName || "?")[0]?.toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={[styles.userName, { color: colors.text }]}>
              {fromProfile?.name || fromProfile?.fullName || "User A"}
            </Text>
            <Text style={[styles.userSub, { color: colors.textSecondary }]}>
              {fromTurn ? `Turn #${fromTurn.turnNumber}` : "Requester"}
            </Text>
          </View>

          <View style={styles.swapIcon}>
            <Ionicons name="swap-horizontal" size={28} color={colors.brand} />
          </View>

          <View style={styles.userCol}>
            {toProfile?.profilePicture && isValidImageUrl(toProfile.profilePicture) ? (
              <Image source={{ uri: toProfile.profilePicture }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: "#F59E0B20" }]}>
                <Text style={[styles.avatarInitial, { color: "#F59E0B" }]}>
                  {(toProfile?.name || toProfile?.fullName || "?")[0]?.toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={[styles.userName, { color: colors.text }]}>
              {toProfile?.name || toProfile?.fullName || "User B"}
            </Text>
            <Text style={[styles.userSub, { color: colors.textSecondary }]}>
              {toTurn ? `Turn #${toTurn.turnNumber}` : "Target"}
            </Text>
          </View>
        </View>

        {/* Details */}
        <View style={[styles.detailBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.detailItem, { color: colors.textSecondary }]}>
            📋 Reason: <Text style={{ color: colors.text }}>{item.reason || "—"}</Text>
          </Text>
          <Text style={[styles.detailItem, { color: colors.textSecondary }]}>
            💰 Fee: <Text style={{ color: colors.text }}>Rs {item.amount || 500}</Text>
          </Text>
          <Text style={[styles.detailItem, { color: colors.textSecondary }]}>
            📅 Date: <Text style={{ color: colors.text }}>
              {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "—"}
            </Text>
          </Text>
        </View>

        {/* Actions — only for PENDING_INITIATOR_APPROVAL */}
        {isPending && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#10B981" }]}
              onPress={() => handleSwap(item, "approve")}
              disabled={actionLoading === item.id}
            >
              {actionLoading === item.id ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.actionBtnText}>✓ Approve</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#EF4444" }]}
              onPress={() => handleSwap(item, "reject")}
              disabled={actionLoading === item.id}
            >
              <Text style={styles.actionBtnText}>✕ Reject</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // ── Legacy Turn Request Card ──────────────────────────
  const renderLegacyCard = ({ item }) => {
    const profile = profiles[item.userId] || {};
    const committee = committees[item.committeeId] || {};
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.committeeLabel, { color: colors.brand }]}>
            {committee?.name || item.committeeId || "—"}
          </Text>
          <View style={[styles.statusBadge, {
            backgroundColor: item.status === "Pending" ? "#FEF9C3"
              : item.status === "Accepted" ? "#D1FAE5" : "#FEE2E2",
          }]}>
            <Text style={[styles.statusText, {
              color: item.status === "Pending" ? "#854D0E"
                : item.status === "Accepted" ? "#065F46" : "#991B1B",
            }]}>{String(item.status || "Pending").toUpperCase()}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", marginTop: 10 }}>
          <View style={{ marginRight: 12 }}>
            {profile?.profilePicture && isValidImageUrl(profile.profilePicture) ? (
              <Image source={{ uri: profile.profilePicture }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: colors.brand + "22" }]}>
                <Text style={[styles.avatarInitial, { color: colors.brand }]}>?</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[{ color: colors.text, fontWeight: "700", fontSize: 14 }]}>
              {profile?.name || profile?.fullName || item.userName || "—"}
            </Text>
            <Text style={[{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }]}>
              Type: {item.type || "—"} • Amount: {item.amount ?? "—"} PKR
            </Text>
            <Text style={[{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }]}>
              Reason: {item.reason || "—"}
            </Text>
          </View>
        </View>
        {item.status === "Pending" && (
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#10B981" }]} onPress={() => updateLegacyStatus(item, "Accepted")}>
              <Text style={styles.actionBtnText}>ACCEPT</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#EF4444" }]} onPress={() => updateLegacyStatus(item, "Rejected")}>
              <Text style={styles.actionBtnText}>REJECT</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (loading) return <ActivityIndicator size="large" color={colors.brand} style={{ marginTop: 40 }} />;

  const currentData = activeTab === "swap" ? swapRequests : legacyRequests;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Tab Bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "swap" && { borderBottomColor: colors.brand }]}
          onPress={() => setActiveTab("swap")}
        >
          <Text style={[styles.tabLabel, { color: activeTab === "swap" ? colors.brand : colors.textSecondary }]}>
            Swap Requests {swapRequests.filter(r => r.status === "PENDING_INITIATOR_APPROVAL").length > 0
              ? `(${swapRequests.filter(r => r.status === "PENDING_INITIATOR_APPROVAL").length} pending)` : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "legacy" && { borderBottomColor: colors.brand }]}
          onPress={() => setActiveTab("legacy")}
        >
          <Text style={[styles.tabLabel, { color: activeTab === "legacy" ? colors.brand : colors.textSecondary }]}>
            Turn Requests
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={currentData}
        keyExtractor={(i, idx) => String(i.id || i.requestId || idx)}
        renderItem={activeTab === "swap" ? renderSwapCard : renderLegacyCard}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <Text style={{ textAlign: "center", marginTop: 30, color: colors.textSecondary, fontSize: 14 }}>
            {activeTab === "swap" ? "No swap requests found." : "No turn change requests."}
          </Text>
        }
      />

      {/* Reject Reason Modal */}
      <Modal visible={rejectModal !== null} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Reject Swap Request</Text>
            <Text style={[{ color: colors.textSecondary, fontSize: 13, marginBottom: 10 }]}>
              Reason (optional):
            </Text>
            <TextInput
              style={[styles.reasonInput, { color: colors.text, borderColor: colors.border }]}
              placeholder="Enter reason for rejection..."
              placeholderTextColor={colors.textSecondary}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderWidth: 1, borderColor: colors.border }]}
                onPress={() => { setRejectModal(null); setRejectReason(""); }}
              >
                <Text style={{ color: colors.text, fontWeight: "700" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: "#EF4444" }]}
                onPress={confirmReject}
                disabled={!!actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Confirm Reject</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: 13, fontWeight: "700" },

  card: {
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    padding: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  committeeLabel: { fontSize: 16, fontWeight: "800" },
  cardSubLabel: { fontSize: 12, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    maxWidth: 160,
  },
  statusText: { fontSize: 11, fontWeight: "800" },

  usersRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginBottom: 14,
  },
  userCol: { alignItems: "center", flex: 1 },
  swapIcon: { alignItems: "center", justifyContent: "center" },
  avatar: { width: 52, height: 52, borderRadius: 26, marginBottom: 6 },
  avatarFallback: { width: 52, height: 52, borderRadius: 26, justifyContent: "center", alignItems: "center", marginBottom: 6 },
  avatarInitial: { fontSize: 20, fontWeight: "800" },
  userName: { fontSize: 13, fontWeight: "700", textAlign: "center" },
  userSub: { fontSize: 12, textAlign: "center", marginTop: 2 },

  detailBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 14,
    gap: 4,
  },
  detailItem: { fontSize: 13 },

  actions: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "90%",
    borderRadius: 18,
    padding: 20,
  },
  modalTitle: { fontSize: 17, fontWeight: "800", marginBottom: 12 },
  reasonInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    minHeight: 80,
    fontSize: 14,
    textAlignVertical: "top",
    marginBottom: 14,
  },
  modalBtns: { flexDirection: "row", gap: 10 },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
