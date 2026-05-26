import { Ionicons } from "@expo/vector-icons";
import { collection, doc, getDocs, getFirestore, query, updateDoc, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import app from "../../firebaseConfig";
import { useTheme } from "../../theme/ThemeProvider";

const db = getFirestore(app);

export default function RecoverLoanScreen() {
  const { colors } = useTheme();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUnpaidLoans = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, "loans"),
        where("status", "==", "Approved")
      );
      const snap = await getDocs(q);
      setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Error fetching unpaid loans:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnpaidLoans();
  }, []);

  const recoverLoan = async (loanId) => {
    try {
      await updateDoc(doc(db, "loans", loanId), {
        recoveredFromBonus: true,
        status: "Recovered",
      });
      Alert.alert("Success", "Loan recovered from bonus successfully");
      fetchUnpaidLoans(); // Refresh list
    } catch (e) {
      Alert.alert("Error", "Failed to recover loan");
    }
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
      <Text style={[styles.heading, { color: colors.brand }]}>Loan Recovery</Text>

      <FlatList
        data={loans}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.userIconBox, { backgroundColor: colors.brand + '10' }]}>
                <Ionicons name="wallet-outline" size={20} color={colors.brand} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.userIdText} numberOfLines={1}>User: {item.userId}</Text>
                <Text style={styles.loanIdText}>Tracking: {item.trackingNumber || item.id.substring(0, 8)}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: '#dcfce7' }]}>
                <Text style={[styles.statusText, { color: '#166534' }]}>APPROVED</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Pending Amount</Text>
              <Text style={[styles.value, { color: colors.brand }]}>PKR {parseInt(item.amount || 0).toLocaleString()}</Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.recoverBtn, { backgroundColor: colors.brand }]}
              onPress={() => recoverLoan(item.id)}
            >
              <Ionicons name="refresh-circle-outline" size={20} color="#fff" />
              <Text style={styles.recoverBtnText}>Recover from Bonus</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-done-circle-outline" size={48} color="#cbd5e1" />
            <Text style={styles.empty}>All loans are currently settled.</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
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
    paddingVertical: 12,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  label: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  value: { fontSize: 14, color: '#0f172a', fontWeight: '800' },
  recoverBtn: {
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  recoverBtnText: { color: "#fff", fontSize: 13, fontWeight: "800", textTransform: 'uppercase' },
  emptyContainer: { alignItems: 'center', marginTop: 80, gap: 12 },
  empty: { fontSize: 15, color: "#64748b", fontWeight: '500' },
});
