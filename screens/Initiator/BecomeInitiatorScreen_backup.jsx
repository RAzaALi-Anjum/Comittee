import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { push as rPush, ref as rRef, set as rSet } from "firebase/database";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import SuccessModal from "../../components/SuccessModal";
import { auth, database, db } from "../../firebaseConfig";
import apiClient from "../../services/apiClient";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";

const INITIATOR_FEE = 5000;

const PAYMENT_METHODS = [
  { id: "easypaisa", label: "Easypaisa", icon: "mobile-alt", color: "#3AAF3C" },
  { id: "jazzcash", label: "JazzCash", icon: "mobile-alt", color: "#E2231A" },
  { id: "bank", label: "Bank Transfer", icon: "university", color: "#1561a9" },
  { id: "card", label: "Card Payment", icon: "credit-card", color: "#6C3CE1" },
];

const WALLET_INFO = {
  easypaisa: { accountName: "Digital Committee Pvt Ltd", accountNumber: "0312-3456789" },
  jazzcash: { accountName: "Digital Committee Pvt Ltd", accountNumber: "0300-9876543" },
};

const BANK_INFO = {
  bankName: "Meezan Bank",
  accountTitle: "Digital Committee Pvt Ltd",
  iban: "PK36 MEZN 0001 2345 6789 0123",
};

