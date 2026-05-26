import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";

export default function InitiatorParticipationRequestsScreen({ navigation }) {
  const { colors } = useTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const formatHMS = (value) => {
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return String(value ?? "");
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } catch {
      return String(value ?? "");
    }
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const load = async () => {
        try {
          let uid = null;
          try {
            const data = await AsyncStorage.getItem("userData");
            if (data) {
              const parsed = JSON.parse(data);
              uid = parsed.userId || parsed.uid;
            }
          } catch { }

          if (!uid || cancelled) {
            if (!cancelled) {
              setItems([]);
              setLoading(false);
            }
            return;
          }

          const [reqData, commData] = await Promise.all([
            userService.getParticipationRequests(),
            userService.getAllCommittees(),
          ]);

          const allReq = reqData
            ? Object.entries(reqData).map(([id, val]) => ({ id, ...val }))
            : [];

          const myCommitteeIds = commData
            ? Object.entries(commData)
              .filter(([id, val]) => val.createdBy === uid)
              .map(([id]) => id)
            : [];

          const myCommitteeIdSet = new Set(myCommitteeIds);

          const mine = allReq.filter((r) => {
            if (r.initiatorId) {
              return r.initiatorId === uid;
            }
            if (r.committeeId && myCommitteeIdSet.has(r.committeeId)) {
              return true;
            }
            return false;
          });
          mine.sort((a, b) => {
            const ta = new Date(a.createdAt || 0).getTime();
            const tb = new Date(b.createdAt || 0).getTime();
            return tb - ta;
          });

          const withCommitteeName = mine.map((r) => {
            const c = commData ? commData[r.committeeId] : null;
            return {
              ...r,
              committeeName: c?.name || r.committeeId || "—",
              committeeStatus: c?.status || null,
            };
          });

          // Enrich with user profile for display (name, avatar, rating)
          const enriched = await Promise.all(
            withCommitteeName.map(async (r) => {
              try {
                const profile = await userService.getProfileRTDB(r.userId);
                return {
                  ...r,
                  userName: profile?.fullName || profile?.name || "Unknown",
                  userEmail: profile?.email || null,
                  userAvatar: profile?.profilePicture || null,
                  userRating: typeof profile?.rating === "number" ? profile.rating : 4.3,
                };
              } catch {
                return { ...r, userName: "Unknown", userAvatar: null, userRating: 4.3 };
              }
            })
          );

          if (!cancelled) {
            setItems(enriched);
            setLoading(false);
          }
        } catch {
          if (!cancelled) {
            setItems([]);
            setLoading(false);
          }
        }
      };

      load();

      return () => {
        cancelled = true;
      };
    }, [])
  );

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, overflow: 'hidden', backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
          {item.userAvatar ? (
            <Image source={{ uri: item.userAvatar }} style={{ width: 44, height: 44 }} />
          ) : (
            <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#64748b', fontWeight: '800' }}>{(item.userName || '?').slice(0,1).toUpperCase()}</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{item.userName}</Text>
          <Text style={{ color: '#64748b' }}>{item.userEmail || item.userId}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          {Array.from({ length: 5 }).map((_, idx) => {
            const filled = idx < Math.round(item.userRating);
            return <Text key={idx} style={{ color: filled ? '#f59e0b' : '#e5e7eb' }}>★</Text>;
          })}
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 }} />

      <Text style={styles.infoText}>Committee: <Text style={{ color: '#0f172a', fontWeight: '500' }}>{item.committeeName}</Text></Text>
      <Text style={styles.infoText}>Committee Status: <Text style={{ color: '#0f172a', fontWeight: '500' }}>{item.committeeStatus || "—"}</Text></Text>
      <Text style={styles.infoText}>Created: <Text style={{ color: '#0f172a', fontWeight: '500' }}>{item.createdAt ? formatHMS(item.createdAt) : "—"}</Text></Text>
      {item.updatedAt && (
        <Text style={styles.infoText}>Updated: <Text style={{ color: '#0f172a', fontWeight: '500' }}>{formatHMS(item.updatedAt)}</Text></Text>
      )}

      <TouchableOpacity
        style={styles.detailBtn}
        onPress={() =>
          navigation.navigate("ParticipationRequest", {
            request: item,
          })
        }
      >
        <Text style={styles.detailText}>View Details</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.heading, { color: colors.brand }]}>Participation Requests</Text>
      {loading ? (
        <ActivityIndicator size="large" color={colors.brand} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            <Text style={styles.empty}>No participation requests found.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  heading: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 16,
    color: "#1e293b",
    letterSpacing: 0.5
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4
  },
  infoText: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 2
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    marginTop: 8,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: 'uppercase',
  },
  empty: { textAlign: "center", marginTop: 32, fontSize: 16, color: "#64748b" },
  detailBtn: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginTop: 16,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    width: '100%',
  },
  detailText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "600"
  },
});
