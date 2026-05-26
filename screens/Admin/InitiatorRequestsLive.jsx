import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { onValue, ref, update as rtdbUpdate } from "firebase/database";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { Alert, Animated, FlatList, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { database, db } from "../../firebaseConfig";
import apiClient from "../../services/apiClient";
import { useTheme } from "../../theme/ThemeProvider";
import { sendNotification } from "../../utils/notificationHelper";

// Fetch decrypted user profile from backend, fallback to raw Firebase
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
  // Fallback: direct Firebase (will show encrypted data)
  try {
    const res = await fetch(`https://com1-e2378-default-rtdb.firebaseio.com/users/${userId}.json`);
    return await res.json();
  } catch { return null; }
}


const isValidImageUrl = (uri) => {
  if (!uri || typeof uri !== "string") return false;
  return uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("data:image/");
};

export default function InitiatorRequestsLive() {
  const { colors } = useTheme();
  const [requests, setRequests] = useState([]);
  const [rtRequests, setRtRequests] = useState([]);
  const [fsRequests, setFsRequests] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [completedCommittees, setCompletedCommittees] = useState([]);
  const prevIdsRef = useRef(new Set());
  const [bannerVisible, setBannerVisible] = useState(false);
  const [bannerText, setBannerText] = useState("");
  const fadeAnim = useRef(new Animated.Value(0)).current;

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
    const r = ref(database, "initiatorRequests");
    const unsub = onValue(r, async (snap) => {
      const data = snap.val() || {};
      const base = Object.entries(data).map(([id, val]) => ({ id, ...val }));
      base.sort((a, b) => {
        const ta = new Date(a.createdAt || 0).getTime();
        const tb = new Date(b.createdAt || 0).getTime();
        return tb - ta;
      });

      const withUsers = await Promise.all(
        base.map(async (req) => {
          try {
            const user = await fetchDecryptedUser(req.userId);
            return { ...req, user: user || null };
          } catch {
            return { ...req, user: null };
          }
        })
      );

      const currentIds = new Set(withUsers.map((r) => r.id));
      let newCount = 0;
      withUsers.forEach((r) => {
        if (!prevIdsRef.current.has(r.id)) newCount += 1;
      });
      prevIdsRef.current = currentIds;
      if (newCount > 0) {
        setBannerText(`${newCount} new request${newCount > 1 ? "s" : ""} received`);
        setBannerVisible(true);
        fadeAnim.setValue(0);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }).start(() => {
          setTimeout(() => {
            Animated.timing(fadeAnim, {
              toValue: 0,
              duration: 250,
              useNativeDriver: true,
            }).start(() => {
              setBannerVisible(false);
            });
          }, 2000);
        });
      }

      setRequests(withUsers);
    });

    return () => unsub();
  }, []);

  const approveRequest = async (req) => {
    try {
      const nowIso = new Date().toISOString();
      await rtdbUpdate(ref(database, `initiatorRequests/${req.id}`), {
        status: "approved",
        updatedAt: nowIso,
        approvedAt: nowIso,
        approvedAtTs: Date.now(),
      });
      await updateDoc(doc(db, "initiatorRequests", req.id), {
        status: "approved",
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "users", req.userId), {
        initiatorStatus: "approved",
        role: "initiator",
        initiatorLevel: 1,
      });
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
      await rtdbUpdate(ref(database, `initiatorRequests/${req.id}`), {
        status: "rejected",
        updatedAt: nowIso,
        rejectedAt: nowIso,
        rejectedAtTs: Date.now(),
      });
      await updateDoc(doc(db, "initiatorRequests", req.id), {
        status: "rejected",
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "users", req.userId), {
        initiatorStatus: "none",
        role: "user",
        initiatorLevel: 0,
      });
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

  return (
    <View style={styles.container}>
      {bannerVisible && (
        <Animated.View style={[styles.banner, { opacity: fadeAnim, backgroundColor: colors.brand }]}>
          <Text style={styles.bannerText}>{bannerText}</Text>
        </Animated.View>
      )}
      <Text style={styles.title}>Initiator Requests</Text>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                {!item.user?.profilePicture || !isValidImageUrl(item.user.profilePicture) ? (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: colors.border }]}>
                    <Ionicons name="person" size={20} color={colors.textSecondary} />
                  </View>
                ) : (
                  <View style={styles.avatarWrap}>
                    <Image source={{ uri: item.user.profilePicture }} style={styles.avatarImage} />
                  </View>
                )}
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={styles.infoText}>Request ID: <Text style={{ color: '#0f172a', fontWeight: '600' }}>{item.trackingNumber ?? "—"}</Text></Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.name}>{item.user?.fullName || item.user?.name || item.requestUserName || "No Name"}</Text>
                    <View style={styles.roleIcon}>
                      <Ionicons
                        name={(item.user?.role || "user") === "initiator" ? "shield-checkmark" : "star"}
                        size={14}
                        color={(item.user?.role || "user") === "initiator" ? "#10B981" : "#F59E0B"}
                      />
                    </View>
                  </View>
                </View>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: item.status?.toLowerCase() === 'approved' ? '#dcfce7' : (item.status?.toLowerCase() === 'rejected' ? '#fee2e2' : '#fef3c7') }]}>
                <Text style={[styles.statusText, { color: item.status?.toLowerCase() === 'approved' ? '#166534' : (item.status?.toLowerCase() === 'rejected' ? '#991b1b' : '#92400e') }]}>{item.status || "PENDING"}</Text>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 }} />

            <Text style={styles.infoText}>Email: <Text style={{ color: '#0f172a', fontWeight: '500' }}>{item.user?.email || item.requestEmail || "—"}</Text></Text>
            <Text style={styles.infoText}>Requested At: <Text style={{ color: '#0f172a', fontWeight: '500' }}>{formatDateTime(item.createdAt)}</Text></Text>

            <View style={styles.row}>
              <TouchableOpacity
                style={styles.detailBtn}
                onPress={async () => {
                  setSelectedRequest(item);
                  try {
                    const user = await fetchDecryptedUser(item.userId);
                    setSelectedUser(
                      user || {
                        fullName: item.requestUserName,
                        email: item.requestEmail,
                      }
                    );
                  } catch {
                    setSelectedUser({
                      fullName: item.requestUserName,
                      email: item.requestEmail,
                    });
                  }
                  try {
                    const committees = await userService.getAllCommittees();
                    const list = Array.isArray(committees)
                      ? committees
                      : Object.keys(committees || {}).map((k) => ({ id: k, ...committees[k] }));
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
                  setModalVisible(true);
                }}
              >
                <Text style={[styles.btnText, { color: "#64748b" }]}>View Details</Text>
              </TouchableOpacity>
              {item.status !== 'approved' && item.status !== 'rejected' && (
                <>
                  <TouchableOpacity
                    style={styles.approveBtn}
                    onPress={() => approveRequest(item)}
                  >
                    <Text style={[styles.btnText, { color: "#166534" }]}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectBtn}
                    onPress={() => rejectRequest(item)}
                  >
                    <Text style={[styles.btnText, { color: "#991b1b" }]}>Reject</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={{ textAlign: "center" }}>No pending requests</Text>}
      />

      <Modal visible={modalVisible} transparent animationType="slide">
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
            <Text>Reference Name: {selectedUser?.referenceName || "—"}</Text>
            <Text>Reference Address: {selectedUser?.referenceAddress || "—"}</Text>
            <Text>Reference Contact: {selectedUser?.referenceContact || "—"}</Text>
            <Text style={{ fontWeight: "700", marginTop: 8 }}>CNIC Number: {selectedUser?.cnicNumber || "—"}</Text>
            {selectedUser?.profilePicture && isValidImageUrl(selectedUser.profilePicture) ? (
              <Image
                source={{ uri: selectedUser.profilePicture }}
                style={styles.docImg}
                resizeMode="cover"
              />
            ) : null}
            {selectedUser?.cnic && isValidImageUrl(selectedUser.cnic) ? (
              <Image
                source={{ uri: selectedUser.cnic }}
                style={styles.docImg}
                resizeMode="cover"
              />
            ) : null}
            {selectedUser?.bankStatement ? (
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
                      try {
                        await WebBrowser.openBrowserAsync(uri);
                      } catch {
                        Alert.alert("Preview Error", "Unable to preview PDF.");
                      }
                    }}
                  >
                    <Text>Preview Bank Statement (PDF)</Text>
                  </TouchableOpacity>
                );
              })()
            ) : null}
            {completedCommittees.length > 0 && (
              <>
                <Text style={[styles.modalTitle, { marginTop: 12 }]}>Completed Committees</Text>
                {completedCommittees.map((c) => (
                  <Text key={c.id}>• {c.name || c.id}</Text>
                ))}
              </>
            )}
            {selectedRequest?.createdAt ? (
              <Text style={{ marginTop: 8 }}>
                Requested At: {formatDateTime(selectedRequest.createdAt)}
              </Text>
            ) : null}
            {selectedRequest?.updatedAt ? (
              <Text>
                Updated At: {formatDateTime(selectedRequest.updatedAt)}
              </Text>
            ) : null}
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.brand }]} onPress={() => setModalVisible(false)}>
              <Text style={{ color: "#fff" }}>Close</Text>
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
  banner: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignSelf: "center",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  bannerText: { color: "#fff", fontWeight: "700", fontSize: 13 },
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
  row: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  detailBtn: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
  },
  approveBtn: {
    backgroundColor: "#dcfce7",
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
  },
  rejectBtn: {
    backgroundColor: "#fee2e2",
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
  },
  btnText: { fontSize: 13, fontWeight: "700" },
  modalBg: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 20,
    textAlign: 'center'
  },
  closeBtn: {
    marginTop: 20,
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
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: 'uppercase',
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
  avatarText: { fontSize: 18, fontWeight: "800", color: "#475569" },
  roleIcon: { marginLeft: 8 },
});
