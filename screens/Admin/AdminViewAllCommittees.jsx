import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

export default function AdminViewAllCommittees({ navigation }) {
  const { colors } = useTheme();
  const [committees, setCommittees] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchContribution, setSearchContribution] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const FIREBASE_URL =
    "https://com1-e2378-default-rtdb.firebaseio.com/committees.json";

  // Fetch all committees (Active, Approved, Rejected, etc.)
  const fetchAllCommittees = async () => {
    try {
      setLoading(true);
      const res = await fetch(FIREBASE_URL);
      const data = await res.json();
      if (!data) {
        setCommittees({});
        setLoading(false);
        return;
      }

      // Keep all data, let the UI filter handle visibility
      setCommittees(data);
    } catch (err) {
      console.log("Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchAllCommittees();
    }, [])
  );

  // Navigate to committee details
  const viewCommitteeDetails = (committee) => {
    navigation.navigate("AdminViewCommitteeDetails", { committee });
  };

  const getFilteredCommittees = () => {
    return Object.keys(committees).filter((key) => {
      const c = committees[key];

      // 1. Search by Contribution Amount
      const contributionMatch = searchContribution
        ? String(c.totalAmount).includes(searchContribution) ||
        String(c.contributionPerCycle).includes(searchContribution)
        : true;

      // 2. Filter by Status (paid/unpaid or others)
      // Matching strict status or if status contains the filter string (case-insensitive)
      let statusMatch = false;
      if (statusFilter === "All") {
        statusMatch = true;
      } else if (statusFilter === "Active") {
        statusMatch = c.active === true;
      } else {
        statusMatch = c.status && c.status.toLowerCase() === statusFilter.toLowerCase();
      }

      return contributionMatch && statusMatch;
    });
  };

  const filteredKeys = getFilteredCommittees();

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.heading, { color: colors.brand }]}>Committee Management</Text>

      <View style={styles.searchSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={20} color="#94a3b8" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by Contribution Amount"
            placeholderTextColor="#94a3b8"
            keyboardType="numeric"
            value={searchContribution}
            onChangeText={setSearchContribution}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {["All", "Active", "Approved", "Rejected", "Pending"].map((st) => (
            <TouchableOpacity
              activeOpacity={0.7}
              key={st}
              style={[
                styles.filterBtn,
                statusFilter === st && [styles.filterBtnActive, { backgroundColor: colors.brand, borderColor: colors.brand }],
              ]}
              onPress={() => setStatusFilter(st)}
            >
              <Text style={[styles.filterText, { color: colors.brand }, statusFilter === st && { color: '#fff' }]}>{st}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filteredKeys}
        keyExtractor={(item) => item}
        renderItem={({ item }) => {
          const c = committees[item];
          const statusColors = {
            'approved': { bg: '#dcfce7', text: '#166534' },
            'pending': { bg: '#fef3c7', text: '#92400e' },
            'rejected': { bg: '#fee2e2', text: '#991b1b' },
            'active': { bg: '#e0f2fe', text: '#0369a1' },
          };
          const badge = statusColors[String(c.status || "").toLowerCase()] || { bg: '#f1f5f9', text: '#475569' };

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{c.name}</Text>
                <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.statusText, { color: badge.text }]}>{c.status?.toUpperCase() || 'NEW'}</Text>
                </View>
              </View>

              <View style={styles.infoGrid}>
                <View style={styles.infoItem}>
                  <Text style={styles.label}>Total Value</Text>
                  <Text style={styles.value}>PKR {parseInt(c.totalAmount).toLocaleString()}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.label}>Contribution</Text>
                  <Text style={[styles.value, { color: colors.brand }]}>PKR {parseInt(c.contributionPerCycle).toLocaleString()}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.detailRow}>
                <View style={styles.detailItem}>
                  <Ionicons name="people-outline" size={14} color="#64748b" />
                  <Text style={styles.detailText}>{c.members} Members</Text>
                </View>
                <View style={styles.detailItem}>
                  <Ionicons name="time-outline" size={14} color="#64748b" />
                  <Text style={styles.detailText}>{c.durationMonths} Months</Text>
                </View>
                <View style={styles.detailItem}>
                  <Ionicons name="calendar-outline" size={14} color="#64748b" />
                  <Text style={styles.detailText}>{c.numberOfCycles} Cycles</Text>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.viewBtn, { backgroundColor: colors.brand }]}
                onPress={() => viewCommitteeDetails(c)}
              >
                <Text style={styles.viewTxt}>View Committee Details</Text>
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="grid-outline" size={48} color="#cbd5e1" />
            <Text style={styles.empty}>No matching committees found.</Text>
          </View>
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  heading: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 20,
    marginBottom: 20,
    textAlign: "center",
    letterSpacing: 0.5
  },
  searchSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 16,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 13, color: '#0f172a' },
  filterRow: { gap: 10, paddingRight: 16 },
  filterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff'
  },
  filterBtnActive: {
    borderColor: 'transparent',
    elevation: 2,
    shadowOpacity: 0.1
  },
  filterText: { fontSize: 13, fontWeight: '700' },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardTitle: { fontSize: 18, fontWeight: "800", color: "#0f172a", flex: 1, marginRight: 12 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: { fontSize: 10, fontWeight: "800" },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  infoItem: { flex: 1 },
  label: { fontSize: 11, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 },
  value: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  divider: { height: 1, backgroundColor: '#f1f5f9', marginBottom: 12 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { fontSize: 12, color: '#475569', fontWeight: '500' },
  viewBtn: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  viewTxt: { color: "#fff", fontSize: 14, fontWeight: "800", textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 12 },
  empty: { fontSize: 16, color: "#64748b", fontWeight: '500' },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
});
