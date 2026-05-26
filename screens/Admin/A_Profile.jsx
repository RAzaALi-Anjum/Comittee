// screens/Admin/A_Profile.jsx
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import storageService from "../../services/storageService";
import { useTheme } from "../../theme/ThemeProvider";

export default function A_Profile() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    (async () => {
      const stored = await storageService.getUserData();
      if (stored) {
        setName(stored.fullName || "Admin");
        setEmail(stored.email || "admin@digital.com");
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Admin Profile</Text>

      <View style={styles.infoRow}>
        <Text style={styles.label}>Name:</Text>
        <Text style={styles.value}>{name}</Text>
      </View>

      <View style={styles.infoRow}>
        <Text style={styles.label}>Email:</Text>
        <Text style={styles.value}>{email}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#FFF5EB" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20 },
  infoRow: { flexDirection: "row", marginBottom: 15 },
  label: { fontWeight: "bold", width: 80, color: "#333" },
  value: { color: "#555" },

});