import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import apiClient from "../../services/apiClient";

const FIREBASE_USERS_URL = "https://com1-e2378-default-rtdb.firebaseio.com/users.json";

export default function AdminMapScreen() {
  const { colors } = useTheme();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        // Prefer backend decrypted list so names are readable
        try {
          const res = await apiClient.backendGet("/profile");
          const list = (Array.isArray(res?.users) ? res.users : [])
            .map((u) => ({
              id: u.userId,
              name: u.fullName || u.name || u.email || u.userId,
              latitude: typeof u.locationLat === "number" ? u.locationLat : null,
              longitude: typeof u.locationLng === "number" ? u.locationLng : null,
            }))
            .filter(u => typeof u.latitude === "number" && typeof u.longitude === "number");
          setUsers(list);
        } catch (backendErr) {
          const res = await fetch(FIREBASE_USERS_URL);
          const data = await res.json();
          const list = Object.entries(data || {})
            .map(([id, u]) => ({
              id,
              name: u?.name || id,
              latitude: typeof u?.locationLat === "number" ? u.locationLat : null,
              longitude: typeof u?.locationLng === "number" ? u.locationLng : null,
            }))
            .filter(u => typeof u.latitude === "number" && typeof u.longitude === "number");
          setUsers(list);
        }
      } catch (e) {
        console.log(e);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };
    fetchLocations();
  }, []);

  const openMaps = (u) => {
    Linking.openURL(`https://www.google.com/maps?q=${u.latitude},${u.longitude}`);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.brand }]}>User Locations (Web)</Text>
      {loading ? (
        <ActivityIndicator size="large" color={colors.brand} />
      ) : users.length === 0 ? (
        <Text style={{ color: "#666" }}>No users with location found.</Text>
      ) : (
        users.map((u) => (
          <View key={u.id} style={styles.row}>
            <View>
              <Text style={styles.name}>{u.name}</Text>
              <Text style={styles.coords}>Lat: {u.latitude.toFixed(5)}  Lng: {u.longitude.toFixed(5)}</Text>
            </View>
            <TouchableOpacity style={styles.btn} onPress={() => openMaps(u)}>
              <Text style={styles.btnText}>Open Map</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  title: { fontSize: 20, fontWeight: "bold", color: "#800000", marginBottom: 12, textAlign: "center" },
  row: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#eee", marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { fontWeight: "bold", color: "#111" },
  coords: { color: "#555", marginTop: 4 },
  btn: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "#0B57D0", borderRadius: 8 },
  btnText: { color: "#fff", fontWeight: "bold" },
});
