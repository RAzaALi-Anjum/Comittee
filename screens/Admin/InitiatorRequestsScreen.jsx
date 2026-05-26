import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { db } from "../../firebaseConfig";
import apiClient from "../../services/apiClient";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";
import { sendNotification } from "../../utils/notificationHelper";

// Fetch decrypted user profile from backend
async function fetchDecryptedUser(userId) {
  try {
    const result = await apiClient.backendGet(`/profile/${userId}`);
    if (result?.success && result.profile) return result.profile;
  } catch (e) {
    // Silently ignore 404 (user not yet in RTDB) — fallback below handles it
    if (!e.message?.includes("User not found")) {
      console.warn("[Admin] Backend decrypt failed, using raw:", e.message);
    }
  }
  try {
    const res = await fetch(`https://com1-e2378-default-rtdb.firebaseio.com/users/${userId}.json`);
    return await res.json();
  } catch { return null; }
}

const isValidImageUrl = (uri) => {
  if (!uri || typeof uri !== "string") return false;
  return uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("data:image/");
};

export default function InitiatorRequestsScreen() {
  const { colors } = useTheme();
  const [requests, setRequests] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const RTDB_USERS = "https://com1-e2378-default-rtdb.firebaseio.com/users";
  const [userMeta, setUserMeta] = useState({});
  const [completedCommittees, setCompletedCommittees] = useState([]);

  const formatDateTime = (value) => {
    try {
      let d = null;
      if (!value) return "";
      if (value?.toDate) d = value.toDate();
      else {
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) d = parsed;
      }
      if (!d) return String(value ?? "");
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } catch {
      return String(value ?? "");
    }
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "initiatorRequests"), (snapshot) => {
      const base = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      base.sort((a, b) => {
        const ta =
          a.createdAt?.toMillis?.() ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
        const tb =
          b.createdAt?.toMillis?.() ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
        return tb - ta;
      });
      setRequests(base);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const fetchAvatars = async () => {
      const ids = Array.from(new Set(requests.map(r => r.userId).filter(Boolean)));
      const nextMeta = { ...userMeta };
      for (const id of ids) {
        if (!nextMeta[id]) {
          try {
            const u = await fetchDecryptedUser(id);
            nextMeta[id] = {
              avatar: u?.profilePicture || null,
              role: u?.role || "user",
              name: u?.fullName || u?.name || null,
            };
          } catch {
            nextMeta[id] = { avatar: null, role: "user", name: null };
          }
        }
      }
      setUserMeta(nextMeta);
    };
    if (requests.length) fetchAvatars();
  }, [requests]);

  const approveRequest = async (req) => {
    try {
      const nowIso = new Date().toISOString();
      await updateDoc(doc(db, "initiatorRequests", req.id), {
        status: "approved",
        updatedAt: serverTimestamp(),
        approvedAt: nowIso,
        approvedAtTs: Date.now(),
      });
      await updateDoc(doc(db, "users", req.userId), {
        initiatorStatus: "approved",
        role: "initiator",
        initiatorLevel: 1,
      });

      try {
        const u = await fetchDecryptedUser(req.userId);
        if (u && (u.pendingReferenceName || u.pendingReferenceCnicNumber)) {
           await apiClient.post("/profile/save", {
              userId: req.userId,
              referenceName: u.pendingReferenceName || u.referenceName || "",
              referenceFatherName: u.pendingReferenceFatherName || u.referenceFatherName || "",
              referenceAddress: u.pendingReferenceAddress || u.referenceAddress || "",
              referenceContact: u.pendingReferenceContact || u.referenceContact || "",
              referenceCnicNumber: u.pendingReferenceCnicNumber || u.referenceCnicNumber || "",
              pendingReferenceName: "",
              pendingReferenceFatherName: "",
              pendingReferenceAddress: "",
              pendingReferenceContact: "",
              pendingReferenceCnicNumber: ""
           });
        }
      } catch (e) {
         console.warn("[Admin] Failed to promote reference profile:", e);
      }

      try {
        await fetch(`${RTDB_USERS}/${req.userId}.json`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            initiatorStatus: "approved",
            role: "initiator",
            initiatorLevel: 1,
            updatedAt: nowIso,
          }),
        });
      } catch (rtdbErr) {
        console.warn("[Admin] Failed to update user RTDB status:", rtdbErr);
      }

      try {
        await sendNotification(
          req.userId,
          "Initiator Request Approved",
          "Congratulations! Your request to become an initiator has been approved.",
          "success",
          req.userId
        );
      } catch (notifErr) {
        console.warn("[Admin] Failed to send approval notification to user:", notifErr);
      }

      Alert.alert("Approved", "User is now an Initiator");
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const rejectRequest = async (req) => {
    try {
      const nowIso = new Date().toISOString();
      await updateDoc(doc(db, "initiatorRequests", req.id), {
        status: "rejected",
        updatedAt: serverTimestamp(),
        rejectedAt: nowIso,
        rejectedAtTs: Date.now(),
      });
      await updateDoc(doc(db, "users", req.userId), {
        initiatorStatus: "none",
        role: "user",
        initiatorLevel: 0,
      });
      try {
        await fetch(`${RTDB_USERS}/${req.userId}.json`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            initiatorStatus: "none",
            role: "user",
            initiatorLevel: 0,
            updatedAt: nowIso,
          }),
        });
      } catch (rtdbErr) {
        console.warn("[Admin] Failed to update user RTDB status:", rtdbErr);
      }

      try {
        await sendNotification(
          req.userId,
          "Initiator Request Rejected",
          "Your request to become an initiator was not approved. Please contact support.",
          "error",
          req.userId
        );
      } catch (notifErr) {
        console.warn("[Admin] Failed to send rejection notification to user:", notifErr);
      }

      Alert.alert("Rejected", "Request rejected");
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const pendingRequests = requests.filter((r) => (r.status || "").toLowerCase() === "pending");
  const historyRequests = requests.filter((r) => (r.status || "").toLowerCase() !== "pending");

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={styles.title}>Initiator Requests</Text>
      <FlatList
        data={pendingRequests}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={styles.avatar}>
                  {userMeta[item.userId]?.avatar && isValidImageUrl(userMeta[item.userId].avatar) ? (
                    <Image source={{ uri: userMeta[item.userId].avatar }} style={styles.avatarImage} />
                  ) : (
                    <Ionicons name="person" size={24} color={colors.textSecondary} />
                  )}
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.name}>{userMeta[item.userId]?.name || item.requestUserName || "No Name"}</Text>
                    <View style={styles.roleIcon}>
                      <Ionicons
                        name={(userMeta[item.userId]?.role || "user") === "initiator" ? "shield-checkmark" : "star"}
                        size={14}
                        color={(userMeta[item.userId]?.role || "user") === "initiator" ? "#10B981" : "#F59E0B"}
                      />
                    </View>
                  </View>
                  <Text style={styles.infoText}>{item.requestEmail || "—"}</Text>
                </View>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: '#fef3c7' }]}>
                <Text style={[styles.statusText, { color: '#92400e' }]}>{item.status || "PENDING"}</Text>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 }} />

            <Text style={styles.infoText}>Request ID: <Text style={{ color: '#0f172a', fontWeight: '600' }}>{item.trackingNumber ?? "—"}</Text></Text>
            <Text style={styles.infoText}>Requested: <Text style={{ color: '#0f172a', fontWeight: '600' }}>{formatDateTime(item.createdAt)}</Text></Text>

            <View style={styles.row}>
              <TouchableOpacity style={[styles.button, styles.approveBtn]} onPress={() => approveRequest(item)}>
                <Text style={styles.btnText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.rejectBtn]} onPress={() => rejectRequest(item)}>
                <Text style={styles.btnText}>Reject</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.button, styles.detailBtn]}
              onPress={async () => {
                setSelectedRequest(item);
                try {
                  const user = await fetchDecryptedUser(item.userId);
                  setSelectedUser(user || { fullName: item.requestUserName, email: item.requestEmail });
                  try {
                    const committees = await userService.getAllCommittees();
                    const list = Array.isArray(committees) ? committees : Object.keys(committees || {}).map((k) => ({ id: k, ...committees[k] }));
                    const uid = item.userId;
                    const now = new Date();
                    const done = list.filter((c) => {
                      const participated = Array.isArray(c.usersParticipated)
                        ? c.usersParticipated.some((u) => u && (u.userId === uid || u.uid === uid))
                        : false;
                      const status = String(c.status || "").toLowerCase();
                      const endedFlag = status === "completed" || status === "ended";
                      const inactiveEnded =
                        c.active === false && c.endDate && !Number.isNaN(new Date(c.endDate).getTime()) && new Date(c.endDate) < now;
                      return participated && (endedFlag || inactiveEnded);
                    });
                    setCompletedCommittees(done.map((c) => ({ id: c.id, name: c.name })));
                  } catch {
                    setCompletedCommittees([]);
                  }
                } catch {
                  setSelectedUser({ fullName: item.requestUserName, email: item.requestEmail });
                }
                setModalVisible(true);
              }}
            >
              <Text style={styles.detailBtnText}>View Full Profile</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text>No pending initiator requests</Text>}
      />

      {historyRequests.length > 0 && (
        <>
          <Text style={[styles.title, { marginTop: 20 }]}>Request History</Text>
          <FlatList
            data={historyRequests}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View style={styles.avatar}>
                      {userMeta[item.userId]?.avatar && isValidImageUrl(userMeta[item.userId].avatar) ? (
                        <Image source={{ uri: userMeta[item.userId].avatar }} style={styles.avatarImage} />
                      ) : (
                        <Ionicons name="person" size={24} color={colors.textSecondary} />
                      )}
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.name}>{userMeta[item.userId]?.name || item.requestUserName || "No Name"}</Text>
                        <View style={styles.roleIcon}>
                          <Ionicons
                            name={(userMeta[item.userId]?.role || "user") === "initiator" ? "shield-checkmark" : "star"}
                            size={14}
                            color={(userMeta[item.userId]?.role || "user") === "initiator" ? "#10B981" : "#F59E0B"}
                          />
                        </View>
                      </View>
                      <Text style={styles.infoText}>{item.requestEmail || "—"}</Text>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: item.status?.toLowerCase() === 'approved' ? '#dcfce7' : '#fee2e2' }]}>
                    <Text style={[styles.statusText, { color: item.status?.toLowerCase() === 'approved' ? '#166534' : '#991b1b' }]}>{item.status || "UNKNOWN"}</Text>
                  </View>
                </View>
                <View style={{ height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 }} />
                <Text style={styles.infoText}>Request ID: <Text style={{ color: '#0f172a', fontWeight: '600' }}>{item.trackingNumber ?? "—"}</Text></Text>
                <Text style={styles.infoText}>Requested: <Text style={{ color: '#0f172a', fontWeight: '600' }}>{formatDateTime(item.createdAt)}</Text></Text>
                {item.updatedAt && (
                  <Text style={styles.infoText}>Updated: <Text style={{ color: '#0f172a', fontWeight: '600' }}>{formatDateTime(item.updatedAt)}</Text></Text>
                )}
                <TouchableOpacity
                  style={[styles.button, styles.detailBtn]}
                  onPress={async () => {
                    setSelectedRequest(item);
                    try {
                      const user = await fetchDecryptedUser(item.userId);
                      setSelectedUser(user || { fullName: item.requestUserName, email: item.requestEmail });
                    } catch {
                      setSelectedUser({ fullName: item.requestUserName, email: item.requestEmail });
                    }
                    setModalVisible(true);
                  }}
                >
                  <Text style={styles.detailBtnText}>View Full Profile</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </>
      )}

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBg}>
          <ScrollView style={styles.modalCard} contentContainerStyle={{ paddingBottom: 10 }}>
            <Text style={styles.modalTitle}>User Details</Text>
            <Text>Name: {selectedUser?.fullName || selectedUser?.name || "—"}</Text>
            <Text>Email: {selectedUser?.email || "—"}</Text>
            <Text>Phone: {selectedUser?.contactNumber || selectedUser?.phone || selectedUser?.contact || selectedUser?.mobile || "—"}</Text>
            <Text>Father Name: {selectedUser?.fatherName || "—"}</Text>
            <Text>Address: {selectedUser?.address || "—"}</Text>
            <Text>City: {selectedUser?.city || "—"}</Text>
            <Text>Age: {selectedUser?.age || "—"}</Text>
            <Text>Gender: {selectedUser?.gender || "—"}</Text>
            <Text>Occupation: {selectedUser?.occupation || "—"}</Text>
            <Text style={{ fontWeight: "700", marginTop: 8 }}>My CNIC: {selectedUser?.cnicNumber || "—"}</Text>

            {/* ── CNIC Verification Status ── */}
            {(selectedUser?.cnicVerificationStatus || selectedUser?.cnic_status) && (() => {
              const vs = selectedUser.cnicVerificationStatus || selectedUser.cnic_status || {};
              const status = vs.status || vs;
              const confidence = vs.confidence ?? null;
              const issues = Array.isArray(vs.issues) ? vs.issues : [];
              const statusColor = status === "VALID" ? "#10B981" : status === "SUSPICIOUS" ? "#F59E0B" : "#EF4444";
              const statusBg = status === "VALID" ? "#ECFDF5" : status === "SUSPICIOUS" ? "#FFFBEB" : "#FEF2F2";
              const statusEmoji = status === "VALID" ? "✅" : status === "SUSPICIOUS" ? "⚠️" : "❌";
              return (
                <View style={{ marginTop: 10, padding: 12, backgroundColor: statusBg, borderRadius: 10, borderWidth: 1, borderColor: statusColor + "40" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ fontWeight: "800", color: statusColor, fontSize: 15 }}>{statusEmoji} CNIC {status}</Text>
                    {confidence !== null && (
                      <View style={{ backgroundColor: statusColor, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 }}>
                        <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Confidence: {confidence}%</Text>
                      </View>
                    )}
                  </View>
                  {vs.name && <Text style={{ color: "#374151", marginTop: 4, fontSize: 13 }}>Name: {vs.name}</Text>}
                  {vs.cnic_number && <Text style={{ color: "#374151", fontSize: 13 }}>CNIC#: {vs.cnic_number}</Text>}
                  {vs.date_of_birth && <Text style={{ color: "#374151", fontSize: 13 }}>DOB: {vs.date_of_birth}</Text>}
                  {vs.ocr_quality && <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 2 }}>OCR Quality: {vs.ocr_quality}</Text>}
                  {issues.length > 0 && (
                    <View style={{ marginTop: 6 }}>
                      <Text style={{ color: statusColor, fontWeight: "700", fontSize: 12 }}>Issues:</Text>
                      {issues.map((issue, i) => (
                        <Text key={i} style={{ color: "#6B7280", fontSize: 12 }}>• {issue}</Text>
                      ))}
                    </View>
                  )}
                </View>
              );
            })()}

            {selectedUser?.profilePicture && isValidImageUrl(selectedUser.profilePicture) ? (
              <Image source={{ uri: selectedUser.profilePicture }} style={styles.docImg} resizeMode="cover" />
            ) : null}
            {selectedUser?.cnic && isValidImageUrl(selectedUser.cnic) ? (
              <Image source={{ uri: selectedUser.cnic }} style={styles.docImg} resizeMode="cover" />
            ) : null}

            <Text style={{ fontWeight: "700", marginTop: 12, borderTopWidth: 1, borderColor: '#eee', paddingTop: 8 }}>Reference Information</Text>
            <Text>Reference Name: {selectedUser?.pendingReferenceName || selectedUser?.referenceName || "—"}</Text>
            <Text>Reference Address: {selectedUser?.pendingReferenceAddress || selectedUser?.referenceAddress || "—"}</Text>
            <Text>Reference Contact: {selectedUser?.pendingReferenceContact || selectedUser?.referenceContact || "—"}</Text>
            <Text style={{ fontWeight: "700", marginTop: 4 }}>Reference CNIC: {selectedUser?.pendingReferenceCnicNumber || selectedUser?.referenceCnicNumber || "—"}</Text>


            {selectedUser?.referenceCnic && isValidImageUrl(selectedUser.referenceCnic) ? (
              <Image source={{ uri: selectedUser.referenceCnic }} style={styles.docImg} resizeMode="cover" />
            ) : null}
            {selectedUser?.bankStatement && isValidImageUrl(selectedUser.bankStatement) ? (
              (() => {
                const uri = String(selectedUser.bankStatement);
                if (uri.startsWith("file://")) {
                  return (
                    <TouchableOpacity
                      style={{ marginTop: 8, padding: 10, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8 }}
                      onPress={() => Alert.alert("Preview Unavailable", "Ask the user to re-upload the bank statement so it can be previewed.")}
                    >
                      <Text>Preview Bank Statement (local file)</Text>
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity
                    style={{ marginTop: 8, padding: 10, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8 }}
                    onPress={async () => {
                      try { await WebBrowser.openBrowserAsync(uri); } catch { Alert.alert("Preview Error", "Unable to preview PDF."); }
                    }}
                  >
                    <Text>Preview Bank Statement (PDF)</Text>
                  </TouchableOpacity>
                );
              })()
            ) : null}
            {completedCommittees.length > 0 && (
              <>
                <Text style={[styles.modalTitle, {marginTop: 16}]}>Completed Committees</Text>
                {completedCommittees.map((c) => (
                  <Text key={c.id}>• {c.name || c.id}</Text>
                ))}
              </>
            )}
            <Text style={[styles.modalTitle, {marginTop: 16}]}>Request Details</Text>
            <Text>Request ID: {selectedRequest?.trackingNumber ?? "—"}</Text>
            <Text>Status: {selectedRequest?.status || "—"}</Text>
            {selectedRequest?.createdAt ? (
              <Text>Requested At: {formatDateTime(selectedRequest.createdAt)}</Text>
            ) : null}
            {selectedRequest?.updatedAt ? (
              <Text>Updated At: {formatDateTime(selectedRequest.updatedAt)}</Text>
            ) : null}
            
            <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16, textAlign: "center" }}>Close</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 16,
    color: "#1e293b",
    letterSpacing: 0.5
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
  name: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4
  },
  infoText: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 2
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    marginTop: 8,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: 'uppercase',
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
  detailBtn: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginTop: 12,
  },
  btnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600"
  },
  detailBtnText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "600"
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: 48, height: 48, borderRadius: 14 },
  roleIcon: { marginLeft: 8 },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    maxHeight: "90%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 16,
    color: "#0f172a"
  },
  closeBtn: {
    marginTop: 24,
    backgroundColor: "#0f172a",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  docImg: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0"
  }
});
