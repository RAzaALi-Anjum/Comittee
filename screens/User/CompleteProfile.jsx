import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import SuccessModal from "../../components/SuccessModal";
import ThemedButton from "../../components/ui/ThemedButton";
import ThemedInput from "../../components/ui/ThemedInput";
import apiClient from "../../services/apiClient";
import storageService from "../../services/storageService";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";
import { getUserLocation } from "../../utils/locationService";

export default function CompleteProfile({ navigation }) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [successVisible, setSuccessVisible] = useState(false);

  const [name, setName] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [address, setAddress] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [city, setCity] = useState("");
  const [cnicNumber, setCnicNumber] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [occupation, setOccupation] = useState("");
  const [profilePicture, setProfilePicture] = useState(null);
  const [contactErr, setContactErr] = useState("");

  // ── CNIC OCR State ──
  const [cnicFront, setCnicFront] = useState(null);
  const [cnicBack, setCnicBack] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState(null);
  const [ocrSuccess, setOcrSuccess] = useState(false);
  const [ocrStatus, setOcrStatus] = useState(""); // Progressive loading text
  const [cnicExpanded, setCnicExpanded] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await storageService.getUserData();
        if (user) {
          setUserId(user.userId);
          setEmail(user.email);

          const profile = await userService.getProfileRTDB(user.userId);
          if (profile) {
            setName(profile.name || "");
            setFatherName(profile.fatherName || "");
            setAddress(profile.address || "");
            setContactNumber(profile.contactNumber || "");
            setCity(profile.city || "");
            setCnicNumber(profile.cnicNumber || profile.cnic_number || "");
            setAge(profile.age || "");
            setGender(profile.gender || "");
            setOccupation(profile.occupation || "");
            setProfilePicture(profile.profilePicture || null);
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

  // ── Image Picker Helpers ──
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

  const pickCnicImage = async (side) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission Required", "Camera roll access is needed.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.85,
      });
      if (!result.canceled && result.assets?.length) {
        if (side === "front") setCnicFront(result.assets[0].uri);
        else setCnicBack(result.assets[0].uri);
        setOcrSuccess(false);
        setOcrError(null);
      }
    } catch {
      Alert.alert("Error", "Failed to pick image.");
    }
  };

  const takeCnicPhoto = async (side) => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission Required", "Camera access is needed.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.85,
      });
      if (!result.canceled && result.assets?.length) {
        if (side === "front") setCnicFront(result.assets[0].uri);
        else setCnicBack(result.assets[0].uri);
        setOcrSuccess(false);
        setOcrError(null);
      }
    } catch {
      Alert.alert("Error", "Failed to capture image.");
    }
  };

  // ── CNIC OCR Extract & Auto-Fill ──
  const handleCnicExtract = async () => {
    if (!cnicFront) {
      Alert.alert("Required", "Please upload at least the CNIC front image.");
      return;
    }

    setOcrLoading(true);
    setOcrError(null);
    setOcrSuccess(false);
    setOcrStatus("Uploading CNIC images...");

    try {
      const formData = new FormData();
      formData.append("userId", userId);

      // Detect file extension and force correct MIME type
      const frontExt = cnicFront.split(".").pop().toLowerCase();
      const frontMime = frontExt === "png" ? "image/png" : "image/jpeg";
      formData.append("cnicImage", {
        uri: cnicFront,
        name: `cnic-front.${frontExt || "jpg"}`,
        type: frontMime,
      });

      if (cnicBack) {
        const backExt = cnicBack.split(".").pop().toLowerCase();
        const backMime = backExt === "png" ? "image/png" : "image/jpeg";
        formData.append("cnicImage", {
          uri: cnicBack,
          name: `cnic-back.${backExt || "jpg"}`,
          type: backMime,
        });
      }

      // Progressive status updates
      const statusTimer1 = setTimeout(() => setOcrStatus("Analyzing CNIC with AI..."), 3000);
      const statusTimer2 = setTimeout(() => setOcrStatus("Extracting text & address..."), 8000);
      const statusTimer3 = setTimeout(() => setOcrStatus("Translating address to English..."), 15000);
      const statusTimer4 = setTimeout(() => setOcrStatus("Almost done, verifying..."), 25000);

      const result = await apiClient.backendUpload("/ocr/cnic", formData);

      clearTimeout(statusTimer1);
      clearTimeout(statusTimer2);
      clearTimeout(statusTimer3);
      clearTimeout(statusTimer4);
      setOcrStatus("");

      if (result?.success) {
        const v = result.verification || {};
        const d = result.data || {};

        // Auto-fill profile fields from extracted data
        if (d.full_name) setName(d.full_name);
        if (d.father_name) setFatherName(d.father_name);
        
        let addressMsg = "";
        if (d.address) {
          setAddress(d.address);
        } else {
          addressMsg = "\n\n⚠️ Address translation failed or was unavailable. Please enter your English address manually.";
        }

        if (d.city) setCity(d.city);
        if (d.cnic_number) setCnicNumber(d.cnic_number);
        if (d.gender) setGender(d.gender);
        if (d.date_of_birth) {
          try {
            const dob = new Date(d.date_of_birth);
            const today = new Date();
            let calcAge = today.getFullYear() - dob.getFullYear();
            const monthDiff = today.getMonth() - dob.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) calcAge--;
            if (calcAge >= 18 && calcAge <= 100) setAge(String(calcAge));
          } catch {}
        }

        setOcrSuccess(true);
        setCnicExpanded(true); // Auto-expand to show extracted data

        // Show verification status to user
        const status = v.status || "VALID";
        const confidence = v.confidence ?? 100;
        const issues = v.issues?.length ? `\n\nIssues:\n• ${v.issues.join("\n• ")}` : "";

        const statusEmoji = status === "VALID" ? "✅" : status === "SUSPICIOUS" ? "⚠️" : "❌";
        Alert.alert(
          `${statusEmoji} CNIC ${status}`,
          `Confidence: ${confidence}%\n\nProfile fields have been auto-filled. Please review and complete remaining fields.${addressMsg}${issues}`
        );
      } else {
        setOcrError(result?.error || "Failed to extract CNIC data.");
      }
    } catch (err) {
      setOcrError(err.message || "OCR processing failed.");
      setOcrStatus("");
    } finally {
      setOcrLoading(false);
    }
  };


  const isValidPkPhone = (n) => /^(\+92|0)3\d{9}$/.test(n);
  const formatPhoneInput = (t) => {
    let v = (t || "").replace(/[^0-9+]/g, "");
    if (v.startsWith("+")) {
      v = "+" + v.slice(1).replace(/\+/g, "");
    } else {
      v = v.replace(/\+/g, "");
    }
    if (v.startsWith("+92")) v = v.slice(0, 13);
    else v = v.slice(0, 11);
    return v;
  };

  const validateProfile = (opts) => {
    const phoneRe = { test: isValidPkPhone };
    const { name, fatherName, address, contactNumber, city, age, gender, occupation } = opts;
    if (!name || name.trim().length < 2) return { ok: false, msg: "Enter a valid Name" };
    if (!fatherName || fatherName.trim().length < 2) return { ok: false, msg: "Enter a valid Father Name" };
    if (!address || address.trim().length < 5) return { ok: false, msg: "Enter a valid Address" };
    if (!contactNumber || !phoneRe.test(contactNumber)) return { ok: false, msg: "Enter a valid PK mobile number (e.g., 03XXXXXXXXX or +923XXXXXXXXX)" };
    if (!city || city.trim().length < 2) return { ok: false, msg: "Enter a valid City" };
    const ageNum = Number(age);
    if (!age || Number.isNaN(ageNum) || ageNum < 18 || ageNum > 100)
      return { ok: false, msg: "Age must be a number between 18 and 100" };
    if (!["Male", "Female", "Other"].includes(gender))
      return { ok: false, msg: "Please select Gender" };
    if (!occupation || occupation.trim().length < 2) return { ok: false, msg: "Enter a valid Occupation" };
    return { ok: true, msg: "" };
  };

  const saveProfile = async () => {
    const v = validateProfile({ name, fatherName, address, contactNumber, city, age, gender, occupation });
    if (!v.ok) return Alert.alert("Invalid Input", v.msg);

    let coords = null;
    try {
      coords = await getUserLocation();
    } catch (e) {
      Alert.alert(
        "Location Required",
        Platform.OS === "web"
          ? "Please allow location access in your browser for this site and try again."
          : "Please allow location access in settings and try again."
      );
      return;
    }

    const profileData = {
      name,
      fatherName,
      address,
      contactNumber,
      city,
      cnicNumber,
      age,
      gender,
      occupation,
      profilePicture,
      isComplete: true,
      updatedAt: new Date().toISOString(),
    };
    if (coords && typeof coords.latitude === "number" && typeof coords.longitude === "number") {
      profileData.locationLat = coords.latitude;
      profileData.locationLng = coords.longitude;
      profileData.locationCapturedAt = new Date().toISOString();
      profileData.locationSource = Platform.OS;
    }

    try {
      // userService.updateProfileRTDB now encrypts via backend automatically
      await userService.updateProfileRTDB(userId, profileData);
      setSuccessVisible(true);
    } catch (error) {
      console.log(error);
      Alert.alert("Error", "Failed to save profile.");
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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.brand }]}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.hero}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtnHero}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Complete Profile</Text>
        </View>

        <View style={[styles.panel, { backgroundColor: colors.background }]}>

          {/* ═══ CNIC SCAN CARD ═══ */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setCnicExpanded(!cnicExpanded)}
            style={[
              styles.cnicCardHeader,
              {
                backgroundColor: ocrSuccess ? "#ECFDF5" : "#EFF6FF",
                borderColor: ocrSuccess ? "#10B981" : colors.brand,
              },
            ]}
          >
            <View style={styles.cnicCardHeaderLeft}>
              <View style={[styles.cnicIconWrap, { backgroundColor: ocrSuccess ? "#10B981" : colors.brand }]}>
                <FontAwesome5 name="id-card" size={16} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cnicCardTitle, { color: ocrSuccess ? "#065F46" : "#1E3A5F" }]}>
                  {ocrSuccess ? "✅ CNIC Scanned Successfully" : "Scan CNIC to Auto-Fill"}
                </Text>
                <Text style={[styles.cnicCardSub, { color: ocrSuccess ? "#047857" : "#6B7280" }]}>
                  {ocrSuccess
                    ? "Fields have been auto-filled from your CNIC"
                    : "Upload your CNIC card to auto-fill profile fields"}
                </Text>
              </View>
            </View>
            <Ionicons
              name={cnicExpanded ? "chevron-up" : "chevron-down"}
              size={20}
              color={ocrSuccess ? "#10B981" : colors.brand}
            />
          </TouchableOpacity>

          {cnicExpanded && (
            <View style={[styles.cnicCardBody, { borderColor: ocrSuccess ? "#10B981" : colors.brand }]}>
              {/* Upload Cards Row */}
              <View style={styles.cnicUploadRow}>
                {/* Front Side */}
                <View style={[styles.cnicUploadCard, { borderColor: cnicFront ? colors.brand : "#D1D5DB" }]}>
                  <Text style={styles.cnicUploadLabel}>Front Side</Text>
                  {cnicFront ? (
                    <Image source={{ uri: cnicFront }} style={styles.cnicPreview} />
                  ) : (
                    <View style={styles.cnicPlaceholder}>
                      <FontAwesome5 name="id-card" size={24} color="#9CA3AF" />
                      <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>Required</Text>
                    </View>
                  )}
                  <View style={styles.cnicBtnRow}>
                    <TouchableOpacity onPress={() => pickCnicImage("front")} style={[styles.cnicPickBtn, { backgroundColor: colors.brand + "15" }]}>
                      <Ionicons name="image-outline" size={14} color={colors.brand} />
                      <Text style={[styles.cnicPickBtnText, { color: colors.brand }]}>Gallery</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => takeCnicPhoto("front")} style={[styles.cnicPickBtn, { backgroundColor: colors.brand + "15" }]}>
                      <Ionicons name="camera-outline" size={14} color={colors.brand} />
                      <Text style={[styles.cnicPickBtnText, { color: colors.brand }]}>Camera</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Back Side */}
                <View style={[styles.cnicUploadCard, { borderColor: cnicBack ? colors.brand : "#D1D5DB" }]}>
                  <Text style={styles.cnicUploadLabel}>Back Side</Text>
                  {cnicBack ? (
                    <Image source={{ uri: cnicBack }} style={styles.cnicPreview} />
                  ) : (
                    <View style={styles.cnicPlaceholder}>
                      <FontAwesome5 name="id-card" size={24} color="#9CA3AF" />
                      <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>Optional</Text>
                    </View>
                  )}
                  <View style={styles.cnicBtnRow}>
                    <TouchableOpacity onPress={() => pickCnicImage("back")} style={[styles.cnicPickBtn, { backgroundColor: colors.brand + "15" }]}>
                      <Ionicons name="image-outline" size={14} color={colors.brand} />
                      <Text style={[styles.cnicPickBtnText, { color: colors.brand }]}>Gallery</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => takeCnicPhoto("back")} style={[styles.cnicPickBtn, { backgroundColor: colors.brand + "15" }]}>
                      <Ionicons name="camera-outline" size={14} color={colors.brand} />
                      <Text style={[styles.cnicPickBtnText, { color: colors.brand }]}>Camera</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Extract Button */}
              <TouchableOpacity
                onPress={handleCnicExtract}
                style={[
                  styles.cnicExtractBtn,
                  { backgroundColor: colors.brand },
                  (ocrLoading || !cnicFront) && { opacity: 0.5 },
                ]}
                disabled={ocrLoading || !cnicFront}
                activeOpacity={0.85}
              >
                {ocrLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <FontAwesome5 name="magic" size={14} color="#fff" />
                    <Text style={styles.cnicExtractBtnText}>Extract & Auto-Fill</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* OCR Loading Indicator */}
              {ocrLoading && (
                <View style={styles.ocrProcessing}>
                  <ActivityIndicator color={colors.brand} size="small" />
                  <Text style={styles.ocrProcessingText}>
                    {ocrStatus || "Processing..."}
                  </Text>
                </View>
              )}

              {/* OCR Error */}
              {ocrError && (
                <View style={styles.ocrErrorCard}>
                  <Ionicons name="alert-circle" size={16} color="#EF4444" />
                  <Text style={styles.ocrErrorText}>{ocrError}</Text>
                </View>
              )}

              {/* Encryption Note */}
              <View style={styles.ocrEncryptNote}>
                <Ionicons name="lock-closed" size={12} color="#9CA3AF" />
                <Text style={styles.ocrEncryptText}>
                  All CNIC data is encrypted with AES-256 before storage
                </Text>
              </View>
            </View>
          )}

          {/* ═══ PROFILE FORM FIELDS ═══ */}
          {[
            { label: "Name", value: name, setter: setName },
            { label: "Father Name", value: fatherName, setter: setFatherName },
            { label: "Address", value: address, setter: setAddress },
            { label: "Contact Number", value: contactNumber, setter: (t) => { const v = formatPhoneInput(t); setContactNumber(v); setContactErr(v && !isValidPkPhone(v) ? "Enter a valid PK mobile number (03XXXXXXXXX or +923XXXXXXXXX)" : ""); }, keyboard: "phone-pad" },
            { label: "City", value: city, setter: setCity },
            { label: "CNIC Number", value: cnicNumber, setter: setCnicNumber, keyboard: "numeric" },
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

          {/* Gender Select */}
          <Text style={[styles.label, { color: colors.text }]}>Gender</Text>
          <View style={[styles.selectWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Picker selectedValue={gender} onValueChange={(val) => setGender(val)} dropdownIconColor={colors.text} style={{ color: colors.text }}>
              <Picker.Item label="Select Gender" value="" color={colors.textSecondary} />
              <Picker.Item label="Male" value="Male" color={colors.text} />
              <Picker.Item label="Female" value="Female" color={colors.text} />
              <Picker.Item label="Other" value="Other" color={colors.text} />
            </Picker>
          </View>

          {/* Upload Profile Picture */}
          <View>
            <Text style={[styles.label, { color: colors.text }]}>Profile Picture</Text>
            <ThemedButton label="Upload Profile Picture" onPress={() => pickImage(setProfilePicture)} />
            {profilePicture ? <Image source={{ uri: profilePicture }} style={styles.preview} /> : null}
          </View>

          <View style={{ marginTop: 24 }}>
            <ThemedButton label="Save Profile" onPress={saveProfile} />
          </View>
        </View>
      </ScrollView>

      <SuccessModal
        visible={successVisible}
        title="Profile saved successfully!"
        onClose={() => {
          setSuccessVisible(false);
          navigation.reset({
            index: 0,
            routes: [{ name: "UserAuthWrapper" }],
          });
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { height: 180, paddingHorizontal: 24, paddingTop: 50, justifyContent: "flex-end", paddingBottom: 20 },
  backBtnHero: { position: "absolute", top: 48, left: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  heroTitle: { color: "#FFFFFF", fontSize: 26, fontWeight: "900" },
  panel: { flex: 1, marginTop: -10, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40 },
  label: { fontWeight: "700", marginTop: 16, marginBottom: 4 },
  preview: { width: 120, height: 120, marginTop: 12, borderRadius: 12, borderWidth: 2, borderColor: "#E5E7EB" },
  selectWrapper: { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 12, overflow: "hidden", backgroundColor: "#fff", marginTop: 4 },
  errorText: { color: "#DC2626", marginTop: 4, fontSize: 13, fontWeight: "500" },

  // ── CNIC Card Styles ──
  cnicCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 4,
  },
  cnicCardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  cnicIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cnicCardTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  cnicCardSub: {
    fontSize: 12,
    marginTop: 2,
  },
  cnicCardBody: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    padding: 14,
    marginBottom: 12,
    marginTop: -4,
  },
  cnicUploadRow: {
    flexDirection: "row",
    gap: 10,
  },
  cnicUploadCard: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    backgroundColor: "#FAFAFA",
  },
  cnicUploadLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 6,
  },
  cnicPreview: {
    width: "100%",
    height: 80,
    borderRadius: 8,
    resizeMode: "cover",
  },
  cnicPlaceholder: {
    width: "100%",
    height: 80,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  cnicBtnRow: {
    flexDirection: "row",
    gap: 4,
    marginTop: 6,
    width: "100%",
  },
  cnicPickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 6,
    borderRadius: 6,
  },
  cnicPickBtnText: {
    fontSize: 11,
    fontWeight: "600",
  },
  cnicExtractBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cnicExtractBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  ocrProcessing: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
    paddingVertical: 8,
  },
  ocrProcessingText: {
    fontSize: 12,
    color: "#6B7280",
  },
  ocrErrorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    padding: 10,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
  },
  ocrErrorText: {
    color: "#EF4444",
    fontSize: 12,
    flex: 1,
  },
  ocrEncryptNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
    justifyContent: "center",
  },
  ocrEncryptText: {
    fontSize: 10,
    color: "#9CA3AF",
  },
});
