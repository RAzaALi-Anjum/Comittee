import { useState } from "react";
import { Alert, StyleSheet, Text, View, Platform, KeyboardAvoidingView, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ThemedButton from "../../components/ui/ThemedButton";
import ThemedInput from "../../components/ui/ThemedInput";
import apiClient from "../../services/apiClient";
import { useTheme } from "../../theme/ThemeProvider";

const COMPLAINT_CATEGORIES = [
  { id: "payment", label: "💳 Payment Issue", color: "#F59E0B" },
  { id: "fraud", label: "🚨 Fraud / Scam", color: "#EF4444" },
  { id: "service", label: "🔧 Service Problem", color: "#3B82F6" },
  { id: "behavior", label: "⚠️ Misconduct", color: "#8B5CF6" },
  { id: "other", label: "📋 Other", color: "#6B7280" },
];

const URGENCY_LEVELS = [
  { id: "low", label: "Low", color: "#22C55E", icon: "chevron-down-circle-outline" },
  { id: "medium", label: "Medium", color: "#F59E0B", icon: "remove-circle-outline" },
  { id: "high", label: "High", color: "#F97316", icon: "chevron-up-circle-outline" },
  { id: "critical", label: "Critical", color: "#EF4444", icon: "alert-circle-outline" },
];

export default function UserComplaintForm({ navigation }) {
  const { colors } = useTheme();
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [targetId, setTargetId] = useState(""); // optional: target initiator/user ID
  const [category, setCategory] = useState("");
  const [urgency, setUrgency] = useState("medium");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    // TC-75-02: Frontend validation (backend also validates)
    if (!category) {
      Alert.alert("Validation Error", "Please select a complaint category.");
      return;
    }
    if (!title.trim()) {
      Alert.alert("Validation Error", "Please enter a complaint title.");
      return;
    }
    if (!reason.trim()) {
      Alert.alert("Validation Error", "Please provide a reason to submit.");
      return;
    }

    setLoading(true);
    try {
      // TC-75-01: Use secure authenticated backend route
      const result = await apiClient.backendPost("/complaint/submit", {
        title: title.trim(),
        reason: reason.trim(),
        targetId: targetId.trim() || undefined,
        category,
        urgency,
      });

      if (result.success) {
        Alert.alert(
          "Complaint Submitted",
          `Your complaint has been submitted successfully. Reference ID: ${result.complaintId}`,
          [{ text: "OK", onPress: () => navigation?.canGoBack?.() ? navigation.goBack() : navigation?.navigate?.("UserDashboard") }]
        );
        setTitle("");
        setReason("");
        setTargetId("");
        setCategory("");
        setUrgency("medium");
      }
    } catch (error) {
      const errorMsg = error.message || "Something went wrong. Please try again.";
      Alert.alert("Submission Failed", errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.kav}>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
          <TouchableOpacity
            onPress={() => navigation?.canGoBack?.() ? navigation.goBack() : navigation?.navigate?.("UserDashboard")}
            style={{ padding: 4, marginRight: 6 }}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headingText, { marginBottom: 0, color: colors.text }]}>Back</Text>
        </View>

        <Text style={[styles.headingText, { color: colors.text }]}>Submit a Complaint</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Your complaint will be reviewed by the admin. Provide accurate details.</Text>

        {/* ── Category Selector ───────────────────────────── */}
        <Text style={[styles.label, { color: colors.text }]}>Category *</Text>
        <View style={styles.categoryGrid}>
          {COMPLAINT_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryChip,
                { borderColor: category === cat.id ? cat.color : colors.border, backgroundColor: category === cat.id ? cat.color + "15" : colors.card },
              ]}
              onPress={() => setCategory(cat.id)}
              activeOpacity={0.75}
            >
              <Text style={[styles.categoryChipText, { color: category === cat.id ? cat.color : colors.textSecondary }]}>
                {cat.label}
              </Text>
              {category === cat.id && (
                <View style={[styles.categoryCheck, { backgroundColor: cat.color }]}>
                  <Ionicons name="checkmark" size={10} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Urgency Level ────────────────────────────── */}
        <Text style={[styles.label, { color: colors.text, marginTop: 16 }]}>Urgency Level</Text>
        <View style={styles.urgencyRow}>
          {URGENCY_LEVELS.map((lvl) => (
            <TouchableOpacity
              key={lvl.id}
              style={[
                styles.urgencyChip,
                { borderColor: urgency === lvl.id ? lvl.color : colors.border, backgroundColor: urgency === lvl.id ? lvl.color + "15" : colors.card },
              ]}
              onPress={() => setUrgency(lvl.id)}
              activeOpacity={0.75}
            >
              <Ionicons name={lvl.icon} size={16} color={urgency === lvl.id ? lvl.color : colors.textSecondary} />
              <Text style={[styles.urgencyText, { color: urgency === lvl.id ? lvl.color : colors.textSecondary }]}>
                {lvl.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { color: colors.text, marginTop: 16 }]}>Complaint Title *</Text>
        <ThemedInput
          placeholder="Enter complaint title"
          value={title}
          onChangeText={setTitle}
          inputStyle={{ marginBottom: 15 }}
        />

        <Text style={[styles.label, { color: colors.text }]}>Reason for Complaint *</Text>
        <ThemedInput
          placeholder="Describe the issue in detail..."
          value={reason}
          onChangeText={setReason}
          multiline
          inputStyle={{ height: 120, textAlignVertical: "top", marginBottom: 15 }}
        />

        <Text style={[styles.label, { color: colors.text }]}>Target User / Initiator ID (Optional)</Text>
        <ThemedInput
          placeholder="Enter the ID of the person you are complaining about"
          value={targetId}
          onChangeText={setTargetId}
          inputStyle={{ marginBottom: 15 }}
        />

        <ThemedButton
          label={loading ? "Submitting..." : "Submit Complaint"}
          onPress={handleSubmit}
          disabled={loading}
          style={{ marginTop: 10 }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  kav: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  headingText: { fontSize: 22, fontWeight: "bold", marginBottom: 20 },
  subtitle: { fontSize: 14, marginBottom: 20, marginTop: -12 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 6 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    position: "relative",
  },
  categoryChipText: { fontSize: 13, fontWeight: "600" },
  categoryCheck: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  urgencyRow: { flexDirection: "row", gap: 8 },
  urgencyChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  urgencyText: { fontSize: 12, fontWeight: "700" },
});
