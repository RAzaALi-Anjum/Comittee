/**
 * AdminPaymentHistoryScreen.jsx
 * ─────────────────────────────────────────────────────────────────────────
 * UPGRADED: Fetches from GET /api/wallet/admin-summary which filters
 * ONLY real/approved committees (not pending/draft/deleted).
 * Shows: Total Earnings, Wallet Balance, Per-Committee Breakdown, Recent Payments.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import apiClient from "../../services/apiClient";
import { useTheme } from "../../theme/ThemeProvider";
import { formatDate } from "../../utils/date";

const STATUS_COLORS = {
    approved: { bg: "#dcfce7", text: "#166534" },
    paid:     { bg: "#dcfce7", text: "#166534" },
    verified: { bg: "#dbeafe", text: "#1e40af" },
    pending:  { bg: "#fef3c7", text: "#92400e" },
    rejected: { bg: "#fee2e2", text: "#991b1b" },
};
const statusColor = (s) =>
    STATUS_COLORS[String(s || "").toLowerCase()] || STATUS_COLORS.pending;

export default function AdminPaymentHistoryScreen() {
    const { colors, language: appLang } = useTheme();
    const [summary, setSummary]           = useState(null);
    const [breakdown, setBreakdown]       = useState([]);
    const [recentPayments, setRecent]     = useState([]);
    const [filter, setFilter]             = useState("All");
    const [loading, setLoading]           = useState(true);
    const [refreshing, setRefreshing]     = useState(false);
    const [successModal, setSuccessModal] = useState(false);

    const loadData = useCallback(async () => {
        try {
            // Use the secure backend endpoint — filters real committees only
            const res = await apiClient.backendGet("/wallet/admin-summary");
            if (res?.success) {
                setSummary(res.summary);
                setBreakdown(res.committeeBreakdown || []);
                setRecent(res.recentPayments || []);
            } else {
                throw new Error(res?.error || "Failed to load");
            }
        } catch (e) {
            console.error("[AdminPaymentHistory]", e);
            Alert.alert("Error", "Could not load payment data. " + (e.message || ""));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);
    const onRefresh = () => { setRefreshing(true); loadData(); };

    const filteredPayments = filter === "All"
        ? recentPayments
        : recentPayments.filter(p =>
            String(p.status || "").toLowerCase() === filter.toLowerCase()
          );

    const renderPayment = ({ item }) => {
        const sc = statusColor(item.status);
        return (
            <View style={[styles.card, { borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                    <View style={styles.userBox}>
                        <View style={[styles.avatarBox, { backgroundColor: colors.brand + "18" }]}>
                            <Ionicons name="person-outline" size={18} color={colors.brand} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.userName} numberOfLines={1}>
                                {item.committeeName || "Committee Payment"}
                            </Text>
                            <Text style={[styles.committeeName, { color: colors.textSecondary }]} numberOfLines={1}>
                                {item.committeeId}
                            </Text>
                        </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                        <Text style={[styles.statusText, { color: sc.text }]}>
                            {String(item.status || "").toUpperCase()}
                        </Text>
                    </View>
                </View>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                <View style={styles.infoGrid}>
                    <View style={styles.infoRow}>
                        <View style={styles.infoLabelRow}>
                            <Ionicons name="cash-outline" size={14} color="#64748b" />
                            <Text style={styles.label}>Amount</Text>
                        </View>
                        <Text style={[styles.value, { color: colors.brand, fontSize: 16 }]}>
                            PKR {Number(item.amount || 0).toLocaleString()}
                        </Text>
                    </View>
                    <View style={styles.infoRow}>
                        <View style={styles.infoLabelRow}>
                            <Ionicons name="calendar-outline" size={14} color="#64748b" />
                            <Text style={styles.label}>Date</Text>
                        </View>
                        <Text style={styles.value}>{formatDate(item.date, appLang)}</Text>
                    </View>
                    <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                        <View style={styles.infoLabelRow}>
                            <Ionicons name="card-outline" size={14} color="#64748b" />
                            <Text style={styles.label}>Method</Text>
                        </View>
                        <Text style={styles.value}>{item.method || "N/A"}</Text>
                    </View>
                </View>
            </View>
        );
    };

    if (loading) {
        return (
            <View style={[styles.center, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.brand} />
                <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Loading admin wallet...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <StatusBar barStyle="dark-content" />
            <Text style={[styles.heading, { color: colors.brand }]}>Admin Wallet · Real Committees</Text>

            {/* ── Summary Cards ─────────────────────────────── */}
            <View style={styles.summarySection}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.summaryRow}>

                    <View style={styles.summaryCard}>
                        <View style={[styles.summaryIcon, { backgroundColor: "#dcfce7" }]}>
                            <Ionicons name="wallet" size={20} color="#166534" />
                        </View>
                        <Text style={styles.summaryNum}>
                            PKR {Number(summary?.totalEarnings || 0).toLocaleString()}
                        </Text>
                        <Text style={styles.summaryLabel}>Total Earnings</Text>
                    </View>

                    <View style={styles.summaryCard}>
                        <View style={[styles.summaryIcon, { backgroundColor: "#dbeafe" }]}>
                            <Ionicons name="cash" size={20} color="#1e40af" />
                        </View>
                        <Text style={styles.summaryNum}>
                            PKR {Number(summary?.totalWalletBalance || 0).toLocaleString()}
                        </Text>
                        <Text style={styles.summaryLabel}>Wallet Balance</Text>
                    </View>

                    <View style={styles.summaryCard}>
                        <View style={[styles.summaryIcon, { backgroundColor: "#fef3c7" }]}>
                            <Ionicons name="checkmark-done" size={20} color="#92400e" />
                        </View>
                        <Text style={styles.summaryNum}>{summary?.totalPaymentCount || 0}</Text>
                        <Text style={styles.summaryLabel}>Payments</Text>
                    </View>

                    <View style={styles.summaryCard}>
                        <View style={[styles.summaryIcon, { backgroundColor: "#ede9fe" }]}>
                            <Ionicons name="people" size={20} color="#5b21b6" />
                        </View>
                        <Text style={styles.summaryNum}>{summary?.realCommitteeCount || 0}</Text>
                        <Text style={styles.summaryLabel}>Active Committees</Text>
                    </View>
                </ScrollView>
            </View>

            {/* ── Per-Committee Breakdown ───────────────────── */}
            {breakdown.length > 0 && (
                <View style={{ marginBottom: 8 }}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>By Committee</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
                        {breakdown.map((item) => (
                            <View key={item.committeeId} style={styles.breakdownCard}>
                                <Text style={[styles.breakdownName, { color: colors.brand }]} numberOfLines={1}>
                                    {item.committeeName}
                                </Text>
                                <Text style={styles.breakdownAmount}>
                                    PKR {Number(item.totalAmount).toLocaleString()}
                                </Text>
                                <Text style={styles.breakdownCount}>{item.paymentCount} payments</Text>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* ── Filter Tabs ────────────────────────────────── */}
            <View style={styles.filterSection}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterRow}>
                    {["All", "approved", "paid", "pending", "rejected"].map((f) => (
                        <TouchableOpacity
                            key={f}
                            activeOpacity={0.7}
                            style={[
                                styles.filterChip,
                                filter === f && [styles.filterChipActive, { backgroundColor: colors.brand }],
                            ]}
                            onPress={() => setFilter(f)}
                        >
                            <Text style={[
                                styles.filterChipText, { color: colors.brand },
                                filter === f && { color: "#fff" },
                            ]}>
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* ── Recent Payments List ───────────────────────── */}
            <FlatList
                data={filteredPayments}
                keyExtractor={(item) => item.paymentId}
                renderItem={renderPayment}
                contentContainerStyle={styles.list}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.brand]} />}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons name="receipt-outline" size={48} color="#cbd5e1" />
                        <Text style={styles.emptyText}>No payments for real committees found.</Text>
                    </View>
                }
                showsVerticalScrollIndicator={true}
            />

            {/* ── Success Modal ──────────────────────────────── */}
            <Modal visible={successModal} transparent animationType="fade">
                <View style={styles.modalBg}>
                    <View style={styles.modalCard}>
                        <View style={[styles.tickCircle, { backgroundColor: colors.brand }]}>
                            <Ionicons name="checkmark" size={40} color="#fff" />
                        </View>
                        <Text style={[styles.modalTitle, { color: colors.brand }]}>Action Complete</Text>
                        <TouchableOpacity
                            activeOpacity={0.7}
                            style={[styles.modalButton, { backgroundColor: colors.brand }]}
                            onPress={() => setSuccessModal(false)}
                        >
                            <Text style={styles.modalButtonText}>Dismiss</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center:    { flex: 1, justifyContent: "center", alignItems: "center" },
    heading: {
        fontSize: 20, fontWeight: "800", marginTop: 20, marginBottom: 16,
        textAlign: "center", letterSpacing: 0.5,
    },
    sectionTitle: { fontSize: 14, fontWeight: "800", marginLeft: 16, marginBottom: 10 },

    summarySection: { marginBottom: 16 },
    summaryRow: { paddingHorizontal: 16, gap: 12 },
    summaryCard: {
        backgroundColor: "#fff", borderRadius: 20, padding: 16,
        alignItems: "flex-start", minWidth: 140, borderWidth: 1,
        borderColor: "#f1f5f9",
        shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
    },
    summaryIcon: {
        width: 36, height: 36, borderRadius: 10,
        justifyContent: "center", alignItems: "center", marginBottom: 10,
    },
    summaryNum:   { fontSize: 18, fontWeight: "800", color: "#0f172a" },
    summaryLabel: { fontSize: 10, color: "#64748b", fontWeight: "700", textTransform: "uppercase", marginTop: 4 },

    breakdownCard: {
        backgroundColor: "#f8fafc", borderRadius: 14, padding: 12,
        minWidth: 130, borderWidth: 1, borderColor: "#e2e8f0",
    },
    breakdownName:   { fontSize: 12, fontWeight: "700", marginBottom: 4 },
    breakdownAmount: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
    breakdownCount:  { fontSize: 10, color: "#64748b", marginTop: 2 },

    filterSection: { marginBottom: 14 },
    filterRow: { paddingHorizontal: 16, gap: 10 },
    filterChip: {
        paddingHorizontal: 16, paddingVertical: 9, borderRadius: 24,
        backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0",
    },
    filterChipActive: { elevation: 4, shadowOpacity: 0.2, borderColor: "transparent" },
    filterChipText: { fontSize: 13, fontWeight: "700" },

    list: { paddingHorizontal: 16, paddingBottom: 40 },
    card: {
        backgroundColor: "#fff", borderRadius: 20, padding: 16, marginBottom: 14,
        shadowColor: "#000", shadowOpacity: 0.07, shadowOffset: { width: 0, height: 4 },
        shadowRadius: 10, elevation: 3, borderWidth: 1,
    },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
    userBox:    { flexDirection: "row", alignItems: "center", flex: 1 },
    avatarBox:  { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center" },
    userName:   { fontSize: 15, fontWeight: "800", color: "#0f172a" },
    committeeName: { fontSize: 11, marginTop: 2, fontWeight: "500" },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    statusText:  { fontSize: 10, fontWeight: "800" },
    divider: { height: 1, marginBottom: 14 },
    infoGrid: { marginBottom: 4 },
    infoRow: {
        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
        paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#f1f5f9",
    },
    infoLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    label: { fontSize: 13, color: "#64748b", fontWeight: "500" },
    value: { fontSize: 14, fontWeight: "700", color: "#0f172a" },

    emptyContainer: { alignItems: "center", marginTop: 80, gap: 12 },
    emptyText: { textAlign: "center", color: "#64748b", fontSize: 15, fontWeight: "500" },

    modalBg: { flex: 1, backgroundColor: "rgba(15,23,42,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
    modalCard: { width: "100%", backgroundColor: "#fff", borderRadius: 24, padding: 24, alignItems: "center" },
    tickCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: "800", marginBottom: 8 },
    modalButton: { width: "100%", height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    modalButtonText: { color: "#fff", fontWeight: "800", fontSize: 15, textTransform: "uppercase", letterSpacing: 1 },
});
