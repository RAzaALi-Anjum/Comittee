import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Card from "../../components/ui/Card";
import ScreenHeader from "../../components/ui/ScreenHeader";
import Typography from "../../components/ui/Typography";
import { useTheme } from "../../theme/ThemeProvider";

export default function AdminViewCommitteeDetails({ route, navigation }) {
  const { colors } = useTheme();
  const { committee } = route.params;

  const membersJoined = committee.usersParticipated ? (
    Array.isArray(committee.usersParticipated)
      ? committee.usersParticipated.filter(u => u).length
      : Object.values(committee.usersParticipated).filter(u => u).length
  ) : 0;

  const getUserNameById = (id) => {
    if (!id || !committee.usersParticipated) return null;
    const users = Array.isArray(committee.usersParticipated)
      ? committee.usersParticipated
      : Object.values(committee.usersParticipated);

    const searchTerm = String(id).toLowerCase();
    const user = users.find(u => {
      const uId = u?.id || u?.userId || u?.uid || u?.memberId;
      return uId && String(uId).toLowerCase() === searchTerm;
    });
    return user ? user.name || user.fullName : null;
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
        title={committee.name}
        subtitle="Administrative Review"
        showBack
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={true}
      >
        {/* 1. STATUS CARD */}
        <Card style={styles.card}>
          <View style={styles.statusHeader}>
            <View>
              <Typography variant="caption" color="secondary">Committee Status</Typography>
              <Typography variant="h3" color="brand">{committee.status}</Typography>
            </View>
            <View style={[styles.badge, { backgroundColor: colors.brand + '15' }]}>
              <Ionicons name="shield-checkmark" size={16} color={colors.brand} />
              <Typography variant="caption" style={{ color: colors.brand, marginLeft: 4 }}>Verified</Typography>
            </View>
          </View>
        </Card>

        {/* 2. OVERVIEW CARD */}
        <Typography variant="subtitle" style={styles.sectionTitle}>Financial Summary</Typography>
        <Card style={styles.card}>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Typography variant="caption" color="secondary">Total Payout</Typography>
              <Typography variant="h3" color="brand">{committee.totalAmount} PKR</Typography>
            </View>
            <View style={[styles.statBox, { borderLeftWidth: 1, borderLeftColor: colors.border }]}>
              <Typography variant="caption" color="secondary">Cycle Contrib.</Typography>
              <Typography variant="h3">{committee.contributionPerCycle} PKR</Typography>
            </View>
          </View>

          <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 }}>
            <InfoRow label="Participation" value={`${membersJoined} / ${committee.members} Members`} icon="people-outline" />
            <InfoRow label="Frequency" value={`${committee.cycleDuration} Days`} icon="calendar-outline" />
            <InfoRow label="Total Duration" value={`${committee.durationMonths} Months`} icon="time-outline" />
            <InfoRow label="Start Date" value={committee.startDate} icon="play-circle-outline" />
            <InfoRow label="End Date" value={committee.endDate} icon="stop-circle-outline" />
            <InfoRow label="Active Status" value={committee.active ? "Yes" : "No"} icon="radio-button-on-outline" />
          </View>
        </Card>

        {/* 3. TURNS SECTION */}
        {committee.turns && committee.turns.length > 0 && (
          <>
            <Typography variant="subtitle" style={styles.sectionTitle}>Assigned Turns</Typography>
            <Card style={styles.card}>
              {committee.turns.map((turn, index) => (
                <View key={index} style={[styles.turnRow, index === committee.turns.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={[styles.turnNum, { backgroundColor: colors.brand + '15' }]}>
                    <Typography variant="caption" color="brand" style={{ fontWeight: 'bold' }}>{index + 1}</Typography>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Typography variant="body" style={{ fontWeight: '700' }}>
                      {turn.name || getUserNameById(turn.id || turn.userId || turn.uid || turn.memberId) || "Member"}
                    </Typography>
                    <View style={styles.turnMetaRow}>
                      <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} style={{ marginRight: 4 }} />
                      <Typography variant="caption" color="secondary">{turn.turnDate}</Typography>
                    </View>
                  </View>
                </View>
              ))}
            </Card>
          </>
        )}

        {/* 4. MEMBERS LIST */}
        <Typography variant="subtitle" style={styles.sectionTitle}>Participant List</Typography>
        {committee.usersParticipated?.length > 0 ? (
          committee.usersParticipated.map((user, index) => (
            <Card key={index} style={styles.memberCard} padding="sm">
              <View style={styles.memberMain}>
                <View style={[styles.avatar, { backgroundColor: colors.brand + '10' }]}>
                  <Typography variant="h3" color="brand">{user ? user.name?.charAt(0) : "?"}</Typography>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Typography variant="body" style={{ fontWeight: '600' }}>
                    {user ? user.name : "Empty Slot"}
                  </Typography>
                  <Typography variant="caption" color="secondary">
                    {user ? user.email : "Awaiting member"}
                  </Typography>
                </View>
                {user && (
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
                )}
              </View>
            </Card>
          ))
        ) : (
          <Card style={styles.emptyCard}>
            <Typography variant="bodySmall" color="secondary" textAlign="center">
              No users have participated in this committee yet.
            </Typography>
          </Card>
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
    paddingVertical: 16,
  },
  sectionTitle: {
    marginTop: 8,
    marginBottom: 12,
    marginLeft: 4,
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
  },
  emptyCard: {
    padding: 30,
    alignItems: 'center',
  }
});
