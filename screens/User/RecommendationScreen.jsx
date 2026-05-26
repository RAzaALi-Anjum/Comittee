/**
 * screens/User/RecommendationScreen.jsx
 * ─────────────────────────────────────────────────────────────────────────
 * UPGRADE: Fetches ranked initiator recommendations from Node.js backend
 * (GET /api/feedback/recommend-ranked) which uses:
 *   score = (avg_rating/5 × 0.60) + (completedCommittees/20 × 0.40)
 *
 * Displays:
 *  - #1 Top Initiator, #2 Second, #3 Third crowns + dynamic rank labels
 *  - Star ratings (avg rating)
 *  - Completed committees count
 *  - ML score percentage
 *  - Skeleton loaders while fetching
 * ─────────────────────────────────────────────────────────────────────────
 */

import { FontAwesome, FontAwesome5 } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import apiClient from "../../services/apiClient";
import { useTheme } from "../../theme/ThemeProvider";

// ── Rank badge config ──────────────────────────────────────────────────────
const RANK_CONFIG = {
  1: { icon: "🥇", bg: "#FEF3C7", border: "#F59E0B", text: "#B45309", label: "#1 Top Initiator" },
  2: { icon: "🥈", bg: "#F1F5F9", border: "#94A3B8", text: "#475569", label: "#2 Second"       },
  3: { icon: "🥉", bg: "#FEF9F3", border: "#F97316", text: "#C2410C", label: "#3 Third"        },
};
const DEFAULT_RANK_CFG = { icon: "⭐", bg: "#F8FAFC", border: "#CBD5E1", text: "#64748B" };

const CLUSTER_COLORS = ["#3B82F6", "#8B5CF6", "#EC4899", "#F59E0B", "#22C55E"];
const clusterColor = (idx) => CLUSTER_COLORS[(idx || 0) % CLUSTER_COLORS.length];

// ── Skeleton card ─────────────────────────────────────────────────────────
function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [opacity]);

  return (
    <Animated.View style={[styles.skeletonCard, { opacity }]}>
      <View style={styles.skeletonTitle} />
      <View style={styles.skeletonRow}>
        <View style={styles.skeletonStar} />
        <View style={styles.skeletonChip} />
      </View>
      <View style={styles.skeletonScore} />
    </Animated.View>
  );
}

// ── Star renderer ─────────────────────────────────────────────────────────
function renderStars(rating) {
  const fullStars = Math.floor(rating || 0);
  const halfStar  = (rating || 0) % 1 >= 0.5;
  const stars = [];
  for (let i = 0; i < fullStars; i++)
    stars.push(<FontAwesome key={i} name="star" size={14} color="#FFD700" />);
  if (halfStar)
    stars.push(<FontAwesome key="half" name="star-half" size={14} color="#FFD700" />);
  while (stars.length < 5)
    stars.push(<FontAwesome key={"e" + stars.length} name="star-o" size={14} color="#D1D5DB" />);
  return <View style={{ flexDirection: "row", gap: 2 }}>{stars}</View>;
}

