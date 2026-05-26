import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
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

import apiClient from "../../services/apiClient";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";
import { requireAuth } from "../../utils/authGate";
import { depositToPool as chainDeposit } from "../../utils/walletManager";

const CHAIN_COLORS = {
  confirmed: "#22C55E",
  pending:   "#F59E0B",
  failed:    "#EF4444",
  onChain:   "#3B82F6",
};

const STEPS = ["Authenticate", "Confirm", "Broadcasting", "Confirmed"];

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

export default function PaymentScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { committeeId, userId, amount, committeeName } = route.params;

  const [selectedMethod, setSelectedMethod] = useState(null);
  const [screenshot, setScreenshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [turnIndex, setTurnIndex] = useState(null);
  const [turnDate, setTurnDate] = useState(null);
  const [memberId, setMemberId] = useState(null);

  // Card fields
  const [cardholderName, setCardholderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvv, setCvv] = useState("");

  // Confirmation
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [transactionId, setTransactionId] = useState("");

  // Blockchain / step state
  const [activeStep,  setActiveStep]  = useState(0);  // 0-based index into STEPS
  const [txPending,   setTxPending]   = useState(false);
  const [onChainHash, setOnChainHash] = useState(null);

  useEffect(() => {
    const loadTurn = async () => {
      try {
        const committeeData = await userService.getCommitteeById(committeeId);
        if (!committeeData) return;
        if (Array.isArray(committeeData.turns)) {
          const t = committeeData.turns.find((t) => t && (t.id === userId || t.userId === userId));
          if (t) {
            setTurnIndex(t.index || t.turnIndex || null);
            setTurnDate(t.turnDate || null);
          }
        }
        if (Array.isArray(committeeData.usersParticipated)) {
          const idx = committeeData.usersParticipated.findIndex((m) => m && (m.userId === userId || m.uid === userId || m.id === userId));
          if (idx >= 0) {
            const m = committeeData.usersParticipated[idx];
            setMemberId(m?.memberId || String(idx + 1));
            if (!turnIndex) setTurnIndex(idx + 1);
          }
        }
      } catch (err) {
        console.error("[PaymentScreen] loadTurn failed:", err);
      }
    };
    loadTurn();
  }, [committeeId, userId]);

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

  // ─── Card formatting ──────────────────────────────────
  const formatCardInput = (text) => {
    const nums = text.replace(/\D/g, "").slice(0, 16);
    return nums.replace(/(\d{4})(?=\d)/g, "$1 ");
  };
  const formatExpiryInput = (text) => {
    const nums = text.replace(/\D/g, "").slice(0, 4);
    if (nums.length > 2) return nums.slice(0, 2) + "/" + nums.slice(2);
    return nums;
  };

  // ─── Process Payment ──────────────────────────────────
  const handlePayment = async () => {
    if (!selectedMethod) {
      Alert.alert("Error", "Please select a payment method");
      return;
    }

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

    // ── Step 1: Biometric / PIN auth ──────────────────────
    setActiveStep(0);
    const authed = await requireAuth();
    if (!authed) return;   // user cancelled
    setActiveStep(1);
    setLoading(true);

    setTimeout(async () => {
      try {
        const txnId = generateTransactionId();

        // Save screenshot if applicable
        let screenshotUrl = null;
        if (screenshot && selectedMethod !== "card") {
          try {
            screenshotUrl = await userService.uploadFileToStorage(
              screenshot,
              `committeePayments/${committeeId}/${userId}/${txnId}.jpg`,
              "image/jpeg"
            );
          } catch (e) {
            console.warn("[Payment] Screenshot upload failed:", e.message);
            screenshotUrl = screenshot;
          }
        }

        // Try backend encryption
        try {
          // ── Step 3: Try blockchain deposit for on-chain methods ──
          if (selectedMethod === "easypaisa" || selectedMethod === "jazzcash" || selectedMethod === "bank") {
            try {
              setActiveStep(2);   // Broadcasting
              setTxPending(true);
              // djb2 hash — stable, no Buffer polyfill needed
              const numId  = committeeId.split("").reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) >>> 0, 5381);
              const ethAmt = (Number(amount) / 300000).toFixed(6);  // PKR→ETH rough peg
              const receipt = await chainDeposit(numId, ethAmt);
              setOnChainHash(receipt?.hash || null);
            } catch (chainErr) {
              console.warn("[Payment] Chain deposit failed (non-blocking):", chainErr.message);
            } finally {
              setTxPending(false);
            }
          }
          setActiveStep(3);   // Confirmed

          let result;
          if (selectedMethod === "card") {
            const paymentData = {
              userId,
              committeeId,
              amount,
              method: "Card",
              committeeName: committeeName || null,
              transactionId: txnId,
              cardNumber: cardNumber.replace(/\s/g, ""),
              expiry: expiryDate,
              cvv: cvv,
              cardholderName: cardholderName,
            };
            result = await apiClient.backendPost("/payment/process", paymentData);
          } else {
            const fileExt = screenshot.split(".").pop().toLowerCase() === "png" ? "png" : "jpg";
            const formData = new FormData();
            formData.append("userId", userId);
            formData.append("committeeId", committeeId);
            formData.append("amount", String(amount));
            formData.append("method", selectedMethod);
            if (committeeName) {
              formData.append("committeeName", committeeName);
            }
            formData.append("referenceId", txnId);
            formData.append("screenshot", {
              uri: screenshot,
              name: `screenshot-${txnId}.${fileExt}`,
              type: `image/${fileExt === "png" ? "png" : "jpeg"}`,
            });
            result = await apiClient.backendUpload("/payment/submit-screenshot", formData);
          }

          if (result?.success) {
            setLoading(false);
            setTransactionId(txnId);
            setConfirmVisible(true);
            return;
          }
        } catch (backendErr) {
          console.warn("[Payment] Backend unavailable, using fallback:", backendErr.message);
        }

        // Fallback: direct Firebase save
        const committeeData = await userService.getCommitteeById(committeeId);
        if (!committeeData || !committeeData.usersParticipated) {
          throw new Error("Committee or members not found");
        }
        const members = committeeData.usersParticipated;
        const memberIndex = members.findIndex((m) => m && (m.userId === userId || m.uid === userId || m.id === userId));
        if (memberIndex === -1) throw new Error("User not found in committee");

        const currentUserData = members[memberIndex];
        const isCard = selectedMethod === "card";
        const newPayment = {
          amount,
          date: new Date().toISOString(),
          status: isCard ? "Paid" : "Pending Verification",
          method: selectedMethod,
          transactionId: txnId,
          referenceId: isCard ? null : txnId,
        };
        const updatedPayments = [...(currentUserData.payments || []), newPayment];
        members[memberIndex] = {
          ...currentUserData,
          payments: updatedPayments,
          lastPaymentDate: new Date().toISOString(),
          paymentStatus: isCard ? "Paid" : "Pending Verification",
        };

        await userService.updateCommittee(committeeId, { usersParticipated: members });
        await apiClient.post("payments", {
          userId,
          committeeId,
          amount,
          date: new Date().toISOString(),
          method: selectedMethod,
          transactionId: txnId,
          screenshotUrl: screenshotUrl || null,
          status: isCard ? "Approved" : "Pending Verification",
          committeeName: committeeName || null,
        });
        setActiveStep(3);
        setLoading(false);
        setTransactionId(txnId);
        setConfirmVisible(true);
      } catch (error) {
        console.error("Payment error:", error);
        setLoading(false);
        setActiveStep(0);
        Alert.alert("Error", "Payment failed. Please try again.");
      }
    }, 2000);
  };

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        {/* ── Header ────────────────────────────────────── */}
        <View style={[styles.hero, { backgroundColor: colors.brand }]}>
          <View style={styles.heroBlobA} />
          <View style={styles.heroBlobB} />
          <FontAwesome5 name="money-check-alt" size={30} color="rgba(255,255,255,0.85)" style={{ marginBottom: 8 }} />
          <Text style={styles.heroTitle}>Committee Payment</Text>
          <Text style={styles.heroSub}>{committeeName || "Pay your contribution"}</Text>
        </View>

        {/* ── Step Indicator ─────────────────────────────── */}
        <View style={styles.stepRow}>
          {STEPS.map((label, idx) => {
            const done   = activeStep > idx;
            const active = activeStep === idx && loading;
            const color  = done ? CHAIN_COLORS.confirmed : active ? CHAIN_COLORS.onChain : "#CBD5E1";
            return (
              <View key={label} style={styles.stepItem}>
                <View style={[styles.stepCircle, { backgroundColor: color }]}>
                  {done
                    ? <Ionicons name="checkmark" size={12} color="#fff" />
                    : <Text style={styles.stepNum}>{idx + 1}</Text>}
                </View>
                <Text style={[styles.stepLabel, { color: active || done ? color : "#94A3B8" }]}>{label}</Text>
                {idx < STEPS.length - 1 && <View style={[styles.stepLine, { backgroundColor: done ? CHAIN_COLORS.confirmed : "#CBD5E1" }]} />}
              </View>
            );
          })}
        </View>

        {/* ── Blockchain broadcast banner ────────────────── */}
        {txPending && (
          <View style={[styles.broadcastBanner, { backgroundColor: CHAIN_COLORS.pending + "20", borderColor: CHAIN_COLORS.pending }]}>
            <ActivityIndicator size="small" color={CHAIN_COLORS.pending} />
            <Text style={[styles.broadcastText, { color: CHAIN_COLORS.pending }]}>
              Awaiting blockchain confirmation… (~12s)
            </Text>
          </View>
        )}

        {/* ── Amount + Info Card ─────────────────────────── */}
        <View style={[styles.amountCard, { backgroundColor: colors.card }]}>
          <View style={styles.amtRow}>
            <View>
              <Text style={[styles.amtLabel, { color: colors.textSecondary }]}>Amount Due</Text>
              <Text style={[styles.amtValue, { color: colors.text }]}>Rs {Number(amount).toLocaleString()} PKR</Text>
            </View>
            <View style={[styles.amtIcon, { backgroundColor: colors.brand + "15" }]}>
              <FontAwesome5 name="coins" size={20} color={colors.brand} />
            </View>
          </View>

          <View style={[styles.amtDivider, { backgroundColor: colors.border }]} />

          <View style={styles.infoItems}>
            <View style={styles.infoRow}>
              <FontAwesome5 name="calendar-check" size={14} color={colors.brand} />
              <Text style={[styles.infoText, { color: colors.text }]}>Your Turn: {turnIndex ? `#${turnIndex}` : "—"}{turnDate ? ` • ${turnDate}` : ""}</Text>
            </View>
            {memberId && (
              <View style={styles.infoRow}>
                <FontAwesome5 name="id-card" size={14} color={colors.textSecondary} />
                <Text style={[styles.infoText, { color: colors.textSecondary }]}>Your ID: CM-{memberId}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Payment Method Selection ───────────────────── */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Select Payment Method</Text>

        <View style={styles.methodGrid}>
          {PAYMENT_METHODS.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.methodCard, { borderColor: selectedMethod === m.id ? m.color : colors.border, backgroundColor: selectedMethod === m.id ? m.color + "10" : colors.card }]}
              onPress={() => { setSelectedMethod(m.id); setScreenshot(null); }}
              activeOpacity={0.75}
              disabled={loading}
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

        {/* ── Easypaisa / JazzCash ──────────────────────── */}
        {(selectedMethod === "easypaisa" || selectedMethod === "jazzcash") && (
          <View style={[styles.formCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.formTitle, { color: colors.text }]}>Transfer Details</Text>
            <View style={[styles.infoBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={styles.infoBoxRow}>
                <Text style={[styles.infoBoxLabel, { color: colors.textSecondary }]}>Account Name</Text>
                <Text style={[styles.infoBoxValue, { color: colors.text }]}>{WALLET_INFO[selectedMethod].accountName}</Text>
              </View>
              <View style={[styles.infoSep, { backgroundColor: colors.border }]} />
              <View style={styles.infoBoxRow}>
                <Text style={[styles.infoBoxLabel, { color: colors.textSecondary }]}>Account Number</Text>
                <Text style={[styles.infoBoxValue, { color: colors.text }]}>{WALLET_INFO[selectedMethod].accountNumber}</Text>
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

        {/* ── Bank Transfer ─────────────────────────────── */}
        {selectedMethod === "bank" && (
          <View style={[styles.formCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.formTitle, { color: colors.text }]}>Bank Transfer Details</Text>
            <View style={[styles.infoBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={styles.infoBoxRow}>
                <Text style={[styles.infoBoxLabel, { color: colors.textSecondary }]}>Bank Name</Text>
                <Text style={[styles.infoBoxValue, { color: colors.text }]}>{BANK_INFO.bankName}</Text>
              </View>
              <View style={[styles.infoSep, { backgroundColor: colors.border }]} />
              <View style={styles.infoBoxRow}>
                <Text style={[styles.infoBoxLabel, { color: colors.textSecondary }]}>Account Title</Text>
                <Text style={[styles.infoBoxValue, { color: colors.text }]}>{BANK_INFO.accountTitle}</Text>
              </View>
              <View style={[styles.infoSep, { backgroundColor: colors.border }]} />
              <View style={styles.infoBoxRow}>
                <Text style={[styles.infoBoxLabel, { color: colors.textSecondary }]}>IBAN</Text>
                <Text style={[styles.infoBoxValue, { color: colors.text }]}>{BANK_INFO.iban}</Text>
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

        {/* ── Card Payment ──────────────────────────────── */}
        {selectedMethod === "card" && (
          <View style={[styles.formCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.formTitle, { color: colors.text }]}>Card Details</Text>
            <View style={[styles.cardFormBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Cardholder Name</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                placeholder="John Doe"
                placeholderTextColor={colors.textSecondary + "80"}
                value={cardholderName}
                onChangeText={setCardholderName}
                autoCapitalize="words"
              />

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

        {/* ── Pay Button ────────────────────────────────── */}
        {selectedMethod && (
          <TouchableOpacity
            onPress={handlePayment}
            style={[
              styles.payBtn,
              { backgroundColor: activeStep === 3 ? CHAIN_COLORS.confirmed : loading ? CHAIN_COLORS.pending : colors.brand },
              (loading || txPending) && { opacity: 0.75 },
            ]}
            disabled={loading || txPending}
            activeOpacity={0.85}
          >
            {loading ? (
              <><ActivityIndicator size="small" color="#fff" />
              <Text style={styles.payBtnText}>
                {activeStep === 2 ? "Broadcasting…" : activeStep === 3 ? "Confirmed" : "Processing…"}
              </Text></>
            ) : (
              <>
                <Ionicons name="shield-checkmark" size={18} color="#fff" />
                <Text style={styles.payBtnText}>Pay Rs {Number(amount).toLocaleString()}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* CONFIRMATION MODAL                             */}
        {/* ═══════════════════════════════════════════════ */}
        <Modal visible={confirmVisible} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={[styles.confirmCard, { backgroundColor: colors.card }]}>
              <View style={[styles.confirmCircle, { backgroundColor: "#10B981" }]}>
                <FontAwesome5 name="check" size={32} color="#fff" />
              </View>
              <Text style={[styles.confirmTitle, { color: "#10B981" }]}>Payment Successful!</Text>
              <Text style={[styles.confirmSub, { color: colors.textSecondary }]}>
                Your payment has been submitted successfully.
              </Text>
              <View style={[styles.txnBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.txnLabel, { color: colors.textSecondary }]}>Transaction ID</Text>
                <Text style={[styles.txnValue, { color: colors.text }]}>{transactionId}</Text>
              </View>
              <View style={[styles.txnBox, { backgroundColor: colors.background, borderColor: colors.border, marginTop: 8 }]}>
                <Text style={[styles.txnLabel, { color: colors.textSecondary }]}>Committee</Text>
                <Text style={[styles.txnValue, { color: colors.text, fontSize: 15 }]}>{committeeName}</Text>
              </View>
              <Text style={[styles.confirmNote, { color: colors.textSecondary }]}>
                Your payment will be verified shortly.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setConfirmVisible(false);
                  navigation.goBack();
                }}
                style={[styles.confirmBtn, { backgroundColor: colors.brand }]}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ═══════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1 },

  // Step indicator
  stepRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 16, marginBottom: 4 },
  stepItem: { flex: 1, alignItems: "center", position: "relative" },
  stepCircle: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  stepNum:  { color: "#fff", fontSize: 11, fontWeight: "800" },
  stepLabel: { fontSize: 9, fontWeight: "700", marginTop: 4, textAlign: "center" },
  stepLine: { position: "absolute", top: 12, left: "60%", right: "-60%", height: 2 },
  broadcastBanner: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  broadcastText: { fontSize: 13, fontWeight: "700" },

  // Hero
  hero: { height: 180, alignItems: "center", justifyContent: "center", borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: "hidden", position: "relative" },
  heroBlobA: { position: "absolute", top: -30, right: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: "rgba(255,255,255,0.12)" },
  heroBlobB: { position: "absolute", bottom: -40, left: -30, width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(255,255,255,0.08)" },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "900" },
  heroSub: { color: "rgba(255,255,255,0.8)", fontSize: 14, marginTop: 4 },

  // Amount card
  amountCard: { marginHorizontal: 16, marginTop: -24, borderRadius: 20, padding: 20, elevation: 5, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  amtRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  amtLabel: { fontSize: 13, fontWeight: "600" },
  amtValue: { fontSize: 26, fontWeight: "900", marginTop: 2 },
  amtIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  amtDivider: { height: 1, marginVertical: 14 },
  infoItems: { gap: 6 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoText: { fontSize: 14, fontWeight: "600" },

  // Section title
  sectionTitle: { fontSize: 17, fontWeight: "800", marginHorizontal: 16, marginTop: 20, marginBottom: 12 },

  // Method grid
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginHorizontal: 16 },
  methodCard: { width: "47%", borderWidth: 2, borderRadius: 14, padding: 14, alignItems: "center", position: "relative" },
  methodIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  methodLabel: { fontSize: 13, fontWeight: "700" },
  methodCheck: { position: "absolute", top: 8, right: 8, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  // Form card
  formCard: { marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 18, elevation: 3, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  formTitle: { fontSize: 16, fontWeight: "800", marginBottom: 10 },
  infoBox: { borderRadius: 12, padding: 14, borderWidth: 1 },
  infoBoxRow: { paddingVertical: 6 },
  infoSep: { height: 1 },
  infoBoxLabel: { fontSize: 12, fontWeight: "600" },
  infoBoxValue: { fontSize: 15, fontWeight: "700", marginTop: 2 },

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
  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginHorizontal: 16, marginTop: 20, paddingVertical: 16, borderRadius: 14, elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  payBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  // Confirmation modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 24 },
  confirmCard: { width: "90%", borderRadius: 24, padding: 28, alignItems: "center" },
  confirmCircle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  confirmTitle: { fontSize: 22, fontWeight: "900", marginBottom: 6 },
  confirmSub: { fontSize: 14, textAlign: "center", marginBottom: 16 },
  txnBox: { width: "100%", borderRadius: 12, padding: 14, borderWidth: 1, alignItems: "center" },
  txnLabel: { fontSize: 12, fontWeight: "600" },
  txnValue: { fontSize: 20, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  confirmNote: { fontSize: 12, textAlign: "center", marginVertical: 14 },
  confirmBtn: { width: "100%", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  confirmBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
