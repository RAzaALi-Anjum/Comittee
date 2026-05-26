import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Location from "expo-location";
import { geohashForLocation } from "geofire-common";
import ThemedButton from "../../components/ui/ThemedButton";
import ThemedInput from "../../components/ui/ThemedInput";
import { sendNotification } from "../../utils/notificationHelper";

const FIREBASE_URL =
  "https://com1-e2378-default-rtdb.firebaseio.com/committees.json";

export default function CreateCommittee({ navigation }) {
  const [name, setName] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [members, setMembers] = useState("");
  const [minMembersToStart, setMinMembersToStart] = useState("");
  const [cycleDuration, setCycleDuration] = useState(15); // 15 or 30 days
  const [durationMonths, setDurationMonths] = useState(0); // auto calculated
  const [numberOfCycles, setNumberOfCycles] = useState(0);
  const [contributionPerCycle, setContributionPerCycle] = useState(0);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  // Update duration, cycles, contribution whenever members, amount, or cycle changes
  useEffect(() => {
    const numMembers = parseInt(members);
    const totalAmt = parseFloat(totalAmount);

    if (!numMembers || !totalAmt) return;

    // duration calculation based on cycle
    let months = 0;
    if (cycleDuration === 15) {
      months = Math.ceil(numMembers / 2); // 2 members per 15-day cycle
    } else if (cycleDuration === 30) {
      months = numMembers; // 1 member per 30-day cycle
    }

    const cyclesPerMonth = Math.floor(30 / cycleDuration);
    const totalCycles = months * cyclesPerMonth;
    const contribution = totalAmt / numMembers;

    setDurationMonths(months);
    setNumberOfCycles(totalCycles);
    setContributionPerCycle(parseFloat(contribution.toFixed(2)));

    // calculate end date
    const end = new Date(startDate);
    end.setDate(end.getDate() + totalCycles * cycleDuration);
    setEndDate(end.toISOString().split("T")[0]);
  }, [members, totalAmount, cycleDuration, startDate]);

  const onChangeDate = (event, selectedDate) => {
    setShowPicker(Platform.OS === "ios");
    if (selectedDate) setStartDate(selectedDate);
  };

  const createCommittee = async () => {
    if (!name || !totalAmount || !members) {
      Alert.alert("Error", "Please fill all fields");
      return;
    }
    const m = parseInt(members);
    const minM = parseInt(minMembersToStart || "0");
    if (minM && (minM < 1 || minM > m)) {
      Alert.alert("Error", "Minimum members to start must be between 1 and total members.");
      return;
    }

    try {
      let createdBy = null;
      try {
        const stored = await AsyncStorage.getItem("userData");
        if (stored) {
          const parsed = JSON.parse(stored);
          createdBy = parsed.userId || parsed.uid || null;
        }
      } catch (e) {}

      if (!createdBy) {
        Alert.alert("Error", "User information missing. Please sign in again.");
        return;
      }

      // ── Geohash (Upgrade 4) ──────────────────────────────────────
      let geoData = {};
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          geoData = { lat, lng, geohash: geohashForLocation([lat, lng]) };
        }
      } catch (geoErr) {
        console.warn("[CreateCommittee] Geolocation failed (non-blocking):", geoErr.message);
      }

      const resp = await fetch(FIREBASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          totalAmount: parseFloat(totalAmount),
          members: parseInt(members),
          minMembersToStart: minM || null,
          cycleDuration,
          durationMonths,
          numberOfCycles,
          contributionPerCycle,
          startDate: startDate.toISOString().split("T")[0],
          endDate,
          status: "Pending",
          active: false,
          createdAt: new Date().toISOString(),
          createdAtTs: Date.now(),
          createdBy,
          ...geoData,
        }),
      });
      let committeeId = "";
      try {
        const data = await resp.json();
        committeeId = data?.name || "";
      } catch {}

      // Notify all users (except creator) about the new committee
      try {
        const usersResp = await fetch("https://com1-e2378-default-rtdb.firebaseio.com/users.json");
        const usersObj = await usersResp.json();
        if (usersObj && typeof usersObj === "object") {
          for (const uid of Object.keys(usersObj)) {
            if (!uid || uid === createdBy) continue;
            const title = "New Committee Available";
            const msg = `A new committee "${name}" has been created. Check it out.`;
            // If committeeId exists, attach it as relatedId for deep-linking
            sendNotification(uid, title, msg, "info", committeeId || null);
          }
        }
      } catch {}
      Alert.alert("Success", "Committee created successfully!");
      setName("");
      setTotalAmount("");
      setMembers("");
      setMinMembersToStart("");
      setCycleDuration(15);
      setDurationMonths(0);
      setNumberOfCycles(0);
      setContributionPerCycle(0);
      setStartDate(new Date());
      setEndDate("");
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to create committee");
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
      
      <Text style={styles.label}>Committee Name</Text>
      <ThemedInput value={name} onChangeText={setName} placeholder="Enter committee name" />

      <Text style={styles.label}>Total Amount (max 10,00,000)</Text>
      <ThemedInput value={totalAmount} onChangeText={setTotalAmount} placeholder="Total amount" keyboardType="numeric" />

      <Text style={styles.label}>Number of Members (max 30)</Text>
      <ThemedInput value={members} onChangeText={setMembers} placeholder="Number of members" keyboardType="numeric" />

      <Text style={styles.label}>Minimum Members to Start (optional)</Text>
      <ThemedInput value={minMembersToStart} onChangeText={setMinMembersToStart} placeholder="e.g., 2" keyboardType="numeric" />

      <Text style={styles.label}>Cycle Duration</Text>
      <View style={styles.cycleButtons}>
        <ThemedButton
          label="15 Days"
          onPress={() => setCycleDuration(15)}
          style={{ flex: 1, marginRight: 8, backgroundColor: cycleDuration === 15 ? "#4CAF50" : "#ccc" }}
          textStyle={{ color: cycleDuration === 15 ? "#fff" : "#000" }}
        />
        <ThemedButton
          label="30 Days"
          onPress={() => setCycleDuration(30)}
          style={{ flex: 1, marginLeft: 8, backgroundColor: cycleDuration === 30 ? "#4CAF50" : "#ccc" }}
          textStyle={{ color: cycleDuration === 30 ? "#fff" : "#000" }}
        />
      </View>

      <Text style={styles.label}>Duration (months, auto)</Text>
      <ThemedInput value={durationMonths.toString()} editable={false} />

      <Text style={styles.label}>Start Date</Text>
      <TouchableOpacity
        onPress={() => setShowPicker(true)}
        style={styles.dateButton}
      >
        <Text>{startDate.toISOString().split("T")[0]}</Text>
      </TouchableOpacity>

      {showPicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          display="calendar"
          minimumDate={new Date()}
          onChange={onChangeDate}
        />
      )}

      <Text style={styles.label}>End Date (auto)</Text>
      <ThemedInput value={endDate} editable={false} />

      <Text style={styles.label}>Contribution per Cycle (auto)</Text>
      <ThemedInput value={contributionPerCycle.toString()} editable={false} />

      <ThemedButton label="Create Committee" onPress={createCommittee} />

      <View style={{ marginTop: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#e6f2ff" },
  contentContainer: { padding: 20 },
  heading: { fontSize: 24, fontWeight: "bold", marginBottom: 20, textAlign: "center" },
  label: { fontWeight: "bold", marginTop: 10 },
  cycleButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 5,
  },
  dateButton: {
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    backgroundColor: "#fff",
    marginVertical: 5,
  },
});
