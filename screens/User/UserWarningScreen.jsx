import React, { useEffect, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";
import { formatDateTime } from "../../utils/date";



export default function UserWarningScreen({ userId }) {
  const { colors, language: appLang } = useTheme();
  const [warnings, setWarnings] = useState([]);

  const fetchWarnings = async () => {
    try {
      const data = await userService.getWarnings();
      if (!data) return;

      // Filter warnings for this user
      const filtered = Object.values(data).filter(
        (w) => w.to === "user" && w.toId === userId
      );

      setWarnings(filtered);
    } catch (error) {
      console.log(error);
      Alert.alert("Error", "Unable to fetch warnings");
    }
  };

  useEffect(() => {
    fetchWarnings();
  }, []);

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.message}>{item.message}</Text>
      <Text style={styles.date}>{formatDateTime(item.timestamp, appLang)}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, padding: 20, backgroundColor: colors.background }}>
      <Text style={[styles.title, { color: colors.brand }]}>Your Warnings</Text>
      {warnings.length === 0 ? (
        <Text style={{ textAlign: "center", marginTop: 20 }}>No warnings</Text>
      ) : (
        <FlatList
          data={warnings}
          keyExtractor={(item, index) => index.toString()}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 15 },
  card: { padding: 15, borderRadius: 10, marginBottom: 10 },
  message: { fontSize: 16 },
  date: { fontSize: 12, color: "#555", marginTop: 5 },
});
