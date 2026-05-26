import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

export default function UserMapScreen() {
  const { colors } = useTheme();
  const [coords, setCoords] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const getLocation = async () => {
    try {
      setLoading(true);
      setError(null);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Location permission denied");
        setLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } catch (e) {
      setError("Failed to get location");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getLocation();
  }, []);

  const openInMaps = () => {
    if (!coords) return;
    const url = `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`;
    Linking.openURL(url);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.brand }]}>Your Location (Web)</Text>
      {loading && <ActivityIndicator size="large" color={colors.brand} style={{ marginBottom: 10 }} />}
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.panel}>
        {coords ? (
          <View style={styles.coordBox}>
            <Text style={styles.coord}>Lat: {coords.latitude.toFixed(6)}</Text>
            <Text style={styles.coord}>Lng: {coords.longitude.toFixed(6)}</Text>
          </View>
        ) : (
          <Text style={{ color: "#666" }}>Location not available</Text>
        )}
      </View>
      <TouchableOpacity style={[styles.btn, { backgroundColor: colors.brand }]} onPress={getLocation}>
        <Text style={styles.btnText}>Refresh Location</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.btn, { backgroundColor: "#0B57D0" }]} onPress={openInMaps} disabled={!coords}>
        <Text style={styles.btnText}>Open in Google Maps</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 8, textAlign: "center" },
  error: { color: "#B00020", textAlign: "center", marginBottom: 8 },
  panel: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: "#eee", alignItems: "center", justifyContent: "center" },
  coordBox: { alignItems: "center" },
  coord: { fontSize: 16, fontWeight: "600", color: "#111", marginVertical: 4 },
  btn: { marginTop: 12, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "bold" },
});
