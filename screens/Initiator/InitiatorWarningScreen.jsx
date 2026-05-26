import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";
import { formatDateTime } from "../../utils/date";



export default function InitiatorWarningScreen({ initiatorId }) {
  const { colors, language: appLang } = useTheme();
  const [warnings, setWarnings] = useState([]);
  const [currentId, setCurrentId] = useState(initiatorId || null);

  const fetchWarnings = async () => {
    try {
      const data = await userService.getWarnings();
      if (!data || !currentId) return;

      // Filter warnings for this initiator
      const filtered = Object.values(data).filter(
        (w) => w.to === "initiator" && w.toId === currentId
      );

      setWarnings(filtered);
    } catch (error) {
      console.log(error);
      Alert.alert("Error", "Unable to fetch warnings");
    }
  };

  useEffect(() => {
    const init = async () => {
      let id = initiatorId;
      if (!id) {
        try {
          const data = await AsyncStorage.getItem("userData");
          if (data) {
            const parsed = JSON.parse(data);
            id = parsed.userId || parsed.uid;
          }
        } catch { }
      }
      if (!id) return;
      setCurrentId(id);
    };
    init();
  }, []);

  useEffect(() => {
    if (currentId) {
      fetchWarnings();
    }
  }, [currentId]);

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
