import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs, getFirestore } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import app from "../../firebaseConfig";
import { useTheme } from "../../theme/ThemeProvider";

const db = getFirestore(app);

export default function MonitorLoanScreen() {
  const { colors } = useTheme();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLoans = async () => {
      try {
        const snap = await getDocs(collection(db, "loans"));
        setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Error fetching loans:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchLoans();
  }, []);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.heading, { color: colors.brand }]}>Loan Monitoring</Text>

      <FlatList
        data={loans}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const statusColors = {
            'Approved': { bg: '#dcfce7', text: '#166534' },
            'Pending': { bg: '#fef3c7', text: '#92400e' },
            'Rejected': { bg: '#fee2e2', text: '#991b1b' },
            'Recovered': { bg: '#e0f2fe', text: '#0369a1' },
          };
          const badge = statusColors[item.status] || { bg: '#f1f5f9', text: '#475569' };

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.userIconBox}>
                  <Ionicons name="person-outline" size={20} color={colors.brand} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.userIdText} numberOfLines={1}>User ID: {item.userId}</Text>
                  <Text style={styles.loanIdText}>Tracking: {item.trackingNumber || item.id.substring(0, 8)}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.statusText, { color: badge.text }]}>{item.status?.toUpperCase() || 'NEW'}</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.label}>Requested Amount</Text>
                <Text style={styles.value}>PKR {parseInt(item.amount || 0).toLocaleString()}</Text>
              </View>

              <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.label}>Application Type</Text>
                <Text style={styles.value}>Micro Loan</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="cash-outline" size={48} color="#cbd5e1" />
            <Text style={styles.empty}>No loan applications found.</Text>
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
    alignItems: 'center',
    marginBottom: 16,
  },
  userIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  userIdText: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  loanIdText: { fontSize: 11, color: '#64748b' },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: { fontSize: 10, fontWeight: "800" },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  label: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  value: { fontSize: 14, color: '#0f172a', fontWeight: '700' },
  emptyContainer: { alignItems: 'center', marginTop: 80, gap: 12 },
  empty: { fontSize: 15, color: "#64748b", fontWeight: '500' },
});
