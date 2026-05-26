import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import Card from "../../components/ui/Card";
import ScreenHeader from "../../components/ui/ScreenHeader";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";

const committeesData = {
  "1": [
    { name: "Committee A", status: "completed", amount: 5000 },
    { name: "Committee B", status: "active", amount: 3000 },
  ],
  "2": [
    { name: "Committee C", status: "completed", amount: 4000 },
    { name: "Committee D", status: "active", amount: 2000 },
  ],
  "3": [
    { name: "Committee E", status: "completed", amount: 7000 },
    { name: "Committee F", status: "active", amount: 3500 },
  ],
  "4": [
    { name: "Committee G", status: "completed", amount: 4500 },
    { name: "Committee H", status: "active", amount: 2500 },
  ],
  "5": [
    { name: "Committee I", status: "completed", amount: 5200 },
    { name: "Committee J", status: "active", amount: 2800 },
  ],
  "6": [
    { name: "Committee K", status: "completed", amount: 6100 },
    { name: "Committee L", status: "active", amount: 3300 },
  ],
  "7": [
    { name: "Committee M", status: "completed", amount: 4800 },
    { name: "Committee N", status: "active", amount: 2600 },
  ],
  "8": [
    { name: "Committee O", status: "completed", amount: 5700 },
    { name: "Committee P", status: "active", amount: 3100 },
  ],
  "9": [
    { name: "Committee Q", status: "completed", amount: 4300 },
    { name: "Committee R", status: "active", amount: 2400 },
  ],
  "10": [
    { name: "Committee S", status: "completed", amount: 3900 },
    { name: "Committee T", status: "active", amount: 2200 },
  ],
  "11": [
    { name: "Committee U", status: "completed", amount: 5600 },
    { name: "Committee V", status: "active", amount: 3000 },
  ],
  "12": [
    { name: "Committee W", status: "completed", amount: 6000 },
    { name: "Committee X", status: "active", amount: 3400 },
  ],
  "13": [
    { name: "Committee Y", status: "completed", amount: 6500 },
    { name: "Committee Z", status: "active", amount: 3600 },
  ],
  "14": [
    { name: "Committee AA", status: "completed", amount: 4100 },
    { name: "Committee AB", status: "active", amount: 2300 },
  ],
  "15": [
    { name: "Committee AC", status: "completed", amount: 7000 },
    { name: "Committee AD", status: "active", amount: 3800 },
  ],
  "16": [
    { name: "Committee AE", status: "completed", amount: 6200 },
    { name: "Committee AF", status: "active", amount: 3500 },
  ],
};

const profileImages = {
  "1": "https://randomuser.me/api/portraits/men/32.jpg",
  "2": "https://randomuser.me/api/portraits/women/44.jpg",
  "3": "https://randomuser.me/api/portraits/men/56.jpg",
  "4": "https://randomuser.me/api/portraits/women/12.jpg",
  "5": "https://randomuser.me/api/portraits/men/65.jpg",
  "6": "https://randomuser.me/api/portraits/women/19.jpg",
  "7": "https://randomuser.me/api/portraits/men/70.jpg",
  "8": "https://randomuser.me/api/portraits/women/38.jpg",
  "9": "https://randomuser.me/api/portraits/men/21.jpg",
  "10": "https://randomuser.me/api/portraits/women/22.jpg",
  "11": "https://randomuser.me/api/portraits/men/43.jpg",
  "12": "https://randomuser.me/api/portraits/women/50.jpg",
  "13": "https://randomuser.me/api/portraits/men/12.jpg",
  "14": "https://randomuser.me/api/portraits/women/60.jpg",
  "15": "https://randomuser.me/api/portraits/men/80.jpg",
  "16": "https://randomuser.me/api/portraits/women/72.jpg",
};

const isValidImageUrl = (uri) => {
  if (!uri || typeof uri !== "string") return false;
  return uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("data:image/");
};

