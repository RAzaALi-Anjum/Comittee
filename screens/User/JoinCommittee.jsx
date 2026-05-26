import { FontAwesome5 } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Alert, FlatList, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import SuccessModal from "../../components/SuccessModal";
import ThemedButton from "../../components/ui/ThemedButton";
import apiClient from "../../services/apiClient";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";
import { sendNotification } from "../../utils/notificationHelper";

export default function JoinCommittee({ navigation }) {
  const { colors } = useTheme();
  const [committees, setCommittees] = useState({});
  const [currentUserId, setCurrentUserId] = useState(null);
  const [successVisible, setSuccessVisible] = useState(false);
  const [showUploadPrompt, setShowUploadPrompt] = useState(false);
  const [pendingCommittee, setPendingCommittee] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [docStatus, setDocStatus] = useState({ hasCNIC: false, hasBank: false, hasRef: false });
  const [hasSavedGlobalDocs, setHasSavedGlobalDocs] = useState(false);
  const [cnicFrontUri, setCnicFrontUri] = useState(null);
  const [cnicBackUri, setCnicBackUri] = useState(null);
  const [bankOcrResult, setBankOcrResult] = useState(null);

  // Fetch approved AND active committees only
  const fetchApprovedCommittees = async () => {
    try {
      const data = await userService.getAllCommittees();
      if (!data) {
        setCommittees({});
        return;
      }

      // Filter: show committees that are Approved or Active
      const filtered = Object.fromEntries(
        Object.entries(data).filter(([key, val]) => {
          const status = String(val.status || "").toLowerCase();
          return status === "approved" || status === "active";
        })
      );

      // Initialize usersParticipated array if not present
      const initialized = Object.fromEntries(
        Object.entries(filtered).map(([key, val]) => {
          if (!val.usersParticipated) {
            val.usersParticipated = Array(val.members).fill(null);
          }
          return [key, val];
        })
      );

      setCommittees(initialized);
    } catch (err) {
      console.log("Fetch Error:", err);
    }
  };

  const getCurrentUserId = async () => {
    const stored = await AsyncStorage.getItem("userData");
    if (!stored) return null;
    const user = JSON.parse(stored);
    return user.userId || user.uid || null;
  };

  const hasVerificationDocs = async (userId, initiatorId) => {
    try {
      const kyc = await userService.getUserKycForInitiator(userId, initiatorId);
      return !!(kyc?.cnic && kyc?.bankStatement && kyc?.referenceCnic);
    } catch {
      return false;
    }
  };

  const doSubmitJoin = async (committeeId, initiatorId) => {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        Alert.alert("Error", "Sign in required");
        return;
      }
      const ok = await hasVerificationDocs(userId, initiatorId);
      if (!ok) {
        Alert.alert("Required", "Please upload CNIC, Reference CNIC, and Bank Statement to continue.");
        return;
      }

      const id = `REQ-${Date.now()}`;
      await userService.createParticipationRequest(id, {
        requestId: id,
        userId,
        committeeId,
        initiatorId,
        status: "Pending",
        createdAt: new Date().toISOString(),
        createdAtTs: Date.now(),
      });

      try {
        await sendNotification(
          userId,
          "Participation Request Submitted",
          "Your request has been submitted successfully and is awaiting approval.",
          "success",
          committeeId
        );
      } catch { }

      setSuccessVisible(true);
    } catch (err) {
      console.log("Error sending participation request:", err);
      Alert.alert("Error", "Failed to send request.");
    }
  };

  const handleJoin = async (committeeId, initiatorId) => {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        Alert.alert("Error", "Sign in required");
        return;
      }
      try {
        const [kyc, profile] = await Promise.all([
          userService.getUserKycForInitiator(userId, initiatorId),
          userService.getProfileRTDB(userId),
        ]);
        setDocStatus({
          hasCNIC: !!kyc?.cnic,
          hasBank: !!kyc?.bankStatement,
          hasRef: !!kyc?.referenceCnic,
        });
        setHasSavedGlobalDocs(!!(profile?.cnic && profile?.bankStatement && profile?.referenceCnic));
      } catch {
        setDocStatus({ hasCNIC: false, hasBank: false, hasRef: false });
        setHasSavedGlobalDocs(false);
      }
      setPendingCommittee({ id: committeeId, createdBy: initiatorId });
      setShowUploadPrompt(true);
    } catch (err) {
      Alert.alert("Error", "Failed to start join request.");
    }
  };

  // ── CNIC Upload: Front/Back Side Picker ──────────────────
  const pickCnicSide = async (side, source) => {
    try {
      setUploading(true);
      const userId = await getCurrentUserId();
      if (!userId) { Alert.alert("Error", "Sign in required"); setUploading(false); return; }
      const initiatorId = pendingCommittee?.createdBy;
      let asset = null;

      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert("Permission required", "Camera access is required!"); setUploading(false); return; }
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.85 });
        if (!result || result.canceled || !result.assets?.length) { setUploading(false); return; }
        asset = result.assets[0];
      } else {
        if (Platform.OS === "web") {
          const res = await DocumentPicker.getDocumentAsync({ type: ["image/*"], multiple: false, copyToCacheDirectory: true });
          if (!res || res.canceled || (!res.assets?.length && res.type !== "success")) { setUploading(false); return; }
          asset = res.assets?.[0] || { uri: res.uri, mimeType: res.mimeType || "image/png", name: res.name || "image.png" };
        } else {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) { Alert.alert("Permission required", "Camera roll permission is required!"); setUploading(false); return; }
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.85 });
          if (!result || result.canceled || !result.assets?.length) { setUploading(false); return; }
          asset = result.assets[0];
        }
      }

      const uri = asset.uri;
      const ctGuess = asset.mimeType || (uri?.toLowerCase?.().endsWith(".png") ? "image/png" : "image/jpeg");
      let saveUri = uri;
      if (Platform.OS !== "web") {
        const storagePath = `kyc/${userId}/cnic-${side}-${Date.now()}.${ctGuess.includes("png") ? "png" : "jpg"}`;
        const remote = await userService.uploadFileToStorage(uri, storagePath, ctGuess);
        saveUri = remote || uri;
      }

      if (side === "front") setCnicFrontUri(saveUri);
      else setCnicBackUri(saveUri);

      const cnicData = { updatedAt: new Date().toISOString() };
      if (side === "front") { cnicData.cnic = saveUri; cnicData.cnicFront = saveUri; }
      else { cnicData.cnicBack = saveUri; }
      await userService.updateUserKycForInitiator(userId, initiatorId, cnicData);
      await userService.updateProfileRTDB(userId, cnicData);
      if (side === "front" || cnicFrontUri) setDocStatus((s) => ({ ...s, hasCNIC: true }));
      Alert.alert("Success", `CNIC ${side} side uploaded!`);
    } catch (err) {
      console.error("CNIC upload error:", err);
      Alert.alert("Error", "Failed to upload CNIC image");
    } finally {
      setUploading(false);
    }
  };

  const uploadCNIC = () => {
    Alert.alert("Upload CNIC", "Select which side to upload:", [
      { text: "📷 Front Side (Camera)", onPress: () => pickCnicSide("front", "camera") },
      { text: "🖼 Front Side (Gallery)", onPress: () => pickCnicSide("front", "gallery") },
      { text: "📷 Back Side (Camera)", onPress: () => pickCnicSide("back", "camera") },
      { text: "🖼 Back Side (Gallery)", onPress: () => pickCnicSide("back", "gallery") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  // ── Reference CNIC Upload ────────────────────────────────
  const uploadReferenceCnic = async () => {
    try {
      setUploading(true);
      const userId = await getCurrentUserId();
      if (!userId) { Alert.alert("Error", "Sign in required"); setUploading(false); return; }
      const initiatorId = pendingCommittee?.createdBy;

      if (Platform.OS === "web") {
        const res = await DocumentPicker.getDocumentAsync({ type: ["image/*"], multiple: false, copyToCacheDirectory: true });
        if (!res || res.canceled || (!res.assets?.length && res.type !== "success")) { setUploading(false); return; }
        const asset = res.assets?.[0] || { uri: res.uri, mimeType: res.mimeType || "image/png", name: res.name || "image.png" };
        const saveUri = asset.uri;
        await userService.updateUserKycForInitiator(userId, initiatorId, { referenceCnic: saveUri, updatedAt: new Date().toISOString() });
        await userService.updateProfileRTDB(userId, { referenceCnic: saveUri, updatedAt: new Date().toISOString() });
        setDocStatus((s) => ({ ...s, hasRef: true }));
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert("Permission required", "Camera roll permission is required!"); setUploading(false); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.85 });
        if (!result || result.canceled || !result.assets?.length) { setUploading(false); return; }
        const uri = result.assets[0].uri;
        const ctGuess = result.assets[0].mimeType || "image/jpeg";
        let saveUri = uri;
        const path = `kyc/${userId}/ref-cnic-${Date.now()}.${ctGuess.includes("png") ? "png" : "jpg"}`;
        const remote = await userService.uploadFileToStorage(uri, path, ctGuess);
        saveUri = remote || uri;
        await userService.updateUserKycForInitiator(userId, initiatorId, { referenceCnic: saveUri, updatedAt: new Date().toISOString() });
        await userService.updateProfileRTDB(userId, { referenceCnic: saveUri, updatedAt: new Date().toISOString() });
        setDocStatus((s) => ({ ...s, hasRef: true }));
      }
    } catch {
      Alert.alert("Error", "Failed to upload Reference CNIC");
    } finally {
      setUploading(false);
    }
  };

  // ── Bank Statement Upload (PDF only + OCR validation) ────
  const uploadBankStatement = async () => {
    try {
      setUploading(true);
      const userId = await getCurrentUserId();
      if (!userId) { Alert.alert("Error", "Sign in required"); setUploading(false); return; }
      const initiatorId = pendingCommittee?.createdBy;

      const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true, multiple: false });
      let uri = null;
      let fileName = null;
      if (res?.assets?.length && !res.canceled) {
        uri = res.assets[0].uri;
        fileName = res.assets[0].name || "";
      } else if (res?.type === "success" && res?.uri) {
        uri = res.uri;
        fileName = res.name || "";
      }
      if (!uri) { setUploading(false); return; }

      // Validate PDF extension
      const ext = (fileName || uri || "").split(".").pop()?.toLowerCase();
      if (ext !== "pdf") {
        Alert.alert("Invalid File", "Only PDF files are accepted for bank statements.");
        setUploading(false);
        return;
      }

      // Try OCR validation first (before uploading/saving to DB)
      let ocrResult = null;
      try {
        const formData = new FormData();
        formData.append("userId", userId);
        if (Platform.OS === "web") {
          const response = await fetch(uri);
          const fileBlob = await response.blob();
          formData.append("bankStatement", fileBlob, fileName || "bank-statement.pdf");
        } else {
          formData.append("bankStatement", { uri, name: fileName || `bank-${Date.now()}.pdf`, type: "application/pdf" });
        }
        ocrResult = await apiClient.backendUpload("/ocr/bank-statement", formData);
        
        if (ocrResult?.matched === false) {
          Alert.alert("Invalid Document", "Account holder name does not match your ID card.");
          setUploading(false);
          return;
        }
      } catch (ocrErr) {
        console.warn("[JoinCommittee] Bank OCR validation skipped:", ocrErr.message);
      }

      let saveUri = uri;
      try {
        const path = `kyc/${userId}/bank-${Date.now()}.pdf`;
        const remote = await userService.uploadFileToStorage(uri, path, "application/pdf");
        saveUri = remote || uri;
      } catch (uploadErr) {
        console.warn("[JoinCommittee] Bank storage upload failed, using local URI:", uploadErr.message);
      }

      await userService.updateUserKycForInitiator(userId, initiatorId, { bankStatement: saveUri, updatedAt: new Date().toISOString() });
      await userService.updateProfileRTDB(userId, { bankStatement: saveUri, updatedAt: new Date().toISOString() });
      setDocStatus((s) => ({ ...s, hasBank: true }));

      if (ocrResult?.success) {
        setBankOcrResult(ocrResult);
        const matchStatus = ocrResult.matched === true ? "✅ Name Verified" : "ℹ️ Verification Skipped";
        Alert.alert("Bank Statement", `Upload successful!\n\n${matchStatus}${ocrResult.extractedName ? `\nExtracted: ${ocrResult.extractedName}` : ""}${ocrResult.bankName ? `\nBank: ${ocrResult.bankName}` : ""}`);
      } else {
        Alert.alert("Bank Statement", "Upload successful!");
      }
    } catch {
      Alert.alert("Error", "Failed to upload Bank Statement");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    fetchApprovedCommittees();
    (async () => {
      try {
        const stored = await AsyncStorage.getItem("userData");
        if (stored) {
          const parsed = JSON.parse(stored);
          setCurrentUserId(parsed.userId || parsed.uid || null);
        }
      } catch { }
    })();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SuccessModal
        visible={successVisible}
        title="Request Sent Successfully!"
        message="Your application has been submitted to the initiator for review. You will be notified once it's approved."
        onClose={() => setSuccessVisible(false)}
        buttonText="Return"
      />
      <Modal
        visible={showUploadPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUploadPrompt(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Verification Required</Text>
            <Text style={[styles.modalText, { color: colors.textSecondary }]}>
              Please upload your CNIC (image), Reference CNIC (image), and Bank Statement (PDF) to proceed with the join request. All documents are mandatory.
            </Text>
            <Text style={{ marginTop: 6, color: colors.textSecondary }}>
              CNIC: {docStatus.hasCNIC ? "✅ Uploaded" : "❌ Not uploaded"} | Ref CNIC: {docStatus.hasRef ? "✅ Uploaded" : "❌ Not uploaded"} | Bank: {docStatus.hasBank ? "✅ Uploaded" : "❌ Not uploaded"}
            </Text>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.brand }, uploading && { opacity: 0.6 }]}
              onPress={uploadCNIC}
              disabled={uploading}
            >
              <Text style={styles.actionBtnText}>{uploading ? "Uploading..." : "📷 Upload CNIC (Front/Back)"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtnOutline, { borderColor: colors.brand }, uploading && { opacity: 0.6 }]}
              onPress={uploadReferenceCnic}
              disabled={uploading}
            >
              <Text style={[styles.actionBtnOutlineText, { color: colors.brand }]}>{uploading ? "Uploading..." : "Upload Reference CNIC"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtnOutline, { borderColor: colors.brand }, uploading && { opacity: 0.6 }]}
              onPress={uploadBankStatement}
              disabled={uploading}
            >
              <Text style={[styles.actionBtnOutlineText, { color: colors.brand }]}>{uploading ? "Uploading..." : "📄 Upload Bank Statement (PDF)"}</Text>
            </TouchableOpacity>
            {hasSavedGlobalDocs && (
              <TouchableOpacity
                onPress={async () => {
                  try {
                    const userId = await getCurrentUserId();
                    const initiatorId = pendingCommittee?.createdBy;
                    const profile = await userService.getProfileRTDB(userId);
                    const payload = {
                      cnic: profile?.cnic,
                      referenceCnic: profile?.referenceCnic,
                      bankStatement: profile?.bankStatement,
                      copiedAt: new Date().toISOString(),
                    };
                    if (payload.cnic && payload.referenceCnic && payload.bankStatement) {
                      await userService.updateUserKycForInitiator(userId, initiatorId, payload);
                      setDocStatus({ hasCNIC: true, hasRef: true, hasBank: true });
                    } else {
                      Alert.alert("Missing Docs", "Your saved documents are incomplete. Please upload the remaining ones.");
                    }
                  } catch {
                    Alert.alert("Error", "Failed to use saved documents.");
                  }
                }}
                style={styles.useSavedLink}
              >
                <Text style={{ color: colors.brand, fontWeight: "600" }}>Use saved documents</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={async () => {
                const userId = await getCurrentUserId();
                if (!userId) {
                  Alert.alert("Error", "Sign in required");
                  return;
                }
                const allDone = docStatus.hasCNIC && docStatus.hasRef && docStatus.hasBank;
                if (!allDone) {
                  Alert.alert("Required", "Please upload CNIC, Reference CNIC, and Bank Statement to continue.");
                  return;
                }
                const committeeId = pendingCommittee?.id;
                const initiatorId = pendingCommittee?.createdBy;
                setShowUploadPrompt(false);
                setPendingCommittee(null);
                if (committeeId && initiatorId) {
                  await doSubmitJoin(committeeId, initiatorId);
                }
              }}
              style={[styles.actionBtn, { backgroundColor: "#4CAF50", opacity: (docStatus.hasCNIC && docStatus.hasRef && docStatus.hasBank) ? 1 : 0.6 }]}
              disabled={!(docStatus.hasCNIC && docStatus.hasRef && docStatus.hasBank)}
            >
              <Text style={styles.actionBtnText}>Proceed</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setShowUploadPrompt(false);
                setPendingCommittee(null);
              }}
              style={styles.cancelLink}
            >
              <Text style={{ color: colors.brand, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Text style={[styles.heading, { color: colors.text }]}>Approved & Active Committees</Text>

      <FlatList
        data={Object.keys(committees)}
        keyExtractor={(item) => item}
        renderItem={({ item }) => {
          const c = committees[item];
          const membersJoined = c.usersParticipated?.filter?.((u) => u !== null).length || 0;
          const isFull = membersJoined >= (parseInt(c.members || 0) || 0);
          const isActive = String(c.status || "").toLowerCase() === "active" || String(c.status || "").toLowerCase() === "started" || c.active === true;
          const isMember = Array.isArray(c.usersParticipated)
            ? c.usersParticipated.some((u) => u && (u.userId === currentUserId || u.uid === currentUserId || u.id === currentUserId))
            : false;
          let myTurnIndex = null;
          let myTurnDate = null;
          if (Array.isArray(c.turns) && c.turns.length) {
            const t = c.turns.find((t) => t && (t.id === currentUserId || t.userId === currentUserId));
            if (t) {
              myTurnIndex = t.index || t.turnIndex || null;
              myTurnDate = t.turnDate || null;
            }
          }
          if (myTurnIndex == null && Array.isArray(c.usersParticipated)) {
            const idx = c.usersParticipated.findIndex((u) => u && (u.userId === currentUserId || u.uid === currentUserId));
            if (idx >= 0) myTurnIndex = idx + 1;
          }
          const myMemberId = Array.isArray(c.usersParticipated)
            ? (() => {
              const idx = c.usersParticipated.findIndex((u) => u && (u.userId === currentUserId || u.uid === currentUserId || u.id === currentUserId));
              if (idx >= 0) {
                const u = c.usersParticipated[idx];
                return u?.memberId || String(idx + 1);
              }
              return null;
            })()
            : null;
          return (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.title, { color: colors.brand }]}>{c.name}</Text>
              <Text style={{ color: colors.text }}>Total Amount: {c.totalAmount}</Text>
              <Text style={{ color: colors.text }}>Members: {c.members}</Text>
              <Text style={{ color: colors.text }}>Cycle Duration: {c.cycleDuration} Days</Text>
              <Text style={{ color: colors.text }}>Duration (Months): {c.durationMonths}</Text>
              <Text style={{ color: colors.text }}>Cycles: {c.numberOfCycles}</Text>
              <Text style={{ color: colors.text }}>Contribution per Cycle: {c.contributionPerCycle}</Text>
              <Text style={{ color: colors.text }}>Start Date: {c.startDate}</Text>
              <Text style={{ color: colors.text }}>End Date: {c.endDate}</Text>
              {c.activationDate && <Text style={{ color: colors.text }}>Activated On: {c.activationDate}</Text>}
              <Text style={{ color: colors.text }}>Status: {c.status}</Text>
              <Text>Active: {c.active ? "Yes" : "No"}</Text>
              <View style={{ height: 10 }} />
              {myMemberId && (
                <View style={styles.turnRow}>
                  <FontAwesome5 name="id-card" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
                  <Text style={[styles.turnText, { color: colors.textSecondary }]}>Your ID: CM-{myMemberId}</Text>
                </View>
              )}

              {(String(c.status || "").toLowerCase() === "approved" || String(c.status || "").toLowerCase() === "started" || c.active) && !isMember && (
                <ThemedButton label={isFull ? "Full" : "Join"} onPress={() => handleJoin(item, c.createdBy)} disabled={isFull} />
              )}
              {isMember && isActive && (
                <View style={{ marginTop: 8 }}>
                  <ThemedButton
                    label="Go to Payment"
                    onPress={() =>
                      navigation.navigate("PaymentScreen", {
                        committeeId: item,
                        userId: currentUserId,
                        amount: c.contributionPerCycle,
                        committeeName: c.name,
                      })
                    }
                  />
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>No approved & active committees yet.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 6 },
  modalText: {},
  heading: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  card: {
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    elevation: 3,
    borderWidth: 1,
  },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  turnRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  turnText: { fontSize: 14, fontWeight: "600" },
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
  useSavedLink: { marginTop: 8, alignItems: "center" },
  viewBtn: {
    marginTop: 10,
    padding: 10,
    backgroundColor: "#0277BD",
    borderRadius: 8,
  },
  viewTxt: { color: "#fff", textAlign: "center", fontWeight: "bold" },
  empty: { textAlign: "center", marginTop: 30, fontSize: 16, opacity: 0.5 },
});
