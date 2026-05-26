import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { doc, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Alert, Image, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { auth, db } from "../../firebaseConfig";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";

export default function ProfileScreen({ navigation }) {
  const { preference, setPreference, colors } = useTheme();
  const [user, setUser] = useState({ name: "", email: "" });
  const [themeSystem, setThemeSystem] = useState(true);
  const [userId, setUserId] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [coords, setCoords] = useState(null);
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
      } catch {}
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
      setCoords({ latitude, longitude });
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
    } catch {}
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
            updatedAt: new Date().toISOString(),
          });
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
            } catch {
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
    } catch {}
  };

  const openInMaps = () => {
    if (!coords) return;
    const url = `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`;
    Linking.openURL(url);
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
          {avatar ? (
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

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.rowLabel, { color: colors.text, marginVertical: 8 }]}>Your Location</Text>
        {locError ? <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{locError}</Text> : null}
        <View style={[styles.mapWrap, { borderColor: colors.border }]}>
          {coords ? (
            <View style={styles.mapPlaceholder}>
              <Text style={[styles.rowSub, { color: colors.textSecondary }]}>Lat: {coords.latitude.toFixed(6)}</Text>
              <Text style={[styles.rowSub, { color: colors.textSecondary }]}>Lng: {coords.longitude.toFixed(6)}</Text>
              <TouchableOpacity onPress={openInMaps} style={[styles.refreshBtn, { backgroundColor: "#0B57D0", marginTop: 8 }]} activeOpacity={0.8}>
                <Text style={styles.refreshTxt}>Open in Google Maps</Text>
              </TouchableOpacity>
            </View>
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

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Item icon="time-outline" label="History" onPress={goHistory} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Item icon="shield-checkmark-outline" label="Privacy Policy" onPress={showPrivacy} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Item icon="information-circle-outline" label="About" onPress={showAbout} />
      </View>

      <View style={[styles.cardDanger, { backgroundColor: `${colors.danger}08`, borderColor: `${colors.danger}20` }]}>
        <Item icon="trash-outline" label="Delete Account" onPress={confirmDelete} danger />
      </View>

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
    elevation: 3,
  },
  name: { color: "#FFFFFF", fontSize: 18, fontWeight: "bold", marginTop: 6 },
  email: { color: "#EDE7F6", fontSize: 12 },
  card: { margin: 16, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: "#eee" },
  divider: { height: 1, backgroundColor: "#eee", marginVertical: 8 },
  row: { flexDirection: "row", alignItems: "center", marginVertical: 6 },
  rowDanger: { backgroundColor: "#ffebee", borderRadius: 8 },
  iconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: 12 },
  rowLabel: { fontSize: 14, fontWeight: "600" },
  rowSub: { fontSize: 12 },
  mapWrap: { height: 180, borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  mapPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  refreshBtn: { marginTop: 12, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  refreshTxt: { color: "#fff", fontWeight: "bold" },
  cardDanger: { margin: 16, padding: 16, borderRadius: 12, borderWidth: 1 },
  logoutBtn: { margin: 16, paddingVertical: 14, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  logoutText: { color: "#fff", fontWeight: "bold", marginLeft: 8 },
});