// ── Main screen ───────────────────────────────────────────────────────────
export default function RecommendationScreen({ navigation }) {
  const { colors } = useTheme();
  const [recommendations, setRecommendations] = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState(null);

  const fetchRecs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Primary: Node.js backend ranked endpoint (uses rating + completed formula)
      const json = await apiClient.backendGet("/feedback/recommend-ranked");
      if (json?.success && json.initiators?.length > 0) {
        setRecommendations(json.initiators);
        return;
      }
      // Fallback: ML server direct call
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(`${apiClient.getMlBaseUrl()}/recommend-initiators`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ userId: "current", minRating: 0 }),
        signal:  controller.signal,
      });
      clearTimeout(timeoutId);
      if (!resp.ok) throw new Error(`ML service returned ${resp.status}`);
      const mlJson = await resp.json();
      const mapped = (mlJson.recommendations || []).map((item, idx) => ({
        ...item,
        avgRating: item.avg_rating || 0,
        completedCommittees: 0,
        rank: idx + 1,
        rankLabel: idx === 0 ? "#1 Top Initiator" : idx === 1 ? "#2 Second" : idx === 2 ? "#3 Third" : `#${idx + 1}`,
      }));
      setRecommendations(mapped);
    } catch (e) {
      console.warn("[Recommendations] Error:", e.message);
      setError("Could not load recommendations. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecs(); }, [fetchRecs]);

  const renderItem = ({ item, index }) => {
    const rankCfg = RANK_CONFIG[item.rank] || DEFAULT_RANK_CFG;
    const isTop3  = item.rank <= 3;

    return (
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: isTop3 ? rankCfg.border : colors.border,
            borderWidth: isTop3 ? 2 : 1,
          },
        ]}
        onPress={() => navigation.navigate("InitiatorProfile", { initiator: item })}
        activeOpacity={0.82}
      >
        {/* Header row: rank badge + name + cluster chip */}
        <View style={styles.cardHeader}>
          {/* Rank badge */}
          <View style={[styles.rankBadge, { backgroundColor: isTop3 ? rankCfg.bg : "#F8FAFC", borderColor: isTop3 ? rankCfg.border : "#CBD5E1" }]}>
            <Text style={styles.rankIcon}>{rankCfg.icon}</Text>
            <Text style={[styles.rankLabel, { color: isTop3 ? rankCfg.text : "#64748B" }]}>
              {item.rankLabel || `#${item.rank}`}
            </Text>
          </View>

          {/* Cluster chip */}
          <View style={[styles.clusterChip, { backgroundColor: clusterColor(item.cluster) + "22", borderColor: clusterColor(item.cluster) + "66" }]}>
            <Text style={[styles.clusterText, { color: clusterColor(item.cluster) }]}>
              Lvl {item.level || 1}
            </Text>
          </View>
        </View>

        {/* Initiator name */}
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {item.name || "Unknown Initiator"}
        </Text>

        {/* Stars + avg rating */}
        <View style={styles.starsRow}>
          {renderStars(item.avgRating || item.avg_rating || 0)}
          <Text style={[styles.ratingText, { color: colors.textSecondary }]}>
            {(item.avgRating || item.avg_rating || 0).toFixed(1)} ({item.totalRatings || item.total_feedback || 0} ratings)
          </Text>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <FontAwesome5 name="check-circle" size={12} color="#10B981" />
            <Text style={[styles.statText, { color: colors.textSecondary }]}>
              {item.completedCommittees || 0} Completed
            </Text>
          </View>
          <View style={styles.statItem}>
            <FontAwesome5 name="brain" size={11} color="#6366F1" />
            <Text style={[styles.statText, { color: colors.textSecondary }]}>
              Score: {((item.score || 0) * 100).toFixed(1)}%
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.brand }]}>Top Recommended Initiators</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Ranked by ratings + completed committees · ML-powered
      </Text>

      {loading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : error ? (
        <View style={styles.errorWrap}>
          <Text style={[styles.errorText, { color: "#EF4444" }]}>{error}</Text>
          <TouchableOpacity onPress={fetchRecs} style={styles.retryBtn}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : recommendations.length === 0 ? (
        <View style={styles.errorWrap}>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>
            No approved initiators found yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={recommendations}
          keyExtractor={(item, idx) => item.initiatorId || item.id || String(idx)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title:     { fontSize: 22, fontWeight: "bold", marginBottom: 2, textAlign: "center" },
  subtitle:  { fontSize: 12, textAlign: "center", marginBottom: 14 },

  card: {
    padding: 16, borderRadius: 16, marginBottom: 12,
    shadowColor: "#000", shadowOpacity: 0.08, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6,
    elevation: 3,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },

  rankBadge:  { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1.5 },
  rankIcon:   { fontSize: 16, marginRight: 4 },
  rankLabel:  { fontSize: 12, fontWeight: "800" },

  clusterChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  clusterText: { fontSize: 11, fontWeight: "800" },

  name:     { fontSize: 17, fontWeight: "800", marginBottom: 6 },
  starsRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  ratingText: { fontSize: 12, fontWeight: "600" },

  statsRow: { flexDirection: "row", gap: 16 },
  statItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { fontSize: 12, fontWeight: "600" },

  errorWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 40 },
  errorText: { fontSize: 14, textAlign: "center", marginBottom: 14 },
  retryBtn:  { backgroundColor: "#3B82F6", paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10 },

  // Skeleton
  skeletonCard:  { backgroundColor: "#E2E8F0", borderRadius: 16, padding: 16, marginBottom: 12 },
  skeletonTitle: { height: 18, backgroundColor: "#CBD5E1", borderRadius: 6, width: "55%", marginBottom: 10 },
  skeletonRow:   { flexDirection: "row", gap: 8, marginBottom: 8 },
  skeletonStar:  { height: 14, backgroundColor: "#CBD5E1", borderRadius: 4, width: "30%" },
  skeletonChip:  { height: 14, backgroundColor: "#CBD5E1", borderRadius: 10, width: "22%" },
  skeletonScore: { height: 12, backgroundColor: "#CBD5E1", borderRadius: 4, width: "40%" },
});
