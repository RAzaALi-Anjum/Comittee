import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import React, { useState, useEffect } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";

export default function TurnChangeRequestForm({ navigation, route }) {
  const { colors } = useTheme();
  const { committeeId, committeeName } = route.params || {};

  const [userId, setUserId] = useState(null);
  const [myTurnNumber, setMyTurnNumber] = useState(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingMembers, setFetchingMembers] = useState(true);

  // Member picker
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberModalVisible, setMemberModalVisible] = useState(false);

  const SWAP_FEE = 500;

  // Load current user and committee members on mount
  useEffect(() => {
    const init = async () => {
      try {
        const stored = await AsyncStorage.getItem("userData");
        if (!stored) return;
        const u = JSON.parse(stored);
        const uid = u.userId || u.uid;
        setUserId(uid);

        // Fetch committee data to get members + turns
        const commData = await userService.getCommitteeById(committeeId);
        if (!commData) return;

        // Get all members except current user
        const participants = Array.isArray(commData.usersParticipated)
          ? commData.usersParticipated.filter(Boolean)
          : Object.values(commData.usersParticipated || {}).filter(Boolean);

        const others = participants.filter(
          (m) => (m.userId || m.uid || m.id) !== uid
        );
        setMembers(others);

        // Find current user's turn number
        if (Array.isArray(commData.turns)) {
          const myTurn = commData.turns.find(
            (t) => t && (t.userId || t.uid) === uid
          );
          if (myTurn) setMyTurnNumber(myTurn.turnNumber);
        }
      } catch (err) {
        console.error("[TurnChangeRequestForm] init error:", err);
      } finally {
        setFetchingMembers(false);
      }
    };
    init();
  }, [committeeId]);

  const filteredMembers = members.filter((m) => {
    const name = String(m.userName || m.name || m.fullName || "").toLowerCase();
    const s = memberSearch.toLowerCase();
    return name.includes(s);
  });

  const handleSubmit = async () => {
    if (!selectedMember) {
      Alert.alert("Select Member", "Please select a member to swap with.");
      return;
    }
    if (!reason.trim()) {
      Alert.alert("Reason Required", "Please enter a reason for the swap.");
      return;
    }

    setLoading(true);
    try {
      const result = await userService.submitTurnSwapRequest({
        committeeId,
        toUserId: selectedMember.userId || selectedMember.uid || selectedMember.id,
        reason: reason.trim(),
      });

      if (result?.success) {
        Alert.alert(
          "Request Submitted ✅",
          "Your turn swap request has been submitted. The committee initiator will review it shortly.\n\nFee: Rs 500 (payable after initiator approval)",
          [{ text: "OK", onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert("Error", result?.error || "Failed to submit swap request.");
      }
    } catch (err) {
      Alert.alert("Error", err.message || "Failed to submit request.");
    } finally {
      setLoading(false);
    }
  };

  if (fetchingMembers) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Loading committee members...
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate("UserDashboard")}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.brand }]}>Request Turn Swap</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{committeeName}</Text>
          </View>
        </View>

        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: colors.brand + "15", borderColor: colors.brand + "30" }]}>
          <Ionicons name="information-circle-outline" size={20} color={colors.brand} style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTitle, { color: colors.brand }]}>How Turn Swap Works</Text>
            <Text style={[styles.infoText, { color: colors.text }]}>
              1. Select member to swap with{"\n"}
              2. Initiator reviews &amp; approves{"\n"}
              3. You pay Rs {SWAP_FEE} swap fee{"\n"}
              4. Admin verifies → turns swapped!
            </Text>
          </View>
        </View>

        {/* Current Turn */}
        {myTurnNumber && (
          <View style={[styles.turnBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="swap-horizontal" size={18} color={colors.brand} style={{ marginRight: 8 }} />
            <Text style={[styles.turnBadgeText, { color: colors.text }]}>
              Your Current Turn: <Text style={{ color: colors.brand, fontWeight: "800" }}>#{myTurnNumber}</Text>
            </Text>
          </View>
        )}

        {/* Member Picker */}
        <Text style={[styles.label, { color: colors.text }]}>Swap With *</Text>
        <TouchableOpacity
          style={[
            styles.pickerBtn,
            {
              backgroundColor: colors.card,
              borderColor: selectedMember ? colors.brand : colors.border,
            },
          ]}
          onPress={() => setMemberModalVisible(true)}
        >
          {selectedMember ? (
            <View style={styles.pickerSelected}>
              <View style={[styles.avatarSmall, { backgroundColor: colors.brand + "20" }]}>
                <Text style={[styles.avatarInitial, { color: colors.brand }]}>
                  {(selectedMember.userName || selectedMember.name || selectedMember.fullName || "?")[0].toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={[styles.pickerName, { color: colors.text }]}>
                  {selectedMember.userName || selectedMember.name || selectedMember.fullName || "Unknown"}
                </Text>
                {selectedMember.turnNumber && (
                  <Text style={[styles.pickerSub, { color: colors.textSecondary }]}>
                    Turn #{selectedMember.turnNumber}
                  </Text>
                )}
              </View>
            </View>
          ) : (
            <Text style={[styles.pickerPlaceholder, { color: colors.textSecondary }]}>
              Select committee member...
            </Text>
          )}
          <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Reason */}
        <Text style={[styles.label, { color: colors.text }]}>Reason for Swap *</Text>
        <TextInput
          style={[
            styles.textArea,
            { backgroundColor: colors.card, borderColor: colors.border, color: colors.text },
          ]}
          placeholder="Explain why you need to swap turns (e.g., urgent financial need, travel plans...)"
          placeholderTextColor={colors.textSecondary}
          value={reason}
          onChangeText={setReason}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* Fee Info */}
        <View style={[styles.feeRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="cash-outline" size={18} color="#F59E0B" style={{ marginRight: 8 }} />
          <Text style={[styles.feeText, { color: colors.text }]}>
            Swap Fee: <Text style={{ color: "#F59E0B", fontWeight: "800" }}>Rs {SWAP_FEE}</Text>
            <Text style={[styles.feeSub, { color: colors.textSecondary }]}>
              {" "}(payable after initiator approval)
            </Text>
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            { backgroundColor: colors.brand },
            loading && { opacity: 0.6 },
          ]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="swap-horizontal" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.submitText}>Submit Swap Request</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Member Picker Modal */}
      <Modal
        visible={memberModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setMemberModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.brand }]}>Select Member</Text>
              <TouchableOpacity onPress={() => setMemberModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.searchInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
              placeholder="Search by name..."
              placeholderTextColor={colors.textSecondary}
              value={memberSearch}
              onChangeText={setMemberSearch}
            />

            <FlatList
              data={filteredMembers}
              keyExtractor={(_, i) => String(i)}
              style={{ maxHeight: 350 }}
              renderItem={({ item }) => {
                const name = item.userName || item.name || item.fullName || "Unknown";
                const isSelected =
                  selectedMember &&
                  (selectedMember.userId || selectedMember.uid || selectedMember.id) ===
                  (item.userId || item.uid || item.id);
                return (
                  <TouchableOpacity
                    style={[
                      styles.memberRow,
                      { borderBottomColor: colors.border },
                      isSelected && { backgroundColor: colors.brand + "15" },
                    ]}
                    onPress={() => {
                      setSelectedMember(item);
                      setMemberSearch("");
                      setMemberModalVisible(false);
                    }}
                  >
                    <View style={[styles.avatarSmall, { backgroundColor: colors.brand + "20" }]}>
                      <Text style={[styles.avatarInitial, { color: colors.brand }]}>
                        {name[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.memberName, { color: colors.text }]}>{name}</Text>
                      {item.turnNumber && (
                        <Text style={[styles.memberSub, { color: colors.textSecondary }]}>
                          Turn #{item.turnNumber}
                        </Text>
                      )}
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  No members found.
                </Text>
              }
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 14 },

  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  backBtn: { padding: 4, marginRight: 12 },
  title: { fontSize: 20, fontWeight: "800" },
  subtitle: { fontSize: 13, marginTop: 2 },

  infoCard: {
    flexDirection: "row",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 18,
    alignItems: "flex-start",
  },
  infoTitle: { fontWeight: "700", fontSize: 13, marginBottom: 4 },
  infoText: { fontSize: 12, lineHeight: 18 },

  turnBadge: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 18,
  },
  turnBadgeText: { fontSize: 14, fontWeight: "600" },

  label: { fontSize: 14, fontWeight: "700", marginBottom: 8 },

  pickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 18,
  },
  pickerSelected: { flexDirection: "row", alignItems: "center", gap: 10 },
  pickerName: { fontSize: 15, fontWeight: "700" },
  pickerSub: { fontSize: 12 },
  pickerPlaceholder: { fontSize: 14 },

  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    minHeight: 100,
    marginBottom: 18,
  },

  feeRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 24,
  },
  feeText: { fontSize: 14, fontWeight: "600" },
  feeSub: { fontSize: 12, fontWeight: "400" },

  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
  },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  searchInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    gap: 12,
  },
  memberName: { fontSize: 15, fontWeight: "600" },
  memberSub: { fontSize: 12 },
  avatarSmall: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: { fontSize: 16, fontWeight: "800" },
  emptyText: { textAlign: "center", padding: 20, fontSize: 14 },
});
