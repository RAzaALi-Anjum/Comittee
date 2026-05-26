/**
 * UserHistoryScreen.jsx
 * ─────────────────────────────────────────────────────────────────────────
 * UPGRADED: Full Payment History with Screenshot Proof
 *
 * - Fetches from GET /api/payment/history?userId= (authenticated backend)
 * - Shows: committee, amount, date, method, status badge
 * - Tap "View Receipt" → loads screenshot via GET /api/payment/screenshot/:id
 *   and displays as full-screen modal image
 * - Real data only — no dummy data fallback for logged-in users
 * - Pull-to-refresh, filter by status
 * ─────────────────────────────────────────────────────────────────────────
 */
import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Modal,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import apiClient from "../../services/apiClient";
import { useTheme } from "../../theme/ThemeProvider";

const STATUS_CONFIG = {
    paid:     { label: "PAID",     bg: "#dcfce7", text: "#166534", icon: "check-circle" },
    approved: { label: "APPROVED", bg: "#dcfce7", text: "#166534", icon: "check-circle" },
    verified: { label: "VERIFIED", bg: "#dbeafe", text: "#1e40af", icon: "shield-alt"   },
    pending:  { label: "PENDING",  bg: "#fef3c7", text: "#92400e", icon: "clock"        },
    rejected: { label: "REJECTED", bg: "#fee2e2", text: "#991b1b", icon: "times-circle" },
};
const statusCfg = (s) =>
    STATUS_CONFIG[String(s || "").toLowerCase()] || STATUS_CONFIG.pending;

const METHOD_ICONS = {
    "Card":        "credit-card",
    "Wallet":      "wallet",
    "Easypaisa":   "mobile-alt",
    "JazzCash":    "mobile-alt",
    "screenshot":  "image",
    "Bank Transfer": "university",
};

