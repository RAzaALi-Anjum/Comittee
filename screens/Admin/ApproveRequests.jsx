// screens/Admin/ApproveRequest.js
import { useFocusEffect } from "@react-navigation/native";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useState } from "react";
import { Alert, FlatList, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeProvider";
import { sendNotification } from "../../utils/notificationHelper";
import apiClient from "../../services/apiClient";
import { formatDateTime } from "../../utils/date";

export default function ApproveRequest() {
  const [requests, setRequests] = useState([]);
  const [selectedInitiator, setSelectedInitiator] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedCommittee, setSelectedCommittee] = useState(null);
  const { colors } = useTheme();

  const firebaseUrl = "https://com1-e2378-default-rtdb.firebaseio.com/";

  // ---------------------------
  // Fetch all committee requests
  // ---------------------------
  const fetchRequests = async () => {
    try {
      const res = await fetch(`${firebaseUrl}/committees.json`);
      const data = await res.json();

      if (!data) {
        setRequests([]);
        return;
      }

      // convert object → array
      const extracted = Object.keys(data).map((key) => ({
        id: key,
        ...data[key],
      }));

      setRequests(extracted);
    } catch (error) {
      Alert.alert("Error", "Failed to load requests");
      console.log(error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
    }, [])
  );

  // ---------------------------
  // Approve
  // ---------------------------
  const approveRequest = async (id) => {
    try {
      await fetch(`${firebaseUrl}/committees/${id}.json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "approved",
          adminStatus: "approved",
          active: false,
          approvedAt: new Date().toISOString(),
          approvedAtTs: Date.now(),
        }),
      });

      const committee = requests.find((r) => r.id === id);
      if (committee && committee.createdBy) {
        sendNotification(
          committee.createdBy,
          "Committee Approved",
          `Your committee "${committee.name}" has been approved. Turns will be assigned randomly after the committee starts.`,
          "success",
          id
        );
      }

      Alert.alert("Success", "Committee request approved!");
      fetchRequests(); // refresh list
    } catch (error) {
      Alert.alert("Error", "Approval failed");
      console.log(error);
    }
  };

  // ---------------------------
  // Reject
  // ---------------------------
  const rejectRequest = async (id) => {
    try {
      await fetch(`${firebaseUrl}/committees/${id}.json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "rejected",
          adminStatus: "rejected",
          rejectedAt: new Date().toISOString(),
          rejectedAtTs: Date.now(),
        }),
      });

      const committee = requests.find((r) => r.id === id);
      if (committee && committee.createdBy) {
        sendNotification(committee.createdBy, "Committee Rejected", `Your committee "${committee.name}" has been rejected.`, "error", id);
      }

      Alert.alert("Rejected", "Committee request rejected");
      fetchRequests();
    } catch (error) {
      Alert.alert("Error", "Rejection failed");
      console.log(error);
    }
  };

  const fetchInitiatorDetails = async (userId) => {
    if (!userId) return null;
    try {
      // Prefer backend decrypted profile
      try {
        const res = await apiClient.backendGet(`/profile/${userId}`);
        return res?.profile || null;
      } catch (backendErr) {
        console.warn("[ApproveRequests] Backend decrypt unavailable, fallback RTDB:", backendErr.message);
      }
      const res = await fetch(`${firebaseUrl}/users/${userId}.json`);
      const user = await res.json();
      return user || null;
    } catch {
      return null;
    }
  };

  // ---------------------------
  // Render Card
  // ---------------------------
  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{item.name}</Text>
          <Text style={styles.details}>Total Amount: <Text style={{ color: '#0f172a', fontWeight: '600' }}>PKR {item.totalAmount}</Text></Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: '#fef3c7' }]}>
          <Text style={[styles.statusText, { color: '#92400e' }]}>{item.status || "PENDING"}</Text>
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 }} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Text style={styles.details}>Members: <Text style={{ color: '#0f172a', fontWeight: '500' }}>{item.members}</Text></Text>
        <Text style={styles.details}>Cycle: <Text style={{ color: '#0f172a', fontWeight: '500' }}>{item.cycleDuration} Days</Text></Text>
        <Text style={styles.details}>Starts: <Text style={{ color: '#0f172a', fontWeight: '500' }}>{item.startDate}</Text></Text>
      </View>

      {/* Unified Details Button */}
      <TouchableOpacity
        style={[styles.button, styles.infoBtn, { marginTop: 16 }]}
        onPress={async () => {
          setSelectedCommittee(item);
          const initiator = await fetchInitiatorDetails(item.createdBy);
          setSelectedInitiator(initiator);
          setDetailVisible(true);
        }}
      >
        <Text style={styles.infoBtnText}>View Details</Text>
      </TouchableOpacity>

      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.button, styles.approveBtn]}
          onPress={() => approveRequest(item.id)}
        >
          <Text style={styles.btnText}>Approve</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.rejectBtn]}
          onPress={() => rejectRequest(item.id)}
        >
          <Text style={styles.btnText}>Reject</Text>
        </TouchableOpacity>
      </View>

      {/* Removed separate Full Details button; Unified above */}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={styles.heading}>Pending Committee Requests</Text>
      <FlatList
        data={requests.filter((r) => {
          const s = (r.status || "").toLowerCase();
          return s === "pending" || !s || (s !== "approved" && s !== "rejected");
        })}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.empty}>No pending requests</Text>}
      />

      {requests.some((r) => { const s = (r.status || "").toLowerCase(); return s === "approved" || s === "rejected"; }) && (
        <>
          <Text style={[styles.heading, { marginTop: 20 }]}>Request History</Text>
          <FlatList
            data={requests.filter((r) => { const s = (r.status || "").toLowerCase(); return s === "approved" || s === "rejected"; })}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{item.name}</Text>
                    <Text style={styles.details}>Total Amount: PKR {item.totalAmount}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: item.status?.toLowerCase() === 'approved' ? '#dcfce7' : '#fee2e2' }]}>
                    <Text style={[styles.statusText, { color: item.status?.toLowerCase() === 'approved' ? '#166534' : '#991b1b' }]}>{item.status || "UNKNOWN"}</Text>
                  </View>
                </View>

                <View style={{ height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 }} />

                {item.approvedAt && <Text style={styles.details}>Approved At: <Text style={{ color: '#0f172a', fontWeight: '500' }}>{formatDateTime(item.approvedAt)}</Text></Text>}
                {item.rejectedAt && <Text style={styles.details}>Rejected At: <Text style={{ color: '#0f172a', fontWeight: '500' }}>{formatDateTime(item.rejectedAt)}</Text></Text>}

                <TouchableOpacity
                  style={[styles.button, styles.infoBtn, { width: '100%', marginTop: 12 }]}
                  onPress={() => {
                    setSelectedCommittee(item);
                    setDetailVisible(true);
                  }}
                >
                  <Text style={styles.infoBtnText}>View Full Details</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </>
      )}

      {/* Unified Details Modal */}
      <Modal
        visible={detailVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setDetailVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Text style={[styles.modalTitle, { color: colors.brand, marginBottom: 0 }]}>Initiator & Committee Details</Text>
              <TouchableOpacity onPress={() => setDetailVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={colors.textSecondary || "#64748b"} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={true}>
              <Text style={[styles.sectionHeading, { color: colors.text }]}>Initiator</Text>
              {selectedInitiator ? (
                <>
                  <Text style={styles.modalText}>Name: {selectedInitiator.name || selectedInitiator.fullName || "—"}</Text>
                  <Text style={styles.modalText}>Email: {selectedInitiator.email || "—"}</Text>
                  <Text style={styles.modalText}>Phone: {selectedInitiator.phoneNumber || selectedInitiator.contactNumber || selectedInitiator.phone || "—"}</Text>
                  <Text style={styles.modalText}>CNIC:</Text>
                  {selectedInitiator.cnic ? (
                    <Image source={{ uri: selectedInitiator.cnic }} style={{ width: '100%', height: 160, borderRadius: 12, marginBottom: 10 }} />
                  ) : (
                    <Text style={styles.modalText}>—</Text>
                  )}
                  <Text style={styles.modalText}>Reference CNIC:</Text>
                  {selectedInitiator.referenceCnic ? (
                    <Image source={{ uri: selectedInitiator.referenceCnic }} style={{ width: '100%', height: 160, borderRadius: 12, marginBottom: 10 }} />
                  ) : (
                    <Text style={styles.modalText}>—</Text>
                  )}
                  {selectedInitiator.bankStatement ? (
                    <TouchableOpacity
                      style={[styles.button, styles.infoBtn, { marginTop: 6, width: '100%' }]}
                      onPress={() => WebBrowser.openBrowserAsync(selectedInitiator.bankStatement)}
                    >
                      <Text style={styles.infoBtnText}>Open Bank Statement (PDF)</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : (
                <Text style={styles.modalText}>No initiator details.</Text>
              )}

              <Text style={[styles.sectionHeading, { color: colors.text, marginTop: 16 }]}>Committee</Text>
              {selectedCommittee ? (
                <>
                  <Text style={styles.modalText}>Name: {selectedCommittee.name || "—"}</Text>
                  <Text style={styles.modalText}>Total Amount: {selectedCommittee.totalAmount || "—"}</Text>
                  <Text style={styles.modalText}>Members: {selectedCommittee.members || "—"}</Text>
                  <Text style={styles.modalText}>Contribution/Cycle: {selectedCommittee.contributionPerCycle || "—"}</Text>
                  <Text style={styles.modalText}>Cycle Duration (Days): {selectedCommittee.cycleDuration || "—"}</Text>
                  <Text style={styles.modalText}>Duration (Months): {selectedCommittee.durationMonths || "—"}</Text>
                  <Text style={styles.modalText}>Number of Cycles: {selectedCommittee.numberOfCycles || "—"}</Text>
                  <Text style={styles.modalText}>Start Date: {selectedCommittee.startDate || "—"}</Text>
                  <Text style={styles.modalText}>End Date: {selectedCommittee.endDate || "—"}</Text>
                  <Text style={styles.modalText}>Status: {selectedCommittee.status || "—"}</Text>
                  {selectedCommittee.approvedAt && <Text style={styles.modalText}>Approved At: {formatDateTime(selectedCommittee.approvedAt)}</Text>}
                  {selectedCommittee.rejectedAt && <Text style={styles.modalText}>Rejected At: {formatDateTime(selectedCommittee.rejectedAt)}</Text>}
                </>
              ) : (
                <Text style={styles.modalText}>No committee details.</Text>
              )}
            </ScrollView>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.brand, marginTop: 16, width: "100%", flex: 0, height: 48 }]}
              onPress={() => setDetailVisible(false)}
            >
              <Text style={styles.btnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------
// Styles
// ---------------------------
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  heading: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 16,
    color: "#1e293b",
    letterSpacing: 0.5,
  },
  card: {
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
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  details: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 2,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    marginTop: 8,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  approveBtn: {
    backgroundColor: "#10b981",
  },
  rejectBtn: {
    backgroundColor: "#ef4444",
  },
  infoBtn: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginTop: 12,
  },
  btnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  infoBtnText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "600",
  },
  empty: { textAlign: "center", marginTop: 32, fontSize: 16, color: "#64748b" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    maxHeight: "90%",
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 20,
    color: "#0f172a",
  },
  modalText: {
    fontSize: 15,
    marginBottom: 10,
    color: "#334155",
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
