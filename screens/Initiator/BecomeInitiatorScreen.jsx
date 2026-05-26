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
import React, { useEffect, useRef, useState } from "react";
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
import { sendNotification, sendAdminNotification } from "../../utils/notificationHelper";

const INITIATOR_FEE = 5000;

const PAYMENT_METHODS = [
  { id: "easypaisa", label: "Easypaisa", icon: "mobile-alt", color: "#3AAF3C" },
  { id: "jazzcash", label: "JazzCash", icon: "mobile-alt", color: "#E2231A" },
  { id: "bank", label: "Bank Transfer", icon: "university", color: "#1561a9" },
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

  // CNIC front/back state
  const [cnicFront, setCnicFront] = useState(null);
  const [cnicBack, setCnicBack] = useState(null);

  // Toast notification state (top-right corner)
  const [toastMsg, setToastMsg] = useState("");
  const [toastType, setToastType] = useState("error"); // 'error' | 'success' | 'info'
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef(null);

  const showToast = (message, type = "error") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(message);
    setToastType(type);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 3500);
  };

  // Reference Modal State
  const [refModalVisible, setRefModalVisible] = useState(false);
  const [refCnicFront, setRefCnicFront] = useState(null);
  const [refCnicBack, setRefCnicBack] = useState(null);
  const [refOcrLoading, setRefOcrLoading] = useState(false);
  const [refOcrSuccess, setRefOcrSuccess] = useState(false);
  const [refName, setRefName] = useState("");
  const [refFatherName, setRefFatherName] = useState("");
  const [refAddress, setRefAddress] = useState("");
  const [refCnicNumber, setRefCnicNumber] = useState("");
  const [refContact, setRefContact] = useState("");
  const [refContactErr, setRefContactErr] = useState("");

  // Payment modal state
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [screenshot, setScreenshot] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [amountPaid, setAmountPaid] = useState("5000");
  const [userTxnId, setUserTxnId] = useState("");

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

  const loadPaymentRequest = async (uid) => {
    try {
      const res = await apiClient.backendGet(`/payment/initiator/status/${uid}`);
      if (res?.success && res.payment) {
        return {
          id: res.payment.paymentId || res.payment.id,
          userId: res.payment.user_id,
          amount: res.payment.amount,
          status: res.payment.status,
          transactionId: res.payment.transaction_id,
          createdAt: res.payment.created_at,
          trackingNumber: res.payment.paymentId ? res.payment.paymentId.substring(1, 9) : res.payment.id ? res.payment.id.substring(1, 9) : "Pending"
        };
      }
    } catch (e) {
      console.warn("[BecomeInitiatorScreen] Failed to fetch payment request:", e.message);
    }
    return null;
  };

  const checkStatus = async () => {
    try {
      let activeUid = null;
      const data = await AsyncStorage.getItem("userData");
      if (data) {
        const parsed = JSON.parse(data);
        activeUid = parsed.userId || parsed.uid;
      }
      if (!activeUid) return;
      setPendingUid(activeUid);
      const reqData = await loadPaymentRequest(activeUid);
      setRequest(reqData);
    } catch (err) {
      console.log("[BecomeInitiator] Check status error:", err);
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // ─── CNIC Helpers ─────────────────────────────────────
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

  const uploadReferenceCnic = () => {
    // Close the verification modal first (prevents nested modal issue)
    setCnicVisible(false);
    // Reset modal state every time it opens
    setRefCnicFront(null);
    setRefCnicBack(null);
    setRefOcrSuccess(false);
    setRefName("");
    setRefFatherName("");
    setRefAddress("");
    setRefCnicNumber("");
    setRefContact("");
    setRefContactErr("");
    // Small delay to let the first modal close animation finish
    setTimeout(() => setRefModalVisible(true), 300);
  };

  const pickRefCnicImage = async (side) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert("Permission Required", "Camera roll access is needed."); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.85 });
      if (!result.canceled && result.assets?.length) {
        if (side === "front") setRefCnicFront(result.assets[0].uri);
        else setRefCnicBack(result.assets[0].uri);
        setRefOcrSuccess(false);
      }
    } catch {
      Alert.alert("Error", "Failed to pick image.");
    }
  };

  const takeRefCnicPhoto = async (side) => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert("Permission Required", "Camera access is needed."); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.85 });
      if (!result.canceled && result.assets?.length) {
        if (side === "front") setRefCnicFront(result.assets[0].uri);
        else setRefCnicBack(result.assets[0].uri);
        setRefOcrSuccess(false);
      }
    } catch {
      Alert.alert("Error", "Failed to capture image.");
    }
  };

  const handleRefExtract = async () => {
    // ── STRICT RULE: Both front AND back images are required ──
    if (!refCnicFront && !refCnicBack) {
      Alert.alert(
        "Images Required",
        "Please upload BOTH Front and Back CNIC images before continuing verification."
      );
      return;
    }
    if (!refCnicFront) {
      Alert.alert(
        "Front Image Missing",
        "Please upload BOTH Front and Back CNIC images before continuing verification."
      );
      return;
    }
    if (!refCnicBack) {
      Alert.alert(
        "Back Image Missing",
        "Please upload BOTH Front and Back CNIC images before continuing verification."
      );
      return;
    }

    setRefOcrLoading(true);
    setRefOcrSuccess(false);
    try {
      const formData = new FormData();
      formData.append("userId", pendingUid || (auth.currentUser?.uid || ""));

      // Detect MIME type by extension
      const frontExt = refCnicFront.split(".").pop().toLowerCase();
      const frontMime = frontExt === "png" ? "image/png" : "image/jpeg";
      formData.append("cnicImage", {
        uri: refCnicFront,
        name: `ref-front.${frontExt || "jpg"}`,
        type: frontMime,
      });

      const backExt = refCnicBack.split(".").pop().toLowerCase();
      const backMime = backExt === "png" ? "image/png" : "image/jpeg";
      formData.append("cnicImage", {
        uri: refCnicBack,
        name: `ref-back.${backExt || "jpg"}`,
        type: backMime,
      });

      const result = await apiClient.backendUpload("/ocr/cnic", formData);

      if (result?.success) {
        const v = result.verification || {};
        const d = result.data || {};

        // Auto-fill reference fields
        if (d.full_name) setRefName(d.full_name);
        if (d.father_name) setRefFatherName(d.father_name);
        
        let addressMsg = "";
        if (d.address) {
          setRefAddress(d.address);
        } else {
          addressMsg = "\n\n⚠️ Address translation failed or was unavailable. Please enter English address manually.";
        }

        if (d.cnic_number) setRefCnicNumber(d.cnic_number);
        setRefOcrSuccess(true);

        // Show verification status
        const status = v.status || "VALID";
        const confidence = v.confidence ?? 100;
        const issues = v.issues?.length ? `\n\nIssues:\n• ${v.issues.join("\n• ")}` : "";
        const statusEmoji = status === "VALID" ? "✅" : status === "SUSPICIOUS" ? "⚠️" : "❌";

        Alert.alert(
          `${statusEmoji} Reference CNIC ${status}`,
          `Confidence: ${confidence}%\n\nReference details extracted. Please review and fill in Contact Number.${addressMsg}${issues}`
        );
      } else {
        Alert.alert("OCR Error", result?.error || "Failed to extract text from image.");
      }
    } catch (err) {
      Alert.alert("OCR Failed", err.message || "Failed to process image.");
    } finally {
      setRefOcrLoading(false);
    }
  };

  const formatPhoneInput = (t) => {
    let v = (t || "").replace(/[^0-9+]/g, "");
    if (v.startsWith("0")) v = "+92" + v.slice(1);
    if (!v.startsWith("+92")) v = "+92" + v.replace(/^\+?/, "");
    return v.slice(0, 13);
  };
  const isValidPkPhone = (n) => /^(\+92|0)3\d{9}$/.test(n);

  const saveReferenceDetails = async () => {
    if (!refName || !refCnicNumber || !refContact) {
      Alert.alert("Missing Fields", "Please provide Name, CNIC Number, and Contact Number.");
      return;
    }
    if (refContactErr) {
      Alert.alert("Invalid Input", "Please fix contact number errors first.");
      return;
    }
    const uid = pendingUid || auth.currentUser?.uid;
    if (!uid) {
      Alert.alert("Error", "User not found. Please sign in again.");
      return;
    }
    try {
      setUploading(true);

      // Upload front CNIC image to Firebase Storage
      let finalRefUri = null;
      if (refCnicFront) {
        try {
          const ext = refCnicFront.split(".").pop().toLowerCase() === "png" ? "png" : "jpg";
          finalRefUri = await userService.uploadFileToStorage(
            refCnicFront,
            `refCnicUploads/${uid}-${Date.now()}.${ext}`,
            `image/${ext === "png" ? "png" : "jpeg"}`
          );
        } catch (storageErr) {
          console.warn("[RefCNIC] Storage upload failed, using local URI:", storageErr.message);
          finalRefUri = refCnicFront; // fallback to local URI
        }
      }

      // Save directly to Firebase RTDB via userService
      await userService.updateProfileRTDB(uid, {
        pendingReferenceName: refName,
        pendingReferenceFatherName: refFatherName || "",
        pendingReferenceAddress: refAddress || "",
        pendingReferenceContact: refContact,
        pendingReferenceCnicNumber: refCnicNumber,
        referenceCnic: finalRefUri || "",
        referenceUpdatedAt: new Date().toISOString(),
      });

      setDocStatus(prev => ({ ...prev, hasRef: true }));
      setRefModalVisible(false);
      setTimeout(() => setCnicVisible(true), 300);
      Alert.alert("✅ Saved", "Reference details have been securely saved.");
    } catch (e) {
      console.error("[RefCNIC] Save error:", e);
      Alert.alert("Error", "Failed to save reference details. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const uploadBankStatement = async () => {
    if (!pendingUid) return;
    try {
      setUploading(true);

      // Step 1: Pick document — PDF only filter applied here
      const res = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) { setUploading(false); setCnicVisible(true); return; }

      const picked = res.assets[0];
      const pickedUri = picked.uri;
      const pickedName = picked.name || "bank-statement.pdf";
      const pickedMime = picked.mimeType || "";

      // Step 2: Enforce PDF format (double check mime + extension)
      const pickedExt = pickedName.split(".").pop().toLowerCase();
      const isPdf = pickedMime === "application/pdf" || pickedExt === "pdf";
      if (!isPdf) {
        showToast("Only PDF files are accepted for bank statements.", "error");
        setUploading(false);
        setCnicVisible(true);
        return;
      }

      // Step 3: Call OCR validation endpoint before uploading
      let ocrPassed = true; // default allow if OCR fails
      try {
        const ocrForm = new FormData();
        ocrForm.append("userId", pendingUid);
        if (Platform.OS === "web") {
          const response = await fetch(pickedUri);
          const fileBlob = await response.blob();
          ocrForm.append("bankStatement", fileBlob, pickedName);
        } else {
          ocrForm.append("bankStatement", {
            uri: pickedUri,
            name: pickedName,
            type: "application/pdf",
          });
        }
        const ocrResult = await apiClient.backendUpload("/ocr/bank-statement", ocrForm);

        if (ocrResult?.matched === false) {
          // Name mismatch — reject document
          showToast("Invalid document — account holder name does not match your ID card.", "error");
          setUploading(false);
          setCnicVisible(true);
          return;
        }
        if (ocrResult?.matched === true) {
          showToast("Document verified ✓ Name matched successfully.", "success");
        }
        // matched === null → inconclusive, allow with warning
      } catch (ocrErr) {
        console.warn("[BankStmt OCR] Validation skipped:", ocrErr.message);
        // Allow upload if OCR endpoint is unreachable
      }

      // Step 4: Upload to Firebase Storage
      let uploadedUri = pickedUri;
      try {
        uploadedUri = await userService.uploadFileToStorage(
          pickedUri,
          `bankStatements/${pendingUid}-${Date.now()}.pdf`,
          "application/pdf"
        );
      } catch (storageErr) {
        console.warn("[BecomeInitiator] Bank storage upload failed, using local URI:", storageErr.message);
      }
      await userService.updateProfileRTDB(pendingUid, { bankStatement: uploadedUri });
      setDocStatus(prev => ({ ...prev, hasBank: true }));
      setCnicVisible(true);
      Alert.alert("Success", "Bank Statement uploaded and verified.");
    } catch (err) {
      console.error("[BankStmt]", err);
      setCnicVisible(true);
      Alert.alert("Error", "Failed to upload Bank Statement. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleUploadCnicAndProceed = async () => {
    if (!pendingUid) return;
    if (!cnicFront) {
      Alert.alert("Required", "Please upload at least the CNIC front image.");
      return;
    }
    try {
      setCnicUploading(true);

      // Upload front image to storage
      const frontExt = cnicFront.split(".").pop().toLowerCase() === "png" ? "png" : "jpg";
      const uploadedFrontUri = await userService.uploadFileToStorage(
        cnicFront,
        `cnicUploads/${pendingUid}-front-${Date.now()}.${frontExt}`,
        `image/${frontExt === "png" ? "png" : "jpeg"}`
      );

      const profileUpdate = { cnic: uploadedFrontUri };

      // Upload back image if provided
      if (cnicBack) {
        const backExt = cnicBack.split(".").pop().toLowerCase() === "png" ? "png" : "jpg";
        const uploadedBackUri = await userService.uploadFileToStorage(
          cnicBack,
          `cnicUploads/${pendingUid}-back-${Date.now()}.${backExt}`,
          `image/${backExt === "png" ? "png" : "jpeg"}`
        );
        profileUpdate.cnicBack = uploadedBackUri;
      }

      await userService.updateProfileRTDB(pendingUid, profileUpdate);
      setDocStatus(prev => ({ ...prev, hasCNIC: true }));

      // Call backend OCR endpoint to extract text and encrypt CNIC
      try {
        const formData = new FormData();
        formData.append("cnicImage", {
          uri: cnicFront,
          name: `ocr-front-${Date.now()}.${frontExt}`,
          type: `image/${frontExt === "png" ? "png" : "jpeg"}`,
        });
        if (cnicBack) {
          const backExt2 = cnicBack.split(".").pop().toLowerCase() === "png" ? "png" : "jpg";
          formData.append("cnicImage", {
            uri: cnicBack,
            name: `ocr-back-${Date.now()}.${backExt2}`,
            type: `image/${backExt2 === "png" ? "png" : "jpeg"}`,
          });
        }
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

      // Send notifications (to User and to Admin)
      try {
        await sendNotification(
          finalUid,
          "Initiator Application Submitted",
          "Your request has been received. Expect approval within 2 hours.",
          "success",
          finalUid
        );
        await sendAdminNotification(
          "New Initiator Request",
          `${requestUserName || "A user"} has requested to become an initiator. Check the dashboard to approve.`,
          "info",
          finalUid
        );
      } catch (notifErr) {
        console.warn("[BecomeInitiator] Failed to send submit notifications:", notifErr.message);
      }

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
        mediaTypes: ["images"],
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

    if (!amountPaid || isNaN(amountPaid) || Number(amountPaid) <= 0) {
      Alert.alert("Error", "Please enter a valid amount paid");
      return;
    }

    if (!screenshot) {
      Alert.alert("Error", "Please upload payment screenshot");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("amount", Number(amountPaid));
      formData.append("method", selectedMethod);
      if (userTxnId.trim()) {
        formData.append("transaction_id", userTxnId.trim());
      }
      
      const fileExt = screenshot.split(".").pop().toLowerCase() === "png" ? "png" : "jpg";
      formData.append("proof", {
        uri: screenshot,
        name: `proof-${Date.now()}.${fileExt}`,
        type: `image/${fileExt === "png" ? "png" : "jpeg"}`,
      });

      const res = await apiClient.backendUpload("/payment/initiator/submit", formData);
      
      if (res?.success) {
        Alert.alert("Success", "Your payment has been submitted and is pending admin approval.");
        setPaymentVisible(false);
        resetPaymentForm();
        checkStatus();
      } else {
        Alert.alert("Error", res?.error || "Submission failed. Please try again.");
      }
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to submit payment.");
      console.error("[BecomeInitiatorScreen] Payment submission failed:", e);
    } finally {
      setUploading(false);
    }
  };

  const resetPaymentForm = () => {
    setSelectedMethod(null);
    setScreenshot(null);
    setAmountPaid("5000");
    setUserTxnId("");
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
      {/* ── Toast Notification (top-right) ───────────────── */}
      {toastVisible && (
        <View
          pointerEvents="none"
          style={[
            styles.toastContainer,
            {
              backgroundColor:
                toastType === "success" ? "#10B981" :
                toastType === "info"    ? "#3B82F6" : "#EF4444",
            },
          ]}
        >
          <Text style={styles.toastText}>
            {toastType === "error" ? "⚠️ " : toastType === "success" ? "✅ " : "ℹ️ "}
            {toastMsg}
          </Text>
        </View>
      )}
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
                  </View>
                )}

                {/* ── Combined Submission Form (For Manual Methods) ── */}
                {selectedMethod && selectedMethod !== "card" && (
                  <View style={styles.formSection}>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary, marginBottom: 4 }]}>Amount Paid (Rs) *</Text>
                    <TextInput
                      style={[styles.input, { color: colors.text, borderColor: colors.border, marginBottom: 12 }]}
                      value={amountPaid}
                      onChangeText={setAmountPaid}
                      keyboardType="numeric"
                      placeholder="e.g. 5000"
                      placeholderTextColor={colors.textSecondary + "80"}
                    />

                    <Text style={[styles.inputLabel, { color: colors.textSecondary, marginBottom: 4 }]}>Transaction ID (Optional)</Text>
                    <TextInput
                      style={[styles.input, { color: colors.text, borderColor: colors.border, marginBottom: 12 }]}
                      value={userTxnId}
                      onChangeText={setUserTxnId}
                      placeholder="e.g. TXN-123456789"
                      placeholderTextColor={colors.textSecondary + "80"}
                      autoCapitalize="characters"
                    />

                    <Text style={[styles.uploadLabel, { color: colors.text, marginBottom: 6 }]}>Upload Payment Screenshot * (JPG, PNG only)</Text>
                    <TouchableOpacity onPress={pickScreenshot} style={[styles.uploadBtn, { borderColor: colors.brand }]} activeOpacity={0.75}>
                      <Ionicons name={screenshot ? "checkmark-circle" : "cloud-upload-outline"} size={20} color={colors.brand} />
                      <Text style={[styles.uploadBtnText, { color: colors.brand }]}>{screenshot ? "Screenshot Selected ✓" : "Choose Screenshot"}</Text>
                    </TouchableOpacity>
                    {screenshot && <Image source={{ uri: screenshot }} style={styles.screenshotPreview} />}
                  </View>
                )}

                {/* ── Submit Button ──────────────────────────── */}
                {selectedMethod && (
                  <TouchableOpacity
                    onPress={processPayment}
                    style={[styles.payBtn, { backgroundColor: colors.brand, marginTop: 10 }, uploading && { opacity: 0.6 }]}
                    disabled={uploading}
                    activeOpacity={0.85}
                  >
                    {uploading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="shield-checkmark" size={18} color="#fff" />
                        <Text style={styles.payBtnText}>Submit Payment Verification</Text>
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
              {/* ── CNIC Front/Back Upload Cards ── */}
              <View>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, marginBottom: 8 }}>
                  {docStatus.hasCNIC ? '✅ CNIC Uploaded' : 'Upload Your CNIC'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                  {/* Front Side */}
                  <View style={[styles.cnicUploadCard, { borderColor: (cnicFront || docStatus.hasCNIC) ? colors.brand : colors.border }]}>
                    <Text style={[styles.cnicUploadLabel, { color: colors.text }]}>Front Side</Text>
                    {cnicFront ? (
                      <Image source={{ uri: cnicFront }} style={styles.cnicPreview} />
                    ) : (
                      <View style={styles.cnicPlaceholder}>
                        <FontAwesome5 name="id-card" size={24} color={docStatus.hasCNIC ? colors.brand : colors.border} />
                        <Text style={{ fontSize: 10, color: docStatus.hasCNIC ? colors.brand : colors.textSecondary, marginTop: 4 }}>
                          {docStatus.hasCNIC ? 'Uploaded' : 'Required'}
                        </Text>
                      </View>
                    )}
                    <View style={styles.cnicBtnRow}>
                      <TouchableOpacity onPress={() => pickCnicImage('front')} style={styles.cnicPickBtn}>
                        <Ionicons name="image-outline" size={14} color={colors.brand} />
                        <Text style={[styles.cnicPickBtnText, { color: colors.brand }]}>Gallery</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => takeCnicPhoto('front')} style={styles.cnicPickBtn}>
                        <Ionicons name="camera-outline" size={14} color={colors.brand} />
                        <Text style={[styles.cnicPickBtnText, { color: colors.brand }]}>Camera</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Back Side */}
                  <View style={[styles.cnicUploadCard, { borderColor: cnicBack ? colors.brand : colors.border }]}>
                    <Text style={[styles.cnicUploadLabel, { color: colors.text }]}>Back Side</Text>
                    {cnicBack ? (
                      <Image source={{ uri: cnicBack }} style={styles.cnicPreview} />
                    ) : (
                      <View style={styles.cnicPlaceholder}>
                        <FontAwesome5 name="id-card" size={24} color={colors.border} />
                        <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 4 }}>Optional</Text>
                      </View>
                    )}
                    <View style={styles.cnicBtnRow}>
                      <TouchableOpacity onPress={() => pickCnicImage('back')} style={styles.cnicPickBtn}>
                        <Ionicons name="image-outline" size={14} color={colors.brand} />
                        <Text style={[styles.cnicPickBtnText, { color: colors.brand }]}>Gallery</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => takeCnicPhoto('back')} style={styles.cnicPickBtn}>
                        <Ionicons name="camera-outline" size={14} color={colors.brand} />
                        <Text style={[styles.cnicPickBtnText, { color: colors.brand }]}>Camera</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {(cnicFront || cnicBack) && (
                  <TouchableOpacity
                    onPress={handleUploadCnicAndProceed}
                    style={[styles.payBtn, { backgroundColor: colors.brand, marginTop: 4 }, (!cnicFront || cnicUploading) && { opacity: 0.5 }]}
                    disabled={!cnicFront || cnicUploading}
                  >
                    {cnicUploading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <FontAwesome5 name="cloud-upload-alt" size={14} color="#fff" />
                        <Text style={styles.payBtnText}>{docStatus.hasCNIC ? 'Re-upload CNIC' : 'Upload CNIC'}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {/* ── Reference CNIC ── */}
              <TouchableOpacity
                onPress={uploadReferenceCnic}
                style={[styles.uploadBtn, { borderColor: docStatus.hasRef ? '#10B981' : colors.brand }]}
              >
                <Ionicons name={docStatus.hasRef ? "checkmark-circle" : "cloud-upload-outline"} size={20} color={docStatus.hasRef ? '#10B981' : colors.brand} />
                <Text style={[styles.uploadBtnText, { color: docStatus.hasRef ? '#10B981' : colors.brand }]}>{docStatus.hasRef ? "Ref CNIC Uploaded ✓" : "Upload Reference CNIC"}</Text>
              </TouchableOpacity>

              {/* ── Bank Statement ── */}
              <TouchableOpacity
                onPress={() => {
                  setCnicVisible(false);
                  setTimeout(() => uploadBankStatement(), 300);
                }}
                style={[styles.uploadBtn, { borderColor: docStatus.hasBank ? '#10B981' : colors.brand }, uploading && { opacity: 0.6 }]}
                disabled={uploading}
              >
                <Ionicons name={docStatus.hasBank ? "checkmark-circle" : "cloud-upload-outline"} size={20} color={docStatus.hasBank ? '#10B981' : colors.brand} />
                <Text style={[styles.uploadBtnText, { color: docStatus.hasBank ? '#10B981' : colors.brand }]}>{docStatus.hasBank ? "Bank Statement Uploaded ✓" : "Upload Bank Statement"}</Text>
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

      {/* ═══════════════════════════════════════════════════ */}
      {/* REFERENCE CNIC OCR MODAL                           */}
      {/* ═══════════════════════════════════════════════════ */}
      <Modal visible={refModalVisible} transparent animationType="slide" onRequestClose={() => { setRefModalVisible(false); setTimeout(() => setCnicVisible(true), 300); }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.paymentModalCard, { backgroundColor: colors.card, padding: 20, maxHeight: "90%" }]}>
              <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 20 }}>
                <View style={[styles.pmHeader, { marginBottom: 12 }]}>
                  <Text style={[styles.pmTitle, { color: colors.text }]}>Reference ID Data</Text>
                  <TouchableOpacity onPress={() => { setRefModalVisible(false); setTimeout(() => setCnicVisible(true), 300); }}>
                    <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Text style={{ color: colors.textSecondary, marginBottom: 16, fontSize: 13 }}>
                  Please take photos of the front and back of the Reference ID card to auto-fill the details below.
                </Text>

                {/* Upload Row */}
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                  {/* Front */}
                  <View style={[styles.cnicUploadCard, { borderColor: refCnicFront ? colors.brand : colors.border }]}>
                    <Text style={[styles.cnicUploadLabel, { color: colors.text }]}>Front Side</Text>
                    {refCnicFront ? (
                      <Image source={{ uri: refCnicFront }} style={styles.cnicPreview} />
                    ) : (
                      <View style={styles.cnicPlaceholder}>
                        <FontAwesome5 name="id-card" size={24} color={colors.border} />
                      </View>
                    )}
                    <View style={styles.cnicBtnRow}>
                      <TouchableOpacity onPress={() => pickRefCnicImage("front")} style={styles.cnicPickBtn}>
                        <Ionicons name="image-outline" size={14} color={colors.brand} />
                        <Text style={[styles.cnicPickBtnText, { color: colors.brand }]}>Gallery</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => takeRefCnicPhoto("front")} style={styles.cnicPickBtn}>
                        <Ionicons name="camera-outline" size={14} color={colors.brand} />
                        <Text style={[styles.cnicPickBtnText, { color: colors.brand }]}>Camera</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Back */}
                  <View style={[styles.cnicUploadCard, { borderColor: refCnicBack ? colors.brand : colors.border }]}>
                    <Text style={[styles.cnicUploadLabel, { color: colors.text }]}>Back Side</Text>
                    {refCnicBack ? (
                      <Image source={{ uri: refCnicBack }} style={styles.cnicPreview} />
                    ) : (
                      <View style={styles.cnicPlaceholder}>
                        <FontAwesome5 name="id-card" size={24} color={colors.border} />
                      </View>
                    )}
                    <View style={styles.cnicBtnRow}>
                      <TouchableOpacity onPress={() => pickRefCnicImage("back")} style={styles.cnicPickBtn}>
                        <Ionicons name="image-outline" size={14} color={colors.brand} />
                        <Text style={[styles.cnicPickBtnText, { color: colors.brand }]}>Gallery</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => takeRefCnicPhoto("back")} style={styles.cnicPickBtn}>
                        <Ionicons name="camera-outline" size={14} color={colors.brand} />
                        <Text style={[styles.cnicPickBtnText, { color: colors.brand }]}>Camera</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Required images indicator */}
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 12 }}>
                  <View style={[{ flex: 1, padding: 8, borderRadius: 8, alignItems: "center", borderWidth: 1 }, { borderColor: refCnicFront ? "#10B981" : colors.border, backgroundColor: refCnicFront ? "#ECFDF5" : colors.background }]}>
                    <Ionicons name={refCnicFront ? "checkmark-circle" : "alert-circle-outline"} size={16} color={refCnicFront ? "#10B981" : colors.textSecondary} />
                    <Text style={{ fontSize: 11, color: refCnicFront ? "#10B981" : colors.textSecondary, marginTop: 2 }}>Front {refCnicFront ? "✓" : "Required"}</Text>
                  </View>
                  <View style={[{ flex: 1, padding: 8, borderRadius: 8, alignItems: "center", borderWidth: 1 }, { borderColor: refCnicBack ? "#10B981" : colors.border, backgroundColor: refCnicBack ? "#ECFDF5" : colors.background }]}>
                    <Ionicons name={refCnicBack ? "checkmark-circle" : "alert-circle-outline"} size={16} color={refCnicBack ? "#10B981" : colors.textSecondary} />
                    <Text style={{ fontSize: 11, color: refCnicBack ? "#10B981" : colors.textSecondary, marginTop: 2 }}>Back {refCnicBack ? "✓" : "Required"}</Text>
                  </View>
                </View>

                {/* Extract Button */}
                <TouchableOpacity
                  onPress={handleRefExtract}
                  style={[styles.payBtn, { backgroundColor: (refCnicFront && refCnicBack) ? colors.brand : colors.border, marginBottom: 20 }, refOcrLoading && { opacity: 0.6 }]}
                  disabled={refOcrLoading || !refCnicFront || !refCnicBack}
                >
                  {refOcrLoading ? <ActivityIndicator size="small" color="#fff" /> : (
                    <>
                      <Ionicons name="scan" size={16} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.payBtnText}>{(refCnicFront && refCnicBack) ? "AI Extract Details" : "Upload Both Images First"}</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* OCR Success Banner */}
                {refOcrSuccess && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#ECFDF5", borderRadius: 8, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: "#10B981" }}>
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    <Text style={{ color: "#065F46", fontSize: 13, flex: 1 }}>Reference CNIC details extracted. Please review below.</Text>
                  </View>
                )}

                {/* Form Fields */}
                <View style={{ gap: 12 }}>
                  <View>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Reference Name</Text>
                    <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} value={refName} onChangeText={setRefName} />
                  </View>
                  <View>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Father Name</Text>
                    <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} value={refFatherName} onChangeText={setRefFatherName} />
                  </View>
                  <View>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>CNIC Number</Text>
                    <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} value={refCnicNumber} onChangeText={setRefCnicNumber} keyboardType="numeric" />
                  </View>
                  <View>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Address</Text>
                    <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} value={refAddress} onChangeText={setRefAddress} />
                  </View>
                  <View>
                    <Text style={[styles.inputLabel, { color: colors.brand, fontWeight: "bold" }]}>Contact Number *</Text>
                    <TextInput 
                      style={[styles.input, { color: colors.text, borderColor: refContactErr ? colors.danger : colors.border }]} 
                      value={refContact} 
                      onChangeText={(t) => {
                        const v = formatPhoneInput(t);
                        setRefContact(v);
                        setRefContactErr(v && !isValidPkPhone(v) ? "Enter valid PK number" : "");
                      }} 
                      keyboardType="phone-pad" 
                      placeholder="+923..." 
                    />
                    {!!refContactErr && <Text style={{ color: colors.danger, fontSize: 11, marginTop: 4 }}>{refContactErr}</Text>}
                  </View>
                </View>

                {/* Save Button */}
                <TouchableOpacity
                  onPress={saveReferenceDetails}
                  style={[styles.payBtn, { backgroundColor: colors.brand, marginTop: 24 }]}
                >
                  {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.payBtnText}>Securely Save Details</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
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

  // Toast notification
  toastContainer: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 9999,
    maxWidth: 280,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 10,
  },
  toastText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
    lineHeight: 18,
  },
});
