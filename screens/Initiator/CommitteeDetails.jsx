import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import Card from "../../components/ui/Card";
import ScreenHeader from "../../components/ui/ScreenHeader";
import ThemedButton from "../../components/ui/ThemedButton";
import ThemedInput from "../../components/ui/ThemedInput";
import Typography from "../../components/ui/Typography";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";
import { sendNotification } from "../../utils/notificationHelper";

export default function CommitteeDetails({ route, navigation }) {
  const { colors } = useTheme();
  const { committee } = route.params;
  const [committeeData, setCommitteeData] = useState(committee);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All"); // All, Paid, Unpaid
  const [pendingCount, setPendingCount] = useState(0);
  const [generatedTurns, setGeneratedTurns] = useState([]);
  const [showTurns, setShowTurns] = useState(false);
  const [turnRevealDate, setTurnRevealDate] = useState(null);

  // Fetch pending requests and latest committee data
  React.useEffect(() => {
    const fetchLatestData = async () => {
      try {
        // Fetch Pending Requests
        const reqData = await userService.getParticipationRequests();
        if (reqData) {
          const count = Object.values(reqData).filter(
            (req) => req.committeeId === committee.id && req.status === "Pending"
          ).length;
          setPendingCount(count);
        }

        // Fetch Latest Committee Data (for turns)
        const comData = await userService.getCommitteeById(committee.id);
        if (comData) {
          const updatedCommittee = { ...comData, id: committee.id };

          // Fix missing names by fetching profiles
          if (updatedCommittee.usersParticipated) {
             let users = Array.isArray(updatedCommittee.usersParticipated)
               ? updatedCommittee.usersParticipated
               : Object.values(updatedCommittee.usersParticipated);
             
             users = users.filter(u => u);
             // Check for missing names OR "Unknown" names OR "Unknown Member"
             const missing = users.filter(u => !u.name || u.name === "Unknown" || u.name === "Unknown Member");

             if (missing.length > 0) {
               try {
                 const newUsers = [...users];
                 let changed = false;
                 await Promise.all(missing.map(async (u) => {
                   const uid = u.id || u.userId || u.uid;
                   if (uid) {
                     const profile = await userService.getProfileRTDB(uid);
                     if (profile && (profile.name || profile.fullName)) {
                       const idx = newUsers.findIndex(nu => (nu.id || nu.userId || nu.uid) === uid);
                       if (idx !== -1) {
                         const correctName = profile.name || profile.fullName;
                         newUsers[idx] = { ...newUsers[idx], name: correctName, email: profile.email || newUsers[idx].email };
                         changed = true;
                         // Also update local turns if they match this user
                         if (updatedCommittee.turns && Array.isArray(updatedCommittee.turns)) {
                            updatedCommittee.turns = updatedCommittee.turns.map(t => {
                                // If turn name is missing or generic, try to use correct name
                                const tName = t.name || "";
                                if ((t.id === uid || t.userId === uid) && 
                                    (!tName || tName === "Unknown" || tName === "Member" || tName === "Unknown Member")) {
                                    return { ...t, name: correctName };
                                }
                                return t;
                            });
                            // Persist updated turns to backend
                            await userService.updateCommitteeTurns(committee.id, updatedCommittee.turns);
                         }
                       }
                     }
                   }
                 }));
                 if (changed) {
                   updatedCommittee.usersParticipated = newUsers;
                   // Persist updated users to backend
                   await userService.updateCommitteeUsers(committee.id, newUsers);
                 }
               } catch (e) {
                 console.warn("Failed to patch missing names", e);
               }
             }
          }

          setCommitteeData(updatedCommittee);
          checkAndGenerateTurns(updatedCommittee);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
      }
    };

    fetchLatestData();
    const interval = setInterval(fetchLatestData, 5000);
    return () => clearInterval(interval);
  }, [committee.id]);

  const checkAndGenerateTurns = async (data) => {
    const started = String(data.status || "").toLowerCase() === "started" || data.active === true;
    if (!started || (!data.activationDate && !data.activationTs)) {
      setShowTurns(false);
      setTurnRevealDate(null);
      return;
    }
    const actTs = typeof data.activationTs === "number" ? data.activationTs : Date.parse(data.activationDate);
    const activation = new Date(isNaN(actTs) ? Date.now() : actTs);
    const revealTs = activation.getTime() + 2 * 60 * 1000; // 2 minutes after start
    const reveal = new Date(revealTs);
    setTurnRevealDate(reveal);

    const now = new Date();
    if (now >= reveal) {
      setShowTurns(true);
      if (data.turns && Array.isArray(data.turns) && data.turns.length) {
        // Enforce name update if it's "Unknown Member"
        const updatedTurns = data.turns.map(t => {
           let displayName = t.name || "";
           if (!displayName || displayName === "Unknown" || displayName === "Member" || displayName === "Unknown Member") {
              const foundName = getUserNameById(t.id || t.userId || t.uid || t.memberId);
              if (foundName && foundName !== "Unknown Member") displayName = foundName;
           }
           // Always return a new object with the correct name to ensure re-render
           return { ...t, name: displayName || "Member" };
        });
        setGeneratedTurns([...updatedTurns]); // Spread to force new array reference
        return;
      }
      // Generate Turns if not exist and 2 minutes elapsed
      const users = data.usersParticipated;
      let validUsers = [];
      if (users) {
        if (Array.isArray(users)) validUsers = users.filter(u => u);
        else if (typeof users === 'object') validUsers = Object.values(users).filter(u => u);
      }
      if (validUsers.length > 0) {
        try {
          // Shuffle users randomly (Fisher–Yates)
          for (let i = validUsers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validUsers[i], validUsers[j]] = [validUsers[j], validUsers[i]];
          }
          const cycleDays = parseInt(data?.cycleDuration) || 30;
         const turns = validUsers.map((u, i) => {
const d = new Date(activation);
d.setDate(activation.getDate() + i * cycleDays);

const userName =
          u?.name?.trim() ||
          u?.fullName?.trim() ||
          u?.username?.trim() ||
          (u?.email ? u.email.split("@")[0] : "") ||
           "Member";

            return {
             index: i + 1,
            turnDate: d.toISOString().split("T")[0],
            id: u.id || u.userId || u.uid || null,
            name: userName,
            email: u.email || "",
            memberId: u.memberId || String(i + 1),
         };
        });

          await userService.updateCommitteeTurns(committee.id, turns);
          setGeneratedTurns(turns);
          setCommitteeData(prev => ({ ...prev, turns }));
        } catch (e) {
          console.error("Error generating turns:", e);
        }
      }
    } else {
      setShowTurns(false);
    }
  };

  const handleStartCommittee = async () => {
    try {
      await userService.startCommittee(committee.id);
      // Notify initiator about turn reveal schedule (2 minutes after start)
      try {
        const users = committeeData?.usersParticipated;
        let validUsers = [];
        if (users) {
          if (Array.isArray(users)) validUsers = users.filter((u) => u);
          else if (typeof users === "object") validUsers = Object.values(users).filter((u) => u);
        }
        const name = committeeData?.name || "Committee";
        const notifPromises = validUsers
          .map((u) => u?.userId || u?.uid)
          .filter(Boolean)
          .map((uid) =>
            sendNotification(
              uid,
              "Committee Started",
              `Your committee "${name}" has started. Turns will be assigned randomly in 2 minutes.`,
              "info",
              committee.id
            )
          );
        await Promise.allSettled(notifPromises);
      } catch (e) { }
      Alert.alert("Success", "Committee has been started successfully! Turns will be assigned randomly in 2 minutes.");
      navigation.goBack();
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to start committee");
    }
  };

  const membersJoined = committeeData.usersParticipated ? (
    Array.isArray(committeeData.usersParticipated)
      ? committeeData.usersParticipated.filter(u => u).length
      : Object.values(committeeData.usersParticipated).filter(u => u).length
  ) : 0;

  const canStart = committeeData.status !== "Started" && membersJoined >= parseInt(committeeData.members || 0);

  const getFilteredMembers = () => {
    if (!committeeData.usersParticipated) return [];

    const list = Array.isArray(committeeData.usersParticipated)
      ? committeeData.usersParticipated
      : Object.values(committeeData.usersParticipated);

    return list.filter((user) => {
      if (!user) return false;

      // 1. Search by Name
      const nameMatch = user.name ? user.name.toLowerCase().includes(searchQuery.toLowerCase()) : false;

      // 2. Filter by Payment Status
      const paymentStatus = user.paymentStatus ? user.paymentStatus.toLowerCase() : "unpaid";
      const statusMatch =
        statusFilter === "All" ||
        (statusFilter === "Paid" && paymentStatus === "paid") ||
        (statusFilter === "Unpaid" && paymentStatus === "unpaid");

      return nameMatch && statusMatch;
    });
  };

  const filteredMembers = getFilteredMembers();

  const getUserNameById = (id) => {
if (!id) return null;

const searchId = String(id).trim().toLowerCase();

let users = [];

if (committeeData.usersParticipated) {
if (Array.isArray(committeeData.usersParticipated)) {
users = committeeData.usersParticipated.filter(Boolean);
} else {
users = Object.values(committeeData.usersParticipated).filter(Boolean);
}
}

const user = users.find((u) => {
const ids = [u.id, u.userId, u.uid, u.memberId];
return ids.some((pid) => pid && String(pid).toLowerCase() === searchId);
});

if (!user) return null;

const name =
user?.name?.trim() ||
user?.fullName?.trim() ||
user?.username?.trim();

if (name) return name;

if (user?.email) return user.email.split("@")[0];

return null;
};

  const InfoRow = ({ label, value, icon }) => (
    <View style={styles.infoRow}>
      <View style={styles.infoLabelContainer}>
        {icon && <Ionicons name={icon} size={18} color={colors.brand} style={{ marginRight: 8 }} />}
        <Typography variant="bodySmall" color="secondary">{label}</Typography>
      </View>
      <Typography variant="body" style={{ fontWeight: '600' }}>{value}</Typography>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title={committeeData.name}
        subtitle="Committee Management"
        showBack
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={true}
      >
        {/* 1. STATUS & ACTIONS CARD */}
        <Card style={styles.card}>
          <View style={styles.statusHeader}>
            <View>
              <Typography variant="caption" color="secondary">Current Status</Typography>
              <Typography variant="h3" color={committeeData.status === "Started" ? "success" : "brand"}>
                {committeeData.status === "Started" ? "Active" : committeeData.status}
              </Typography>
            </View>
            {committeeData.status === "Started" && (
              <View style={[styles.badge, { backgroundColor: colors.success + '20' }]}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Typography variant="caption" style={{ color: colors.success, marginLeft: 4 }}>Started</Typography>
              </View>
            )}
          </View>

          {committeeData.status !== "Started" && (
            <ThemedButton
              label={canStart ? "Launch Committee" : `Awaiting Members (${membersJoined}/${committeeData.members})`}
              onPress={handleStartCommittee}
              disabled={!canStart}
              style={{ marginTop: 16 }}
            />
          )}

          {pendingCount > 0 && (
            <TouchableOpacity
              style={[styles.pendingAlert, { backgroundColor: colors.warning + '20', borderColor: colors.warning }]}
              onPress={() => navigation.navigate("ParticipationRequests")}
            >
              <Ionicons name="people-outline" size={20} color={colors.warning} />
              <Typography variant="bodySmall" style={{ color: colors.warning, marginLeft: 8, flex: 1 }}>
                {pendingCount} Pending Participation Requests
              </Typography>
              <Ionicons name="chevron-forward" size={16} color={colors.warning} />
            </TouchableOpacity>
          )}
        </Card>

        {/* 2. OVERVIEW CARD */}
        <Typography variant="subtitle" style={styles.sectionTitle}>Overview Details</Typography>
        <Card style={styles.card}>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Typography variant="caption" color="secondary">Total Amount</Typography>
              <Typography variant="h3" color="brand">{committeeData.totalAmount} PKR</Typography>
            </View>
            <View style={[styles.statBox, { borderLeftWidth: 1, borderLeftColor: colors.border }]}>
              <Typography variant="caption" color="secondary">Monthly Contrib.</Typography>
              <Typography variant="h3">{committeeData.contributionPerCycle} PKR</Typography>
            </View>
          </View>

          <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 }}>
            <InfoRow
              label="Members Joined"
              value={`${membersJoined} / ${committeeData.members}`}
              icon="people-outline"
            />
            <InfoRow label="Cycle Duration" value={`${committeeData.cycleDuration} Days`} icon="calendar-outline" />
            <InfoRow label="Total Cycles" value={committeeData.numberOfCycles} icon="repeat-outline" />
            <InfoRow label="Start Date" value={committeeData.startDate} icon="play-circle-outline" />
            <InfoRow label="End Date" value={committeeData.endDate} icon="stop-circle-outline" />
            {committeeData.activationDate && (
              <InfoRow label="Activated On" value={committeeData.activationDate} icon="flash-outline" />
            )}
          </View>
        </Card>

        {/* 3. TURNS CARD */}
        <View style={[styles.sectionHeader, { marginTop: 20 }]}>
          <Typography variant="subtitle">Committee Turns</Typography>
          {generatedTurns && generatedTurns.length > 0 && (
            <TouchableOpacity
              onPress={() => navigation.navigate("TurnManagement", { committeeId: committee.id, committeeName: committee.name })}
            >
              <Typography variant="caption" color="brand" style={{ fontWeight: '700' }}>Manage / Swap</Typography>
            </TouchableOpacity>
          )}
        </View>

        <Card style={styles.card}>
          {showTurns ? (
            generatedTurns && generatedTurns.length > 0 ? (
              generatedTurns.map((turn, index) => {
                // Ensure we get a valid display name
               let displayName =
                   turn?.name?.trim() ||
                   getUserNameById(turn?.id || turn?.userId || turn?.uid) ||
                   (turn?.email ? turn.email.split("@")[0] : "") ||
                  "Member";

                
                // If the turn has a name but it's "Unknown Member" or generic, try to find the real one
                if (!displayName || displayName === "Unknown" || displayName === "Member" || displayName === "Unknown Member") {
                  displayName = getUserNameById(turn.id || turn.userId || turn.uid || turn.memberId);
                }
                
                // If we still have a generic name, try one last lookup by ID directly
                if (!displayName || displayName === "Member" || displayName === "Unknown Member") {
                   const uId = turn.id || turn.userId || turn.uid || turn.memberId;
                   if (uId) {
                      const foundName = getUserNameById(uId);
                      if (foundName && foundName !== "Unknown Member") displayName = foundName;
                   }
                }
                
                if (!displayName || displayName === "Unknown Member") displayName = "Member";
                return (
                  <View key={index} style={[styles.turnRow, index === generatedTurns.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={[styles.turnNum, { backgroundColor: colors.brand + '15' }]}>
                      <Typography variant="caption" color="brand" style={{ fontWeight: 'bold' }}>{index + 1}</Typography>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Typography variant="body" style={{ fontWeight: '700' }}>
                        {displayName}
                      </Typography>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                        <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} style={{ marginRight: 4 }} />
                        <Typography variant="caption" color="secondary">{turn.turnDate}</Typography>
                      </View>
                    </View>
                    {/* Optional: Add chevron if detail navigation is needed */}
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="time-outline" size={40} color={colors.textSecondary} style={{ opacity: 0.5 }} />
                <Typography variant="bodySmall" color="secondary" style={styles.emptyText}>
                  No turns yet — they will appear automatically after the reveal time.
                </Typography>
              </View>
            )
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="lock-closed-outline" size={40} color={colors.brand} style={{ opacity: 0.3 }} />
              <Typography variant="bodySmall" color="secondary" style={styles.emptyText}>
                Turns will be assigned randomly 2 minutes after start.
                {turnRevealDate ? `\nExpected reveal: ${turnRevealDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ""}
              </Typography>
            </View>
          )}
        </Card>

        {/* 4. MEMBERS LIST */}
        <Typography variant="subtitle" style={styles.sectionTitle}>Participating Members</Typography>

        <View style={styles.searchBox}>
          <ThemedInput
            placeholder="Search members..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            leftIcon="search-outline"
          />
        </View>

        <View style={styles.filterRow}>
          {["All", "Paid", "Unpaid"].map((status) => (
            <TouchableOpacity
              key={status}
              onPress={() => setStatusFilter(status)}
              style={[
                styles.filterChip,
                { borderColor: colors.brand },
                statusFilter === status && { backgroundColor: colors.brand }
              ]}
            >
              <Typography
                variant="caption"
                style={{
                  color: statusFilter === status ? "#FFF" : colors.brand,
                  fontWeight: '700'
                }}
              >
                {status}
              </Typography>
            </TouchableOpacity>
          ))}
        </View>

        {filteredMembers.length > 0 ? (
          filteredMembers.map((user, index) => (
            <Card key={index} style={styles.memberCard} padding="sm">
              <View style={styles.memberMain}>
                <View style={[styles.avatar, { backgroundColor: colors.brand + '10' }]}>
                  <Typography variant="h3" color="brand">{user.name?.charAt(0)}</Typography>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Typography variant="body" style={{ fontWeight: '600' }}>{user.name}</Typography>
                  <Typography variant="caption" color="secondary">{user.email}</Typography>
                </View>
                <View style={[
                  styles.statusPill,
                  { backgroundColor: (user.paymentStatus || "unpaid").toLowerCase() === "paid" ? colors.success + '15' : colors.danger + '15' }
                ]}>
                  <Typography
                    variant="caption"
                    style={{
                      color: (user.paymentStatus || "unpaid").toLowerCase() === "paid" ? colors.success : colors.danger,
                      fontWeight: 'bold'
                    }}
                  >
                    {(user.paymentStatus || "Unpaid").toUpperCase()}
                  </Typography>
                </View>
              </View>
            </Card>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Typography variant="bodySmall" color="secondary">No matching members found</Typography>
          </View>
        )}
      </ScrollView>
    </View >
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: -30,
    paddingHorizontal: 20,
  },
  card: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginTop: 8,
    marginBottom: 12,
    marginLeft: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginHorizontal: 4,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  pendingAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  statsGrid: {
    flexDirection: 'row',
  },
  statBox: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  turnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  turnNum: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  turnMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  turnBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 4,
  },
  turnDetail: {
    flex: 1,
    marginLeft: 12,
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  searchBox: {
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: "row",
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    marginRight: 10,
  },
  memberCard: {
    marginBottom: 10,
  },
  memberMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  }
});
