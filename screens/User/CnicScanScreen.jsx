import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import apiClient from "../../services/apiClient";
import { useTheme } from "../../theme/ThemeProvider";
import { triangulateGranularRegion } from "../../utils/cnicRegionUtil";

// ML service base URL is resolved dynamically from apiClient

const CHAIN_COLORS = {
  confirmed: "#22C55E",
  pending:   "#F59E0B",
  failed:    "#EF4444",
};

const BADGE_STATES = {
  idle:       { label: "—",               color: "#94A3B8" },
  checking:   { label: "Checking\u2026",   color: CHAIN_COLORS.pending },
  scanning:   { label: "Scanning\u2026",   color: CHAIN_COLORS.pending },
  verified:   { label: "\u2713 NADRA Verified",  color: CHAIN_COLORS.confirmed },
  blocked:    { label: "\u2717 Blocked",    color: CHAIN_COLORS.failed },
  genuine:    { label: "\u2713 Genuine",    color: CHAIN_COLORS.confirmed },
  suspicious: { label: "\u26a0 Suspicious",color: CHAIN_COLORS.failed },
};

export default function CnicScanScreen({ navigation }) {
  const { colors } = useTheme();
  const [frontImage, setFrontImage] = useState(null);
  const [backImage, setBackImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState(null);
  const [nadraStatus, setNadraStatus] = useState("idle");   // idle|checking|verified|blocked
  const [mlVerdict,   setMlVerdict]   = useState("idle");   // idle|scanning|genuine|suspicious
  const [mlConfidence, setMlConfidence] = useState(null);

  const pickImage = async (side) => {
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
        if (side === "front") setFrontImage(result.assets[0].uri);
        else setBackImage(result.assets[0].uri);
      }
    } catch {
      Alert.alert("Error", "Failed to pick image.");
    }
  };

  const takePhoto = async (side) => {
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
        if (side === "front") setFrontImage(result.assets[0].uri);
        else setBackImage(result.assets[0].uri);
      }
    } catch {
      Alert.alert("Error", "Failed to capture image.");
    }
  };

  // ── NADRA Mock DB query ────────────────────────────────
  const queryNadra = async (cnicStr) => {
    const clean = cnicStr.replace(/\D/g, "");
    if (clean.length !== 13) { setNadraStatus("blocked"); return false; }
    setNadraStatus("checking");
    try {
      const snap = await getDoc(doc(db, "NADRA_Mock_DB", clean));
      if (snap.exists() && snap.data().isActive === true) {
        setNadraStatus("verified"); return true;
      } else {
        setNadraStatus("blocked");  return false;
      }
    } catch (e) {
      console.warn("[CNIC] NADRA query failed:", e.message);
      setNadraStatus("blocked"); return false;
    }
  };

  // ── ML /verify-cnic call ───────────────────────────────
  const callVerifyCnic = async (imageUri) => {
    setMlVerdict("scanning");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const form = new FormData();
      form.append("file", { uri: imageUri, name: "cnic.jpg", type: "image/jpeg" });
      const resp = await fetch(`${apiClient.getMlBaseUrl()}/verify-cnic`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      setMlVerdict(json.verdict === "genuine" ? "genuine" : "suspicious");
      setMlConfidence(json.confidence);
    } catch (e) {
      clearTimeout(timeoutId);
      console.warn("[CNIC] ML verify failed:", e.message);
      setMlVerdict("suspicious");
    }
  };

  const handleExtract = async () => {
    if (!frontImage) {
      Alert.alert("Required", "Please upload at least the CNIC front image.");
      return;
    }
    setLoading(true);
    setError(null);
    setExtractedData(null);
    setNadraStatus("idle");
    setMlVerdict("idle");
    try {
      const formData = new FormData();
      formData.append("cnicImage", { uri: frontImage, name: "cnic-front.jpg", type: "image/jpeg" });
      if (backImage) formData.append("cnicImage", { uri: backImage, name: "cnic-back.jpg", type: "image/jpeg" });
      const result = await apiClient.backendUpload("/ocr/cnic", formData);
      if (result?.success && result?.data) {
        const ocrData = { ...result.data };
        if (ocrData.cnic_number) {
          ocrData.region = triangulateGranularRegion(ocrData.cnic_number);
          try { await apiClient.backendPost("/profile/update", { region: ocrData.region }); }
          catch (profileUpdateError) { console.warn("Failed to update user profile region:", profileUpdateError); }

          // ── NADRA check ──
          const nadraOk = await queryNadra(ocrData.cnic_number);
          if (!nadraOk) {
            setError("CNIC verification failed. Registration blocked.");
            setExtractedData(ocrData);
            setLoading(false);
            // Still run ML verdict for display
            callVerifyCnic(frontImage);
            return;
          }
        }
        // ── ML tamper check (non-blocking) ──
        callVerifyCnic(frontImage);
        setExtractedData(ocrData);
      } else {
        setError(result?.error || "Failed to extract CNIC data.");
      }
    } catch (err) {
      setError(err.message || "OCR processing failed.");
    } finally {
      setLoading(false);
    }
  };

  const renderField = (label, value) => (
    <View style={styles.fieldRow} key={label}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: value ? colors.text : "#aaa" }]}>
        {value || "Not detected"}
      </Text>
    </View>
  );

  const FIELDS = [
    ["Full Name", "full_name"],
    ["Father Name", "father_name"],
    ["CNIC Number", "cnic_number"],
    ["Date of Birth", "date_of_birth"],
    ["Date of Issue", "date_of_issue"],
    ["Date of Expiry", "date_of_expiry"],
    ["Gender", "gender"],
    ["Address", "address"],
    ["Region", "region"],
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: colors.brand }]}>
        <View style={styles.heroBlobA} />
        <View style={styles.heroBlobB} />
        <FontAwesome5 name="id-card" size={34} color="rgba(255,255,255,0.9)" />
        <Text style={styles.heroTitle}>CNIC Scanner</Text>
        <Text style={styles.heroSub}>Upload front & back of your CNIC card</Text>
      </View>

      {/* Upload Cards */}
      <View style={styles.uploadRow}>
        {/* Front */}
        <View style={[styles.uploadCard, { backgroundColor: colors.card, borderColor: frontImage ? colors.brand : colors.border }]}>
          <Text style={[styles.uploadLabel, { color: colors.text }]}>Front Side</Text>
          {frontImage ? (
            <Image source={{ uri: frontImage }} style={styles.preview} />
          ) : (
            <View style={[styles.placeholder, { backgroundColor: colors.background }]}>
              <FontAwesome5 name="id-card" size={30} color={colors.textSecondary} />
            </View>
          )}
          <View style={styles.btnRow}>
            <TouchableOpacity onPress={() => pickImage("front")} style={[styles.pickBtn, { backgroundColor: colors.brand + "15" }]}>
              <Ionicons name="image-outline" size={16} color={colors.brand} />
              <Text style={[styles.pickBtnText, { color: colors.brand }]}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => takePhoto("front")} style={[styles.pickBtn, { backgroundColor: colors.brand + "15" }]}>
              <Ionicons name="camera-outline" size={16} color={colors.brand} />
              <Text style={[styles.pickBtnText, { color: colors.brand }]}>Camera</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Back */}
        <View style={[styles.uploadCard, { backgroundColor: colors.card, borderColor: backImage ? colors.brand : colors.border }]}>
          <Text style={[styles.uploadLabel, { color: colors.text }]}>Back Side</Text>
          {backImage ? (
            <Image source={{ uri: backImage }} style={styles.preview} />
          ) : (
            <View style={[styles.placeholder, { backgroundColor: colors.background }]}>
              <FontAwesome5 name="id-card" size={30} color={colors.textSecondary} />
              <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 4 }}>Optional</Text>
            </View>
          )}
          <View style={styles.btnRow}>
            <TouchableOpacity onPress={() => pickImage("back")} style={[styles.pickBtn, { backgroundColor: colors.brand + "15" }]}>
              <Ionicons name="image-outline" size={16} color={colors.brand} />
              <Text style={[styles.pickBtnText, { color: colors.brand }]}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => takePhoto("back")} style={[styles.pickBtn, { backgroundColor: colors.brand + "15" }]}>
              <Ionicons name="camera-outline" size={16} color={colors.brand} />
              <Text style={[styles.pickBtnText, { color: colors.brand }]}>Camera</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Extract Button */}
      <TouchableOpacity
        onPress={handleExtract}
        style={[styles.extractBtn, { backgroundColor: colors.brand }, loading && { opacity: 0.6 }]}
        disabled={loading || !frontImage}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <FontAwesome5 name="magic" size={16} color="#fff" />
            <Text style={styles.extractBtnText}>Extract CNIC Data</Text>
          </>
        )}
      </TouchableOpacity>

      {loading && (
        <View style={styles.processingCard}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={[styles.processingText, { color: colors.textSecondary }]}>
            Analyzing CNIC with AI... This may take a moment
          </Text>
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={[styles.errorCard, { backgroundColor: "#FEF2F2" }]}>
          <Ionicons name="alert-circle" size={20} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Results */}
      {extractedData && (
        <View style={[styles.resultCard, { backgroundColor: colors.card }]}>
          <View style={styles.resultHeader}>
            <FontAwesome5 name="check-circle" size={20} color="#10B981" />
            <Text style={[styles.resultTitle, { color: colors.text }]}>Extracted Data</Text>
          </View>

          {/* Side-by-side NADRA + ML badges */}
          <View style={styles.badgeRow}>
            {["nadra", "ml"].map((type) => {
              const key   = type === "nadra" ? nadraStatus : mlVerdict;
              const state = BADGE_STATES[key] || BADGE_STATES.idle;
              const label = type === "nadra"
                ? state.label
                : key === "genuine" || key === "suspicious"
                  ? `${state.label} ${mlConfidence ? `(${(mlConfidence * 100).toFixed(0)}%)` : ""}`
                  : state.label;
              return (
                <View
                  key={type}
                  style={[styles.statusBadge, { borderColor: state.color + "50", backgroundColor: state.color + "15" }]}
                >
                  {(key === "checking" || key === "scanning") && (
                    <ActivityIndicator size="small" color={state.color} style={{ marginRight: 4 }} />
                  )}
                  <Text style={[styles.statusBadgeText, { color: state.color }]}>{label}</Text>
                </View>
              );
            })}
          </View>

          <View style={[styles.resultDivider, { backgroundColor: colors.border }]} />
          {FIELDS.map(([label, key]) => renderField(label, extractedData[key]))}
          <View style={styles.encryptNote}>
            <Ionicons name="lock-closed" size={14} color={colors.textSecondary} />
            <Text style={[styles.encryptNoteText, { color: colors.textSecondary }]}>
              All data encrypted with AES-256 before storage
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: {
    height: 180, alignItems: "center", justifyContent: "center",
    borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
    overflow: "hidden", position: "relative",
  },
  heroBlobA: { position: "absolute", top: -30, right: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: "rgba(255,255,255,0.12)" },
  heroBlobB: { position: "absolute", bottom: -40, left: -30, width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(255,255,255,0.08)" },
  heroTitle: { color: "#fff", fontSize: 24, fontWeight: "900", marginTop: 8 },
  heroSub: { color: "rgba(255,255,255,0.8)", fontSize: 14, marginTop: 4 },

  uploadRow: { flexDirection: "row", paddingHorizontal: 12, marginTop: 16, gap: 10 },
  uploadCard: {
    flex: 1, borderRadius: 16, padding: 12, borderWidth: 2, alignItems: "center",
    elevation: 3, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8,
  },
  uploadLabel: { fontSize: 14, fontWeight: "700", marginBottom: 8 },
  preview: { width: "100%", height: 100, borderRadius: 10, resizeMode: "cover" },
  placeholder: { width: "100%", height: 100, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  btnRow: { flexDirection: "row", gap: 6, marginTop: 8, width: "100%" },
  pickBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: 8 },
  pickBtnText: { fontSize: 12, fontWeight: "600" },

  extractBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    marginHorizontal: 16, marginTop: 20, paddingVertical: 16, borderRadius: 14,
    elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8,
  },
  extractBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  processingCard: { alignItems: "center", marginTop: 20, paddingHorizontal: 20 },
  processingText: { marginTop: 10, fontSize: 14, textAlign: "center" },

  errorCard: { marginHorizontal: 16, marginTop: 16, padding: 14, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  errorText: { color: "#EF4444", fontSize: 14, flex: 1 },

  resultCard: {
    marginHorizontal: 16, marginTop: 20, borderRadius: 20, padding: 20,
    elevation: 4, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10,
  },
  resultHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  resultTitle:  { fontSize: 18, fontWeight: "800" },
  resultDivider:{ height: 1, marginVertical: 14 },
  badgeRow:     { flexDirection: "row", gap: 10, marginTop: 10, marginBottom: 4 },
  statusBadge:  { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1.5 },
  statusBadgeText: { fontSize: 12, fontWeight: "800" },
  fieldRow:    { marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: 2 },
  fieldValue: { fontSize: 16, fontWeight: "700" },
  encryptNote: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16 },
  encryptNoteText: { fontSize: 12, fontWeight: "500" },
});
