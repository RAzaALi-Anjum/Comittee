import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import SuccessModal from "../../components/SuccessModal";
import ThemedButton from "../../components/ui/ThemedButton";
import ThemedInput from "../../components/ui/ThemedInput";
import storageService from "../../services/storageService";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";
import { sendNotification } from "../../utils/notificationHelper";



export default function JoinCommittee({ navigation, route }) {
  const { colors } = useTheme();
  const [committees, setCommittees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [minContribution, setMinContribution] = useState("");
  const [maxContribution, setMaxContribution] = useState("");
  const [showUploadPrompt, setShowUploadPrompt] = useState(false);
  const [pendingCommittee, setPendingCommittee] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [docStatus, setDocStatus] = useState({ hasCNIC: false, hasBank: false, hasRef: false });
  const [hasSavedGlobalDocs, setHasSavedGlobalDocs] = useState(false);
  const [requestSuccessVisible, setRequestSuccessVisible] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [detailsCommittee, setDetailsCommittee] = useState(null);
  const [userRequestsByCommittee, setUserRequestsByCommittee] = useState({});

  useEffect(() => {
    fetchActiveCommittees();
    (async () => {
      try {
        const parsed = await storageService.getUserData();
        if (parsed) {
          const uid = parsed.userId || parsed.uid || null;
          setCurrentUserId(uid);
          if (uid) {
            await fetchUserRequests(uid);
          }
        }
      } catch { }
    })();
  }, []);

  const fetchUserRequests = async (uid) => {
    try {
      // Fetch all participation requests and filter by current user
      const data = await userService.getParticipationRequests();
      const byCommittee = {};
      if (data) {
        Object.keys(data).forEach((key) => {
          const r = data[key];
          if (r?.userId === uid && r?.committeeId) {
            // Track latest status by committee (Accepted > Pending > Rejected)
            const status = String(r.status || "").toLowerCase();
            const prev = byCommittee[r.committeeId];
            if (!prev) byCommittee[r.committeeId] = status;
            else {
              // Prioritize accepted over pending over rejected
              const rank = { accepted: 2, pending: 1, rejected: 0 };
              if ((rank[status] ?? -1) > (rank[prev] ?? -1)) byCommittee[r.committeeId] = status;
            }
          }
        });
      }
      setUserRequestsByCommittee(byCommittee);
    } catch (e) {
      setUserRequestsByCommittee({});
    }
  };

  const fetchActiveCommittees = async () => {
    try {
      const data = await userService.getAllCommittees();

      if (!data) {
        setCommittees([]);
        setLoading(false);
        return;
      }

      // Convert object → array if needed (getAllCommittees usually returns array or object)
      const committeesArray = Array.isArray(data) ? data : Object.keys(data).map((key) => ({ id: key, ...data[key] }));

      // Filter: Approved/Active/Started or have active flag true
      const filtered = committeesArray.filter((c) => {
        const status = String(c.status || "").toLowerCase();
        const adminStatus = String(c.adminStatus || "").toLowerCase();
          const isActiveFlag = c.active === true;
        const hasIds = !!(c && c.createdBy && c.createdBy !== "" && c.id && c.id !== "");
        return hasIds && (isActiveFlag || status === "approved" || status === "active" || status === "started" || adminStatus === "approved");
      });

      setCommittees(filtered);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching committees:", err);
      setLoading(false);
      Alert.alert("Error", "Failed to fetch committees");
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

  const doSubmitJoin = async (userId, committee) => {
    try {
      const ok = await hasVerificationDocs(userId, committee.createdBy);
      if (!ok) {
        Alert.alert("Required", "Please upload CNIC, Reference CNIC, and Bank Statement to continue.");
        return;
      }
      const id = `REQ-${committee.id}-${userId}-${Date.now()}`;
      const payload = {
        requestId: id,
        userId,
        committeeId: committee.id,
        initiatorId: committee.createdBy,
        status: "Pending",
        createdAt: new Date().toISOString(),
        createdAtTs: Date.now(),
      };
      await userService.createParticipationRequest(id, payload);
      setUserRequestsByCommittee((m) => ({ ...m, [committee.id]: "pending" }));
      try {
        await userService.createIncomingRequest(committee.createdBy, id, {
          requestId: id,
          userId,
          committeeId: committee.id,
          status: "Pending",
          createdAt: new Date().toISOString(),
          createdAtTs: Date.now(),
        });
      } catch { }
      try {
        await sendNotification(
          committee.createdBy,
          "New Participation Request",
          "A user requested to join your committee.",
          "info",
          committee.id
        );
        await sendNotification(
          userId,
          "Participation Request Submitted",
          "Your request has been submitted successfully and is awaiting approval.",
          "success",
          committee.id
        );
      } catch { }
      setRequestSuccessVisible(true);
    } catch (err) {
      console.error("Error sending participation request:", err);
      Alert.alert("Error", "Failed to send request.");
    }
  };

  const handleJoin = async (committee) => {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        Alert.alert("Error", "Sign in required");
        return;
      }
      if (!committee?.id || !committee?.createdBy) {
        Alert.alert("Error", "Invalid committee data. Missing IDs.");
        return;
      }

      // Prevent duplicate or repeat after approval
      const reqStatus = String(userRequestsByCommittee?.[committee.id] || "");
      if (reqStatus === "accepted") {
        Alert.alert("Already Joined", "You are already approved for this committee.");
        return;
      }
      if (reqStatus === "pending") {
        Alert.alert("Request Sent", "Your join request is already pending for this committee.");
        return;
      }

      try {
        const [kyc, profile] = await Promise.all([
          userService.getUserKycForInitiator(userId, committee.createdBy),
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
      setPendingCommittee(committee);
      setShowUploadPrompt(true);
    } catch (err) {
      console.error("Error sending participation request:", err);
      Alert.alert("Error", "Failed to send request.");
    }
  };

  const uploadCNIC = async () => {
    try {
      setUploading(true);
      const userId = await getCurrentUserId();
      if (!userId) {
        Alert.alert("Error", "Sign in required");
        setUploading(false);
        return;
      }
      const initiatorId = pendingCommittee?.createdBy;
      if (!initiatorId) {
        Alert.alert("Error", "Missing initiator");
        setUploading(false);
        return;
      }
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission required", "Camera roll permission is required!");
        setUploading(false);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });
      if (result?.canceled || !result?.assets?.length) {
        setUploading(false);
        return;
      }
      const uri = result.assets[0].uri;

      // Try OCR processing via backend
      try {
        const apiClient = require("../../services/apiClient").default;
        const formData = new FormData();
        formData.append("cnicImage", {
          uri,
          type: "image/jpeg",
          name: "cnic.jpg",
        });
        formData.append("userId", userId);
        formData.append("initiatorId", initiatorId);

        const ocrResult = await apiClient.backendUpload("/ocr/cnic", formData);

        if (ocrResult?.success && ocrResult?.cnicNumber) {
          Alert.alert(
            "CNIC Detected",
            `CNIC Number: ${ocrResult.cnicNumber}\n\nThis has been securely saved and encrypted.`
          );
        }
      } catch (ocrErr) {
        console.warn("[OCR] Backend OCR unavailable, saving image directly:", ocrErr.message);
      }

      // Also save the image URI to KYC (existing behavior)
      await userService.updateUserKycForInitiator(userId, initiatorId, { cnic: uri, updatedAt: new Date().toISOString() });
      setDocStatus((s) => ({ ...s, hasCNIC: true }));
    } catch (e) {
      Alert.alert("Error", "Failed to upload CNIC");
    } finally {
      setUploading(false);
    }
  };

  const uploadBankStatement = async () => {
    try {
      setUploading(true);
      const userId = await getCurrentUserId();
      if (!userId) {
        Alert.alert("Error", "Sign in required");
        setUploading(false);
        return;
      }
      const initiatorId = pendingCommittee?.createdBy;
      if (!initiatorId) {
        Alert.alert("Error", "Missing initiator");
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

      // Try OCR validation first (before uploading/saving to DB)
      let ocrResult = null;
      try {
        const apiClient = require("../../services/apiClient").default;
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
        console.warn("[JoinCommittees] Bank OCR validation skipped:", ocrErr.message);
      }

      let saveUri = uri;
      try {
        const path = `kyc/${userId}/bank-${Date.now()}.pdf`;
        const remote = await userService.uploadFileToStorage(uri, path, "application/pdf");
        saveUri = remote || uri;
      } catch (uploadErr) {
        console.warn("[JoinCommittees] Bank storage upload failed, using local URI:", uploadErr.message);
      }

      await userService.updateUserKycForInitiator(userId, initiatorId, { bankStatement: saveUri, updatedAt: new Date().toISOString() });
      await userService.updateProfileRTDB(userId, { bankStatement: saveUri, updatedAt: new Date().toISOString() });
      setDocStatus((s) => ({ ...s, hasBank: true }));

      if (ocrResult?.success) {
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

  const uploadReferenceCnic = async () => {
    try {
      setUploading(true);
      const userId = await getCurrentUserId();
      if (!userId) {
        Alert.alert("Error", "Sign in required");
        setUploading(false);
        return;
      }
      const initiatorId = pendingCommittee?.createdBy;
      if (!initiatorId) {
        Alert.alert("Error", "Missing initiator");
        setUploading(false);
        return;
      }
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission required", "Camera roll permission is required!");
        setUploading(false);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });
      if (result?.canceled || !result?.assets?.length) {
        setUploading(false);
        return;
      }
      const uri = result.assets[0].uri;
      await userService.updateUserKycForInitiator(userId, initiatorId, { referenceCnic: uri, updatedAt: new Date().toISOString() });
      setDocStatus((s) => ({ ...s, hasRef: true }));
    } catch (e) {
      Alert.alert("Error", "Failed to upload Reference CNIC");
    } finally {
      setUploading(false);
    }
  };

  const getFilteredCommittees = () => {
    return committees.filter((c) => {
      const query = searchText.toLowerCase();

      // 1. Search by Initiator Name OR Contribution Amount
      const nameMatch = c.initiatorName
        ? c.initiatorName.toLowerCase().includes(query)
        : false;

      const contributionMatch =
        String(c.contributionPerCycle || "").includes(query) ||
        String(c.totalAmount || "").includes(query);

      const isMatch = !searchText || nameMatch || contributionMatch;

      // 2. Filter by Range
      const amount = parseFloat(c.contributionPerCycle || 0);
      const min = minContribution ? parseFloat(minContribution) : 0;
      const max = maxContribution ? parseFloat(maxContribution) : Infinity;
      const rangeMatch = amount >= min && amount <= max;

      // 3. Exclude committees already joined or requested
      const isMember = Array.isArray(c.usersParticipated)
        ? c.usersParticipated.some((u) => u && (u.userId === currentUserId || u.uid === currentUserId || u.id === currentUserId))
        : false;
      const reqStatus = String(userRequestsByCommittee?.[c.id] || "");
      const alreadyApproved = reqStatus === "accepted" || isMember;
      const alreadyPending = reqStatus === "pending";

      return isMatch && rangeMatch && !alreadyApproved && !alreadyPending;
    });
  };

  const filteredData = getFilteredCommittees();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (committees.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>No active committees available.</Text>
      </View>
    );
  }

  const renderCommittee = ({ item }) => {
    const membersJoined = item.usersParticipated?.filter((u) => u !== null).length || 0;
    const slotsLeft = item.members - membersJoined;
    const isMember = Array.isArray(item.usersParticipated)
      ? item.usersParticipated.some((u) => u && (u.userId === currentUserId || u.uid === currentUserId || u.id === currentUserId))
      : false;
    const isActive = item.active === true || String(item.status || "").toLowerCase() === "started";
    const isFull = slotsLeft <= 0;
    const canProceedPayment = isActive && isFull && isMember;
    const reqStatus = String(userRequestsByCommittee?.[item.id] || "");
    const alreadyApproved = reqStatus === "accepted" || isMember;
    const alreadyPending = reqStatus === "pending";

    return (
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.title, { color: colors.brand }]}>{item.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: colors.brand + '20' }]}>
            <Text style={[styles.statusBadgeText, { color: colors.brand }]}>{item.status}</Text>
          </View>
        </View>

        <View style={styles.initiatorRow}>
          <FontAwesome5 name="user-circle" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
          <Text style={[styles.initiatorText, { color: colors.textSecondary }]}>
            Initiator: {item.initiatorName || "Unknown"}
          </Text>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Ionicons name="cash-outline" size={18} color={colors.brand} />
            <Text style={[styles.statValue, { color: colors.text }]}>{item.totalAmount}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="people-outline" size={18} color={colors.brand} />
            <Text style={[styles.statValue, { color: colors.text }]}>{slotsLeft}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Slots Left</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="time-outline" size={18} color={colors.brand} />
            <Text style={[styles.statValue, { color: colors.text }]}>{item.cycleDuration}d</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Cycle</Text>
          </View>
        </View>

        <ThemedButton
          label={isFull ? "Full" : "Join"}
          onPress={() => handleJoin(item)}
          disabled={isFull}
          style={[styles.joinButton, { backgroundColor: colors.brand }]}
        />
        <ThemedButton
          label="View Committee"
          onPress={async () => {
            try {
              const data = await userService.getCommitteeById(item.id);
              if (data) {
                setDetailsCommittee({ ...data, id: item.id });
                setDetailsVisible(true);
              }
            } catch {
              setDetailsCommittee({ ...item });
              setDetailsVisible(true);
            }
          }}
          variant="outline"
          style={styles.joinButton}
        />
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SuccessModal
        visible={requestSuccessVisible}
        title="Request Sent Successfully!"
        message="Your application has been submitted to the initiator for review. You will be notified once it's approved."
        onClose={() => setRequestSuccessVisible(false)}
        buttonText="Return"
      />
      <Modal
        visible={showUploadPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUploadPrompt(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Verification Required</Text>
            <Text style={[styles.modalText, { color: colors.textSecondary }]}>
              Please upload your CNIC (image), Reference CNIC (image), and Bank Statement (PDF) to proceed with the join request. All documents are mandatory.
            </Text>
            <Text style={{ marginTop: 6, color: colors.textSecondary }}>
              CNIC: {docStatus.hasCNIC ? "Uploaded" : "Not uploaded"} | Ref CNIC: {docStatus.hasRef ? "Uploaded" : "Not uploaded"} | Bank: {docStatus.hasBank ? "Uploaded" : "Not uploaded"}
            </Text>
            <View style={{ height: 8 }} />
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.brand }, uploading && { opacity: 0.6 }]}
              onPress={uploadCNIC}
              disabled={uploading}
            >
              <Text style={styles.actionBtnText}>{uploading ? "Uploading..." : "Upload CNIC"}</Text>
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
              <Text style={[styles.actionBtnOutlineText, { color: colors.brand }]}>{uploading ? "Uploading..." : "Upload Bank Statement"}</Text>
            </TouchableOpacity>
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
                const committee = pendingCommittee;
                setShowUploadPrompt(false);
                setPendingCommittee(null);
                if (committee) {
                  const reqStatus = String(userRequestsByCommittee?.[committee.id] || "");
                  if (reqStatus === "accepted") {
                    Alert.alert("Already Joined", "You are already approved for this committee.");
                    return;
                  }
                  if (reqStatus === "pending") {
                    Alert.alert("Request Sent", "Your join request is already pending for this committee.");
                    return;
                  }
                  await doSubmitJoin(userId, committee);
                }
              }}
              style={[styles.actionBtn, { backgroundColor: "#4CAF50", opacity: (docStatus.hasCNIC && docStatus.hasRef && docStatus.hasBank) ? 1 : 0.6 }]}
              disabled={!(docStatus.hasCNIC && docStatus.hasRef && docStatus.hasBank)}
            >
              <Text style={styles.actionBtnText}>Proceed</Text>
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
      <View style={[styles.searchHeader, { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.background }]}>
          <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search by Name or Amount"
            placeholderTextColor={colors.textSecondary}
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>
        <TouchableOpacity
          style={[styles.filterButton, { backgroundColor: colors.brand }]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Ionicons name="options" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {showFilters && (
        <View style={[styles.filterContainer, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={styles.row}>
            <ThemedInput
              placeholder="Min Contribution"
              keyboardType="numeric"
              value={minContribution}
              onChangeText={setMinContribution}
              style={styles.halfInput}
            />
            <ThemedInput
              placeholder="Max Contribution"
              keyboardType="numeric"
              value={maxContribution}
              onChangeText={setMaxContribution}
              style={styles.halfInput}
            />
          </View>
        </View>
      )}

      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id}
        renderItem={renderCommittee}
        contentContainerStyle={{ padding: 20 }}
        ListEmptyComponent={<Text style={{ textAlign: "center", marginTop: 20 }}>No matching committees found.</Text>}
      />
      <Modal visible={detailsVisible} transparent animationType="fade" onRequestClose={() => setDetailsVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Committee Details</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              <Text style={{ fontWeight: "bold", marginBottom: 6, color: colors.text }}>{detailsCommittee?.name || "—"}</Text>
              <Text style={{ color: colors.textSecondary }}>Initiator: {detailsCommittee?.initiatorName || "Unknown"}</Text>
              <Text style={{ color: colors.textSecondary }}>Initiator ID: {detailsCommittee?.createdBy || "—"}</Text>
              <Text style={{ color: colors.textSecondary }}>Total Amount: {detailsCommittee?.totalAmount || "—"}</Text>
              <Text style={{ color: colors.textSecondary }}>Contribution: {detailsCommittee?.contributionPerCycle || "—"}</Text>
              <Text style={{ color: colors.textSecondary }}>Cycle: {detailsCommittee?.cycleDuration} Days</Text>
              <Text style={{ color: colors.textSecondary }}>Duration: {detailsCommittee?.durationMonths} Months</Text>
              <Text style={{ marginTop: 10, fontWeight: "bold", color: colors.text }}>Members Joined</Text>
              {Array.isArray(detailsCommittee?.usersParticipated) && detailsCommittee.usersParticipated.filter(Boolean).length > 0 ? (
                detailsCommittee.usersParticipated
                  .filter(Boolean)
                  .map((u, idx) => (
                    <View key={idx} style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                      <FontAwesome5 name="id-card" size={14} color={colors.textSecondary} style={{ marginRight: 6 }} />
                      <Text style={{ color: colors.text }}>
                        CM-{u?.memberId || idx + 1} • {u?.name || u?.fullName || u?.email || u?.userId || u?.uid || "Member"}
                      </Text>
                    </View>
                  ))
              ) : (
                <Text style={{ marginTop: 4, color: colors.textSecondary }}>No members yet</Text>
              )}
            </ScrollView>
            <TouchableOpacity onPress={() => setDetailsVisible(false)} style={styles.cancelLink}>
              <Text style={{ color: colors.brand, fontWeight: "600" }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#111827", marginBottom: 6 },
  modalText: { color: "#374151" },
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
  searchHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 45,
    marginRight: 10,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: "100%",
  },
  filterButton: {
    padding: 10,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  filterContainer: {
    padding: 15,
    borderBottomWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  halfInput: {
    width: "48%",
  },
  card: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  initiatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  initiatorText: {
    fontSize: 14,
    fontWeight: '500',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.02)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  title: { fontSize: 20, fontWeight: "800", flex: 1, marginRight: 8 },
  joinButton: {
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  joinButtonText: { color: "#fff", fontWeight: "bold" },
  disabledButton: { backgroundColor: "#ccc" },
});
