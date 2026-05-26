import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { doc, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { auth, db } from "../../firebaseConfig";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";

const isValidImageUrl = (uri) => {
  if (!uri || typeof uri !== "string") return false;
  return uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("data:image/");
};

export default function ProfileScreen({ navigation }) {
  const { preference, setPreference, colors } = useTheme();
  const [user, setUser] = useState({ name: "", email: "" });
  const [themeSystem, setThemeSystem] = useState(true);
  const [userId, setUserId] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [region, setRegion] = useState(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const stored = await AsyncStorage.getItem("userData");
        if (stored) {
          const parsed = JSON.parse(stored);
          setUser({
            name: parsed.fullName || parsed.name || (parsed.email || "").split("@")[0],
            email: parsed.email || "",
          });
          const uid = parsed.userId || parsed.uid;
          setUserId(uid || "");
          if (uid) {
            const profile = await userService.getProfileRTDB(uid);
            if (profile?.profilePicture) setAvatar(profile.profilePicture);
            if (profile?.name) setUser((u) => ({ ...u, name: profile.name }));
          }
        }
        const pref = await AsyncStorage.getItem("theme_pref");
        if (pref) setThemeSystem(pref === "system");
      } catch { }
    };
    load();
  }, []);

  const getLocation = async () => {
    try {
      setLocLoading(true);
      setLocError("");
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocError("Location permission denied");
        setLocLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = loc.coords;
      setRegion({ latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 });
    } catch {
      setLocError("Failed to get location");
    } finally {
      setLocLoading(false);
    }
  };

  useEffect(() => {
    getLocation();
  }, []);

  const toggleTheme = async () => {
    try {
      const next = !themeSystem;
      setThemeSystem(next);
      await AsyncStorage.setItem("theme_pref", next ? "system" : "light");
      setPreference(next ? "system" : "light");
    } catch { }
  };

  const goEditProfile = () => navigation.navigate("EditProfile");
  const goChangePassword = () => navigation.navigate("EditPassword");
  const goNotifications = () => navigation.navigate("UserNotifications");
  const goHistory = () => navigation.navigate("PaymentHistory");

  const showPrivacy = () => Alert.alert("Privacy Policy", "Available in next update");
  const showAbout = () => Alert.alert("About", "Committee app v1.0");

  const changeAvatar = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission required", "Allow media library to change photo.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (!result.canceled && result.assets?.length) {
        const uri = result.assets[0].uri;
        setAvatar(uri);
        if (userId) {
          await userService.apiClient.patch(`users/${userId}`, {
            profilePicture: uri,
            updatedAt: new Date().toISOString()
          });
          try {
            const stored = await AsyncStorage.getItem("userData");
            if (stored) {
              const parsed = JSON.parse(stored);
              parsed.profilePicture = uri;
              await AsyncStorage.setItem("userData", JSON.stringify(parsed));
            }
          } catch { }
        }
      }
    } catch {
      Alert.alert("Error", "Failed to update photo");
    }
  };

  const confirmDelete = async () => {
    Alert.alert(
      "Delete Account",
      "This will remove your profile and leave all joined committees.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const uid = auth.currentUser?.uid;
              if (!uid) {
                Alert.alert("Error", "Sign in required");
                return;
              }
              await setDoc(doc(db, "users", uid), { deleted: true, deletedAt: new Date().toISOString() }, { merge: true });
              await AsyncStorage.removeItem("userData");
              Alert.alert("Account Deleted", "Your account is marked for deletion.");
              navigation.replace("Welcome");
            } catch (e) {
              Alert.alert("Error", "Failed to delete account");
            }
          },
        },
      ]
    );
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem("userData");
      Alert.alert("Logged out", "See you soon!");
      navigation.replace("Welcome");
    } catch { }
  };

  const Item = ({ icon, label, right, onPress, danger }) => (
    <TouchableOpacity onPress={onPress} style={[styles.row, danger && styles.rowDanger]} activeOpacity={0.7}>
      <View style={[styles.iconWrap, { backgroundColor: colors.brandLight }, danger && { backgroundColor: `${colors.danger}15` }]}>
        <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.text }, danger && { color: colors.danger, fontWeight: "700" }]}>{label}</Text>
        {typeof right === "string" && <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{right}</Text>}
      </View>
      {typeof right !== "string" ? right : <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingBottom: 16 }}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.brand }]}>
        <TouchableOpacity
          onPress={() => (navigation?.canGoBack?.() ? navigation.goBack() : navigation?.openDrawer?.())}
          style={styles.backBtn}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerBlobOne} />
        <View style={styles.headerBlobTwo} />
        <View style={styles.avatar}>
          {avatar && isValidImageUrl(avatar) ? (
            <Image source={{ uri: avatar }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{(user.name || "A").charAt(0).toUpperCase()}</Text>
          )}
          <TouchableOpacity onPress={changeAvatar} style={[styles.cameraBtn, { backgroundColor: colors.brand }]} accessibilityLabel="Change profile photo">
            <Ionicons name="camera" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={styles.name}>{user.name || "User"}</Text>
        <Text style={styles.email}>{user.email}</Text>
      </View>

      {/* Account Settings */}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Item icon="create-outline" label="Edit Profile" onPress={goEditProfile} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Item icon="lock-closed-outline" label="Change Password" onPress={goChangePassword} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Item
          icon="moon-outline"
          label="Theme"
          right={<Switch value={themeSystem} onValueChange={toggleTheme} trackColor={{ false: colors.border, true: colors.brand }} thumbColor="#fff" />}
          onPress={toggleTheme}
        />
      </View>

      {/* Location */}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.rowLabel, { color: colors.text, marginVertical: 8 }]}>Your Location</Text>
        {locError ? <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{locError}</Text> : null}
        <View style={[styles.mapWrap, { borderColor: colors.border }]}>
          {region ? (
            <MapView style={styles.map} provider={PROVIDER_GOOGLE} initialRegion={region} region={region}>
              <Marker coordinate={{ latitude: region.latitude, longitude: region.longitude }} />
            </MapView>
          ) : (
            <View style={[styles.mapPlaceholder, { backgroundColor: colors.card }]}>
              <Text style={[styles.rowSub, { color: colors.textSecondary }]}>Map not available</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={getLocation} style={[styles.refreshBtn, { backgroundColor: colors.brand }]} activeOpacity={0.8}>
          <Text style={styles.refreshTxt}>Refresh Location</Text>
        </TouchableOpacity>
      </View>

      {/* More Options */}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Item icon="time-outline" label="History" onPress={goHistory} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Item icon="shield-checkmark-outline" label="Privacy Policy" onPress={showPrivacy} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Item icon="information-circle-outline" label="About" onPress={showAbout} />
      </View>

      {/* Danger Zone */}
      <View style={[styles.cardDanger, { backgroundColor: `${colors.danger}08`, borderColor: `${colors.danger}20` }]}>
        <Item icon="trash-outline" label="Delete Account" onPress={confirmDelete} danger />
      </View>

      {/* Logout Button */}
      <TouchableOpacity onPress={logout} style={[styles.logoutBtn, { backgroundColor: colors.brand }]} activeOpacity={0.8}>
        <Ionicons name="log-out-outline" size={20} color="#fff" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingBottom: 12 },
  header: {
    height: 220,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 20,
    position: "relative",
    overflow: "hidden",
  },
  headerBlobOne: {
    position: "absolute",
    top: -30,
    left: -20,
    width: 160,
    height: 160,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 100,
  },
  headerBlobTwo: {
    position: "absolute",
    top: -50,
    right: -20,
    width: 200,
    height: 200,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 120,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    marginBottom: 8,
    position: "relative",
  },
  avatarText: { color: "#FFFFFF", fontSize: 30, fontWeight: "bold" },
  avatarImage: { width: 84, height: 84, borderRadius: 42 },
  cameraBtn: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  name: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
  email: { color: "rgba(255,255,255,0.8)", marginTop: 2, fontSize: 14 },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  cardDanger: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
  },
  rowDanger: {},
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rowLabel: { fontSize: 16, fontWeight: "600" },
  rowSub: { fontSize: 12, marginTop: 2 },
  divider: { height: 1 },
  logoutBtn: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    flexDirection: "row",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  logoutText: { color: "#FFFFFF", fontWeight: "700", marginLeft: 8, fontSize: 16 },
  mapWrap: { height: 180, borderRadius: 12, overflow: "hidden", borderWidth: 1 },
  map: { flex: 1 },
  mapPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  refreshBtn: { marginTop: 12, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  refreshTxt: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  backBtn: {
    position: "absolute",
    top: 48,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
});
