import { collection, doc, getFirestore, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import app from "../../firebaseConfig";
import { useTheme } from "../../theme/ThemeProvider";

const db = getFirestore(app);

export default function AdminLoanRequestsScreen({ navigation }) {
  const { colors } = useTheme();
  const [loans, setLoans] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "loans"), async (snapshot) => {
      const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      all.sort((a, b) => {
        const ta =
          a.appliedAt?.toMillis?.() ? a.appliedAt.toMillis() : new Date(a.appliedAt || 0).getTime();
        const tb =
          b.appliedAt?.toMillis?.() ? b.appliedAt.toMillis() : new Date(b.appliedAt || 0).getTime();
        return tb - ta;
      });
      setLoans(all);
      await Promise.all(
        all
          .filter((l) => !l.trackingNumber)
          .map(async (l) => {
            try {
              const ts =
                l.appliedAt?.toMillis?.() ? l.appliedAt.toMillis() : new Date(l.appliedAt).getTime();
              const trackingNumber = Number(String(ts || Date.now()).slice(-8));
              await updateDoc(doc(db, "loans", l.id), { trackingNumber });
            } catch { }
          })
      );
    });
    return () => unsub();
  }, []);

  const updateStatus = async (loanId, status) => {
    await updateDoc(doc(db, "loans", loanId), { status, updatedAt: serverTimestamp() });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={styles.title}>Loan Requests</Text>

      <FlatList
        data={loans.filter((l) => l.status === "Pending")}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.amount}>PKR {item.amount}</Text>
                <Text style={styles.infoText}>Request ID: {item.trackingNumber ?? "—"}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: '#fef3c7' }]}>
                <Text style={[styles.statusText, { color: '#92400e' }]}>{item.status || "PENDING"}</Text>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 }} />

            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.button, styles.approveBtn]}
                onPress={() => updateStatus(item.id, "Approved")}
              >
                <Text style={styles.btnText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.rejectBtn]}
                onPress={() => updateStatus(item.id, "Rejected")}
              >
                <Text style={styles.btnText}>Reject</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.button, styles.detailBtn]}
              onPress={() => navigation.navigate("LoanDetails", { loan: item })}
            >
              <Text style={styles.detailBtnText}>View Details</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <Text>No pending loan requests</Text>
        }
      />

      {loans.some((l) => l.status !== "Pending") && (
        <>
          <Text style={[styles.title, { marginTop: 20 }]}>Loan History</Text>
          <FlatList
            data={loans.filter((l) => l.status !== "Pending")}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.amount}>PKR {item.amount}</Text>
                    <Text style={styles.infoText}>Request ID: {item.trackingNumber ?? "—"}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: item.status?.toLowerCase() === 'approved' ? '#dcfce7' : '#fee2e2' }]}>
                    <Text style={[styles.statusText, { color: item.status?.toLowerCase() === 'approved' ? '#166534' : '#991b1b' }]}>{item.status || "UNKNOWN"}</Text>
                  </View>
                </View>

                <View style={{ height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 }} />

                <TouchableOpacity
                  style={[styles.button, styles.detailBtn]}
                  onPress={() => navigation.navigate("LoanDetails", { loan: item })}
                >
                  <Text style={styles.detailBtnText}>View Details</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </>
      )}
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
  amount: {
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
});
