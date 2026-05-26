import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image, Linking,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import apiClient from "../../services/apiClient";

export default function AdminViewAllUsers({ navigation }) {
  const { colors } = useTheme();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchName, setSearchName] = useState("");
  const [minContrib, setMinContrib] = useState("");
  const [maxContrib, setMaxContrib] = useState("");
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [selectedSerial, setSelectedSerial] = useState(null);
  const [serialMap, setSerialMap] = useState({});

  const FIREBASE_URL = "https://com1-e2378-default-rtdb.firebaseio.com/users.json";
  const USERS_BASE = "https://com1-e2378-default-rtdb.firebaseio.com/users";

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      // Try secure backend that returns decrypted profiles (admin only)
      try {
        const res = await apiClient.backendGet("/profile");
        const list = Array.isArray(res?.users) ? res.users : [];
        // Build serial map from decrypted list
        const allIds = list.map(u => u.userId).sort((a, b) => a.localeCompare(b));
        const map = {};
        allIds.forEach((id, idx) => (map[id] = idx + 1));
        setSerialMap(map);
        const onlyUsers = list
          .map(u => ({ id: u.userId, ...u, totalContribution: u.totalContribution || 0 }))
          .filter(u => {
            const role = (u.role || "").toLowerCase();
            const status = (u.initiatorStatus || "").toLowerCase();
            return role === "user" || (!role && status !== "approved");
          });
        setUsers(onlyUsers);
        return;
      } catch (backendErr) {
        console.warn("[AdminViewAllUsers] Backend decrypt unavailable, falling back to RTDB:", backendErr.message);
      }
      // Fallback: direct RTDB (will show encrypted values)
      const res = await fetch(FIREBASE_URL);
      const data = await res.json();
      if (!data) {
        setUsers([]);
        setSerialMap({});
        return;
      }
      const allIds = Object.keys(data).sort((a, b) => a.localeCompare(b));
      const map = {};
      allIds.forEach((id, idx) => (map[id] = idx + 1));
      setSerialMap(map);
      const usersArray = Object.keys(data).map((key) => ({
        id: key,
        ...data[key],
        totalContribution: data[key].totalContribution || 0
      }));
      const onlyUsers = usersArray.filter(u => {
        const role = (u.role || "").toLowerCase();
        const status = (u.initiatorStatus || "").toLowerCase();
        return role === "user" || (!role && status !== "approved");
      });
      setUsers(onlyUsers);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredUsers = () => {
    return users.filter((u) => {
      // FR-52: Search by Name
      const nameMatch = u.fullName
        ? u.fullName.toLowerCase().includes(searchName.toLowerCase())
        : false;

      // FR-55: Filter by Contribution Range
      const contrib = parseFloat(u.totalContribution || 0);
      const min = minContrib ? parseFloat(minContrib) : 0;
      const max = maxContrib ? parseFloat(maxContrib) : Infinity;
      const rangeMatch = contrib >= min && contrib <= max;

      return nameMatch && rangeMatch;
    });
  };

  const filteredUsers = getFilteredUsers();

  const viewDetails = async (userId) => {
    try {
      setSelectedSerial(serialMap[userId] ?? null);
      try {
        // Prefer backend decrypted profile
        const res = await apiClient.backendGet(`/profile/${userId}`);
        const prof = res?.profile || null;
        setSelectedProfile(prof);
        setDetailVisible(true);
        return;
      } catch (backendErr) {
        console.warn("[AdminViewAllUsers] Profile decrypt unavailable, fallback RTDB:", backendErr.message);
      }
      const res = await fetch(`${USERS_BASE}/${userId}.json`);
      const prof = await res.json();
      setSelectedProfile(prof || null);
      setDetailVisible(true);
    } catch {
      setSelectedProfile(null);
      setDetailVisible(true);
    }
  };
  
  const openPdf = async (url) => {
    try {
      if (!url) return;
      const isWeb = url.startsWith("http://") || url.startsWith("https://");
      if (isWeb) {
        await Linking.openURL(url);
        return;
      }
      Alert.alert(
        "PDF not available",
        "This is a local device file path. Ask the user to re-upload so a public link is saved."
      );
    } catch {
      Alert.alert("Unable to open PDF", "Please try again later.");
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.heading, { color: colors.brand }]}>All Registered Users</Text>

      <View style={styles.filterSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={20} color="#94a3b8" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by Name"
            placeholderTextColor="#94a3b8"
            value={searchName}
            onChangeText={setSearchName}
          />
        </View>

        <View style={styles.row}>
          <View style={styles.halfInputBox}>
            <Text style={styles.inputLabel}>Min Contribution</Text>
            <TextInput
              style={styles.filterInput}
              placeholder="0"
              keyboardType="numeric"
              value={minContrib}
              onChangeText={setMinContrib}
            />
          </View>
          <View style={styles.halfInputBox}>
            <Text style={styles.inputLabel}>Max Contribution</Text>
            <TextInput
              style={styles.filterInput}
              placeholder="Any"
              keyboardType="numeric"
              value={maxContrib}
              onChangeText={setMaxContrib}
            />
          </View>
        </View>
      </View>

      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.idBadge}>ID: {serialMap[item.id] ?? "—"}</Text>
              <View style={[styles.roleBadge, { backgroundColor: item.role === 'Admin' ? '#fee2e2' : '#e0f2fe' }]}>
                <Text style={[styles.roleText, { color: item.role === 'Admin' ? '#991b1b' : '#0369a1' }]}>
                  {item.role?.toUpperCase() || "USER"}
                </Text>
              </View>
            </View>

            <Text style={styles.name}>{item.fullName || item.name || "—"}</Text>

            <View style={styles.cardInfoRow}>
              <Text style={styles.cardLabel}>Email Address</Text>
              <Text style={styles.cardValue} numberOfLines={1}>{item.email}</Text>
            </View>
            <View style={styles.cardInfoRow}>
              <Text style={styles.cardLabel}>Total Contribution</Text>
              <Text style={[styles.cardValue, { color: colors.brand }]}>PKR {item.totalContribution.toLocaleString()}</Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.viewBtn, { backgroundColor: colors.brand }]}
              onPress={() => viewDetails(item.id)}
            >
              <Text style={styles.btnText}>View User Profile</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No users found in this criteria.</Text>}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
      />

      <Modal
        visible={detailVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailVisible(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: colors.brand }]}>User Information</Text>
            {selectedProfile ? (
              <ScrollView showsVerticalScrollIndicator={true} style={{ width: "100%" }}>
                {selectedProfile.profilePicture ? (
                  <View style={styles.profileImageContainer}>
                    <Image source={{ uri: selectedProfile.profilePicture }} style={styles.profileImage} />
                  </View>
                ) : (
                  <View style={styles.profileImagePlaceholder}>
                    <Ionicons name="person" size={40} color="#cbd5e1" />
                  </View>
                )}

                <View style={styles.detailSection}>
                  <View style={styles.itemRow}>
                    <Text style={styles.label}>Serial ID</Text>
                    <Text style={styles.value}>{selectedSerial ?? "—"}</Text>
                  </View>
                  <View style={styles.itemRow}>
                    <Text style={styles.label}>Full Name</Text>
                    <Text style={styles.value}>{selectedProfile.name || selectedProfile.fullName || "—"}</Text>
                  </View>
                  <View style={styles.itemRow}>
                    <Text style={styles.label}>Email Address</Text>
                    <Text style={styles.value}>{selectedProfile.email || "—"}</Text>
                  </View>
                  <View style={styles.itemRow}>
                    <Text style={styles.label}>Phone Number</Text>
                    <Text style={styles.value}>{selectedProfile.contactNumber || "—"}</Text>
                  </View>
                  <View style={styles.itemRow}>
                    <Text style={styles.label}>Living Address</Text>
                    <Text style={styles.value}>{selectedProfile.address || "—"}</Text>
                  </View>
                  <View style={styles.itemRow}>
                    <Text style={styles.label}>Work Industry</Text>
                    <Text style={styles.value}>{selectedProfile.occupation || "—"}</Text>
                  </View>
                </View>

                <Text style={styles.sectionTitle}>Verification Assets</Text>

                {selectedProfile.cnic ? (
                  <View style={styles.docWrapper}>
                    <Text style={styles.docLabel}>Identification Card</Text>
                    <Image source={{ uri: selectedProfile.cnic }} style={styles.docImg} resizeMode="cover" />
                  </View>
                ) : null}

                {selectedProfile.bankStatement ? (
                  <View style={styles.docWrapper}>
                    <Text style={styles.docLabel}>Financial Proof</Text>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={[styles.pdfBtn, { backgroundColor: colors.brand }]}
                      onPress={() => openPdf(selectedProfile.bankStatement)}
                    >
                      <Ionicons name="document-text" size={20} color="#fff" />
                      <Text style={styles.pdfBtnText}>View Bank Statement PDF</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                <View style={{ height: 20 }} />
              </ScrollView>
            ) : (
              <Text style={styles.empty}>No profile found.</Text>
            )}

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setDetailVisible(false)}
              style={[styles.closeBtn, { backgroundColor: colors.brand }]}
            >
              <Text style={styles.closeBtnText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  heading: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 20,
    marginBottom: 20,
    textAlign: "center",
    letterSpacing: 0.5
  },
  filterSection: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 13, color: '#0f172a' },
  row: { flexDirection: "row", justifyContent: "space-between" },
  halfInputBox: { width: "48%" },
  inputLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', marginBottom: 4, marginLeft: 4 },
  filterInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0f172a',
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  idBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  roleText: {
    fontSize: 10,
    fontWeight: "800",
  },
  name: { fontSize: 20, fontWeight: "800", color: "#0f172a", marginBottom: 12 },
  cardInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  cardLabel: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  cardValue: { fontSize: 13, color: '#0f172a', fontWeight: '700', flex: 1, textAlign: 'right', marginLeft: 12 },
  viewBtn: {
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  empty: { textAlign: "center", marginTop: 40, color: "#64748b", fontSize: 16 },

  modalBg: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    maxHeight: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: 0.5
  },
  profileImageContainer: {
    alignSelf: 'center',
    marginBottom: 20,
    padding: 4,
    borderRadius: 56,
    borderWidth: 2,
    borderColor: '#f1f5f9'
  },
  profileImage: { width: 100, height: 100, borderRadius: 50 },
  profileImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f8fafc',
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  detailSection: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 12,
    marginBottom: 20,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  label: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  value: { fontSize: 13, color: '#0f172a', fontWeight: '700', flex: 1, textAlign: 'right', marginLeft: 12 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 8,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  docWrapper: {
    marginBottom: 16,
  },
  docLabel: { fontSize: 12, fontWeight: '800', color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' },
  docImg: { width: "100%", height: 160, borderRadius: 12, backgroundColor: '#f1f5f9' },
  pdfBtn: {
    flexDirection: 'row',
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  pdfBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  closeBtn: {
    marginTop: 10,
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  closeBtnText: { color: "#fff", fontWeight: "800", fontSize: 15, textTransform: 'uppercase', letterSpacing: 1 },
});