function generateTransactionId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "TXN-";
  for (let i = 0; i < 10; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

export default function BecomeInitiatorScreen({ navigation }) {
  const { colors } = useTheme();
  const [request, setRequest] = useState(null);
  const [cnicVisible, setCnicVisible] = useState(false);
  const [cnicUploading, setCnicUploading] = useState(false);
  const [pendingUid, setPendingUid] = useState(null);
  const [successVisible, setSuccessVisible] = useState(false);
  const [docStatus, setDocStatus] = useState({ hasCNIC: false, hasRef: false, hasBank: false });
  const [hasSavedGlobalDocs, setHasSavedGlobalDocs] = useState(false);

  // Payment modal state
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [screenshot, setScreenshot] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Card fields
  const [cardholderName, setCardholderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvv, setCvv] = useState("");

  // Confirmation state
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [transactionId, setTransactionId] = useState("");

  // ─── Existing request tracking ────────────────────────
  const formatDateTime = (value) => {
    if (!value) return "Just now";
    let d = null;
    try {
      if (value?.toDate) d = value.toDate();
      else if (typeof value === "string") {
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) d = parsed;
      }
    } catch { }
    if (!d) return "Just now";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
  };

  useEffect(() => {
    let unsub = null;
    let cancelled = false;
    const setup = async () => {
      let activeUid = null;
      try {
        const data = await AsyncStorage.getItem("userData");
        if (data) {
          const parsed = JSON.parse(data);
          activeUid = parsed.userId || parsed.uid;
        }
      } catch { }
      if (!activeUid || cancelled) { setRequest(null); return; }
      const currentUid = activeUid;
      const q = query(collection(db, "initiatorRequests"), where("userId", "==", currentUid));
      unsub = onSnapshot(q, (snap) => {
        if (snap.empty) {
          (async () => {
            try {
              const rtData = await userService.getInitiatorRequestsRTDB();
              if (!rtData) { setRequest(null); return; }
              const items = Object.entries(rtData).map(([id, val]) => ({ id, ...val })).filter((r) => r.userId === currentUid);
              items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
              setRequest(items[0] || null);
            } catch { setRequest(null); }
          })();
          return;
        }
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
          const tb = b.createdAt?.toMillis?.() ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
          return tb - ta;
        });
        setRequest(items[0] || null);
      });
    };
    setup();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, []);

  // ─── CNIC Helpers ─────────────────────────────────────
  const pickCnicUri = async () => {
    try {
      const docPick = await DocumentPicker.getDocumentAsync({ type: ["image/*", "application/pdf"], multiple: false, copyToCacheDirectory: true });
      if (docPick?.assets?.length && !docPick.canceled) return docPick.assets[0].uri;
      if (docPick?.type === "success" && docPick.uri) return docPick.uri;
    } catch { }
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return null;
      const img = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 1 });
      if (!img.canceled && img.assets?.length) return img.assets[0].uri;
    } catch { }
    return null;
  };

  const uploadReferenceCnic = async () => {
    if (!pendingUid) return;
    try {
      setUploading(true);
      const picked = await pickCnicUri();
      if (!picked) { setUploading(false); return; }
      const ext = picked.split(".").pop().toLowerCase() === "png" ? "png" : "jpg";
      const uploadedUri = await userService.uploadFileToStorage(
        picked,
        `refCnicUploads/${pendingUid}-${Date.now()}.${ext}`,
        `image/${ext === "png" ? "png" : "jpeg"}`
      );
      await userService.updateProfileRTDB(pendingUid, { referenceCnic: uploadedUri });
      setDocStatus(prev => ({ ...prev, hasRef: true }));
      Alert.alert("Success", "Reference CNIC uploaded.");
    } catch {
      Alert.alert("Error", "Failed to upload Reference CNIC.");
    } finally {
      setUploading(false);
    }
  };

  const uploadBankStatement = async () => {
    if (!pendingUid) return;
    try {
      setUploading(true);
      const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) { setUploading(false); return; }
      const picked = res.assets[0].uri;
      const uploadedUri = await userService.uploadFileToStorage(
        picked,
        `bankStatements/${pendingUid}-${Date.now()}.pdf`,
        "application/pdf"
      );
      await userService.updateProfileRTDB(pendingUid, { bankStatement: uploadedUri });
      setDocStatus(prev => ({ ...prev, hasBank: true }));
      Alert.alert("Success", "Bank Statement uploaded.");
    } catch {
      Alert.alert("Error", "Failed to upload Bank Statement.");
    } finally {
      setUploading(false);
    }
  };

  const handleUploadCnicAndProceed = async () => {
    if (!pendingUid) return;
    try {
      setCnicUploading(true);
      const picked = await pickCnicUri();
      if (!picked) { setCnicUploading(false); return; }

      // Also upload to storage for profile display
      const ext = picked.split(".").pop().toLowerCase() === "png" ? "png" : "jpg";
      const uploadedUri = await userService.uploadFileToStorage(
        picked,
        `cnicUploads/${pendingUid}-${Date.now()}.${ext}`,
        `image/${ext === "png" ? "png" : "jpeg"}`
      );
      await userService.updateProfileRTDB(pendingUid, { cnic: uploadedUri });
      setDocStatus(prev => ({ ...prev, hasCNIC: true }));

      // Call backend OCR endpoint to extract text and encrypt CNIC
      try {
        const formData = new FormData();
        formData.append("cnicImage", {
          uri: picked,
          name: `ocr-${Date.now()}.${ext}`,
          type: `image/${ext === "png" ? "png" : "jpeg"}`,
        });
        formData.append("userId", pendingUid);
        await apiClient.backendUpload("/ocr/cnic", formData);
      } catch (ocrErr) {
        console.warn("[OCR Error]", ocrErr);
      }

      setCnicUploading(false);
      Alert.alert("Success", "CNIC uploaded.");
    } catch {
      setCnicUploading(false);
      Alert.alert("Error", "Failed to process CNIC. Please try again.");
    }
  };

  // ─── Submit initiator request ─────────────────────────
  const submitRequest = async (finalUid, requestUserName, requestEmail, txnId, method) => {
    try {
      const trackingNumber = Number(String(Date.now()).slice(-8));
      const payload = {
        userId: finalUid,
        trackingNumber,
        transactionId: txnId,
        paymentMethod: method,
        status: "pending",
        paymentStatus: "paid",
        paymentAmount: INITIATOR_FEE,
        createdAt: serverTimestamp(),
      };
      if (requestUserName) payload.requestUserName = requestUserName;
      if (requestEmail) payload.requestEmail = requestEmail;

      let wrote = false;
      try { await setDoc(doc(db, "initiatorRequests", finalUid), payload, { merge: true }); wrote = true; } catch { }
      try {
        const reqRef = rPush(rRef(database, "initiatorRequests"));
        await rSet(reqRef, { ...payload, createdAt: new Date().toISOString() });
        wrote = true;
      } catch { }
      if (!wrote) { Alert.alert("Error", "Failed to submit request"); return false; }

      await setDoc(doc(db, "users", finalUid), { initiatorStatus: "pending", role: "user", updatedAt: serverTimestamp() }, { merge: true });

      setRequest({ id: finalUid, ...payload, createdAt: new Date().toISOString() });
      return true;
    } catch (e) {
      Alert.alert("Error", e.message);
      return false;
    }
  };

  // ─── "Pay & Apply" button handler ─────────────────────
  const handlePayAndApply = async () => {
    try {
      let storageUid = null;
      try {
        const data = await AsyncStorage.getItem("userData");
        if (data) { const p = JSON.parse(data); storageUid = p.userId || p.uid; }
      } catch { }
      if (!storageUid) { Alert.alert("Error", "Sign in required"); return; }

      // Check all 3 documents
      try {
        const profile = await userService.getProfileRTDB(storageUid);
        const hasCNIC = !!(profile?.cnic && String(profile.cnic).trim().length > 0);
        const hasRef = !!(profile?.referenceCnic && String(profile.referenceCnic).trim().length > 0);
        const hasBank = !!(profile?.bankStatement && String(profile.bankStatement).trim().length > 0);

        setDocStatus({ hasCNIC, hasRef, hasBank });
        // If profile has all 3, but specifically identifying saved vs unsaved can be helpful
        setHasSavedGlobalDocs(hasCNIC && hasRef && hasBank);

        if (!hasCNIC || !hasRef || !hasBank) {
          setPendingUid(storageUid);
          setCnicVisible(true);
          return;
        }
      } catch { }
      setPendingUid(storageUid);
      setPaymentVisible(true);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  // ─── Pick screenshot ──────────────────────────────────
  const pickScreenshot = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert("Permission required", "Camera roll access is needed"); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.length) {
        const asset = result.assets[0];
        const ext = (asset.fileName || asset.uri || "").split(".").pop().toLowerCase();
        if (!["jpg", "jpeg", "png"].includes(ext) && asset.mimeType && !["image/jpeg", "image/png"].includes(asset.mimeType)) {
          Alert.alert("Invalid File", "Only JPG and PNG images are allowed.");
          return;
        }
        setScreenshot(asset.uri);
      }
    } catch {
      Alert.alert("Error", "Failed to pick image");
    }
  };

  // ─── Process payment ──────────────────────────────────
  const processPayment = async () => {
    if (!pendingUid) { Alert.alert("Error", "Sign in required"); return; }

    // Validation
    if (selectedMethod === "card") {
      if (!cardholderName.trim()) { Alert.alert("Error", "Cardholder name is required"); return; }
      const cleanCard = cardNumber.replace(/\s/g, "");
      if (!/^\d{13,19}$/.test(cleanCard)) { Alert.alert("Error", "Enter a valid card number"); return; }
      if (!/^\d{2}\/\d{2}$/.test(expiryDate)) { Alert.alert("Error", "Enter expiry as MM/YY"); return; }
      if (!/^\d{3,4}$/.test(cvv)) { Alert.alert("Error", "Enter a valid CVV"); return; }
    } else {
      if (!screenshot) { Alert.alert("Error", "Please upload payment screenshot"); return; }
    }

    setUploading(true);
    try {
      const txnId = generateTransactionId();

      // Get user info
      let userName = null;
      let userEmail = null;
      try {
        const data = await AsyncStorage.getItem("userData");
        if (data) { const p = JSON.parse(data); userName = p.fullName; userEmail = p.email; }
      } catch { }

      // Save screenshot if applicable
      let screenshotUrl = null;
      if (screenshot && selectedMethod !== "card") {
        try {
          screenshotUrl = await userService.uploadFileToStorage(
            screenshot,
            `initiatorPayments/${pendingUid}/${txnId}.jpg`,
            "image/jpeg"
          );
        } catch (e) {
          console.warn("[Payment] Screenshot upload failed:", e.message);
          screenshotUrl = screenshot; // Save local URI as fallback
        }
      }

      // Encrypt & save via backend
      try {
        const paymentData = {
          userId: pendingUid,
          committeeId: "initiator-fee",
          amount: INITIATOR_FEE,
          method: selectedMethod === "card" ? "Card" : selectedMethod,
          committeeName: "Initiator Registration Fee",
          transactionId: txnId,
        };

        if (selectedMethod === "card") {
          paymentData.cardNumber = cardNumber.replace(/\s/g, "");
          paymentData.expiry = expiryDate;
          paymentData.cvv = cvv;
          paymentData.cardholderName = cardholderName;
        } else {
          paymentData.referenceId = txnId;
          if (screenshotUrl) paymentData.screenshotUrl = screenshotUrl;
        }

        await apiClient.backendPost("/payment/process", paymentData);
      } catch (backendErr) {
        // Fallback: save directly to Firebase
        console.warn("[Payment] Backend unavailable, saving directly:", backendErr.message);
        await apiClient.post("payments", {
          userId: pendingUid,
          type: "initiator-fee",
          amount: INITIATOR_FEE,
          method: selectedMethod,
          transactionId: txnId,
          screenshotUrl: screenshotUrl || null,
          status: "Pending Verification",
          date: new Date().toISOString(),
        });
      }

      // Submit the initiator request
      const ok = await submitRequest(
        pendingUid,
        userName,
        userEmail || auth.currentUser?.email,
        txnId,
        selectedMethod
      );

      if (ok) {
        setTransactionId(txnId);
        setPaymentVisible(false);
        resetPaymentForm();
        setConfirmVisible(true);
      }
    } catch (e) {
      Alert.alert("Error", "Payment failed. Please try again.");
      console.error("[Payment]", e);
    } finally {
      setUploading(false);
    }
  };

  const resetPaymentForm = () => {
    setSelectedMethod(null);
    setScreenshot(null);
    setCardholderName("");
    setCardNumber("");
    setExpiryDate("");
    setCvv("");
  };

  const deleteRequest = async () => {
    if (!request?.id) return;
    try {
      await deleteDoc(doc(db, "initiatorRequests", request.id));
      await updateDoc(doc(db, "users", request.userId), { initiatorStatus: "none", role: "user" });
      setRequest(null);
      Alert.alert("Deleted", "Your request has been removed");
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  // ─── Card number formatting ───────────────────────────
  const formatCardInput = (text) => {
    const nums = text.replace(/\D/g, "").slice(0, 16);
    return nums.replace(/(\d{4})(?=\d)/g, "$1 ");
  };
  const formatExpiryInput = (text) => {
    const nums = text.replace(/\D/g, "").slice(0, 4);
    if (nums.length > 2) return nums.slice(0, 2) + "/" + nums.slice(2);
    return nums;
  };

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════
  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* ── Hero Header ──────────────────────────────────── */}
      <View style={[styles.hero, { backgroundColor: colors.brand }]}>
        <View style={styles.heroBlobA} />
        <View style={styles.heroBlobB} />
        <FontAwesome5 name="rocket" size={36} color="rgba(255,255,255,0.85)" style={{ marginBottom: 10 }} />
        <Text style={styles.heroTitle}>Become an Initiator</Text>
        <Text style={styles.heroSub}>Create and manage your own committees</Text>
      </View>

      {/* ── Fee Card ─────────────────────────────────────── */}
      <View style={[styles.feeCard, { backgroundColor: colors.card }]}>
        <View style={styles.feeRow}>
          <View>
            <Text style={[styles.feeLabel, { color: colors.textSecondary }]}>Registration Fee</Text>
            <Text style={[styles.feeAmount, { color: colors.text }]}>Rs {INITIATOR_FEE.toLocaleString()}</Text>
          </View>
          <View style={[styles.feeIconWrap, { backgroundColor: colors.brand + "15" }]}>
            <FontAwesome5 name="hand-holding-usd" size={22} color={colors.brand} />
          </View>
        </View>

        <View style={[styles.feeDivider, { backgroundColor: colors.border }]} />

        <View style={styles.feeBenefits}>
          {["Create unlimited committees", "Manage members & turns", "Access initiator dashboard", "Priority admin support"].map((b, i) => (
            <View key={i} style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
              <Text style={[styles.benefitText, { color: colors.text }]}>{b}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Request Status ───────────────────────────────── */}
      {request && (
        <View style={[styles.statusCard, { backgroundColor: colors.card }]}>
          <View style={styles.statusHeader}>
            <Text style={[styles.statusLabel, { color: colors.text }]}>Application Status</Text>
            <View style={[styles.badge, { backgroundColor: request.status === "approved" ? "#10B981" : request.status === "rejected" ? "#EF4444" : "#F59E0B" }]}>
              <Text style={styles.badgeText}>{String(request.status).toUpperCase()}</Text>
            </View>
          </View>

          <View style={[styles.statusDivider, { backgroundColor: colors.border }]} />

          <View style={styles.statusRow}>
            <Ionicons name="receipt-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.statusInfo, { color: colors.textSecondary }]}>Request #{request.trackingNumber ?? "—"}</Text>
          </View>
          {request.transactionId && (
            <View style={styles.statusRow}>
              <Ionicons name="card-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.statusInfo, { color: colors.textSecondary }]}>TXN: {request.transactionId}</Text>
            </View>
          )}
          <View style={styles.statusRow}>
            <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.statusInfo, { color: colors.textSecondary }]}>{formatDateTime(request.createdAt)}</Text>
          </View>

          {request.status === "rejected" && (
            <TouchableOpacity onPress={handlePayAndApply} style={[styles.reApplyBtn, { backgroundColor: colors.brand }]} activeOpacity={0.8}>
              <Text style={styles.reApplyText}>Re-Apply</Text>
            </TouchableOpacity>
          )}
          {request.status !== "approved" && (
            <TouchableOpacity onPress={deleteRequest} style={[styles.deleteBtn, { borderColor: colors.danger }]} activeOpacity={0.8}>
              <Text style={[styles.deleteBtnText, { color: colors.danger }]}>Delete Request</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Pay & Apply Button ───────────────────────────── */}
      {!request && (
        <TouchableOpacity onPress={handlePayAndApply} style={[styles.payApplyBtn, { backgroundColor: colors.brand }]} activeOpacity={0.85}>
          <FontAwesome5 name="bolt" size={16} color="#fff" />
          <Text style={styles.payApplyText}>Pay & Apply</Text>
        </TouchableOpacity>
      )}

      <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>
        Your request will be reviewed and approved within 2 hours.
      </Text>

      {/* ═══════════════════════════════════════════════════ */}
      {/* PAYMENT METHOD SELECTION MODAL                     */}
      {/* ═══════════════════════════════════════════════════ */}
      <Modal visible={paymentVisible} transparent animationType="slide" onRequestClose={() => { setPaymentVisible(false); resetPaymentForm(); }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.paymentModalCard, { backgroundColor: colors.card }]}>
              <ScrollView showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">

                {/* Header */}
                <View style={styles.pmHeader}>
                  <Text style={[styles.pmTitle, { color: colors.text }]}>Select Payment Method</Text>
                  <TouchableOpacity onPress={() => { setPaymentVisible(false); resetPaymentForm(); }}>
                    <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.pmFeeText, { color: colors.brand }]}>Amount: Rs {INITIATOR_FEE.toLocaleString()}</Text>

                {/* Method Chips */}
                <View style={styles.methodGrid}>
                  {PAYMENT_METHODS.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.methodCard, { borderColor: selectedMethod === m.id ? m.color : colors.border, backgroundColor: selectedMethod === m.id ? m.color + "10" : colors.background }]}
                      onPress={() => { setSelectedMethod(m.id); setScreenshot(null); }}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.methodIconWrap, { backgroundColor: m.color + "20" }]}>
                        <FontAwesome5 name={m.icon} size={18} color={m.color} />
                      </View>
                      <Text style={[styles.methodLabel, { color: selectedMethod === m.id ? m.color : colors.text }]}>{m.label}</Text>
                      {selectedMethod === m.id && (
                        <View style={[styles.methodCheck, { backgroundColor: m.color }]}>
                          <Ionicons name="checkmark" size={12} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>

                {/* ── Easypaisa / JazzCash Form ───────────── */}
                {(selectedMethod === "easypaisa" || selectedMethod === "jazzcash") && (
                  <View style={styles.formSection}>
                    <Text style={[styles.formSectionTitle, { color: colors.text }]}>Transfer Details</Text>
                    <View style={[styles.infoBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Account Name</Text>
                        <Text style={[styles.infoValue, { color: colors.text }]}>{WALLET_INFO[selectedMethod].accountName}</Text>
                      </View>
                      <View style={[styles.infoSep, { backgroundColor: colors.border }]} />
                      <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Account Number</Text>
                        <Text style={[styles.infoValue, { color: colors.text }]}>{WALLET_INFO[selectedMethod].accountNumber}</Text>
                      </View>
                    </View>

                    <Text style={[styles.uploadLabel, { color: colors.text }]}>Upload Payment Screenshot (JPG, PNG only)</Text>
                    <TouchableOpacity onPress={pickScreenshot} style={[styles.uploadBtn, { borderColor: colors.brand }]} activeOpacity={0.75}>
                      <Ionicons name={screenshot ? "checkmark-circle" : "cloud-upload-outline"} size={20} color={colors.brand} />
                      <Text style={[styles.uploadBtnText, { color: colors.brand }]}>{screenshot ? "Screenshot Selected ✓" : "Choose Screenshot"}</Text>
                    </TouchableOpacity>
                    {screenshot && <Image source={{ uri: screenshot }} style={styles.screenshotPreview} />}
                  </View>
                )}

                {/* ── Bank Transfer Form ──────────────────── */}
                {selectedMethod === "bank" && (
                  <View style={styles.formSection}>
                    <Text style={[styles.formSectionTitle, { color: colors.text }]}>Bank Transfer Details</Text>
                    <View style={[styles.infoBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Bank Name</Text>
                        <Text style={[styles.infoValue, { color: colors.text }]}>{BANK_INFO.bankName}</Text>
                      </View>
                      <View style={[styles.infoSep, { backgroundColor: colors.border }]} />
                      <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Account Title</Text>
                        <Text style={[styles.infoValue, { color: colors.text }]}>{BANK_INFO.accountTitle}</Text>
                      </View>
                      <View style={[styles.infoSep, { backgroundColor: colors.border }]} />
                      <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>IBAN</Text>
                        <Text style={[styles.infoValue, { color: colors.text }]}>{BANK_INFO.iban}</Text>
                      </View>
                    </View>

                    <Text style={[styles.uploadLabel, { color: colors.text }]}>Upload Payment Screenshot (JPG, PNG only)</Text>
                    <TouchableOpacity onPress={pickScreenshot} style={[styles.uploadBtn, { borderColor: colors.brand }]} activeOpacity={0.75}>
                      <Ionicons name={screenshot ? "checkmark-circle" : "cloud-upload-outline"} size={20} color={colors.brand} />
                      <Text style={[styles.uploadBtnText, { color: colors.brand }]}>{screenshot ? "Screenshot Selected ✓" : "Choose Screenshot"}</Text>
                    </TouchableOpacity>
                    {screenshot && <Image source={{ uri: screenshot }} style={styles.screenshotPreview} />}
                  </View>
                )}

                {/* ── Card Payment Form ──────────────────── */}
                {selectedMethod === "card" && (
                  <View style={styles.formSection}>
                    <Text style={[styles.formSectionTitle, { color: colors.text }]}>Card Details</Text>

                    <View style={[styles.cardFormBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      {/* Cardholder Name */}
                      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Cardholder Name</Text>
                      <TextInput
                        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                        placeholder="John Doe"
                        placeholderTextColor={colors.textSecondary + "80"}
                        value={cardholderName}
                        onChangeText={setCardholderName}
                        autoCapitalize="words"
                      />

                      {/* Card Number */}
                      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Card Number</Text>
                      <View style={[styles.cardInputRow, { borderColor: colors.border }]}>
                        <TextInput
                          style={[styles.cardInput, { color: colors.text }]}
                          placeholder="0000 0000 0000 0000"
                          placeholderTextColor={colors.textSecondary + "80"}
                          value={cardNumber}
                          onChangeText={(t) => setCardNumber(formatCardInput(t))}
                          keyboardType="numeric"
                          maxLength={19}
                        />
                        <FontAwesome5 name="credit-card" size={18} color={colors.textSecondary} />
                      </View>

                      {/* Expiry + CVV */}
                      <View style={styles.cardRow}>
                        <View style={{ flex: 1, marginRight: 10 }}>
                          <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Expiry</Text>
                          <TextInput
                            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                            placeholder="MM/YY"
                            placeholderTextColor={colors.textSecondary + "80"}
                            value={expiryDate}
                            onChangeText={(t) => setExpiryDate(formatExpiryInput(t))}
                            keyboardType="numeric"
                            maxLength={5}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>CVV</Text>
                          <TextInput
                            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                            placeholder="•••"
                            placeholderTextColor={colors.textSecondary + "80"}
                            value={cvv}
                            onChangeText={setCvv}
                            keyboardType="numeric"
                            maxLength={4}
                            secureTextEntry
                          />
                        </View>
                      </View>
                    </View>

                    <View style={styles.secureRow}>
                      <Ionicons name="lock-closed" size={14} color={colors.textSecondary} />
                      <Text style={[styles.secureText, { color: colors.textSecondary }]}>256-bit AES encrypted · Secure processing</Text>
                    </View>
                  </View>
                )}

                {/* ── Pay Button ──────────────────────────── */}
                {selectedMethod && (
                  <TouchableOpacity
                    onPress={processPayment}
                    style={[styles.payBtn, { backgroundColor: colors.brand }, uploading && { opacity: 0.6 }]}
                    disabled={uploading}
                    activeOpacity={0.85}
                  >
                    {uploading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="shield-checkmark" size={18} color="#fff" />
                        <Text style={styles.payBtnText}>Pay Rs {INITIATOR_FEE.toLocaleString()}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══════════════════════════════════════════════════ */}
      {/* PAYMENT CONFIRMATION MODAL                         */}
      {/* ═══════════════════════════════════════════════════ */}
      <Modal visible={confirmVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.confirmCard, { backgroundColor: colors.card }]}>
            <View style={[styles.confirmCircle, { backgroundColor: "#10B981" }]}>
              <FontAwesome5 name="check" size={32} color="#fff" />
            </View>
            <Text style={[styles.confirmTitle, { color: "#10B981" }]}>Payment Submitted!</Text>
            <Text style={[styles.confirmSub, { color: colors.textSecondary }]}>
              Your payment has been submitted successfully.
            </Text>
            <View style={[styles.txnBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.txnLabel, { color: colors.textSecondary }]}>Transaction ID</Text>
              <Text style={[styles.txnValue, { color: colors.text }]}>{transactionId}</Text>
            </View>
            <Text style={[styles.confirmNote, { color: colors.textSecondary }]}>
              Your request will be reviewed and approved within 2 hours.
            </Text>
            <TouchableOpacity
              onPress={() => setConfirmVisible(false)}
              style={[styles.confirmBtn, { backgroundColor: colors.brand }]}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════ */}
      {/* CNIC MODAL (Existing)                              */}
      {/* ═══════════════════════════════════════════════════ */}
      <Modal visible={cnicVisible} transparent animationType="fade" onRequestClose={() => setCnicVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.paymentModalCard, { backgroundColor: colors.card, padding: 24 }]}>
            <FontAwesome5 name="id-card" size={28} color={colors.brand} style={{ marginBottom: 12, alignSelf: 'center' }} />
            <Text style={[styles.pmTitle, { color: colors.text, textAlign: 'center' }]}>Verification Required</Text>
            <Text style={[styles.pmFeeText, { color: colors.textSecondary, textAlign: 'center', marginBottom: 20 }]}>Please upload all mandatory documents to proceed with your application.</Text>

            <View style={{ gap: 12 }}>
              <TouchableOpacity
                onPress={handleUploadCnicAndProceed}
                style={[styles.uploadBtn, { borderColor: colors.brand }, cnicUploading && { opacity: 0.6 }]}
                disabled={cnicUploading}
              >
                <Ionicons name={docStatus.hasCNIC ? "checkmark-circle" : "cloud-upload-outline"} size={20} color={colors.brand} />
                <Text style={[styles.uploadBtnText, { color: colors.brand }]}>{docStatus.hasCNIC ? "CNIC Uploaded ✓" : "Upload CNIC"}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={uploadReferenceCnic}
                style={[styles.uploadBtn, { borderColor: colors.brand }, uploading && { opacity: 0.6 }]}
                disabled={uploading}
              >
                <Ionicons name={docStatus.hasRef ? "checkmark-circle" : "cloud-upload-outline"} size={20} color={colors.brand} />
                <Text style={[styles.uploadBtnText, { color: colors.brand }]}>{docStatus.hasRef ? "Ref CNIC Uploaded ✓" : "Upload Reference CNIC"}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={uploadBankStatement}
                style={[styles.uploadBtn, { borderColor: colors.brand }, uploading && { opacity: 0.6 }]}
                disabled={uploading}
              >
                <Ionicons name={docStatus.hasBank ? "checkmark-circle" : "cloud-upload-outline"} size={20} color={colors.brand} />
                <Text style={[styles.uploadBtnText, { color: colors.brand }]}>{docStatus.hasBank ? "Bank Statement Uploaded ✓" : "Upload Bank Statement"}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => {
                if (docStatus.hasCNIC && docStatus.hasRef && docStatus.hasBank) {
                  setCnicVisible(false);
                  setPaymentVisible(true);
                } else {
                  Alert.alert("Missing Documents", "Please upload all 3 documents to continue.");
                }
              }}
              style={[styles.payBtn, { backgroundColor: "#4CAF50", marginTop: 24, opacity: (docStatus.hasCNIC && docStatus.hasRef && docStatus.hasBank) ? 1 : 0.6 }]}
              disabled={!(docStatus.hasCNIC && docStatus.hasRef && docStatus.hasBank)}
            >
              <Text style={styles.payBtnText}>Proceed to Payment</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setCnicVisible(false)} style={{ marginTop: 16, alignSelf: 'center' }}>
              <Text style={[styles.cnicCancel, { color: colors.brand }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <SuccessModal
        visible={successVisible}
        title="Your request has been approved within 2 hours of apply."
        onClose={() => setSuccessVisible(false)}
        buttonText="OK"
      />
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1 },

  // Hero
  hero: { height: 200, alignItems: "center", justifyContent: "center", borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: "hidden", position: "relative" },
  heroBlobA: { position: "absolute", top: -30, right: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: "rgba(255,255,255,0.12)" },
  heroBlobB: { position: "absolute", bottom: -40, left: -30, width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(255,255,255,0.08)" },
  heroTitle: { color: "#fff", fontSize: 24, fontWeight: "900" },
  heroSub: { color: "rgba(255,255,255,0.8)", fontSize: 14, marginTop: 4 },

  // Fee Card
  feeCard: { marginHorizontal: 16, marginTop: -24, borderRadius: 20, padding: 20, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  feeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  feeLabel: { fontSize: 13, fontWeight: "600" },
  feeAmount: { fontSize: 28, fontWeight: "900", marginTop: 2 },
  feeIconWrap: { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  feeDivider: { height: 1, marginVertical: 16 },
  feeBenefits: { gap: 8 },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  benefitText: { fontSize: 14, fontWeight: "500" },

  // Status card
  statusCard: { marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 18, elevation: 3, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  statusHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusLabel: { fontSize: 16, fontWeight: "700" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { color: "#fff", fontWeight: "800", fontSize: 11, letterSpacing: 0.5 },
  statusDivider: { height: 1, marginVertical: 12 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  statusInfo: { fontSize: 13, fontWeight: "500" },
  reApplyBtn: { marginTop: 14, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  reApplyText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  deleteBtn: { marginTop: 10, paddingVertical: 12, borderRadius: 10, alignItems: "center", borderWidth: 1.5 },
  deleteBtnText: { fontWeight: "700", fontSize: 14 },

  // Pay & Apply
  payApplyBtn: { marginHorizontal: 16, marginTop: 20, paddingVertical: 16, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  payApplyText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  disclaimer: { textAlign: "center", marginTop: 12, fontSize: 13, marginHorizontal: 32 },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  paymentModalCard: { maxHeight: "92%", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20 },

  // Payment modal header
  pmHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  pmTitle: { fontSize: 20, fontWeight: "900" },
  pmFeeText: { fontSize: 15, fontWeight: "700", marginBottom: 16 },

  // Method grid
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 8 },
  methodCard: { width: "47%", borderWidth: 2, borderRadius: 14, padding: 14, alignItems: "center", position: "relative" },
  methodIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  methodLabel: { fontSize: 13, fontWeight: "700" },
  methodCheck: { position: "absolute", top: 8, right: 8, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  // Form sections
  formSection: { marginTop: 16 },
  formSectionTitle: { fontSize: 16, fontWeight: "800", marginBottom: 10 },
  infoBox: { borderRadius: 12, padding: 14, borderWidth: 1 },
  infoRow: { paddingVertical: 6 },
  infoSep: { height: 1 },
  infoLabel: { fontSize: 12, fontWeight: "600" },
  infoValue: { fontSize: 15, fontWeight: "700", marginTop: 2 },

  // Upload
  uploadLabel: { fontSize: 14, fontWeight: "600", marginTop: 16, marginBottom: 8 },
  uploadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 12, paddingVertical: 14 },
  uploadBtnText: { fontSize: 14, fontWeight: "700" },
  screenshotPreview: { width: "100%", height: 160, borderRadius: 10, marginTop: 10, resizeMode: "cover" },

  // Card form
  cardFormBox: { borderRadius: 14, padding: 16, borderWidth: 1 },
  inputLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontWeight: "500" },
  cardInputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 2 },
  cardInput: { flex: 1, fontSize: 15, fontWeight: "500", paddingVertical: 10 },
  cardRow: { flexDirection: "row", marginTop: 4 },
  secureRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, justifyContent: "center" },
  secureText: { fontSize: 12, fontWeight: "500" },

  // Pay button
  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 20, paddingVertical: 16, borderRadius: 14 },
  payBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  // Confirmation modal
  confirmCard: { alignSelf: "center", width: "88%", borderRadius: 24, padding: 28, alignItems: "center", marginBottom: 60 },
  confirmCircle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  confirmTitle: { fontSize: 22, fontWeight: "900", marginBottom: 6 },
  confirmSub: { fontSize: 14, textAlign: "center", marginBottom: 16 },
  txnBox: { width: "100%", borderRadius: 12, padding: 14, borderWidth: 1, alignItems: "center", marginBottom: 16 },
  txnLabel: { fontSize: 12, fontWeight: "600" },
  txnValue: { fontSize: 20, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  confirmNote: { fontSize: 12, textAlign: "center", marginBottom: 16 },
  confirmBtn: { width: "100%", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  confirmBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  // CNIC modal
  cnicCard: { alignSelf: "center", width: "88%", borderRadius: 20, padding: 24, alignItems: "center", marginBottom: 80 },
  cnicTitle: { fontSize: 18, fontWeight: "800", marginBottom: 6 },
  cnicSub: { fontSize: 13, textAlign: "center", marginBottom: 16 },
  cnicUploadBtn: { paddingVertical: 12, paddingHorizontal: 28, borderRadius: 10 },
  cnicUploadText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  cnicCancel: { fontWeight: "600", fontSize: 14 },
});
