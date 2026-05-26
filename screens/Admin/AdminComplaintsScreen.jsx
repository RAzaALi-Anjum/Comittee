import { useEffect, useState, useCallback } from "react";
import {
  Alert, FlatList, StyleSheet, Text, TextInput,
  TouchableOpacity, View, ActivityIndicator, RefreshControl
} from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import apiClient from "../../services/apiClient";

// TC-77, TC-78, TC-79: Admin Complaints Screen — wired to secure backend /api/complaint
export default function AdminComplaintsScreen() {
  const { colors } = useTheme();
  const [complaints, setComplaints] = useState([]);
  const [resolutionNotes, setResolutionNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("all"); // all | pending | resolved | rejected

  // TC-79-01: Fetch all complaints from secure backend
  const fetchComplaints = useCallback(async () => {
    try {
      const res = await apiClient.backendGet("/complaint");
      // TC-79-02: Empty state gracefully
      setComplaints(res.complaints || []);
    } catch (error) {
      console.error("[AdminComplaints]", error);
      Alert.alert("Error", "Unable to fetch complaints");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchComplaints(); }, [fetchComplaints]);

  const onRefresh = () => { setRefreshing(true); fetchComplaints(); };

  // TC-77-01: Admin resolve with mandatory notes
  const resolveComplaint = async (complaintId) => {
    const notes = resolutionNotes[complaintId];
    if (!notes || !notes.trim()) {
      Alert.alert("Validation Error", "Resolution notes are required to resolve a complaint.");
      return;
    }
    try {
      await apiClient.backendPost("/complaint/resolve", {
        complaintId,
        resolutionNotes: notes.trim(),
      });
      // TC-78-01: Backend automatically notifies complainant
      Alert.alert("Resolved", "Complaint resolved and the user has been notified.");
      setResolutionNotes(prev => ({ ...prev, [complaintId]: "" }));
      fetchComplaints();
    } catch (err) {
      Alert.alert("Error", err.message || "Failed to resolve complaint");
    }
  };

  // TC-77-02: Admin reject with mandatory notes
  const rejectComplaint = async (complaintId) => {
    const notes = resolutionNotes[complaintId];
    if (!notes || !notes.trim()) {
      Alert.alert("Validation Error", "Rejection notes are required before rejecting a complaint.");
      return;
    }
    Alert.alert(
      "Confirm Rejection",
      "Are you sure you want to reject this complaint?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: async () => {
            try {
              await apiClient.backendPost("/complaint/reject", {
                complaintId,
                rejectionNotes: notes.trim(),
              });
              Alert.alert("Rejected", "Complaint rejected and the user has been notified.");
              setResolutionNotes(prev => ({ ...prev, [complaintId]: "" }));
              fetchComplaints();
            } catch (err) {
              Alert.alert("Error", err.message || "Failed to reject complaint");
            }
          },
        },
      ]
    );
  };

  const filteredComplaints = filter === "all"
    ? complaints
    : complaints.filter(c => c.status === filter);

  const renderItem = ({ item }) => {
    const isResolved = item.status === "resolved";
    const isRejected = item.status === "rejected";
    const isPending = item.status === "pending";

    const statusColors = {
      pending: { bg: "#fef3c7", text: "#92400e" },
      resolved: { bg: "#dcfce7", text: "#166534" },
      rejected: { bg: "#fee2e2", text: "#991b1b" },
    };
    const sc = statusColors[item.status] || statusColors.pending;

    return (
      <View style={styles.card}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.complaintTitle}>{item.title || "No Title"}</Text>
            <Text style={styles.meta}>Ref: {item.id}</Text>
            <Text style={styles.meta}>Filed: {new Date(item.createdAt).toLocaleDateString()}</Text>
            {item.targetId ? <Text style={styles.meta}>Against: {item.targetId}</Text> : null}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.statusText, { color: sc.text }]}>
              {item.status?.toUpperCase() || "PENDING"}
            </Text>
          </View>
        </View>

        <View style={styles.messageContainer}>
          <Text style={styles.messageLabel}>REASON</Text>
          <Text style={styles.messageText}>{item.reason || "—"}</Text>
        </View>

        {isPending && (
          <View style={{ marginTop: 12 }}>
            <View style={{ height: 1, backgroundColor: "#f1f5f9", marginBottom: 12 }} />
            <Text style={styles.responseLabel}>ADMIN RESPONSE NOTES (REQUIRED)</Text>
            <TextInput
              style={styles.input}
              placeholder="Type your resolution or rejection notes..."
              placeholderTextColor="#94a3b8"
              multiline
              value={resolutionNotes[item.id] || ""}
              onChangeText={(text) => setResolutionNotes(prev => ({ ...prev, [item.id]: text }))}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                style={[styles.button, { flex: 1, backgroundColor: "#16a34a" }]}
                onPress={() => resolveComplaint(item.id)}
              >
                <Text style={styles.buttonText}>✓ Resolve</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { flex: 1, backgroundColor: "#dc2626" }]}
                onPress={() => rejectComplaint(item.id)}
              >
                <Text style={styles.buttonText}>✗ Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {(isResolved || isRejected) && item.resolvedAt && (
          <View style={[styles.resolvedContainer, { borderColor: sc.bg, backgroundColor: sc.bg + "60" }]}>
            <Text style={[styles.responseLabel, { color: sc.text }]}>
              {isResolved ? "RESOLUTION" : "REJECTION"} NOTES
            </Text>
            <Text style={[styles.responseText, { color: sc.text }]}>
              {item.resolutionNotes || item.rejectionNotes || "No notes provided"}
            </Text>
            <Text style={[styles.meta, { marginTop: 4 }]}>
              {isResolved ? "Resolved" : "Rejected"}: {new Date(item.resolvedAt).toLocaleDateString()}
            </Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color="#800000" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {["all", "pending", "resolved", "rejected"].map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterTabText, filter === f && styles.filterTabTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredComplaints}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <Text style={styles.heading}>
            Complaints & Resolutions
            {filteredComplaints.length > 0 ? ` (${filteredComplaints.length})` : ""}
          </Text>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {/* TC-79-02: Empty state */}
            No Complaint History Found.
          </Text>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#800000" />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 20, fontWeight: "800", marginBottom: 16, color: "#1e293b", letterSpacing: 0.5 },
  filterRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  filterTab: { flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 8 },
  filterTabActive: { backgroundColor: "#800000" },
  filterTabText: { fontSize: 12, color: "#64748b", fontWeight: "600" },
  filterTabTextActive: { color: "#fff" },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  complaintTitle: { fontSize: 16, fontWeight: "700", color: "#1e293b", marginBottom: 4 },
  meta: { fontSize: 12, color: "#64748b", marginBottom: 2 },
  messageContainer: { backgroundColor: "#f8fafc", padding: 12, borderRadius: 12, marginTop: 4 },
  messageLabel: { fontSize: 11, fontWeight: "800", color: "#94a3b8", marginBottom: 4, textTransform: "uppercase" },
  messageText: { fontSize: 15, color: "#334155", lineHeight: 22 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  statusText: { fontSize: 11, fontWeight: "700" },
  responseLabel: { fontSize: 11, fontWeight: "800", color: "#800000", marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" },
  input: {
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    fontSize: 14,
    color: "#0f172a",
    minHeight: 80,
    textAlignVertical: "top",
  },
  button: {
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  resolvedContainer: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  responseText: { fontSize: 14, lineHeight: 20 },
  empty: { textAlign: "center", marginTop: 40, fontSize: 16, color: "#64748b" },
});
