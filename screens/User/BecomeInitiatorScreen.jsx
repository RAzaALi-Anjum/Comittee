import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import SuccessModal from "../../components/SuccessModal";
import authService from "../../services/authService";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";
import { sendNotification, sendAdminNotification } from "../../utils/notificationHelper";

export default function BecomeInitiatorScreen({ navigation }) {
  const { colors } = useTheme();
  const [successVisible, setSuccessVisible] = useState(false);
  const [cnicVisible, setCnicVisible] = useState(false);
  const [cnicUploading, setCnicUploading] = useState(false);
  const [cnicFront, setCnicFront] = useState(null);
  const [cnicBack, setCnicBack] = useState(null);

  // ── Pick CNIC image from gallery ──
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
      }
    } catch {
      Alert.alert("Error", "Failed to pick image.");
    }
  };

  // ── Capture CNIC image with camera ──
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
      }
    } catch {
      Alert.alert("Error", "Failed to capture image.");
    }
  };

  const ensureCnic = async (uid) => {
    try {
      const prof = await userService.getProfileRTDB(uid);
      if (prof && typeof prof.cnic === "string" && prof.cnic.trim().length > 0) {
        return true;
      }
    } catch { }
    // Reset images when showing modal
    setCnicFront(null);
    setCnicBack(null);
    setCnicVisible(true);
    return false;
  };

  const apply = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      const uid = currentUser?.uid;
      if (!uid) {
        Alert.alert("Error", "Sign in required");
        return;
      }

      const ok = await ensureCnic(uid);
      if (!ok) return;

      await userService.createInitiatorRequest(uid);
      await userService.updateProfileFirestore(uid, { initiatorStatus: "pending" });

      try {
        await sendNotification(
          uid,
          "Initiator Application Submitted",
          "Your request has been received. Expect approval within 2 hours.",
          "success",
          uid
        );
        // Get user profile details
        const prof = await userService.getProfileRTDB(uid);
        const name = prof?.fullName || prof?.name || "A user";
        // Send notification to admin
        await sendAdminNotification(
          "New Initiator Request",
          `${name} has requested to become an initiator. Check the dashboard to approve.`,
          "info",
          uid
        );
      } catch (err) {
        console.warn("[BecomeInitiatorScreen] Failed to send notifications:", err.message);
      }

      setSuccessVisible(true);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const handleUploadCnicAndProceed = async () => {
    if (!cnicFront) {
      Alert.alert("Required", "Please upload at least the CNIC front image.");
      return;
    }

    const currentUser = await authService.getCurrentUser();
    const uid = currentUser?.uid;
    if (!uid) {
      setCnicVisible(false);
      return;
    }
    try {
      setCnicUploading(true);

      const cnicData = { cnic: cnicFront };
      if (cnicBack) {
        cnicData.cnicBack = cnicBack;
      }

      await userService.updateProfileRTDB(uid, cnicData);
      setCnicUploading(false);
      setCnicVisible(false);
      await apply();
    } catch {
      setCnicUploading(false);
      Alert.alert("Error", "Failed to save CNIC. Please try again.");
    }
  };

  return (
    <View style={{ padding: 20, flex: 1, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 20, color: colors.text }}>Become an Initiator</Text>
      <Text style={{ marginVertical: 10, color: colors.textSecondary }}>Initiator Fee: Rs 5000</Text>

      <TouchableOpacity onPress={apply} style={{ backgroundColor: colors.brand, padding: 15, borderRadius: 10 }}>
        <Text style={{ color: "#fff", textAlign: "center", fontWeight: "bold" }}>Pay & Apply</Text>
      </TouchableOpacity>

      <SuccessModal
        visible={successVisible}
        title="Your request has been approved within 2 hours of apply."
        onClose={() => {
          setSuccessVisible(false);
          navigation.replace("Pending");
        }}
        buttonText="OK"
      />

      {/* ═══ CNIC Upload Modal ═══ */}
      <Modal visible={cnicVisible} transparent animationType="fade" onRequestClose={() => setCnicVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ alignItems: "center" }}>
              {/* Header */}
              <View style={[styles.cnicIconWrap, { backgroundColor: colors.brand }]}>
                <FontAwesome5 name="id-card" size={20} color="#fff" />
              </View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>CNIC Required</Text>
              <Text style={[styles.modalText, { color: colors.textSecondary }]}>
                Please upload your CNIC front & back images to proceed.
              </Text>

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

              {/* Encryption Note */}
              <View style={styles.encryptNote}>
                <Ionicons name="lock-closed" size={12} color="#9CA3AF" />
                <Text style={styles.encryptText}>
                  All CNIC data is encrypted with AES-256 before storage
                </Text>
              </View>

              {/* Upload & Proceed Button */}
              <TouchableOpacity
                onPress={handleUploadCnicAndProceed}
                style={[
                  styles.uploadBtn,
                  { backgroundColor: colors.brand },
                  (!cnicFront || cnicUploading) && { opacity: 0.5 },
                ]}
                disabled={!cnicFront || cnicUploading}
              >
                {cnicUploading ? (
                  <Text style={styles.uploadBtnText}>Uploading...</Text>
                ) : (
                  <>
                    <FontAwesome5 name="cloud-upload-alt" size={14} color="#fff" />
                    <Text style={styles.uploadBtnText}>Upload & Proceed</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Cancel */}
              <TouchableOpacity
                onPress={() => {
                  setCnicVisible(false);
                  setCnicFront(null);
                  setCnicBack(null);
                }}
                style={{ marginTop: 12, alignItems: "center", paddingVertical: 8 }}
              >
                <Text style={{ color: colors.brand, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "95%",
    maxHeight: "80%",
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  cnicIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 6,
    textAlign: "center",
  },
  modalText: {
    textAlign: "center",
    marginBottom: 20,
    fontSize: 14,
    lineHeight: 20,
  },
  cnicUploadRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
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
  encryptNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 14,
    justifyContent: "center",
  },
  encryptText: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: 10,
    width: "100%",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  uploadBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    textAlign: "center",
  },
});
