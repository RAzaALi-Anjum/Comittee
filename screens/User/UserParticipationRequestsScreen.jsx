import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";

export default function UserParticipationRequestsScreen() {
  const { colors } = useTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
          setItems([]);
          setLoading(false);
          return;
        }

        const [reqData, commData] = await Promise.all([
          userService.getParticipationRequests(),
          userService.getAllCommittees(),
        ]);

        const allReq = reqData
          ? Object.entries(reqData).map(([id, val]) => ({ id, ...val }))
          : [];

        const mine = allReq.filter((r) => r.userId === uid);
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
          };
        });

        if (!cancelled) {
          setItems(withCommitteeName);
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
  }, []);

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{item.committeeName}</Text>
          <Text style={styles.infoText}>Request ID: <Text style={{ color: '#0f172a', fontWeight: '600' }}>{item.requestId ?? item.id}</Text></Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: item.status?.toLowerCase() === 'approved' ? '#dcfce7' : (item.status?.toLowerCase() === 'rejected' ? '#fee2e2' : '#fef3c7') }]}>
          <Text style={[styles.statusText, { color: item.status?.toLowerCase() === 'approved' ? '#166534' : (item.status?.toLowerCase() === 'rejected' ? '#991b1b' : '#92400e') }]}>{item.status || "PENDING"}</Text>
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 }} />

      <Text style={styles.infoText}>Created: <Text style={{ color: '#0f172a', fontWeight: '500' }}>{item.createdAt || "—"}</Text></Text>
      {item.updatedAt && (
        <Text style={styles.infoText}>Updated: <Text style={{ color: '#0f172a', fontWeight: '500' }}>{item.updatedAt}</Text></Text>
      )}
      
      {(!item.status || item.status?.toLowerCase() === 'pending') && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
          <TouchableOpacity
            style={[styles.deleteBtn, { backgroundColor: '#ef4444' }]}
            onPress={() => {
              Alert.alert("Delete Request", "Are you sure you want to delete this request?", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await userService.deleteParticipationRequest(item.id);
                      setItems((prev) => prev.filter((it) => it.id !== item.id));
                    } catch {
                      Alert.alert("Error", "Failed to delete request.");
                    }
                  }
                }
              ]);
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.heading, { color: colors.brand }]}>My Participation Requests</Text>
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
  deleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  empty: { textAlign: "center", marginTop: 32, fontSize: 16, color: "#64748b" },
});
