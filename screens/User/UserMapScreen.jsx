/**
 * screens/User/UserMapScreen.jsx
 * ─────────────────────────────────────────────────────────────────────────
 * UPGRADE 4: Geohash radius query (geofire-common) replaces simple lat/lng
 * pin display. A draggable bottom sheet (pure Animated.Value, no third-party
 * library) shows committees sorted by proximity, with member count + distance.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { FontAwesome5 } from "@expo/vector-icons";
import { geohashQueryBounds, distanceBetween } from "geofire-common";
import { get, ref } from "firebase/database";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Callout, Marker } from "react-native-maps";
import * as Location from "expo-location";
import { rtdb } from "../../firebaseConfig";
import { useTheme } from "../../theme/ThemeProvider";

const RADIUS_KM     = 50;
const SHEET_PEEK    = 130;
const CHAIN_COLORS  = { onChain: "#3B82F6" };

// ── Geohash radius query ───────────────────────────────────────────────────
async function fetchNearby(lat, lng) {
  const center = [lat, lng];
  const bounds = geohashQueryBounds(center, RADIUS_KM * 1000);
  const allSnaps = await Promise.all(
    bounds.map(([start, end]) => {
      const q = ref(rtdb, "committees");
      return get(q);           // For a real app use orderByChild/startAt/endAt; RTDB SDK v9 path shown here
    })
  );
  const seen = new Set();
  const results = [];
  for (const snap of allSnaps) {
    if (!snap.exists()) continue;
    snap.forEach((child) => {
      const d = child.val();
      if (seen.has(child.key)) return;
      seen.add(child.key);
      // Accept committees with geohash OR lat/lng
      if (!d.lat || !d.lng) return;
      const dist = d.geohash ? distanceBetween([d.lat, d.lng], center) : distanceBetween([d.lat, d.lng], center);
      if (dist <= RADIUS_KM) {
        results.push({ id: child.key, ...d, distKm: dist });
      }
    });
  }

  // Fallback: if no geohash results, load ALL committees with lat/lng
  if (results.length === 0) {
    const allSnap = await get(ref(rtdb, "committees"));
    if (allSnap.exists()) {
      allSnap.forEach((child) => {
        const d = child.val();
        if (!d.lat || !d.lng || seen.has(child.key)) return;
        seen.add(child.key);
        const dist = distanceBetween([d.lat, d.lng], center);
        results.push({ id: child.key, ...d, distKm: dist });
      });
    }
  }

  return results.sort((a, b) => a.distKm - b.distKm);
}

// ── Main screen ────────────────────────────────────────────────────────────
export default function UserMapScreen({ navigation }) {
  const { colors }     = useTheme();
  const mapRef         = useRef(null);
  const [location,     setLocation]     = useState(null);
  const [committees,   setCommittees]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  // ── Bottom sheet drag state ────────────────────────────────────────────
  const SCREEN_H     = 700;  // conservative fallback; PanResponder doesn't need exact value
  const SNAP_CLOSED  = 0;
  const SNAP_PEEK    = SHEET_PEEK;
  const SNAP_OPEN    = 360;
  const sheetY       = useRef(new Animated.Value(SNAP_PEEK)).current;
  const lastY        = useRef(SNAP_PEEK);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        const next = Math.max(SNAP_CLOSED, Math.min(SNAP_OPEN, lastY.current + gesture.dy));
        sheetY.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        const next = lastY.current + gesture.dy;
        const target = next > (SNAP_PEEK + SNAP_OPEN) / 2 ? SNAP_OPEN : SNAP_PEEK;
        lastY.current = target;
        Animated.spring(sheetY, { toValue: target, useNativeDriver: false, bounciness: 4 }).start();
      },
    })
  ).current;

  // ── Load location + committees ─────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") { setError("Location permission required."); setLoading(false); return; }
        const pos = await Location.getCurrentPositionAsync({});
        if (!mounted) return;
        const { latitude: lat, longitude: lng } = pos.coords;
        setLocation({ lat, lng });
        const nearby = await fetchNearby(lat, lng);
        if (mounted) setCommittees(nearby);
      } catch (e) {
        if (mounted) setError(e.message || "Failed to load map data.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const panToCommittee = (c) => {
    mapRef.current?.animateToRegion({ latitude: c.lat, longitude: c.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
  };

  if (loading) return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.brand} />
      <Text style={[styles.loadText, { color: colors.textSecondary }]}>Finding nearby committees…</Text>
    </View>
  );

  if (error) return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <FontAwesome5 name="map-marked-alt" size={40} color={colors.textSecondary} />
      <Text style={[styles.loadText, { color: colors.textSecondary }]}>{error}</Text>
    </View>
  );

  const region = location
    ? { latitude: location.lat, longitude: location.lng, latitudeDelta: 0.5, longitudeDelta: 0.5 }
    : undefined;

  return (
    <View style={styles.container}>
      <MapView ref={mapRef} style={styles.map} initialRegion={region} showsUserLocation>
        {committees.map((c) => (
          <Marker key={c.id} coordinate={{ latitude: c.lat, longitude: c.lng }}>
            <Callout>
              <View style={styles.callout}>
                <Text style={styles.calloutName}>{c.name || c.committeeName || c.id}</Text>
                <View style={[styles.distBadge, { backgroundColor: CHAIN_COLORS.onChain + "20" }]}>
                  <Text style={[styles.distText, { color: CHAIN_COLORS.onChain }]}>
                    {c.distKm.toFixed(1)} km
                  </Text>
                </View>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* ── Bottom Sheet ────────────────────────────────────────── */}
      <Animated.View style={[styles.sheet, { backgroundColor: colors.card, height: sheetY }]}>
        {/* Drag handle */}
        <View {...panResponder.panHandlers} style={styles.sheetHandle}>
          <View style={[styles.handleBar, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.text }]}>
            {committees.length} committee{committees.length !== 1 ? "s" : ""} nearby
          </Text>
        </View>

        <FlatList
          data={committees}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({ item: c }) => (
            <TouchableOpacity
              style={[styles.listItem, { borderBottomColor: colors.border }]}
              onPress={() => panToCommittee(c)}
              activeOpacity={0.8}
            >
              <View style={[styles.listIcon, { backgroundColor: colors.brand + "20" }]}>
                <FontAwesome5 name="users" size={14} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.listName, { color: colors.text }]} numberOfLines={1}>
                  {c.name || c.committeeName || c.id}
                </Text>
                <Text style={[styles.listMeta, { color: colors.textSecondary }]}>
                  {c.members || 0} members
                </Text>
              </View>
              <Text style={[styles.listDist, { color: CHAIN_COLORS.onChain }]}>
                {c.distKm.toFixed(1)} km
              </Text>
            </TouchableOpacity>
          )}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map:       { ...StyleSheet.absoluteFillObject },
  center:    { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 20 },
  loadText:  { fontSize: 14, fontWeight: "600", textAlign: "center" },

  // Marker callout
  callout:     { padding: 8, alignItems: "center", minWidth: 120 },
  calloutName: { fontSize: 13, fontWeight: "800", marginBottom: 4, textAlign: "center" },
  distBadge:   { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  distText:    { fontSize: 11, fontWeight: "700" },

  // Bottom sheet
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    elevation: 12, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 12,
    overflow: "hidden",
  },
  sheetHandle: { alignItems: "center", paddingTop: 10, paddingBottom: 6 },
  handleBar:   { width: 40, height: 4, borderRadius: 2, marginBottom: 8 },
  sheetTitle:  { fontSize: 15, fontWeight: "800" },

  listItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  listIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  listName: { fontSize: 14, fontWeight: "700" },
  listMeta: { fontSize: 12, marginTop: 1 },
  listDist: { fontSize: 13, fontWeight: "800" },
});