export default function UserHistoryScreen({ route }) {
    const { colors } = useTheme();

    const [userId,      setUserId]      = useState(route?.params?.userId || null);
    const [history,     setHistory]     = useState([]);
    const [filtered,    setFiltered]    = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [refreshing,  setRefreshing]  = useState(false);
    const [filter,      setFilter]      = useState("All");
    const [totalPaid,   setTotalPaid]   = useState(0);

    // Screenshot modal state
    const [screenshotModal,    setScreenshotModal]    = useState(false);
    const [screenshotBase64,   setScreenshotBase64]   = useState(null);
    const [screenshotLoading,  setScreenshotLoading]  = useState(false);
    const [screenshotPayId,    setScreenshotPayId]    = useState(null);

    // Load userId from storage if not passed via route
    useEffect(() => {
        if (userId) return;
        AsyncStorage.getItem("userData").then((raw) => {
            if (raw) {
                const u = JSON.parse(raw);
                setUserId(u.userId || u.uid);
            }
        });
    }, []);

    const fetchHistory = useCallback(async (uid) => {
        const targetId = uid || userId;
        if (!targetId) return;
        try {
            // Use secure backend endpoint
            const res = await apiClient.backendGet(`/payment/history?userId=${targetId}`);
            if (!res?.success) throw new Error(res?.error || "Failed");

            const payments = (res.payments || [])
                .filter(p => p.userId === targetId)
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            setHistory(payments);

            // Compute total paid
            const paid = payments
                .filter(p => ["paid", "approved", "verified"].includes(String(p.status || "").toLowerCase()))
                .reduce((sum, p) => sum + Number(p.amount || 0), 0);
            setTotalPaid(paid);
        } catch (err) {
            console.error("[UserHistory] Fetch error:", err);
            // Leave empty — show empty state rather than dummy data
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [userId]);

    useEffect(() => {
        if (userId) fetchHistory(userId);
    }, [userId, fetchHistory]);

    // Apply filter
    useEffect(() => {
        if (filter === "All") {
            setFiltered(history);
        } else {
            setFiltered(history.filter(p =>
                String(p.status || "").toLowerCase() === filter.toLowerCase()
            ));
        }
    }, [filter, history]);

    const onRefresh = () => { setRefreshing(true); fetchHistory(); };

    // ── Load screenshot from backend ──────────────────────────
    const loadScreenshot = async (paymentId) => {
        setScreenshotPayId(paymentId);
        setScreenshotBase64(null);
        setScreenshotModal(true);
        setScreenshotLoading(true);
        try {
            const res = await apiClient.backendGet(`/payment/screenshot/${paymentId}`);
            if (res?.success && res.screenshot) {
                setScreenshotBase64(res.screenshot);
            } else {
                Alert.alert("No Receipt", "No screenshot was uploaded for this payment.");
                setScreenshotModal(false);
            }
        } catch (err) {
            Alert.alert("Error", "Could not load payment receipt.");
            setScreenshotModal(false);
        } finally {
            setScreenshotLoading(false);
        }
    };

    // ── Render payment card ───────────────────────────────────
    const renderItem = ({ item }) => {
        const sc  = statusCfg(item.status);
        const methodIcon = METHOD_ICONS[item.method] || "money-bill-wave";
        const hasScreenshot = item.hasScreenshot !== false && item.method === "screenshot";

        return (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {/* Header: committee + status */}
                <View style={styles.cardHeader}>
                    <View style={styles.leftHeader}>
                        <View style={[styles.iconBox, { backgroundColor: colors.brand + "18" }]}>
                            <FontAwesome5 name={methodIcon} size={16} color={colors.brand} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={[styles.committeeName, { color: colors.text }]} numberOfLines={1}>
                                {item.committeeName || "Committee Payment"}
                            </Text>
                            <Text style={[styles.methodText, { color: colors.textSecondary }]}>
                                {item.method || "N/A"}
                            </Text>
                        </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                        <FontAwesome5 name={sc.icon} size={10} color={sc.text} style={{ marginRight: 4 }} />
                        <Text style={[styles.statusText, { color: sc.text }]}>{sc.label}</Text>
                    </View>
                </View>

                {/* Amount + Date */}
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.infoRow}>
                    <View style={styles.infoItem}>
                        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Amount</Text>
                        <Text style={[styles.infoValue, { color: colors.brand }]}>
                            PKR {Number(item.amount || 0).toLocaleString()}
                        </Text>
                    </View>
                    <View style={styles.infoItem}>
                        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Date</Text>
                        <Text style={[styles.infoValue, { color: colors.text }]}>
                            {item.date ? new Date(item.date).toLocaleDateString() : "N/A"}
                        </Text>
                    </View>
                    <View style={styles.infoItem}>
                        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>ID</Text>
                        <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={1}>
                            {String(item.paymentId || "").slice(-8)}
                        </Text>
                    </View>
                </View>

                {/* View Receipt button */}
                {hasScreenshot && (
                    <TouchableOpacity
                        style={[styles.receiptBtn, { borderColor: colors.brand + "66" }]}
                        onPress={() => loadScreenshot(item.paymentId)}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="image-outline" size={14} color={colors.brand} />
                        <Text style={[styles.receiptBtnText, { color: colors.brand }]}>View Payment Receipt</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    if (loading) {
        return (
            <View style={[styles.center, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.brand} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>

            {/* ── Summary header ──────────────────────────── */}
            <View style={[styles.summaryBar, { backgroundColor: colors.brand }]}>
                <View style={styles.summaryItem}>
                    <Text style={styles.summaryValue}>{history.length}</Text>
                    <Text style={styles.summaryLabel}>Total Payments</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                    <Text style={styles.summaryValue}>
                        PKR {totalPaid.toLocaleString()}
                    </Text>
                    <Text style={styles.summaryLabel}>Total Paid</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                    <Text style={styles.summaryValue}>
                        {history.filter(p => String(p.status || "").toLowerCase() === "pending").length}
                    </Text>
                    <Text style={styles.summaryLabel}>Pending</Text>
                </View>
            </View>

            {/* ── Filter tabs ─────────────────────────────── */}
            <View style={styles.filterRow}>
                {["All", "paid", "approved", "pending", "rejected"].map((f) => (
                    <TouchableOpacity
                        key={f}
                        onPress={() => setFilter(f)}
                        style={[
                            styles.filterChip,
                            filter === f && { backgroundColor: colors.brand, borderColor: colors.brand },
                        ]}
                    >
                        <Text style={[
                            styles.filterText, { color: colors.brand },
                            filter === f && { color: "#fff" },
                        ]}>
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* ── Payments list ────────────────────────────── */}
            <FlatList
                data={filtered}
                keyExtractor={(item) => item.paymentId}
                renderItem={renderItem}
                contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.brand]} />
                }
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <FontAwesome5 name="receipt" size={48} color="#CBD5E1" />
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                            {filter === "All"
                                ? "No payment records found."
                                : `No ${filter} payments.`}
                        </Text>
                    </View>
                }
            />

            {/* ── Screenshot / Receipt Modal ───────────────── */}
            <Modal
                visible={screenshotModal}
                transparent
                animationType="slide"
                onRequestClose={() => setScreenshotModal(false)}
            >
                <View style={styles.modalBg}>
                    <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>Payment Receipt</Text>
                            <TouchableOpacity onPress={() => setScreenshotModal(false)}>
                                <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        {screenshotLoading ? (
                            <View style={{ paddingVertical: 60 }}>
                                <ActivityIndicator size="large" color={colors.brand} />
                                <Text style={{ textAlign: "center", marginTop: 12, color: colors.textSecondary }}>
                                    Loading receipt...
                                </Text>
                            </View>
                        ) : screenshotBase64 ? (
                            <>
                                <Image
                                    source={{ uri: `data:image/jpeg;base64,${screenshotBase64}` }}
                                    style={styles.screenshotImage}
                                    resizeMode="contain"
                                />
                                <Text style={[styles.payIdText, { color: colors.textSecondary }]}>
                                    Payment ID: {screenshotPayId}
                                </Text>
                            </>
                        ) : (
                            <View style={{ paddingVertical: 40, alignItems: "center" }}>
                                <Ionicons name="image-outline" size={48} color="#CBD5E1" />
                                <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
                                    No receipt available
                                </Text>
                            </View>
                        )}

                        <TouchableOpacity
                            style={[styles.closeBtn, { backgroundColor: colors.brand }]}
                            onPress={() => setScreenshotModal(false)}
                        >
                            <Text style={styles.closeBtnText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center:    { flex: 1, justifyContent: "center", alignItems: "center" },

    summaryBar: {
        flexDirection: "row", paddingVertical: 16, paddingHorizontal: 20,
        justifyContent: "space-around",
    },
    summaryItem:    { alignItems: "center" },
    summaryValue:   { color: "#fff", fontSize: 18, fontWeight: "800" },
    summaryLabel:   { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 2 },
    summaryDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.3)" },

    filterRow: {
        flexDirection: "row", paddingHorizontal: 12, paddingVertical: 12, gap: 8,
        flexWrap: "wrap",
    },
    filterChip: {
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
        borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#fff",
    },
    filterText: { fontSize: 12, fontWeight: "700" },

    card: {
        borderRadius: 16, padding: 14, marginBottom: 14,
        borderWidth: 1, elevation: 2,
        shadowColor: "#000", shadowOpacity: 0.07, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6,
    },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    leftHeader: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 8 },
    iconBox:    { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center" },
    committeeName: { fontSize: 14, fontWeight: "700" },
    methodText:    { fontSize: 12, marginTop: 2 },
    statusBadge:   { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    statusText:    { fontSize: 10, fontWeight: "800" },

    divider: { height: 1, marginBottom: 10 },
    infoRow: { flexDirection: "row", justifyContent: "space-between" },
    infoItem: { flex: 1, alignItems: "center" },
    infoLabel: { fontSize: 10, fontWeight: "600", marginBottom: 2 },
    infoValue: { fontSize: 13, fontWeight: "800" },

    receiptBtn: {
        marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center",
        paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, gap: 6,
    },
    receiptBtnText: { fontSize: 13, fontWeight: "700" },

    empty:     { alignItems: "center", paddingTop: 60, gap: 14 },
    emptyText: { fontSize: 15, fontWeight: "600", textAlign: "center" },

    // Screenshot modal
    modalBg: {
        flex: 1, backgroundColor: "rgba(0,0,0,0.7)",
        justifyContent: "flex-end",
    },
    modalCard: {
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: 20, maxHeight: "90%",
    },
    modalHeader: {
        flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14,
    },
    modalTitle: { fontSize: 18, fontWeight: "800" },
    screenshotImage: {
        width: "100%", height: 360, borderRadius: 12, marginBottom: 12,
    },
    payIdText: { fontSize: 11, textAlign: "center", marginBottom: 16 },
    closeBtn: {
        height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center",
    },
    closeBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
