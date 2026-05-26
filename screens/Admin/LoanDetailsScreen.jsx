import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import apiClient from "../../services/apiClient";
import { useTheme } from "../../theme/ThemeProvider";
import { formatDate } from "../../utils/date";

const isValidImageUrl = (uri) => {
  if (!uri || typeof uri !== "string") return false;
  return uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("data:image/");
};

export default function LoanDetailsScreen({ route, navigation }) {
  const { colors } = useTheme();
  const loan = route?.params?.loan || null;
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!loan?.userId) {
      setLoading(false);
      return;
    }
    const fetchProfile = async () => {
      try {
        // Use backend API which returns decrypted profile data
        const result = await apiClient.backendGet(`/profile/${loan.userId}`);
        if (result?.success && result?.profile) {
          setProfile(result.profile);
        } else {
          setProfile(null);
        }
      } catch (e) {
        console.error("Error fetching decrypted profile:", e);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [loan?.userId]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (!loan) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: 24 }]}>
        <Ionicons name="search-outline" size={64} color="#cbd5e1" />
        <Text style={styles.emptyTitle}>Loan Not Found</Text>
        <Text style={styles.emptySub}>Please select a loan from the monitoring or request list.</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation?.goBack()}
          style={[styles.primaryBtn, { backgroundColor: colors.brand, width: '100%' }]}
        >
          <Text style={styles.primaryBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Status Badge Logic
  const statusColors = {
    'Approved': { bg: '#dcfce7', text: '#166534' },
    'Pending': { bg: '#fef3c7', text: '#92400e' },
    'Rejected': { bg: '#fee2e2', text: '#991b1b' },
    'Recovered': { bg: '#e0f2fe', text: '#0369a1' },
  };
  const badge = statusColors[loan?.status] || { bg: '#f1f5f9', text: '#475569' };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
      showsVerticalScrollIndicator={true}
    >
      <Text style={[styles.heading, { color: colors.brand }]}>Loan Information</Text>

      {/* Loan Details Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={[styles.iconBox, { backgroundColor: colors.brand + '10' }]}>
            <Ionicons name="cash-outline" size={20} color={colors.brand} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.sectionTitle}>Financial Snapshot</Text>
            <Text style={styles.sectionSub}>Request details and status tracking</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusText, { color: badge.text }]}>{loan?.status?.toUpperCase() || 'NEW'}</Text>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Tracking Number</Text>
            <Text style={styles.value}>{loan?.trackingNumber ?? loan?.id?.substring(0, 10) ?? "—"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Loan Amount</Text>
            <Text style={[styles.value, { color: colors.brand }]}>PKR {parseInt(loan?.amount || 0).toLocaleString()}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Application Date</Text>
            <Text style={styles.value}>{loan?.appliedAt ? formatDate(loan.appliedAt) : "—"}</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.label}>Reason/Purpose</Text>
            <Text style={[styles.value, { textAlign: 'left', flex: 0, marginTop: 4 }]}>{loan?.reason ?? "No reason provided."}</Text>
          </View>
        </View>
      </View>

      <Text style={[styles.mainSubTitle, { color: colors.brand }]}>Initiator Profile</Text>

      {profile ? (
        <View style={styles.profileSection}>
          <View style={styles.profileHeader}>
            {profile.profilePicture && isValidImageUrl(profile.profilePicture) ? (
              <View style={styles.imageWrapper}>
                <Image source={{ uri: profile.profilePicture }} style={styles.profileImage} />
              </View>
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="person" size={40} color="#cbd5e1" />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={styles.profileName}>{profile.name || profile.fullName || "Member Account"}</Text>
              <View style={styles.profileBadge}>
                <Ionicons name="shield-checkmark" size={12} color="#fff" />
                <Text style={styles.profileBadgeText}>VERIFIED INITIATOR</Text>
              </View>
            </View>
          </View>

          <View style={styles.detailCard}>
            <View style={styles.itemRow}>
              <Text style={styles.detailLabel}>Email Address</Text>
              <Text style={styles.detailValue}>{profile.email || "—"}</Text>
            </View>
            <View style={styles.itemRow}>
              <Text style={styles.detailLabel}>Contact Number</Text>
              <Text style={styles.detailValue}>{profile.contactNumber || "—"}</Text>
            </View>
            <View style={styles.itemRow}>
              <Text style={styles.detailLabel}>Father's Name</Text>
              <Text style={styles.detailValue}>{profile.fatherName || "—"}</Text>
            </View>
            <View style={styles.itemRow}>
              <Text style={styles.detailLabel}>City/Location</Text>
              <Text style={styles.detailValue}>{profile.city || "—"}</Text>
            </View>
            <View style={styles.itemRow}>
              <Text style={styles.detailLabel}>Resident Address</Text>
              <Text style={styles.detailValue} numberOfLines={1}>{profile.address || "—"}</Text>
            </View>
            <View style={styles.itemRow}>
              <Text style={styles.detailLabel}>Occupation</Text>
              <Text style={styles.detailValue}>{profile.occupation || "—"}</Text>
            </View>
            <View style={[styles.itemRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.detailLabel}>Age / Gender</Text>
              <Text style={styles.detailValue}>{profile.age || "—"} / {profile.gender || "—"}</Text>
            </View>
          </View>

          <Text style={styles.docHeading}>Verification Documents</Text>

          {profile.cnic && isValidImageUrl(profile.cnic) ? (
            <View style={styles.docItem}>
              <Text style={styles.docLabel}>National Identity Card (CNIC)</Text>
              <Image source={{ uri: profile.cnic }} style={styles.docImg} resizeMode="cover" />
            </View>
          ) : null}

          {profile.referenceCnic && isValidImageUrl(profile.referenceCnic) ? (
            <View style={styles.docItem}>
              <Text style={styles.docLabel}>Reference Identity (Guarantor)</Text>
              <Image source={{ uri: profile.referenceCnic }} style={styles.docImg} resizeMode="cover" />
            </View>
          ) : null}

          {profile.bankStatement && isValidImageUrl(profile.bankStatement) ? (
            <View style={styles.docItem}>
              <Text style={styles.docLabel}>Financial Proof / Statement</Text>
              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.pdfBtn, { backgroundColor: colors.brand }]}
                onPress={async () => {
                  try {
                    const url = profile.bankStatement;
                    if (!url) return;
                    if (url.startsWith('file://')) {
                      Alert.alert('Local File', "This document was saved locally on the user's device and cannot be viewed remotely.");
                      return;
                    }
                    const supported = await Linking.canOpenURL(url);
                    if (supported) {
                      await Linking.openURL(url);
                    } else {
                      Alert.alert('Error', 'Cannot open this document URL.');
                    }
                  } catch (err) {
                    Alert.alert('Error', 'Unable to open document.');
                  }
                }}
              >
                <Ionicons name="document-text" size={20} color="#fff" />
                <Text style={styles.pdfBtnText}>Open Document PDF</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.emptyProfileCard}>
          <Ionicons name="person-remove-outline" size={32} color="#94a3b8" />
          <Text style={styles.emptyProfileText}>No initiator profile data linked to this loan.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  heading: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 20,
    marginBottom: 20,
    textAlign: "center",
    letterSpacing: 0.5
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a', marginTop: 24, marginBottom: 8 },
  emptySub: { fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  primaryBtn: { height: 50, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  section: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  sectionSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusText: { fontSize: 10, fontWeight: "800" },
  infoGrid: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  label: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  value: { fontSize: 14, color: '#0f172a', fontWeight: '700' },

  mainSubTitle: { fontSize: 18, fontWeight: '800', marginBottom: 16, marginLeft: 4 },
  profileSection: { marginBottom: 20 },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  imageWrapper: {
    width: 84,
    height: 84,
    borderRadius: 42,
    padding: 3,
    borderWidth: 2,
    borderColor: '#f1f5f9',
    backgroundColor: '#fff'
  },
  profileImage: { width: '100%', height: '100%', borderRadius: 40 },
  imagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  profileName: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0369a1',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
    gap: 4
  },
  profileBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },

  detailCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  detailLabel: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  detailValue: { fontSize: 13, color: '#0f172a', fontWeight: '700', flex: 1, textAlign: 'right', marginLeft: 16 },

  docHeading: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 },
  docItem: { marginBottom: 20 },
  docLabel: { fontSize: 12, fontWeight: '800', color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase' },
  docImg: { width: "100%", height: 160, borderRadius: 16, backgroundColor: '#f1f5f9' },
  pdfBtn: {
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  pdfBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  emptyProfileCard: {
    padding: 32,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  emptyProfileText: { color: '#64748b', fontSize: 14, marginTop: 12, textAlign: 'center', fontWeight: '500' },
});
