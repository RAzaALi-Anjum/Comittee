import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useTheme } from "../../theme/ThemeProvider";
import { sendNotification } from "../../utils/notificationHelper";
import apiClient from "../../services/apiClient";
import { decryptAES256 } from "../../utils/cryptoUtils";

export default function ParticipationRequestDetails({ route, navigation }) {
    const { colors } = useTheme();
    const { request } = route.params;
    const [user, setUser] = useState(null);
    const [committee, setCommittee] = useState(null);
    const [loading, setLoading] = useState(true);
    const formatHMS = (value) => {
        try {
            const d = new Date(value);
            if (isNaN(d.getTime())) return String(value ?? "");
            const pad = (n) => String(n).padStart(2, "0");
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        } catch {
            return String(value ?? "");
        }
    };

    // URLs
    const USERS_URL = "https://com1-e2378-default-rtdb.firebaseio.com/users";
    const REQUEST_URL = `https://com1-e2378-default-rtdb.firebaseio.com/participationRequests/${request.id}.json`;
    const COMMITTEE_URL = `https://com1-e2378-default-rtdb.firebaseio.com/committees/${request.committeeId}.json`;

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch committee info
                const commRes = await fetch(COMMITTEE_URL);
                const commData = await commRes.json();
                setCommittee(commData);

                // Fetch decrypted user profile from backend
                let userData = null;
                try {
                    const profileRes = await apiClient.backendGet(`/profile/${request.userId}`);
                    if (profileRes && profileRes.success && profileRes.profile) {
                        userData = profileRes.profile;
                    }
                } catch (backendErr) {
                    console.warn("[ParticipationRequestDetails] Backend decrypt unavailable, fallback RTDB:", backendErr.message);
                }

                // Fallback: fetch raw data from RTDB directly (will need client-side decryption)
                if (!userData) {
                    const userRes = await fetch(`${USERS_URL}/${request.userId}.json`);
                    userData = await userRes.json();
                }

                setUser(userData);
            } catch (err) {
                console.error(err);
                Alert.alert("Error", "Failed to load details");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleAccept = async () => {
        if (!user || !committee) return;
        try {
            // 1. Re-fetch Committee to be safe (concurrency)
            const cRes = await fetch(COMMITTEE_URL);
            const latestCommittee = await cRes.json();

            const totalMembers = parseInt(latestCommittee.members, 10);
            let usersArray = latestCommittee.usersParticipated;

            // Ensure usersArray is a proper array of size 'totalMembers'
            if (!usersArray) {
                usersArray = new Array(totalMembers).fill(null);
            } else if (Array.isArray(usersArray)) {
                // If it's shorter, pad it with nulls
                while (usersArray.length < totalMembers) {
                    usersArray.push(null);
                }
            } else if (typeof usersArray === 'object') {
                // Convert object {0:..., 1:...} to array (Firebase quirk)
                const newArr = new Array(totalMembers).fill(null);
                Object.entries(usersArray).forEach(([k, v]) => {
                    const idx = parseInt(k, 10);
                    if (idx >= 0 && idx < totalMembers) {
                        newArr[idx] = v;
                    }
                });
                usersArray = newArr;
            }

            const emptyIndex = usersArray.findIndex((u) => !u); // Find first null/undefined slot

            if (emptyIndex === -1) {
                Alert.alert("Failed", "Committee is already full.");
                return;
            }

            // 2. Add user to committee
            // Resolve name: backend stores as fullName; direct RTDB read may have name or fullName
            const resolvedName = user.fullName || user.name || user.displayName || null;
            const userToAdd = {
                id: request.userId,
                userId: request.userId,     // explicit userId for payment lookups
                uid: request.userId,         // alias for lookups
                name: resolvedName || "Unknown",
                userName: resolvedName || "Unknown",  // extra field for display
                fullName: resolvedName || "Unknown",  // mirror for CommitteeDetails
                email: user.email || "Unknown",
                paymentStatus: "Unpaid", // Default
                joinedAt: new Date().toISOString()
            };

            usersArray[emptyIndex] = { ...userToAdd, memberId: String(emptyIndex + 1) };

            const nowFull = usersArray.every((u) => u !== null && u !== undefined);
            let updatedCommitteeData = { usersParticipated: usersArray };

            if (nowFull) {
                // Committee is full, but we let Initiator start it manually.
                // We can optionally set a flag 'isFull' or similar, but members count is enough.
                // Do NOT set status to "Started" automatically.
                console.log("Committee is now full. Waiting for Initiator to start.");
            }

            // Auto-start only when committee is full
            if (!latestCommittee.active && nowFull) {
                updatedCommitteeData = {
                    ...updatedCommitteeData,
                    active: true,
                    status: "Started",
                    activationDate: new Date().toISOString(),
                    activationTs: Date.now()
                };
            }

            // 3. Update Committee
            await fetch(COMMITTEE_URL, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedCommitteeData)
            });

            // 4. Update Request Status
            const nowIso = new Date().toISOString();
            const nowTs = Date.now();
            await fetch(REQUEST_URL, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: "Accepted",
                updatedAt: nowIso,
                updatedAtTs: nowTs,
                acceptedAt: nowIso,
                acceptedAtTs: nowTs
              })
            });

            // 5. Send Notification to User
            console.log(`Sending notification to user: ${request.userId}`);
            const notifSuccess = await sendNotification(
                request.userId,
                "Request Accepted",
                `You have been accepted into the committee "${request.committeeName || 'Unknown'}".`,
                "success",
                request.committeeId
            );

            if (!notifSuccess) {
                console.warn("Failed to send notification via helper");
            }

            Alert.alert("Success", updatedCommitteeData.active ? "User added and committee started." : "Request Accepted and User Added.");
            navigation.goBack();

        } catch (err) {
            console.error(err);
            Alert.alert("Error", "Failed to accept request.");
        }
    };

    const handleReject = async () => {
        try {
            const nowIso = new Date().toISOString();
            const nowTs = Date.now();
            await fetch(REQUEST_URL, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  status: "Rejected",
                  updatedAt: nowIso,
                  updatedAtTs: nowTs,
                  rejectedAt: nowIso,
                  rejectedAtTs: nowTs
                })
            });

            // Send Notification to User
            console.log(`Sending rejection notification to user: ${request.userId}`);
            const notifSuccess = await sendNotification(
                request.userId,
                "Request Rejected",
                `Your request to join "${request.committeeName || 'Unknown'}" was rejected.`,
                "error",
                request.committeeId
            );

            if (!notifSuccess) {
                console.warn("Failed to send rejection notification");
            }

            Alert.alert("Success", "Request Rejected.");
            navigation.goBack();
        } catch (err) {
            console.error(err);
            Alert.alert("Error", "Failed to reject request.");
        }
    };

    if (loading) return <ActivityIndicator size="large" color={colors.brand} style={{ marginTop: 20 }} />;

    const getParticipantCount = () => {
        if (!committee || !committee.usersParticipated) return 0;
        const list = committee.usersParticipated;
        if (Array.isArray(list)) return list.filter(u => u).length;
        if (typeof list === 'object') return Object.values(list).filter(u => u).length;
        return 0;
    };

    const isFull = committee && getParticipantCount() >= parseInt(committee.members || 0);

    return (
        <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
            <Text style={[styles.heading, { color: colors.brand, fontSize: 20 }]}>Request Details</Text>

            <View style={styles.section}>
                <View style={styles.itemRow}>
                    <Text style={styles.label}>Committee</Text>
                    <Text style={styles.value}>{request.committeeName}</Text>
                </View>
                <View style={styles.itemRow}>
                    <Text style={styles.label}>Status</Text>
                    <View style={[styles.statusBadge, { backgroundColor: request.status === 'Pending' ? '#fef3c7' : (request.status === 'Accepted' ? '#dcfce7' : '#fee2e2') }]}>
                        <Text style={[styles.statusText, { color: request.status === 'Pending' ? '#92400e' : (request.status === 'Accepted' ? '#166534' : '#991b1b') }]}>
                            {request.status.toUpperCase()}
                        </Text>
                    </View>
                </View>

                <View style={styles.itemRow}>
                    <Text style={styles.label}>Requested At</Text>
                    <Text style={styles.value}>{formatHMS(request.createdAt)}</Text>
                </View>

                {isFull && (
                    <View style={{ marginTop: 8, padding: 10, backgroundColor: '#fee2e2', borderRadius: 8, alignItems: 'center' }}>
                        <Text style={{ color: '#991b1b', fontWeight: '800', fontSize: 12 }}>COMMITTEE IS FULL</Text>
                    </View>
                )}
            </View>

            <Text style={[styles.heading, { color: colors.brand }]}>Applicant Details</Text>
            {user ? (
                <View style={styles.section}>
                    <View style={styles.itemRow}>
                        <Text style={styles.label}>Full Name</Text>
                        <Text style={styles.value}>{decryptAES256(user.name || user.fullName)}</Text>
                    </View>
                    <View style={styles.itemRow}>
                        <Text style={styles.label}>Email Address</Text>
                        <Text style={styles.value}>{decryptAES256(user.email)}</Text>
                    </View>
                    <View style={styles.itemRow}>
                        <Text style={styles.label}>Phone Number</Text>
                        <Text style={styles.value}>
                            {decryptAES256(user.contactNumber || user.phone || user.contact || user.mobile || "N/A")}
                        </Text>
                    </View>
                    <View style={styles.itemRow}>
                        <Text style={styles.label}>CNIC Image</Text>
                        {user.cnic ? (
                            <Image source={{ uri: user.cnic }} style={{ width: 120, height: 80, borderRadius: 8 }} />
                        ) : (
                            <Text style={styles.value}>N/A</Text>
                        )}
                    </View>
                    <View style={styles.itemRow}>
                        <Text style={styles.label}>Reference CNIC</Text>
                        {user.referenceCnic ? (
                            <Image source={{ uri: user.referenceCnic }} style={{ width: 120, height: 80, borderRadius: 8 }} />
                        ) : (
                            <Text style={styles.value}>N/A</Text>
                        )}
                    </View>
                    <View style={[styles.itemRow, { borderBottomColor: 'transparent' }]}>
                        <Text style={styles.label}>Bank Statement (PDF)</Text>
                        {user.bankStatement ? (
                            <TouchableOpacity
                                style={{ backgroundColor: "#0B57D0", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignSelf: 'flex-start' }}
                                onPress={async () => {
                                    try {
                                        const url = String(user.bankStatement);
                                        if (url.startsWith("file://")) {
                                            Alert.alert("Preview Unavailable", "Ask the user to re-upload the bank statement so it can be previewed.");
                                            return;
                                        }
                                        await WebBrowser.openBrowserAsync(url);
                                    } catch {
                                        Alert.alert("Preview Error", "Unable to preview PDF.");
                                    }
                                }}
                            >
                                <Text style={{ color: "#fff", fontWeight: "700" }}>Preview PDF</Text>
                            </TouchableOpacity>
                        ) : (
                            <Text style={styles.value}>N/A</Text>
                        )}
                    </View>
                </View>
            ) : (
                <View style={styles.section}>
                    <Text style={styles.value}>User details not found.</Text>
                </View>
            )}

            {request.status === "Pending" && (
                <View style={styles.actions}>
                    <TouchableOpacity
                        style={[styles.btn, styles.acceptBtn, isFull && { backgroundColor: '#e2e8f0', elevation: 0 }]}
                        onPress={handleAccept}
                        disabled={isFull}
                    >
                        <Text style={[styles.btnText, isFull && { color: '#94a3b8' }]}>{isFull ? "COMMITTEE FULL" : "ACCEPT REQUEST"}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.btn, styles.rejectBtn]} onPress={handleReject}>
                        <Text style={styles.btnText}>REJECT</Text>
                    </TouchableOpacity>
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 16 },
    heading: {
        fontSize: 18,
        fontWeight: "800",
        color: "#0f172a",
        marginBottom: 16,
        marginTop: 8,
        textTransform: 'uppercase',
        letterSpacing: 1
    },
    section: {
        backgroundColor: "#ffffff",
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,
        borderWidth: 1,
        borderColor: "#f1f5f9",
    },
    itemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9'
    },
    label: {
        fontSize: 14,
        fontWeight: "600",
        color: "#64748b"
    },
    value: {
        fontSize: 14,
        fontWeight: "600",
        color: "#0f172a"
    },
    actions: {
        flexDirection: "row",
        gap: 12,
        marginTop: 10,
        marginBottom: 40
    },
    btn: {
        flex: 1,
        height: 50,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    acceptBtn: { backgroundColor: "#10b981" },
    rejectBtn: { backgroundColor: "#ef4444" },
    btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 99,
    },
    statusText: {
        fontSize: 12,
        fontWeight: "700",
        textTransform: 'uppercase',
    }
});
