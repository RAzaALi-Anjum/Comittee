import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import apiClient from "../../services/apiClient";
import { useTheme } from "../../theme/ThemeProvider";
import { useWalletReload } from "../../context/WalletContext";

export default function AdminPaymentVerificationScreen({ navigation }) {
  const { colors } = useTheme();
  const [committees, setCommittees] = useState([]);
  const [selectedCommittee, setSelectedCommittee] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const { triggerWalletReload } = useWalletReload();
  const [screenshotModal, setScreenshotModal] = useState(null);
  const [screenshotData, setScreenshotData] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectModal, setRejectModal] = useState(null);
  const [activeTab, setActiveTab] = useState("committee"); // 'committee' | 'initiator' | 'turnswap'

  // Load committees
  useEffect(() => {
    const loadCommittees = async () => {
      try {
        const data = await apiClient.get("committees");
        if (data) {
          const arr = Object.entries(data).map(([id, c]) => ({ id, ...c }));
          setCommittees(arr);
          if (arr.length > 0) setSelectedCommittee(arr[0].id);
        }
      } catch (err) {
        console.error("Load committees error:", err);
      }
    };
    loadCommittees();
  }, []);

  const fetchPending = useCallback(async () => {
    let isMounted = true;
    if (activeTab === "initiator") {
      try {
        const result = await apiClient.backendGet("/payment/initiator/pending");
        if (!isMounted) return () => {};
        if (result?.success) {
          setPayments(result.payments || []);
        }
      } catch (err) {
        console.error("Fetch pending initiator payments error:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
      return () => { isMounted = false; };
    }

    if (activeTab === "turnswap") {
      try {
        const result = await apiClient.backendGet("/turn/swap-requests?status=PENDING_ADMIN_VERIFICATION");
        if (!isMounted) return () => {};
        if (result?.success) {
          setPayments(result.requests || []);
        }
      } catch (err) {
        console.error("Fetch pending swap requests error:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
      return () => { isMounted = false; };
    }

    if (!selectedCommittee) {
      setLoading(false);
      return () => { isMounted = false; };
    }
    try {
      const result = await apiClient.backendGet(`/payment/pending/${selectedCommittee}`);
      if (!isMounted) return () => {};
      if (result?.success) {
        setPayments(result.payments || []);
      }
    } catch (err) {
      console.error("Fetch pending error:", err);
    } finally {
      if (isMounted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    return () => { isMounted = false; };
  }, [selectedCommittee, activeTab]);

  useEffect(() => {
    setLoading(true);
    let isMounted = true;
    const cleanup = fetchPending();
    return () => {
      isMounted = false;
      cleanup.then(fn => fn && fn()).catch(() => {});
    };
  }, [fetchPending, activeTab]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPending();
  };

  const viewScreenshot = async (p) => {
    try {
      setScreenshotModal(p.paymentId);
      setScreenshotData(null);
      if (p.proof_image) {
        setScreenshotData(p.proof_image);
      } else {
        const result = await apiClient.backendGet(`/payment/screenshot/${p.paymentId}`);
        if (result?.success) {
          setScreenshotData(result.screenshot);
        }
      }
    } catch (err) {
      Alert.alert("Error", "Failed to load screenshot.");
      setScreenshotModal(null);
    }
  };

  const handleApprove = async (paymentId) => {
    Alert.alert("Approve", "Are you sure you want to approve?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Approve",
        onPress: async () => {
          setActionLoading(paymentId);
          try {
            let result;
            if (activeTab === "turnswap") {
              result = await apiClient.backendPost("/turn/swap-admin-verify", {
                requestId: paymentId,
                action: "approve",
              });
            } else {
              const url = activeTab === "initiator" ? "/payment/initiator/verify" : "/payment/verify";
              result = await apiClient.backendPost(url, { paymentId, action: "approve" });
            }
            if (result?.success) {
              Alert.alert("Success",
                activeTab === "turnswap"
                  ? `Swap approved! Turns have been swapped and Rs ${result.newWalletBalance ? "" : ""}payment credited to admin wallet.`
                  : activeTab === "initiator"
                    ? "Payment approved successfully"
                    : "Payment approved. Wallet credited & members notified."
              );
              triggerWalletReload();
              fetchPending();
            }
          } catch (err) {
            Alert.alert("Error", err.message || "Approval failed.");
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setActionLoading(rejectModal);
    try {
      let result;
      if (activeTab === "turnswap") {
        result = await apiClient.backendPost("/turn/swap-admin-verify", {
          requestId: rejectModal,
          action: "reject",
        });
      } else {
        const url = activeTab === "initiator" ? "/payment/initiator/verify" : "/payment/verify";
        const body = { paymentId: rejectModal, action: "reject" };
        if (activeTab !== "initiator") body.rejectionReason = rejectionReason || undefined;
        result = await apiClient.backendPost(url, body);
      }
      if (result?.success) {
        Alert.alert("Rejected", "Request has been rejected.");
        setRejectModal(null);
        setRejectionReason("");
        fetchPending();
      }
    } catch (err) {
      Alert.alert("Error", err.message || "Rejection failed.");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.brand }]}>
        <View style={styles.heroBlobA} />
        <FontAwesome5 name="clipboard-check" size={26} color="rgba(255,255,255,0.9)" />
        <Text style={styles.headerTitle}>Payment Verification</Text>
        <Text style={styles.headerSub}>Review & approve member payments</Text>
      </View>

      {/* Tab Control */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "committee" && { borderBottomColor: colors.brand }]}
          onPress={() => setActiveTab("committee")}
        >
          <Text style={[styles.tabText, { color: activeTab === "committee" ? colors.brand : colors.textSecondary }]}>
            Committee
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "initiator" && { borderBottomColor: colors.brand }]}
          onPress={() => setActiveTab("initiator")}
        >
          <Text style={[styles.tabText, { color: activeTab === "initiator" ? colors.brand : colors.textSecondary }]}>
            Initiator
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "turnswap" && { borderBottomColor: colors.brand }]}
          onPress={() => setActiveTab("turnswap")}
        >
          <Text style={[styles.tabText, { color: activeTab === "turnswap" ? colors.brand : colors.textSecondary }]}>
            Turn Swaps ⇄
          </Text>
        </TouchableOpacity>
      </View>

      {/* Committee Filter */}
      {activeTab === "committee" && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {committees.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[
                styles.filterChip,
                {
                  backgroundColor: selectedCommittee === c.id ? colors.brand : colors.card,
                  borderColor: selectedCommittee === c.id ? colors.brand : colors.border,
                },
              ]}
              onPress={() => setSelectedCommittee(c.id)}
            >
              <Text style={[
                styles.filterText,
                { color: selectedCommittee === c.id ? "#fff" : colors.text },
              ]}>
                {c.name || c.committeeName || c.id}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Payments List */}
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.brand]} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {loading ? (
          <ActivityIndicator size="large" color={colors.brand} style={{ marginTop: 40 }} />
        ) : payments.length === 0 ? (
          <View style={styles.emptyWrap}>
            <FontAwesome5 name="check-double" size={40} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No pending payments
            </Text>
          </View>
        ) : (
          payments.map((p) => {
            if (activeTab === "turnswap") {
              // Turn Swap Card
              const swapId = p.id;
              return (
                <View key={swapId} style={[styles.payCard, { backgroundColor: colors.card, borderLeftWidth: 4, borderLeftColor: colors.brand }]}>
                  <View style={styles.payHeader}>
                    <View style={[styles.statusBadge, { backgroundColor: "#EDE9FE" }]}>
                      <Text style={[styles.statusText, { color: "#5B21B6" }]}>⇄ Turn Swap</Text>
                    </View>
                    <Text style={[styles.payAmount, { color: colors.text }]}>Rs {(p.amount || 500).toLocaleString()}</Text>
                  </View>
                  <View style={styles.payInfo}>
                    <View style={styles.payInfoRow}>
                      <FontAwesome5 name="exchange-alt" size={12} color={colors.textSecondary} />
                      <Text style={[styles.payInfoText, { color: colors.text }]}>Committee: {p.committeeId?.substring(0, 16)}...</Text>
                    </View>
                    <View style={styles.payInfoRow}>
                      <FontAwesome5 name="user" size={12} color={colors.textSecondary} />
                      <Text style={[styles.payInfoText, { color: colors.text }]}>From: {p.fromUserId?.substring(0, 14)}...</Text>
                    </View>
                    <View style={styles.payInfoRow}>
                      <FontAwesome5 name="user-friends" size={12} color={colors.textSecondary} />
                      <Text style={[styles.payInfoText, { color: colors.text }]}>To: {p.toUserId?.substring(0, 14)}...</Text>
                    </View>
                    <View style={styles.payInfoRow}>
                      <FontAwesome5 name="mobile-alt" size={12} color={colors.textSecondary} />
                      <Text style={[styles.payInfoText, { color: colors.text }]}>Method: {p.paymentMethod || "—"}</Text>
                    </View>
                    {p.reason ? (
                      <View style={styles.payInfoRow}>
                        <FontAwesome5 name="comment" size={12} color={colors.textSecondary} />
                        <Text style={[styles.payInfoText, { color: colors.text }]}>Reason: {p.reason}</Text>
                      </View>
                    ) : null}
                    <View style={styles.payInfoRow}>
                      <FontAwesome5 name="calendar" size={12} color={colors.textSecondary} />
                      <Text style={[styles.payInfoText, { color: colors.textSecondary }]}>
                        {p.paymentSubmittedAt ? new Date(p.paymentSubmittedAt).toLocaleString() : ""}
                      </Text>
                    </View>
                  </View>
                  {/* Proof Screenshot */}
                  {p.paymentScreenshot && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.brand + "15", marginBottom: 8 }]}
                      onPress={() => viewScreenshot({ paymentId: swapId, proof_image: p.paymentScreenshot })}
                    >
                      <Ionicons name="image-outline" size={16} color={colors.brand} />
                      <Text style={[styles.actionBtnText, { color: colors.brand }]}>View Payment Screenshot</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#10B981" + "15" }]}
                      onPress={() => handleApprove(swapId)}
                      disabled={actionLoading === swapId}
                    >
                      {actionLoading === swapId ? (
                        <ActivityIndicator size="small" color="#10B981" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                          <Text style={[styles.actionBtnText, { color: "#10B981" }]}>Approve & Swap</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#EF4444" + "15" }]}
                      onPress={() => { setRejectModal(swapId); setRejectionReason(""); }}
                      disabled={actionLoading === swapId}
                    >
                      <Ionicons name="close-circle" size={16} color="#EF4444" />
                      <Text style={[styles.actionBtnText, { color: "#EF4444" }]}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }
            if (activeTab === "initiator") {
              return (
                <View key={p.paymentId} style={[styles.payCard, { backgroundColor: colors.card }]}>
                  <View style={styles.payHeader}>
                    <View style={[styles.statusBadge, { backgroundColor: "#F59E0B" + "20" }]}>
                      <Text style={[styles.statusText, { color: "#F59E0B" }]}>Pending</Text>
                    </View>
                    <Text style={[styles.payAmount, { color: colors.text }]}>Rs {(p.amount || 0).toLocaleString()}</Text>
                  </View>

                  <View style={styles.payInfo}>
                    <View style={styles.payInfoRow}>
                      <FontAwesome5 name="user" size={12} color={colors.textSecondary} />
                      <Text style={[styles.payInfoText, { color: colors.text }]}>User: {p.userInfo?.name || "Unknown"}</Text>
                    </View>
                    <View style={styles.payInfoRow}>
                      <FontAwesome5 name="envelope" size={12} color={colors.textSecondary} />
                      <Text style={[styles.payInfoText, { color: colors.text }]}>Email: {p.userInfo?.email || "Unknown"}</Text>
                    </View>
                    {p.userInfo?.contactNumber ? (
                      <View style={styles.payInfoRow}>
                        <FontAwesome5 name="phone" size={12} color={colors.textSecondary} />
                        <Text style={[styles.payInfoText, { color: colors.text }]}>Phone: {p.userInfo.contactNumber}</Text>
                      </View>
                    ) : null}
                    <View style={styles.payInfoRow}>
                      <FontAwesome5 name="key" size={12} color={colors.textSecondary} />
                      <Text style={[styles.payInfoText, { color: colors.textSecondary }]}>User ID: {p.user_id}</Text>
                    </View>
                    <View style={styles.payInfoRow}>
                      <FontAwesome5 name="mobile-alt" size={12} color={colors.textSecondary} />
                      <Text style={[styles.payInfoText, { color: colors.text }]}>Method: {p.method || "Transfer"}</Text>
                    </View>
                    {p.transaction_id ? (
                      <View style={styles.payInfoRow}>
                        <FontAwesome5 name="hashtag" size={12} color={colors.textSecondary} />
                        <Text style={[styles.payInfoText, { color: colors.text }]}>Txn ID: {p.transaction_id}</Text>
                      </View>
                    ) : null}
                    <View style={styles.payInfoRow}>
                      <FontAwesome5 name="calendar" size={12} color={colors.textSecondary} />
                      <Text style={[styles.payInfoText, { color: colors.textSecondary }]}>
                        {p.created_at ? new Date(p.created_at).toLocaleString() : ""}
                      </Text>
                    </View>
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.actionRow}>
                    {!!p.proof_image && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: colors.brand + "15" }]}
                        onPress={() => viewScreenshot(p)}
                      >
                        <Ionicons name="image-outline" size={16} color={colors.brand} />
                        <Text style={[styles.actionBtnText, { color: colors.brand }]}>View Proof</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#10B981" + "15" }]}
                      onPress={() => handleApprove(p.paymentId)}
                      disabled={actionLoading === p.paymentId}
                    >
                      {actionLoading === p.paymentId ? (
                        <ActivityIndicator size="small" color="#10B981" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                          <Text style={[styles.actionBtnText, { color: "#10B981" }]}>Approve</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#EF4444" + "15" }]}
                      onPress={() => { setRejectModal(p.paymentId); setRejectionReason(""); }}
                      disabled={actionLoading === p.paymentId}
                    >
                      <Ionicons name="close-circle" size={16} color="#EF4444" />
                      <Text style={[styles.actionBtnText, { color: "#EF4444" }]}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }

            return (
              <View key={p.paymentId} style={[styles.payCard, { backgroundColor: colors.card }]}>
                <View style={styles.payHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: "#F59E0B" + "20" }]}>
                    <Text style={[styles.statusText, { color: "#F59E0B" }]}>Pending</Text>
                  </View>
                  <Text style={[styles.payAmount, { color: colors.text }]}>Rs {(p.amount || 0).toLocaleString()}</Text>
                </View>

                <View style={styles.payInfo}>
                  <View style={styles.payInfoRow}>
                    <FontAwesome5 name="user" size={12} color={colors.textSecondary} />
                    <Text style={[styles.payInfoText, { color: colors.text }]}>User: {p.userId?.substring(0, 15)}...</Text>
                  </View>
                  <View style={styles.payInfoRow}>
                    <FontAwesome5 name="mobile-alt" size={12} color={colors.textSecondary} />
                    <Text style={[styles.payInfoText, { color: colors.text }]}>Method: {p.method}</Text>
                  </View>
                  <View style={styles.payInfoRow}>
                    <FontAwesome5 name="calendar" size={12} color={colors.textSecondary} />
                    <Text style={[styles.payInfoText, { color: colors.textSecondary }]}>
                      {p.submittedAt ? new Date(p.submittedAt).toLocaleDateString() : p.date}
                    </Text>
                  </View>
                </View>

                {/* AI Analysis */}
                {p.analysisResult && (
                  <View style={[styles.analysisBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={[styles.analysisTitle, { color: colors.brand }]}>
                      <FontAwesome5 name="robot" size={12} /> AI Analysis
                    </Text>
                    {p.analysisResult.amount && (
                      <Text style={[styles.analysisItem, { color: colors.text }]}>
                        Amount Detected: Rs {p.analysisResult.amount}
                      </Text>
                    )}
                    {p.analysisResult.sender_name && (
                      <Text style={[styles.analysisItem, { color: colors.text }]}>
                        Sender: {p.analysisResult.sender_name}
                      </Text>
                    )}
                    {p.analysisResult.transaction_id && (
                      <Text style={[styles.analysisItem, { color: colors.text }]}>
                        Txn ID: {p.analysisResult.transaction_id}
                      </Text>
                    )}
                  </View>
                )}

                {/* Action Buttons */}
                <View style={styles.actionRow}>
                  {p.hasScreenshot && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.brand + "15" }]}
                      onPress={() => viewScreenshot(p)}
                    >
                      <Ionicons name="image-outline" size={16} color={colors.brand} />
                      <Text style={[styles.actionBtnText, { color: colors.brand }]}>View</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#10B981" + "15" }]}
                    onPress={() => handleApprove(p.paymentId)}
                    disabled={actionLoading === p.paymentId}
                  >
                    {actionLoading === p.paymentId ? (
                      <ActivityIndicator size="small" color="#10B981" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                        <Text style={[styles.actionBtnText, { color: "#10B981" }]}>Approve</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#EF4444" + "15" }]}
                    onPress={() => { setRejectModal(p.paymentId); setRejectionReason(""); }}
                    disabled={actionLoading === p.paymentId}
                  >
                    <Ionicons name="close-circle" size={16} color="#EF4444" />
                    <Text style={[styles.actionBtnText, { color: "#EF4444" }]}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Screenshot Modal */}
      <Modal visible={screenshotModal !== null} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Payment Screenshot</Text>
            {screenshotData ? (
              <Image
                source={{ uri: screenshotData.startsWith("http") ? screenshotData : `data:image/jpeg;base64,${screenshotData}` }}
                style={styles.screenshotFull}
                resizeMode="contain"
              />
            ) : (
              <ActivityIndicator size="large" color={colors.brand} style={{ marginVertical: 40 }} />
            )}
            <TouchableOpacity
              onPress={() => { setScreenshotModal(null); setScreenshotData(null); }}
              style={[styles.closeBtn, { backgroundColor: colors.brand }]}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Reject Modal */}
      <Modal visible={rejectModal !== null} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Reject Payment</Text>
            <Text style={[styles.rejectLabel, { color: colors.textSecondary }]}>Reason (optional):</Text>
            <TextInput
              style={[styles.rejectInput, { color: colors.text, borderColor: colors.border }]}
              placeholder="Enter rejection reason..."
              placeholderTextColor={colors.textSecondary + "80"}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline
            />
            <View style={styles.rejectBtnRow}>
              <TouchableOpacity
                onPress={() => { setRejectModal(null); setRejectionReason(""); }}
                style={[styles.rejectCancelBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.rejectCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleReject} style={[styles.rejectConfirmBtn, { backgroundColor: "#EF4444" }]}>
                <Text style={styles.rejectConfirmText}>Reject</Text>
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
  header: {
    paddingVertical: 28, alignItems: "center",
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
    overflow: "hidden", position: "relative",
  },
  heroBlobA: { position: "absolute", top: -20, right: -10, width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(255,255,255,0.1)" },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 8 },
  headerSub: { color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 2 },

  filterRow: { paddingHorizontal: 12, paddingVertical: 14, gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 13, fontWeight: "700" },

  emptyWrap: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyText: { fontSize: 16, fontWeight: "600" },

  payCard: {
    marginHorizontal: 16, marginBottom: 14, borderRadius: 18, padding: 16,
    elevation: 3, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8,
  },
  payHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: "700" },
  payAmount: { fontSize: 22, fontWeight: "900" },

  payInfo: { gap: 4, marginBottom: 10 },
  payInfoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  payInfoText: { fontSize: 13, fontWeight: "500" },

  analysisBox: { borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 10 },
  analysisTitle: { fontSize: 13, fontWeight: "700", marginBottom: 6 },
  analysisItem: { fontSize: 13, marginBottom: 2 },

  actionRow: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, borderRadius: 10 },
  actionBtnText: { fontSize: 13, fontWeight: "700" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { width: "95%", borderRadius: 20, padding: 20, maxHeight: "85%" },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 12, textAlign: "center" },
  screenshotFull: { width: "100%", height: 350, borderRadius: 12 },
  closeBtn: { marginTop: 14, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  closeBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  rejectLabel: { fontSize: 14, fontWeight: "600", marginBottom: 6 },
  rejectInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: "top" },
  rejectBtnRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  rejectCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  rejectCancelText: { fontSize: 14, fontWeight: "700" },
  rejectConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  rejectConfirmText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  tabContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
