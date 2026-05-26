import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";

const PAYMENT_METHODS = [
  { id: "JazzCash", label: "JazzCash", icon: "phone-portrait-outline", color: "#E31E27" },
  { id: "EasyPaisa", label: "EasyPaisa", icon: "phone-portrait-outline", color: "#36A93E" },
  { id: "BankTransfer", label: "Bank Transfer", icon: "business-outline", color: "#1A56DB" },
];

export default function TurnSwapPaymentScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { requestId, committeeName, amount = 500 } = route.params || {};

  const [selectedMethod, setSelectedMethod] = useState(null);
  const [screenshot, setScreenshot] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Please allow access to your photo library.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setUploading(true);
        try {
          // Upload to Firebase Storage via backend
          const uploadedUrl = await userService.uploadFileToStorage(
            asset.uri,
            `turnSwapPayments/${requestId}_${Date.now()}.jpg`,
            "image/jpeg"
          );
          setScreenshot({ uri: asset.uri, uploadedUrl });
        } catch (uploadErr) {
          // Fallback: use base64 directly
          const base64Data = `data:image/jpeg;base64,${asset.base64}`;
          setScreenshot({ uri: asset.uri, uploadedUrl: base64Data });
          console.warn("[TurnSwapPayment] Upload failed, using base64:", uploadErr.message);
        } finally {
          setUploading(false);
        }
      }
    } catch (err) {
      Alert.alert("Error", "Failed to pick image.");
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedMethod) {
      Alert.alert("Select Method", "Please select your payment method.");
      return;
    }
    if (!screenshot) {
      Alert.alert("Screenshot Required", "Please upload your payment screenshot.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await userService.submitSwapPayment(
        requestId,
        selectedMethod,
        screenshot.uploadedUrl
      );

      if (result?.success) {
        Alert.alert(
          "Payment Submitted ✅",
          "Your payment has been submitted and is pending admin verification. You will be notified once verified.",
          [
            {
              text: "OK",
              onPress: () => navigation.navigate("UserDashboardScreen"),
            },
          ]
        );
      } else {
        Alert.alert("Error", result?.error || "Failed to submit payment.");
      }
    } catch (err) {
      Alert.alert("Error", err.message || "Failed to submit payment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => navigation.canGoBack() ? navigation.goBack() : null}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.brand }]}>Submit Payment</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{committeeName}</Text>
          </View>
        </View>

        {/* Amount Banner */}
        <View style={[styles.amountBanner, { backgroundColor: colors.brand }]}>
          <Text style={styles.amountLabel}>Turn Swap Fee</Text>
          <Text style={styles.amountValue}>Rs {amount}</Text>
          <Text style={styles.amountSub}>Pay to proceed with your turn swap</Text>
        </View>

        {/* Payment Method */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Payment Method</Text>
        <View style={styles.methodGrid}>
          {PAYMENT_METHODS.map((method) => {
            const isSelected = selectedMethod === method.id;
            return (
              <TouchableOpacity
                key={method.id}
                style={[
                  styles.methodCard,
                  {
                    backgroundColor: isSelected ? method.color + "15" : colors.card,
                    borderColor: isSelected ? method.color : colors.border,
                  },
                ]}
                onPress={() => setSelectedMethod(method.id)}
              >
                <View
                  style={[
                    styles.methodIconWrap,
                    { backgroundColor: method.color + "20" },
                  ]}
                >
                  <Ionicons name={method.icon} size={24} color={method.color} />
                </View>
                <Text
                  style={[
                    styles.methodLabel,
                    { color: isSelected ? method.color : colors.text },
                  ]}
                >
                  {method.label}
                </Text>
                {isSelected && (
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color={method.color}
                    style={{ position: "absolute", top: 8, right: 8 }}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Account Numbers Info */}
        {selectedMethod && (
          <View
            style={[
              styles.accountCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={colors.brand}
              style={{ marginRight: 8 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.accountTitle, { color: colors.brand }]}>
                {selectedMethod === "JazzCash"
                  ? "JazzCash Account"
                  : selectedMethod === "EasyPaisa"
                  ? "EasyPaisa Account"
                  : "Bank Account Details"}
              </Text>
              <Text style={[styles.accountText, { color: colors.text }]}>
                {selectedMethod === "BankTransfer"
                  ? "Bank: HBL\nAccount: 0123-4567890-1\nTitle: Digital Committee"
                  : "Contact your committee initiator for the payment number."}
              </Text>
            </View>
          </View>
        )}

        {/* Screenshot Upload */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Payment Screenshot *
        </Text>
        <TouchableOpacity
          style={[
            styles.uploadBox,
            {
              backgroundColor: colors.card,
              borderColor: screenshot ? colors.brand : colors.border,
              borderStyle: screenshot ? "solid" : "dashed",
            },
          ]}
          onPress={pickImage}
          disabled={uploading || submitting}
        >
          {uploading ? (
            <View style={styles.uploadInner}>
              <ActivityIndicator size="large" color={colors.brand} />
              <Text style={[styles.uploadText, { color: colors.textSecondary }]}>
                Uploading...
              </Text>
            </View>
          ) : screenshot ? (
            <View style={{ alignItems: "center" }}>
              <Image
                source={{ uri: screenshot.uri }}
                style={styles.previewImage}
                resizeMode="cover"
              />
              <Text style={[styles.changePhoto, { color: colors.brand }]}>
                Tap to change
              </Text>
            </View>
          ) : (
            <View style={styles.uploadInner}>
              <Ionicons name="cloud-upload-outline" size={40} color={colors.textSecondary} />
              <Text style={[styles.uploadText, { color: colors.textSecondary }]}>
                Upload Payment Screenshot
              </Text>
              <Text style={[styles.uploadSub, { color: colors.textSecondary }]}>
                JPG or PNG format
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Status Flow Reminder */}
        <View
          style={[
            styles.flowCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.flowTitle, { color: colors.text }]}>What happens next?</Text>
          <View style={styles.flowStep}>
            <View style={[styles.flowDot, { backgroundColor: "#10B981" }]} />
            <Text style={[styles.flowText, { color: colors.text }]}>
              Admin reviews your screenshot
            </Text>
          </View>
          <View style={styles.flowStep}>
            <View style={[styles.flowDot, { backgroundColor: "#F59E0B" }]} />
            <Text style={[styles.flowText, { color: colors.text }]}>
              Payment verified — turns swapped automatically
            </Text>
          </View>
          <View style={styles.flowStep}>
            <View style={[styles.flowDot, { backgroundColor: colors.brand }]} />
            <Text style={[styles.flowText, { color: colors.text }]}>
              You and the other member are notified
            </Text>
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            { backgroundColor: colors.brand },
            (submitting || !selectedMethod || !screenshot) && { opacity: 0.5 },
          ]}
          onPress={handleSubmit}
          disabled={submitting || !selectedMethod || !screenshot}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons
                name="checkmark-circle-outline"
                size={20}
                color="#fff"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.submitText}>Submit Payment Proof</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  backBtn: { padding: 4, marginRight: 12 },
  title: { fontSize: 20, fontWeight: "800" },
  subtitle: { fontSize: 13, marginTop: 2 },

  amountBanner: {
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 24,
  },
  amountLabel: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "600" },
  amountValue: { color: "#fff", fontSize: 36, fontWeight: "900", marginVertical: 4 },
  amountSub: { color: "rgba(255,255,255,0.7)", fontSize: 12 },

  sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 12 },

  methodGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
    flexWrap: "wrap",
  },
  methodCard: {
    flex: 1,
    minWidth: 90,
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 2,
    position: "relative",
  },
  methodIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  methodLabel: { fontSize: 12, fontWeight: "700", textAlign: "center" },

  accountCard: {
    flexDirection: "row",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 22,
    alignItems: "flex-start",
  },
  accountTitle: { fontWeight: "700", fontSize: 13, marginBottom: 4 },
  accountText: { fontSize: 13, lineHeight: 20 },

  uploadBox: {
    borderWidth: 2,
    borderRadius: 16,
    minHeight: 160,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
    overflow: "hidden",
  },
  uploadInner: { alignItems: "center", gap: 8 },
  uploadText: { fontSize: 14, fontWeight: "600" },
  uploadSub: { fontSize: 12 },
  previewImage: { width: "100%", height: 180, borderRadius: 12 },
  changePhoto: { fontSize: 13, fontWeight: "700", marginTop: 8 },

  flowCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 24,
    gap: 10,
  },
  flowTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  flowStep: { flexDirection: "row", alignItems: "center", gap: 10 },
  flowDot: { width: 10, height: 10, borderRadius: 5 },
  flowText: { fontSize: 13, flex: 1 },

  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
  },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
