import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import ThemedButton from "../../components/ui/ThemedButton";
import ThemedInput from "../../components/ui/ThemedInput";
import apiClient from "../../services/apiClient";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";



export default function EditProfile({ navigation }) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);

  // User info
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");

  const [name, setName] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [address, setAddress] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [city, setCity] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [occupation, setOccupation] = useState("");
  const [profilePicture, setProfilePicture] = useState(null);

  const [contactErr, setContactErr] = useState("");

  // Load user data from AsyncStorage; prefer direct fetch by userId; fallback to email scan
  useEffect(() => {
    const loadUser = async () => {
      try {
        const data = await AsyncStorage.getItem("userData");
        if (data) {
          const user = JSON.parse(data);
          setEmail(user.email || "");

          // Prefer fetch by userId if available
          const uid = user.userId || user.uid || null;
          if (uid) {
            const profile = await userService.getProfileRTDB(uid);
            if (profile) {
              setUserId(uid);
              setName(profile.name || profile.fullName || "");
              setFatherName(profile.fatherName || "");
              setAddress(profile.address || "");
              setContactNumber(profile.contactNumber || "");
              setCity(profile.city || "");
              setAge(profile.age || "");
              setGender(profile.gender || "");
              setOccupation(profile.occupation || "");
              setProfilePicture(profile.profilePicture || null);
              return;
            }
          }

          // Fallback: scan by email
          if (user.email) {
            const allUsers = await apiClient.get("users");
            let foundId = null;
            let profile = null;
            for (const key in allUsers || {}) {
              if (allUsers[key]?.email === user.email) {
                profile = allUsers[key];
                foundId = key;
                break;
              }
            }
            if (profile && foundId) {
              setUserId(foundId);
              setName(profile.name || profile.fullName || "");
              setFatherName(profile.fatherName || "");
              setAddress(profile.address || "");
              setContactNumber(profile.contactNumber || "");
              setCity(profile.city || "");
              setAge(profile.age || "");
              setGender(profile.gender || "");
              setOccupation(profile.occupation || "");
              setProfilePicture(profile.profilePicture || null);
            }
          }
        }
      } catch (err) {
        console.log(err);
        Alert.alert("Error", "Failed to load user data.");
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  const pickImage = async (setter) => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permission required", "Camera roll permission is required!");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setter(result.assets[0].uri);
    }
  };

  const isValidPkPhone = (n) => /^(\+92|0)3\d{9}$/.test(n);
  const formatPhoneInput = (t) => {
    let v = (t || "").replace(/[^0-9+]/g, "");
    if (v.startsWith("+")) v = "+" + v.slice(1).replace(/\+/g, "");
    else v = v.replace(/\+/g, "");
    if (v.startsWith("+92")) v = v.slice(0, 13);
    else v = v.slice(0, 11);
    return v;
  };

  const updateProfile = async () => {
    const phoneRe = { test: isValidPkPhone };
    const ageNum = Number(age);
    if (!name || name.trim().length < 2) return Alert.alert("Invalid Input", "Enter a valid Name");
    if (!fatherName || fatherName.trim().length < 2) return Alert.alert("Invalid Input", "Enter a valid Father Name");
    if (!address || address.trim().length < 5) return Alert.alert("Invalid Input", "Enter a valid Address");
    if (!contactNumber || !phoneRe.test(contactNumber))
      return Alert.alert("Invalid Input", "Enter a valid PK mobile number (e.g., 03XXXXXXXXX or +923XXXXXXXXX)");
    if (!city || city.trim().length < 2) return Alert.alert("Invalid Input", "Enter a valid City");
    if (!age || Number.isNaN(ageNum) || ageNum < 18 || ageNum > 100)
      return Alert.alert("Invalid Input", "Age must be a number between 18 and 100");
    if (!["Male", "Female", "Other"].includes(gender))
      return Alert.alert("Invalid Input", "Please select Gender");
    if (!occupation || occupation.trim().length < 2)
      return Alert.alert("Invalid Input", "Enter a valid Occupation");

    const profileData = {
      name,
      fullName: name,
      fatherName,
      address,
      contactNumber,
      city,
      email,
      age,
      gender,
      occupation,
      profilePicture,
      updatedAt: new Date().toISOString(),
    };

    try {
      await userService.apiClient.patch(`users/${userId}`, profileData);
      try {
        const stored = await AsyncStorage.getItem("userData");
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.fullName = name;
          parsed.profilePicture = profilePicture;
          await AsyncStorage.setItem("userData", JSON.stringify(parsed));
        }
      } catch { }
      Alert.alert("Success", "Profile updated successfully!", [
        {
          text: "OK",
          onPress: () =>
            navigation.reset({
              index: 0,
              routes: [{ name: "UserAuthWrapper" }],
            }),
        },
      ]);
    } catch (error) {
      console.log(error);
      Alert.alert("Error", "Failed to update profile.");
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.brand }]}>
      <View style={styles.hero}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtnHero}>
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.heroTitle}>Edit Profile</Text>
      </View>
      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={{ padding: 20, paddingBottom: 64, flexGrow: 1, minHeight: "100%" }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <View style={styles.starRow}>
          <Ionicons name="star" size={24} color="#22c55e" />
          <Text style={styles.starText}>Digital Committee Performance</Text>
        </View>

        {/* Email (read-only) */}
        <ThemedInput label="Email" value={email} editable={false} inputStyle={{ backgroundColor: "#ddd" }} />

        {/* All text inputs */}
        {[
          { label: "Name", value: name, setter: setName },
          { label: "Father Name", value: fatherName, setter: setFatherName },
          { label: "Address", value: address, setter: setAddress },
          { label: "Contact Number", value: contactNumber, setter: (t) => { const v = formatPhoneInput(t); setContactNumber(v); setContactErr(v && !isValidPkPhone(v) ? "Enter a valid PK mobile number (03XXXXXXXXX or +923XXXXXXXXX)" : ""); }, keyboard: "phone-pad" },
          { label: "City", value: city, setter: setCity },
          { label: "Age", value: age, setter: setAge, keyboard: "numeric" },
          { label: "Occupation", value: occupation, setter: setOccupation },
        ].map((field, i) => (
          <View key={i}>
            <ThemedInput
              label={field.label}
              value={field.value}
              onChangeText={field.setter}
              keyboardType={field.keyboard || "default"}
              inputStyle={{ marginTop: 5 }}
            />
            {field.label === "Contact Number" && !!contactErr && <Text style={styles.errorText}>{contactErr}</Text>}
          </View>
        ))}

        {/* Gender picker */}
        <Text style={styles.label}>Gender</Text>
        <View style={styles.selectWrapper}>
          <Picker selectedValue={gender} onValueChange={(val) => setGender(val)} dropdownIconColor="#111827">
            <Picker.Item label="Select Gender" value="" color="#9CA3AF" />
            <Picker.Item label="Male" value="Male" />
            <Picker.Item label="Female" value="Female" />
            <Picker.Item label="Other" value="Other" />
          </Picker>
        </View>

        {/* Profile Picture */}
        <View style={{ marginTop: 15 }}>
          <Text style={styles.label}>Profile Picture</Text>
          <ThemedButton
            label={`${profilePicture ? "Change" : "Upload"} Profile Picture`}
            onPress={() => pickImage(setProfilePicture)}
            style={{ marginTop: 10 }}
          />
          {profilePicture ? (
            <Image source={{ uri: profilePicture }} style={styles.preview} />
          ) : (
            <View style={styles.placeholder}>
              <Text style={{ color: "#aaa" }}>No Profile Picture uploaded</Text>
            </View>
          )}
        </View>
        <ThemedButton
          label="Update Profile"
          onPress={updateProfile}
          disabled={!!contactErr}
          style={{ marginTop: 20, opacity: contactErr ? 0.6 : 1 }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { height: 200, paddingHorizontal: 20, paddingTop: 48, justifyContent: "flex-end", paddingBottom: 16 },
  backBtnHero: { position: "absolute", top: 48, left: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  heroTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "bold" },
  panelScroll: { flex: 1, backgroundColor: "#FFF8F0", marginTop: -8, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  label: { fontWeight: "bold", marginTop: 10 },
  preview: { width: 120, height: 120, marginTop: 10, borderRadius: 5 },
  placeholder: { width: 120, height: 120, marginTop: 10, borderRadius: 5, backgroundColor: "#eee", justifyContent: "center", alignItems: "center" },
  selectWrapper: { borderWidth: 1, borderColor: "#ccc", borderRadius: 5, overflow: "hidden", backgroundColor: "#fff", marginTop: 5 },
  errorText: { color: "#B00020", marginTop: 4, fontSize: 12 },
  starRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, backgroundColor: "#f0fdf4", marginBottom: 10 },
  starText: { color: "#166534", fontSize: 16, fontWeight: "bold", marginLeft: 8 },
});
