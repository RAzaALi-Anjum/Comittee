import React, { useEffect, useState } from "react";
import {
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import userService from "../../services/userService";

export default function ViewApprovedCommittees({ navigation }) {
  const [committees, setCommittees] = useState({});


  // Fetch approved AND active committees only
  const fetchApprovedCommittees = async () => {
    try {
      const data = await userService.getAllCommittees();
      if (!data) {
        setCommittees({});
        return;
      }

      // Filter only committees that are approved AND active
      const filtered = Object.fromEntries(
        Object.entries(data).filter(
          ([key, val]) => val.status === "Active" && val.active === true
        )
      );

      // Initialize usersParticipated array if not present
      const initialized = Object.fromEntries(
        Object.entries(filtered).map(([key, val]) => {
          if (!val.usersParticipated) {
            val.usersParticipated = Array(val.members).fill(null);
          }
          return [key, val];
        })
      );

      setCommittees(initialized);
    } catch (err) {
      console.log("Fetch Error:", err);
    }
  };

  useEffect(() => {
    fetchApprovedCommittees();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Approved & Active Committees</Text>

      <FlatList
        data={Object.keys(committees)}
        keyExtractor={(item) => item}
        renderItem={({ item }) => {
          const c = committees[item];
          return (
            <View style={styles.card}>
              <Text style={styles.title}>{c.name}</Text>
              <Text>Total Amount: {c.totalAmount}</Text>
              <Text>Members: {c.members}</Text>
              <Text>Cycle Duration: {c.cycleDuration} Days</Text>
              <Text>Duration (Months): {c.durationMonths}</Text>
              <Text>Cycles: {c.numberOfCycles}</Text>
              <Text>Contribution per Cycle: {c.contributionPerCycle}</Text>
              <Text>Start Date: {c.startDate}</Text>
              <Text>End Date: {c.endDate}</Text>
              {c.activationDate && <Text>Activated On: {c.activationDate}</Text>}
              <Text>Status: {c.status}</Text>
              <Text>Active: {c.active ? "Yes" : "No"}</Text>

              {/* View Committee Details button only if committee is active */}
              {c.active && (
                <TouchableOpacity
                  style={styles.viewBtn}
                  onPress={() =>
                    navigation.navigate("CommitteeDetails", { committee: c })
                  }
                >
                  <Text style={styles.viewTxt}>View Committee Details</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>No approved & active committees yet.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#ebf4ff" },
  heading: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  viewBtn: {
    marginTop: 10,
    padding: 10,
    backgroundColor: "#0277BD",
    borderRadius: 8,
  },
  viewTxt: { color: "#fff", textAlign: "center", fontWeight: "bold" },
  empty: { textAlign: "center", marginTop: 30, fontSize: 16, opacity: 0.5 },
});
