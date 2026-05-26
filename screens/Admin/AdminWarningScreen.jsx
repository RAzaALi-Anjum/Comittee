import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { formatDate } from "../../utils/date";

// Firebase URL
const FIREBASE_URL = "https://com1-e2378-default-rtdb.firebaseio.com/warnings.json";

export default function AdminWarningScreen() {
  const { colors, language: appLang } = useTheme();
  const [toType, setToType] = useState("user"); // user or initiator
  const [toId, setToId] = useState("");
  const [message, setMessage] = useState("");
  const [warnings, setWarnings] = useState({});
  const [loading, setLoading] = useState(true);

  // Fetch existing warnings
  const fetchWarnings = async () => {
    try {
      setLoading(true);
      const res = await fetch(FIREBASE_URL);
      const data = await res.json();
      setWarnings(data || {});
    } catch (error) {
      console.log(error);
      Alert.alert("Error", "Unable to fetch warnings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWarnings();
  }, []);

  const submitWarning = async () => {
    if (!toId || !message) {
      Alert.alert("Error", "Please fill all fields");
      return;
    }

    // Check if this user/initiator already has a warning
    const alreadyWarned = Object.values(warnings).some(
      (w) => w.to === toType && w.toId === toId
    );

    if (alreadyWarned) {
      Alert.alert("Warning Locked", `This ${toType} already has an active warning recorded.`);
      return;
    }

    const newWarning = {
      from: "admin",
      to: toType,
      toId,
      message,
      warningGiven: true, // mark that warning is given
      timestamp: Date.now(),
    };

    try {
      await fetch(FIREBASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newWarning),
      });

      Alert.alert("Success", "Security warning has been issued successfully.");
      setToId("");
      setMessage("");
      fetchWarnings();
    } catch (error) {
      console.log(error);
      Alert.alert("Error", "Failed to send warning");
    }
  };

  const renderItem = ({ item }) => {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.typeBadge, { backgroundColor: item.to === 'initiator' ? '#fee2e2' : '#fef3c7' }]}>
            <Text style={[styles.typeBadgeText, { color: item.to === 'initiator' ? '#991b1b' : '#92400e' }]}>
              {item.to?.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.timestamp}>{formatDate(item.timestamp, appLang)}</Text>
        </View>

        <View style={styles.idRow}>
          <Ionicons name="finger-print-outline" size={14} color="#64748b" />
          <Text style={styles.idText}>Target ID: {item.toId}</Text>
        </View>

        <View style={styles.messageBox}>
          <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
          <Text style={styles.messageText}>{item.message}</Text>
        </View>
      </View>
    );
  };

  if (loading && Object.keys(warnings).length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={true}>
        <Text style={[styles.heading, { color: colors.brand }]}>Issue Compliance Warning</Text>

        <View style={styles.formSection}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Target Entity ID</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="id-card-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="e.g. USER_123 or INIT_456"
                placeholderTextColor="#94a3b8"
                value={toId}
                onChangeText={setToId}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Warning Message</Text>
            <View style={[styles.inputContainer, { height: 100, alignItems: 'flex-start', paddingTop: 12 }]}>
              <Ionicons name="chatbox-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Describe the violation or reason for warning..."
                placeholderTextColor="#94a3b8"
                multiline
                value={message}
                onChangeText={setMessage}
              />
            </View>
          </View>

          <Text style={styles.inputLabel}>Entity Classification</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              style={[
                styles.typeButton,
                toType === "user" && [styles.typeButtonActive, { backgroundColor: colors.brand, borderColor: colors.brand }],
              ]}
              onPress={() => setToType("user")}
            >
              <Ionicons name="person-outline" size={18} color={toType === 'user' ? '#fff' : colors.brand} />
              <Text style={[styles.typeText, { color: toType === 'user' ? '#fff' : colors.brand }]}>Standard User</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              style={[
                styles.typeButton,
                toType === "initiator" && [styles.typeButtonActive, { backgroundColor: colors.brand, borderColor: colors.brand }],
              ]}
              onPress={() => setToType("initiator")}
            >
              <Ionicons name="briefcase-outline" size={18} color={toType === 'initiator' ? '#fff' : colors.brand} />
              <Text style={[styles.typeText, { color: toType === 'initiator' ? '#fff' : colors.brand }]}>Initiator</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.submitButton, { backgroundColor: colors.brand }]}
            onPress={submitWarning}
          >
            <Ionicons name="paper-plane-outline" size={20} color="#fff" />
            <Text style={styles.submitButtonText}>Dispatch Warning Notice</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.line} />
          <Text style={styles.dividerText}>HISTORICAL LOGS</Text>
          <View style={styles.line} />
        </View>

        <FlatList
          scrollEnabled={false}
          data={Object.values(warnings).reverse()}
          keyExtractor={(item, index) => index.toString()}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="shield-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>No warnings have been issued yet.</Text>
            </View>
          }
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },
  heading: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 20,
    marginBottom: 24,
    textAlign: "center",
    letterSpacing: 0.5
  },
  formSection: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    marginBottom: 32,
  },
  inputGroup: { marginBottom: 20 },
  inputLabel: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 8, marginLeft: 4 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    height: 52,
    paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 14, color: '#0f172a', fontWeight: '500' },
  typeRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  typeButton: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    backgroundColor: '#fff'
  },
  typeButtonActive: { elevation: 4, shadowOpacity: 0.1, borderColor: 'transparent' },
  typeText: { fontWeight: "700", fontSize: 13 },
  submitButton: {
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonText: { color: "#fff", fontWeight: "800", fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.5 },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
  line: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  dividerText: { fontSize: 11, fontWeight: '800', color: '#94a3b8', letterSpacing: 1 },

  card: {
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  timestamp: { fontSize: 11, color: '#94a3b8', fontWeight: '500' },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  idText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  messageBox: {
    flexDirection: 'row',
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#fee2e2'
  },
  messageText: { flex: 1, fontSize: 13, color: '#991b1b', lineHeight: 18, fontWeight: '500' },
  emptyBox: { alignItems: 'center', marginTop: 40, gap: 12 },
  emptyText: { fontSize: 14, color: '#94a3b8', fontWeight: '500' }
});
