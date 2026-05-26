import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { Alert, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import ThemedButton from "../../components/ui/ThemedButton";
import ThemedInput from "../../components/ui/ThemedInput";
import storageService from "../../services/storageService";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";

export default function ApplyLoanScreen({ navigation }) {
  const { colors } = useTheme();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [showUploadPrompt, setShowUploadPrompt] = useState(false);
  const [docStatus, setDocStatus] = useState({ hasCNIC: false, hasRef: false, hasBank: false });
  const [uploading, setUploading] = useState(false);

  const USERS_URL = "https://com1-e2378-default-rtdb.firebaseio.com/users";

  const getCurrentUserId = async () => {
    const parsed = await storageService.getUserData();
    if (!parsed) return null;
    return parsed.userId || parsed.uid || null;
  };

  const hasVerificationDocs = async (userId) => {
    try {
      const profile = await userService.getProfileRTDB(userId);
      return !!(profile?.cnic && profile?.referenceCnic && profile?.bankStatement);
    } catch {
      return false;
    }
  };

  const refreshDocStatus = async (uid) => {
    try {
      const profile = await userService.getProfileRTDB(uid);
      setDocStatus({
        hasCNIC: !!profile?.cnic,
        hasRef: !!profile?.referenceCnic,
        hasBank: !!profile?.bankStatement,
      });
    } catch {
      setDocStatus({ hasCNIC: false, hasRef: false, hasBank: false });
    }
  };

  const uploadCNIC = async () => {
    try {
      setUploading(true);
      const uid = await getCurrentUserId();
      if (!uid) { Alert.alert("Error", "Sign in required"); setUploading(false); return; }
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert("Permission required", "Camera roll permission is required!"); setUploading(false); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.85,
      });
      if (result?.canceled || !result?.assets?.length) { setUploading(false); return; }
      const picked = result.assets[0].uri;
      await userService.updateProfileRTDB(uid, { cnic: picked });
      setDocStatus((s) => ({ ...s, hasCNIC: true }));
    } catch {
      Alert.alert("Error", "Failed to upload CNIC");
    } finally {
      setUploading(false);
    }
  };

  const uploadReferenceCnic = async () => {
    try {
      setUploading(true);
      const uid = await getCurrentUserId();
      if (!uid) { Alert.alert("Error", "Sign in required"); setUploading(false); return; }
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert("Permission required", "Camera roll permission is required!"); setUploading(false); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.85,
      });
      if (result?.canceled || !result?.assets?.length) { setUploading(false); return; }
      const picked = result.assets[0].uri;
      await userService.updateProfileRTDB(uid, { referenceCnic: picked });
      setDocStatus((s) => ({ ...s, hasRef: true }));
    } catch {
      Alert.alert("Error", "Failed to upload Reference CNIC");
    } finally {
      setUploading(false);
    }
  };

  const uploadBankStatement = async () => {
    try {
      setUploading(true);
      const uid = await getCurrentUserId();
      if (!uid) {
        Alert.alert("Error", "Sign in required");
        setUploading(false);
        return;
      }
      const res = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
        multiple: false,
      });
      let uri = null;
      let fileName = null;
      if (res?.assets?.length && !res?.canceled) {
        uri = res.assets[0].uri;
        fileName = res.assets[0].name || "";
      } else if (res?.type === "success" && res?.uri) {
        uri = res.uri;
        fileName = res.name || "";
      }
      if (!uri) {
        setUploading(false);
        return;
      }

      // Validate PDF extension
      const ext = (fileName || uri || "").split(".").pop()?.toLowerCase();
      if (ext !== "pdf") {
        Alert.alert("Invalid File", "Only PDF files are accepted for bank statements.");
        setUploading(false);
        return;
      }

      let saveUri = uri;
      if (Platform.OS !== "web") {
        const path = `kyc/${uid}/bank-${Date.now()}.pdf`;
        const remote = await userService.uploadFileToStorage(uri, path, "application/pdf");
        saveUri = remote || uri;
      }

      await userService.updateProfileRTDB(uid, { bankStatement: saveUri });
      setDocStatus((s) => ({ ...s, hasBank: true }));

      // Try OCR validation (non-blocking)
      try {
        const apiClient = require("../../services/apiClient").default;
        const formData = new FormData();
        formData.append("userId", uid);
        formData.append("bankStatement", { uri, name: fileName || `bank-${Date.now()}.pdf`, type: "application/pdf" });
        const ocrResult = await apiClient.backendUpload("/ocr/bank-statement", formData);
        if (ocrResult?.success) {
          const matchStatus = ocrResult.matched === true ? "✅ Name Verified" : ocrResult.matched === false ? "⚠️ Name Mismatch" : "ℹ️ Verification Skipped";
          Alert.alert("Bank Statement", `Upload successful!\n\n${matchStatus}${ocrResult.extractedName ? `\nExtracted: ${ocrResult.extractedName}` : ""}${ocrResult.bankName ? `\nBank: ${ocrResult.bankName}` : ""}`);
        }
      } catch (ocrErr) {
        console.warn("[ApplyLoan] Bank OCR validation skipped:", ocrErr.message);
      }
    } catch {
      Alert.alert("Error", "Failed to upload Bank Statement");
    } finally {
      setUploading(false);
    }
  };

  const performSubmit = async (uid) => {
    try {
      setLoading(true);
      const trackingNumber = Number(String(Date.now()).slice(-8));
      await userService.createLoanApplication(uid, {
        amount: Number(amount),
        reason,
        trackingNumber,
      });
      Alert.alert("Success", `Submitted successfully\nTracking ID: ${trackingNumber}`, [{ text: "OK" }]);
      setAmount("");
      setReason("");
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      Alert.alert("Error", "Enter a valid amount");
      return;
    }
    if (!reason.trim()) {
      Alert.alert("Error", "Enter a reason");
      return;
    }
    let uid = null;
    try {
      const parsed = await storageService.getUserData();
      if (parsed) {
        uid = parsed.userId || parsed.uid;
      }
    } catch { }
    if (!uid) {
      Alert.alert("Error", "Sign in required");
      return;
    }
    // Verify docs before submit
    const verified = await hasVerificationDocs(uid);
    if (!verified) {
      await refreshDocStatus(uid);
      setShowUploadPrompt(true);
      return;
    }
    await performSubmit(uid);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.brand }]}>Apply for Loan</Text>
      <ThemedInput
        label="Amount"
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
        placeholder="Enter amount"
        inputStyle={{ marginBottom: 12 }}
      />
      <ThemedInput
        label="Reason"
        multiline
        value={reason}
        onChangeText={setReason}
        placeholder="Enter reason"
        inputStyle={{ height: 100, textAlignVertical: "top", marginBottom: 12 }}
      />
      <ThemedButton
        label={loading ? "Submitting..." : "Submit Request"}
        onPress={submit}
        loading={loading}
        style={styles.button}
      />
      <Modal visible={showUploadPrompt} transparent animationType="fade" onRequestClose={() => setShowUploadPrompt(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Verification Required</Text>
            <Text style={[styles.modalText, { color: colors.textSecondary }]}>
              Please upload your CNIC (image), Reference CNIC (image), and Bank Statement (PDF) to proceed with loan.
            </Text>
            <Text style={{ marginTop: 8, color: colors.textSecondary }}>
              CNIC: {docStatus.hasCNIC ? "Uploaded" : "Not uploaded"} | Ref CNIC: {docStatus.hasRef ? "Uploaded" : "Not uploaded"} | Bank: {docStatus.hasBank ? "Uploaded" : "Not uploaded"}
            </Text>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.brand }, uploading && { opacity: 0.6 }]} onPress={uploadCNIC} disabled={uploading}>
              <Text style={styles.actionBtnText}>{uploading ? "Uploading..." : "Upload CNIC"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtnOutline, { borderColor: colors.brand }, uploading && { opacity: 0.6 }]} onPress={uploadReferenceCnic} disabled={uploading}>
              <Text style={[styles.actionBtnOutlineText, { color: colors.brand }]}>{uploading ? "Uploading..." : "Upload Reference CNIC"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtnOutline, { borderColor: colors.brand }, uploading && { opacity: 0.6 }]} onPress={uploadBankStatement} disabled={uploading}>
              <Text style={[styles.actionBtnOutlineText, { color: colors.brand }]}>{uploading ? "Uploading..." : "Upload Bank Statement"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                const uidNow = await getCurrentUserId();
                if (!uidNow) {
                  Alert.alert("Error", "Sign in required");
                  return;
                }
                const ok = await hasVerificationDocs(uidNow);
                if (!ok) {
                  Alert.alert("Required", "Upload CNIC, Reference CNIC and Bank Statement to continue.");
                  return;
                }
                setShowUploadPrompt(false);
                await performSubmit(uidNow);
              }}
              style={[styles.actionBtn, { backgroundColor: "#4CAF50", opacity: docStatus.hasCNIC && docStatus.hasRef && docStatus.hasBank ? 1 : 0.6 }]}
              disabled={!(docStatus.hasCNIC && docStatus.hasRef && docStatus.hasBank)}
            >
              <Text style={styles.actionBtnText}>Proceed</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowUploadPrompt(false)} style={styles.cancelLink}>
              <Text style={{ color: colors.brand, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 15 },
  label: { fontWeight: "bold", marginTop: 10 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, backgroundColor: "#fff", marginTop: 6 },
  button: { padding: 14, borderRadius: 10, alignItems: "center", marginTop: 16 },
  buttonText: { color: "#fff", fontWeight: "bold" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 6 },
  modalText: {},
  actionBtn: {
    marginTop: 14,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  actionBtnText: { color: "#fff", fontWeight: "bold" },
  actionBtnOutline: {
    marginTop: 10,
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  actionBtnOutlineText: { fontWeight: "bold" },
  cancelLink: { marginTop: 10, alignItems: "center" },
});
