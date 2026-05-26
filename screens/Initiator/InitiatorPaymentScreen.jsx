import { FontAwesome5 } from "@expo/vector-icons";
import { useState } from "react";
import {
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

export default function InitiatorPaymentScreen() {
  const { colors } = useTheme();
  // Dummy data inside file
  const dummyCommittees = [
    {
      id: "c1",
      name: "Health Committee",
      contributionPerCycle: 500,
      usersParticipated: [
        { id: "u1", name: "Ali Khan", email: "ali@example.com", paymentStatus: "Paid" },
        { id: "u2", name: "Sara Ahmed", email: "sara@example.com", paymentStatus: "Unpaid" },
      ],
    },
    {
      id: "c2",
      name: "Education Committee",
      contributionPerCycle: 300,
      usersParticipated: [
        { id: "u3", name: "Ahmed Raza", email: "ahmed@example.com", paymentStatus: "Paid" },
      ],
    },
  ];

  const dummyLoans = [
    { id: "l1", userName: "Ali Khan", committeeName: "Health Committee", amount: 1000, repaymentStatus: "Repaid", status: "Approved" },
    { id: "l2", userName: "Sara Ahmed", committeeName: "Health Committee", amount: 500, repaymentStatus: "Pending", status: "Pending" },
  ];

  const [committees, setCommittees] = useState(dummyCommittees);
  const [selectedCommittee, setSelectedCommittee] = useState(dummyCommittees[0] || null);
  const [members, setMembers] = useState((dummyCommittees[0] && dummyCommittees[0].usersParticipated) || []);
  const [loans, setLoans] = useState(dummyLoans);
  const [activeTab, setActiveTab] = useState("members");

  const handleSelectCommittee = (committee) => {
    setSelectedCommittee(committee);
    setMembers(committee.usersParticipated || []);
  };

  const paidCount = members.filter((m) => m.paymentStatus?.toLowerCase() === "paid").length;
  const unpaidCount = members.length - paidCount;
  const totalCollected = members
    .filter((m) => m.paymentStatus?.toLowerCase() === "paid")
    .reduce((acc) => acc + Number(selectedCommittee?.contributionPerCycle || 0), 0);

  const renderMember = ({ item }) => {
    const isPaid = item.paymentStatus?.toLowerCase() === "paid";
    return (
      <View style={styles.memberCard}>
        <View style={[styles.memberAvatarWrap, { backgroundColor: colors.brand }]}>
          <Text style={styles.memberAvatar}>{(item.name || "?")[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.memberName}>{item.name || "Unknown"}</Text>
          <Text style={styles.memberEmail}>{item.email || ""}</Text>
        </View>
        <View style={[styles.badge, isPaid ? styles.badgePaid : styles.badgeUnpaid]}>
          <Text style={[styles.badgeText, { color: isPaid ? "#2e7d32" : "#c62828" }]}>
            {isPaid ? "Paid" : "Unpaid"}
          </Text>
        </View>
      </View>
    );
  };

  const renderLoan = ({ item }) => {
    const isRepaid = item.repaymentStatus === "Repaid";
    return (
      <View style={styles.loanCard}>
        <View style={styles.loanRow}>
          <Text style={styles.loanName}>{item.userName}</Text>
          <View style={[styles.badge, isRepaid ? styles.badgePaid : styles.badgeUnpaid]}>
            <Text style={[styles.badgeText, { color: isRepaid ? "#2e7d32" : "#c62828" }]}>
              {item.repaymentStatus}
            </Text>
          </View>
        </View>
        <Text style={styles.loanDetail}>Committee: {item.committeeName}</Text>
        <Text style={styles.loanDetail}>
          Amount: <Text style={styles.bold}>PKR {item.amount.toLocaleString()}</Text>
        </Text>
        <Text style={styles.loanDetail}>
          Status:{" "}
          <Text
            style={{
              color: item.status === "Approved" ? "#2e7d32" : "#e65100",
              fontWeight: "700",
            }}
          >
            {item.status}
          </Text>
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.brand }]}>
        <Text style={styles.headerTitle}>Payment Tracker</Text>
        <Text style={styles.headerSub}>Select a committee to view payments</Text>
      </View>

      {/* Committee Selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.committeeScroll}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10 }}
      >
        {committees.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.committeeChip, selectedCommittee?.id === c.id && { backgroundColor: colors.brand }]}
            onPress={() => handleSelectCommittee(c)}
          >
            <Text style={[styles.committeeChipText, selectedCommittee?.id === c.id && styles.committeeChipTextActive]}>
              {c.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Summary Cards */}
      {selectedCommittee && (
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: "#e8f5e9" }]}>
            <FontAwesome5 name="check-circle" size={20} color="#2e7d32" />
            <Text style={styles.summaryNumber}>{paidCount}</Text>
            <Text style={styles.summaryLabel}>Paid</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: "#fdecea" }]}>
            <FontAwesome5 name="times-circle" size={20} color="#c62828" />
            <Text style={styles.summaryNumber}>{unpaidCount}</Text>
            <Text style={styles.summaryLabel}>Unpaid</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: "#e3f2fd" }]}>
            <FontAwesome5 name="coins" size={20} color="#1565c0" />
            <Text style={[styles.summaryNumber, { fontSize: 14 }]}>PKR {totalCollected.toLocaleString()}</Text>
            <Text style={styles.summaryLabel}>Collected</Text>
          </View>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "members" && [styles.tabActive, { borderBottomColor: colors.brand }]]}
          onPress={() => setActiveTab("members")}
        >
          <Text style={[styles.tabText, activeTab === "members" && { color: colors.brand }]}>
            Members ({members.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "loans" && [styles.tabActive, { borderBottomColor: colors.brand }]]}
          onPress={() => setActiveTab("loans")}
        >
          <Text style={[styles.tabText, activeTab === "loans" && { color: colors.brand }]}>
            Loans ({loans.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {activeTab === "members" ? (
        <FlatList
          data={members}
          keyExtractor={(_, i) => i.toString()}
          renderItem={renderMember}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No members in this committee.</Text>}
        />
      ) : (
        <FlatList
          data={loans}
          keyExtractor={(item) => item.id}
          renderItem={renderLoan}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No loan records found.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  header: { paddingVertical: 20, paddingHorizontal: 20 },
  headerTitle: { fontSize: 22, fontWeight: "bold", color: "#fff" },
  headerSub: { fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  committeeScroll: { maxHeight: 60, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eee" },
  committeeChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: "#f0f0f0", marginRight: 8, alignSelf: "center" },
  committeeChipActive: {},
  committeeChipText: { fontWeight: "600", color: "#555" },
  committeeChipTextActive: { color: "#fff" },
  summaryRow: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, gap: 10 },
  summaryCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: "center", gap: 4 },
  summaryNumber: { fontSize: 18, fontWeight: "800", color: "#222" },
  summaryLabel: { fontSize: 11, color: "#555", fontWeight: "600" },
  tabBar: { flexDirection: "row", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eee", marginTop: 8 },
  tab: { flex: 1, paddingVertical: 13, alignItems: "center" },
  tabActive: { borderBottomWidth: 3 },
  tabText: { fontSize: 14, color: "#888", fontWeight: "600" },
  tabTextActive: {},
  list: { padding: 16 },
  memberCard: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#000", shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 3 },
  memberAvatarWrap: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  memberAvatar: { color: "#fff", fontWeight: "800", fontSize: 16 },
  memberName: { fontSize: 14, fontWeight: "700", color: "#222" },
  memberEmail: { fontSize: 12, color: "#888" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgePaid: { backgroundColor: "#e8f5e9" },
  badgeUnpaid: { backgroundColor: "#fdecea" },
  badgeText: { fontSize: 11, fontWeight: "700" },
  loanCard: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 3 },
  loanRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  loanName: { fontSize: 15, fontWeight: "700", color: "#222" },
  loanDetail: { fontSize: 13, color: "#555", marginBottom: 4 },
  bold: { fontWeight: "700", color: "#222" },
  emptyText: { textAlign: "center", color: "#aaa", marginTop: 40, fontSize: 16 },
});
