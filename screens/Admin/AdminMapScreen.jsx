import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
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
          // Fallback to RTDB (fields may be encrypted)
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

  const initialRegion = useMemo(() => {
    if (users.length > 0) {
      return {
        latitude: users[0].latitude,
        longitude: users[0].longitude,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      };
    }
    // Fallback center (Pakistan approx)
    return {
      latitude: 30.3753,
      longitude: 69.3451,
      latitudeDelta: 12,
      longitudeDelta: 12,
    };
  }, [users]);

  return (
    <View style={{ flex: 1 }}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 12 }} size="large" color={colors.brand} />
      ) : (
        <MapView
          style={{ flex: 1 }}
          provider={PROVIDER_GOOGLE}
          initialRegion={initialRegion}
        >
          {users.map((user) => (
            <Marker
              key={user.id}
              coordinate={{ latitude: user.latitude, longitude: user.longitude }}
              title={user.name}
              description={user.id}
            />
          ))}
        </MapView>
      )}
    </View>
  );
}
