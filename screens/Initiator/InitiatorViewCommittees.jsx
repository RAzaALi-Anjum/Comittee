// screens/Initiator/InitiatorViewAllCommittees.js

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";

export default function InitiatorViewAllCommittees({ navigation }) {
  const { colors } = useTheme();

  const [committees, setCommittees] = useState({});
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  const [minMembers, setMinMembers] = useState("");
  const [maxMembers, setMaxMembers] = useState("");

  const FIREBASE_URL =
    "https://com1-e2378-default-rtdb.firebaseio.com/committees.json";

  const fetchCommittees = async () => {
    try {
      const res = await fetch(FIREBASE_URL);
      const data = await res.json();

      if (!data) {
        setCommittees({});
        return;
      }

      const initialized = Object.fromEntries(
        Object.entries(data).map(([key, val]) => {
          if (!val.usersParticipated) {
            val.usersParticipated = new Array(val.members).fill(null);
          }
          return [key, val];
        })
      );

      setCommittees(initialized);

      // Post-fetch: ensure turns are generated after 2 minutes of start
      const entries = Object.entries(initialized);
      const now = Date.now();
      for (const [id, c] of entries) {
        const started = String(c.status || "").toLowerCase() === "started" || c.active === true;
        const actTs = typeof c.activationTs === "number" ? c.activationTs : Date.parse(c.activationDate);
        const revealDue = started && !Number.isNaN(actTs) && (now - actTs >= 2 * 60 * 1000);
        const hasTurns = Array.isArray(c.turns) && c.turns.length > 0;
        if (revealDue && !hasTurns) {
          let users = [];
          if (Array.isArray(c.usersParticipated)) users = c.usersParticipated.filter(u => u);
          else if (typeof c.usersParticipated === "object") users = Object.values(c.usersParticipated).filter(u => u);
          if (users.length > 0) {
            // Shuffle users randomly
            for (let i = users.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [users[i], users[j]] = [users[j], users[i]];
            }
            const activation = new Date(isNaN(actTs) ? Date.now() : actTs);
            const cycleDays = parseInt(c?.cycleDuration) || 30;
            const turns = users.map((u, i) => {
              const d = new Date(activation);
              d.setDate(activation.getDate() + i * cycleDays);
              return {
                index: i + 1,
                turnDate: d.toISOString().split("T")[0],
                id: u.id || u.userId || u.uid || null,
                name: u.name || u.fullName || "",
                email: u.email || "",
                memberId: u.memberId || String(i + 1),
              };
            });
            try {
              await userService.updateCommitteeTurns(id, turns);
            } catch (e) {
              console.log("Turn generation error:", e?.message || e);
            }
          }
        }
      }
    } catch (err) {
      console.log("Fetch Error:", err);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchCommittees();
    }, [])
  );

  const activateCommittee = async (id, committeeData) => {
    if (String(committeeData.status || "").toLowerCase() !== "approved") {
      Alert.alert("Not Allowed", "Admin has not approved this committee yet.");
      return;
    }

    try {
      const totalMembers = parseInt(committeeData.members || 0);

      let membersJoined = 0;

      if (Array.isArray(committeeData.usersParticipated)) {
        membersJoined = committeeData.usersParticipated.filter((u) => u).length;
      }

      if (membersJoined < totalMembers) {
        Alert.alert(
          "Not Allowed",
          `Waiting for members ${membersJoined}/${totalMembers}`
        );
        return;
      }

      const url = `https://com1-e2378-default-rtdb.firebaseio.com/committees/${id}.json`;

      const activationDate = new Date();
      const endDate = new Date(activationDate);

      endDate.setDate(
        endDate.getDate() +
        committeeData.numberOfCycles * committeeData.cycleDuration
      );

      await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active: true,
          status: "Started",
          activationDate: activationDate.toISOString().split("T")[0],
          activationTs: Date.now(),
          endDate: endDate.toISOString().split("T")[0],
          endTs: endDate.getTime(),
        }),
      });

      Alert.alert("Activated", "Committee Started Successfully");

      fetchCommittees();
    } catch (err) {
      console.log("Activation Error:", err);
    }
  };

  const viewCommitteeDetails = (committeeId) => {
    const c = committees[committeeId];

    navigation.navigate("CommitteeDetails", {
      committee: { id: committeeId, ...c },
    });
  };

  // 🔹 Corrected Search Logic
  const getFilteredCommittees = () => {
    return Object.keys(committees).filter((key) => {
      const c = committees[key];

      const query = searchText.trim().toLowerCase();

      const name = c.name ? c.name.toLowerCase() : "";
      const amount = parseFloat(c.totalAmount) || 0;
      const members = parseInt(c.members) || 0;

      let searchMatch = true;

      if (query !== "") {
        if (!isNaN(query)) {
          // If the query is a number, match exact amount
          searchMatch = amount === parseFloat(query);
        } else {
          // Else, search by name
          searchMatch = name.includes(query);
        }
      }

      const minA = minAmount ? parseFloat(minAmount) : null;
      const maxA = maxAmount ? parseFloat(maxAmount) : null;
      const amountMatchRange =
        (!minA || amount >= minA) && (!maxA || amount <= maxA);

      const minM = minMembers ? parseInt(minMembers) : null;
      const maxM = maxMembers ? parseInt(maxMembers) : null;
      const membersMatchRange =
        (!minM || members >= minM) && (!maxM || members <= maxM);

      let statusMatch = true;
      if (statusFilter !== "All") {
        if (statusFilter === "Active") statusMatch = c.active === true;
        else statusMatch = c.status === statusFilter;
      }

      return searchMatch && amountMatchRange && membersMatchRange && statusMatch;
    });
  };

  const filteredKeys = getFilteredCommittees();

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by Name or Exact Amount"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>

        <View style={styles.filterRow}>
          {["All", "Active", "Rejected"].map((st) => (
            <TouchableOpacity
              key={st}
              style={[
                styles.filterBtn,
                statusFilter === st && styles.filterBtnActive,
              ]}
              onPress={() => setStatusFilter(st)}
            >
              <Text
                style={[
                  styles.filterText,
                  statusFilter === st && styles.filterTextActive,
                ]}
              >
                {st}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.rangeRow}>
          <TextInput
            style={styles.filterInput}
            placeholder="Min Amount"
            keyboardType="numeric"
            value={minAmount}
            onChangeText={setMinAmount}
          />
          <TextInput
            style={styles.filterInput}
            placeholder="Max Amount"
            keyboardType="numeric"
            value={maxAmount}
            onChangeText={setMaxAmount}
          />
          <TextInput
            style={styles.filterInput}
            placeholder="Min Members"
            keyboardType="numeric"
            value={minMembers}
            onChangeText={setMinMembers}
          />
          <TextInput
            style={styles.filterInput}
            placeholder="Max Members"
            keyboardType="numeric"
            value={maxMembers}
            onChangeText={setMaxMembers}
          />
        </View>
      </View>

      <FlatList
        data={filteredKeys}
        keyExtractor={(item) => item}
        renderItem={({ item }) => {
          const c = committees[item];

          return (
            <View style={styles.card}>
              <Text style={styles.title}>{c.name}</Text>
              <Text>Total Amount: {c.totalAmount}</Text>
              <Text>Members: {c.members}</Text>
              <Text>Status: {c.status}</Text>

              <TouchableOpacity
                style={styles.activateBtn}
                onPress={() => activateCommittee(item, c)}
              >
                <Text style={styles.btnText}>Start Committee</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.viewBtn}
                onPress={() => viewCommitteeDetails(item)}
              >
                <Text style={styles.btnText}>View Details</Text>
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>No committees found</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#ebf4ff" },
  searchContainer: { marginBottom: 15 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 45,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  searchInput: { flex: 1, marginLeft: 10 },
  filterRow: { flexDirection: "row", marginTop: 10 },
  filterBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#800000",
    marginRight: 8,
  },
  filterBtnActive: { backgroundColor: "#800000" },
  filterText: { fontSize: 12 },
  filterTextActive: { color: "#fff" },
  rangeRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 10 },
  filterInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: "#fff",
    width: "48%",
  },
  card: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    elevation: 3,
  },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  activateBtn: {
    backgroundColor: "#4CAF50",
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  viewBtn: {
    backgroundColor: "#0277BD",
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  btnText: { color: "#fff", textAlign: "center", fontWeight: "bold" },
  empty: { textAlign: "center", marginTop: 30, fontSize: 16, opacity: 0.5 },
});
