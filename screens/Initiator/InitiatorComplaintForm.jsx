import React, { useState } from "react";
import { Alert, StyleSheet, Text, View, Platform, KeyboardAvoidingView, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ThemedButton from "../../components/ui/ThemedButton";
import ThemedInput from "../../components/ui/ThemedInput";

// Firebase URL as per your link
const FIREBASE_URL = "https://com1-e2378-default-rtdb.firebaseio.com/complaints.json";

export default function InitiatorComplaintForm({ navigation }) {
  const [initiatorId, setInitiatorId] = useState(""); // Initiator enters own ID
  const [userId, setUserId] = useState("");           // Initiator enters target user ID
  const [message, setMessage] = useState("");

  const handleSubmit = async () => {
    if (!initiatorId.trim() || !userId.trim() || !message.trim()) {
      Alert.alert("Error", "Please fill all fields.");
      return;
    }

    try {
      const response = await fetch(FIREBASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "initiator",
          fromId: initiatorId,
          to: "user",
          toId: userId,
          message,
          response: "",
          status: "pending",
          timestamp: Date.now(),
        }),
      });

      if (response.ok) {
        Alert.alert("Success", "Complaint submitted successfully.");
        setInitiatorId("");
        setUserId("");
        setMessage("");
        navigation.goBack();
      } else {
        Alert.alert("Error", "Failed to submit complaint.");
      }
    } catch (error) {
      console.log(error);
      Alert.alert("Error", "Something went wrong.");
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.kav}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
          <TouchableOpacity onPress={() => (navigation?.canGoBack?.() ? navigation.goBack() : navigation?.navigate?.("InitiatorDashboard"))} style={{ padding: 4, marginRight: 6 }}>
            <Ionicons name="arrow-back" size={22} color="#333" />
          </TouchableOpacity>
          <Text style={[styles.title, { marginBottom: 0 }]}>Back</Text>
        </View>
        <Text style={styles.title}>Complain about User</Text>
        <ThemedInput placeholder="Enter your Initiator ID" value={initiatorId} onChangeText={setInitiatorId} inputStyle={{ marginBottom: 15 }} />
        <ThemedInput placeholder="Enter Target User ID" value={userId} onChangeText={setUserId} inputStyle={{ marginBottom: 15 }} />
        <ThemedInput placeholder="Write your complaint here..." value={message} onChangeText={setMessage} multiline inputStyle={{ height: 120, textAlignVertical: 'top' }} />
        <ThemedButton label="Submit Complaint" onPress={handleSubmit} style={{ marginTop: 10 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  kav: { flex: 1 },
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 20 },
});
