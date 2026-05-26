import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import storageService from "../../services/storageService";
import userService from "../../services/userService";
import { TOKENS, useTheme } from "../../theme/ThemeProvider";

export default function InitiatorLoanStatusScreen() {
  const { colors } = useTheme();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub = null;
    let cancelled = false;

    const setup = async () => {
      try {
        const parsed = await storageService.getUserData();
        const uid = parsed?.userId || parsed?.uid;

        if (!uid || cancelled) {
          setLoans([]);
          setLoading(false);
          return;
        }

        const items = await userService.getLoansByUser(uid);
        if (!cancelled) {
          items.sort((a, b) => {
            const ta = a.appliedAt?.toMillis?.() ? a.appliedAt.toMillis() : new Date(a.appliedAt).getTime();
            const tb = b.appliedAt?.toMillis?.() ? b.appliedAt.toMillis() : new Date(b.appliedAt).getTime();
            return tb - ta;
          });
          setLoans(items);
          setLoading(false);
        }
      } catch (err) {
        setLoading(false);
      }
    };

    setup();

    return () => {
      cancelled = true;
    };
  }, []);

  const getStatusColor = (status) => {
    const s = String(status || "").toLowerCase();
    if (s.includes("approved") || s.includes("accepted") || s.includes("success")) return colors.success;
    if (s.includes("pending") || s.includes("wait")) return colors.warning;
    if (s.includes("reject") || s.includes("fail") || s.includes("cancel")) return colors.danger;
    return colors.brand;
  };

  const renderItem = ({ item }) => {
    const statusColor = getStatusColor(item.status);
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardHeader}>
          <View style={styles.idContainer}>
            <Text style={[styles.idLabel, { color: colors.textSecondary }]}>TRACKING ID</Text>
            <Text style={[styles.idValue, { color: colors.text }]}>{item.trackingNumber ?? "—"}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '15' }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>{item.status}</Text>
          </View>
        </View>

        <View style={styles.amountContainer}>
          <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Requested Amount</Text>
          <Text style={[styles.amountValue, { color: colors.text }]}>{item.amount}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.footer}>
          <View style={styles.dateItem}>
            <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.dateText, { color: colors.textSecondary }]}>
              {item.appliedAt?.toDate?.().toLocaleDateString?.() ||
                (item.appliedAt ? new Date(item.appliedAt).toLocaleDateString() : "—")}
            </Text>
          </View>
          {item.updatedAt && (
            <View style={styles.dateItem}>
              <Ionicons name="refresh-outline" size={14} color={colors.textSecondary} />
              <Text style={[styles.dateText, { color: colors.textSecondary }]}>
                {item.updatedAt?.toDate?.().toLocaleDateString?.() ||
                  new Date(item.updatedAt).toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>My Loan Requests</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Track your application status</Text>
      </View>

      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={loans}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={48} color={colors.textSecondary + '40'} />
              <Text style={[styles.empty, { color: colors.textSecondary }]}>No requests found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: TOKENS.spacing.lg,
    paddingBottom: TOKENS.spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
    fontWeight: '500',
  },
  listContent: {
    padding: TOKENS.spacing.md,
    paddingBottom: TOKENS.spacing.xl,
  },
  card: {
    padding: TOKENS.spacing.md,
    borderRadius: TOKENS.radius.lg,
    marginBottom: TOKENS.spacing.md,
    borderWidth: 1,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: TOKENS.spacing.md,
  },
  idContainer: {
    flex: 1,
  },
  idLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  idValue: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: TOKENS.radius.md,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  amountContainer: {
    marginBottom: TOKENS.spacing.md,
  },
  amountLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  amountValue: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginBottom: TOKENS.spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 12,
    marginLeft: 4,
    fontWeight: '500',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: TOKENS.spacing.xxl,
  },
  empty: {
    textAlign: "center",
    marginTop: TOKENS.spacing.md,
    fontSize: 16,
    fontWeight: '500',
  },
});