export default function InitiatorProfileScreen({ route, navigation }) {
  const { colors, language: appLang } = useTheme();
  const tr = (en, ur) => (appLang === "ur" ? ur : en);
  const { initiator } = route.params;

  const [committees, setCommittees] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const completedCount = committees.filter(c => {
    const status = String(c.status || "").toLowerCase();
    return status === "completed" || status === "finished";
  }).length;

  const activeCount = committees.filter(c => {
    const status = String(c.status || "").toLowerCase();
    return status === "active" || status === "started";
  }).length;

  const totalCount = committees.length;
  const successRate = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
  const ratingVal = Number(initiator.rating ?? 5);
  const levelNum = Math.min(5, Math.max(1, Math.round((ratingVal - 3) + completedCount)));
  const fallbackImage = initiator.image || profileImages[initiator.id];

  useEffect(() => {
    const load = async () => {
      try {
        if (initiator.id) {
          const profileData = await userService.getProfileRTDB(initiator.id);
          if (profileData) {
            setProfile(profileData);
          }
        }
      } catch (e) {
        console.warn("[InitiatorProfile] Failed to fetch profile:", e.message);
      }

      try {
        const allComms = await userService.getAllCommittees();
        if (allComms) {
          const filtered = Object.entries(allComms)
            .map(([id, c]) => ({ id, ...c }))
            .filter((c) => c && c.createdBy === initiator.id);
          setCommittees(filtered);
        }
      } catch (e) {
        console.warn("[InitiatorProfile] Failed to fetch committees:", e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [initiator?.id]);

  const renderStars = (rating) => {
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5;
    const stars = [];
    for (let i = 0; i < fullStars; i++)
      stars.push(<Ionicons key={i} name="star" size={18} color="#FFD700" />);
    if (halfStar)
      stars.push(<Ionicons key="half" name="star-half" size={18} color="#FFD700" />);
    while (stars.length < 5)
      stars.push(<Ionicons key={"empty" + stars.length} name="star-outline" size={18} color="#FFD700" />);
    return <View style={styles.starRow}>{stars}</View>;
  };

  const initiatorName = profile?.fullName || profile?.name || initiator.name || tr("Initiator", "انتظامی");

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={initiatorName}
        subtitle={tr("Authorized Committee Initiator", "منظور شدہ کمیٹی انتظامی")}
        showBack={true}
        onBack={() => navigation.goBack()}
        height={240}
      >
        <View style={styles.headerContent}>
          <View style={styles.avatarWrapper}>
            {(profile?.profilePicture && isValidImageUrl(profile.profilePicture)) || fallbackImage ? (
              <Image source={{ uri: (profile?.profilePicture && isValidImageUrl(profile.profilePicture)) ? profile.profilePicture : fallbackImage }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                <Text style={styles.avatarInitial}>
                  {initiatorName.slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.ratingBox}>
            <Text style={styles.ratingText}>{ratingVal.toFixed(1)}</Text>
            {renderStars(ratingVal)}
          </View>
        </View>
      </ScreenHeader>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {loading && <ActivityIndicator style={{ marginBottom: 12 }} size="small" color={colors.brand} />}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{tr("Performance Stats", "کارکردگی کے اعدادوشمار")}</Text>
        </View>

        <Card style={styles.statsCard}>
          <View style={styles.statsRow}>
            <StatItem label={tr("Completed", "مکمل")} value={completedCount} color={colors.success} bgColor={colors.success + '15'} />
            <StatItem label={tr("Active", "فعال")} value={activeCount} color={colors.info} bgColor={colors.info + '15'} />
            <StatItem label={tr("Success", "کامیابی")} value={`${successRate}%`} color={colors.brand} bgColor={colors.brand + '15'} />
          </View>

          <View style={styles.levelContainer}>
            <View style={styles.levelHeader}>
              <Text style={[styles.levelLabel, { color: colors.textSecondary }]}>{tr("Experience Level", "تجربے کا درجہ")}</Text>
              <Text style={[styles.levelValue, { color: colors.brand }]}>{`${levelNum} / 5`}</Text>
            </View>
            <View style={styles.levelBar}>
              {[1, 2, 3, 4, 5].map((n) => (
                <View
                  key={n}
                  style={[
                    styles.levelSegment,
                    { backgroundColor: n <= levelNum ? colors.brand : colors.border }
                  ]}
                />
              ))}
            </View>
          </View>
        </Card>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{tr("Committees History", "کمیٹیوں کی تاریخ")}</Text>
        </View>

        <Card style={styles.historyCard}>
          <HistoryRow icon="checkmark-done" label={tr("Total Completed", "کل مکمل")} value={completedCount} color={colors.success} />
          <HistoryRow icon="time" label={tr("Current Active", "موجودہ فعال")} value={activeCount} color={colors.info} />
          <HistoryRow icon="ribbon" label={tr("Total Successful", "کل کامیاب")} value={completedCount} color={colors.brand} />
        </Card>
      </ScrollView>
    </View>
  );
}

function StatItem({ label, value, color, bgColor }) {
  return (
    <View style={[styles.statItem, { backgroundColor: bgColor }]}>
      <Text style={[styles.statValue, { color }]}>{String(value)}</Text>
      <Text style={[styles.statLabel, { color }]}>{label}</Text>
    </View>
  );
}

function HistoryRow({ icon, label, value, color }) {
  const { colors } = useTheme();
  return (
    <View style={styles.historyRow}>
      <View style={styles.historyLeft}>
        <View style={[styles.historyIcon, { backgroundColor: color + '15' }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <Text style={[styles.historyLabel, { color: colors.text }]}>{label}</Text>
      </View>
      <Text style={[styles.historyValue, { color: colors.text }]}>{String(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1, marginTop: -30 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },

  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  avatarWrapper: {
    padding: 2,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 36
  },
  ratingBox: {
    alignItems: 'flex-end',
  },
  ratingText: {
    fontSize: 28,
    fontWeight: "900",
    color: '#FFF',
    marginBottom: 2
  },
  starRow: {
    flexDirection: "row",
    gap: 4
  },

  sectionHeader: {
    marginTop: 24,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  statsCard: {
    padding: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  levelContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    paddingTop: 16,
  },
  levelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  levelLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  levelValue: {
    fontSize: 16,
    fontWeight: '900',
  },
  levelBar: {
    flexDirection: "row",
    gap: 6,
  },
  levelSegment: {
    flex: 1,
    height: 8,
    borderRadius: 4
  },

  historyCard: {
    padding: 16,
    gap: 14,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historyIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  historyValue: {
    fontSize: 16,
    fontWeight: '900',
  },
});

