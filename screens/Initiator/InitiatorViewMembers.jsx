import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

export default function InitiatorViewMembers({ navigation }) {
  const { colors } = useTheme();
  const [members, setMembers] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("All"); // All, Paid, Unpaid

  const FIREBASE_URL = "https://com1-e2378-default-rtdb.firebaseio.com/committees.json";

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const res = await fetch(FIREBASE_URL);
      const data = await res.json();
      if (!data) return;

      const allMembers = [];
      Object.keys(data).forEach((key) => {
        const committee = data[key];
        if (committee.usersParticipated) {
          committee.usersParticipated.forEach((user) => {
            if (user) {
              allMembers.push({
                ...user,
                committeeName: committee.name,
                committeeId: key,
              });
            }
          });
        }
      });
      setMembers(allMembers);
    } catch (err) {
      console.error(err);
    }
  };

  const getFilteredMembers = () => {
    return members.filter((m) => {
      const query = searchText.toLowerCase();
      const nameMatch = m.name ? m.name.toLowerCase().includes(query) : false;

      const paymentStatus = m.paymentStatus ? m.paymentStatus.toLowerCase() : "unpaid";
      const statusMatch =
        statusFilter === "All" ||
        (statusFilter === "Paid" && paymentStatus === "paid") ||
        (statusFilter === "Unpaid" && paymentStatus === "unpaid");

      return nameMatch && statusMatch;
    });
  };

  const filteredData = getFilteredMembers();

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.brand }]}>All Committee Members</Text>

      {/* Search and Filter */}
      <View style={styles.filterContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#666" style={{ marginRight: 10 }} />
          <TextInput
            style={styles.input}
            placeholder="Search Member Name"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>

        <View style={styles.statusRow}>
          {["All", "Paid", "Unpaid"].map((status) => (
            <TouchableOpacity
              key={status}
              style={[
                styles.statusBtn,
                statusFilter === status && [styles.statusBtnActive, { backgroundColor: colors.brand, borderColor: colors.brand }],
              ]}
              onPress={() => setStatusFilter(status)}
            >
              <Text
                style={[
                  styles.statusBtnText,
                  { color: colors.brand },
                  statusFilter === status && styles.statusBtnTextActive,
                ]}
              >
                {status}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={filteredData}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item, index }) => (
          <View style={[styles.card, { borderLeftColor: colors.brand }]}>
            <Text style={styles.idText}>ID: {index + 1}</Text>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.email}>{item.email}</Text>
            <Text style={styles.committee}>Committee: {item.committeeName}</Text>
            <Text style={[
              styles.status,
              { color: (item.paymentStatus || "Unpaid").toLowerCase() === "paid" ? "green" : "red" }
            ]}>
              Status: {item.paymentStatus || "Unpaid"}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={{ textAlign: "center", marginTop: 20 }}>No members found.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 15 },
  filterContainer: { marginBottom: 15 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  input: { flex: 1, paddingVertical: 10 },
  statusRow: { flexDirection: "row" },
  statusBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#800000",
    marginRight: 10,
  },
  statusBtnActive: { backgroundColor: "#800000" },
  statusBtnText: { fontSize: 12 },
  statusBtnTextActive: { color: "#fff" },
  card: {
    padding: 15,
    backgroundColor: "#f9f9f9",
    borderRadius: 10,
    marginBottom: 10,
    borderLeftWidth: 5,
    borderLeftColor: "#800000",
    elevation: 2,
  },
  idText: { fontSize: 12, color: "#555", marginBottom: 4 },
  name: { fontSize: 16, fontWeight: "bold" },
  email: { color: "#555", marginBottom: 5 },
  committee: { fontStyle: "italic", color: "#666", marginBottom: 5 },
  status: { fontWeight: "bold" },
});
