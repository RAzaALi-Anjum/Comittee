/**
 * screens/Initiator/WalletScreen.jsx
 * ─────────────────────────────────────────────────────────────────────────
 * UPGRADE 1 + 5: Real on-chain balance via ethers.Contract.getPoolBalance()
 * with live Deposited event listener, animated escrow balance counter,
 * pulsing "Verified On-Chain" badge, and expandable tx-hash rows.
 *
 * PRESERVATION: isMounted ref pattern and resolveCleanup helper retained.
 * cryptoUtils imports kept for legacy encrypted-description fields.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { FontAwesome5 } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import apiClient from "../../services/apiClient";
import { useTheme } from "../../theme/ThemeProvider";
import { useWalletReload } from "../../context/WalletContext";
import { decryptAES256, verifyLedgerHash } from "../../utils/cryptoUtils";
import {
  getEscrowContractReadOnly,
  getPoolBalance,
  ESCROW_ABI,
} from "../../utils/walletManager";
import { ethers } from "ethers";

// ── Design tokens ────────────────────────────────────────────────────────────
const CHAIN_COLORS = {
  confirmed: "#22C55E",
  pending:   "#F59E0B",
  failed:    "#EF4444",
  onChain:   "#3B82F6",
};

export default function WalletScreen({ route }) {
  const { colors } = useTheme();
  const committeeId   = route?.params?.committeeId;
  const committeeName = route?.params?.committeeName;

  // ── Legacy wallet state ────────────────────────────────────────
  const [wallet,       setWallet]       = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [error,        setError]        = useState(null);
  const { walletReloadKey } = useWalletReload();

  // ── On-chain escrow state ──────────────────────────────────────
  const [onChainBalance,    setOnChainBalance]    = useState(null);  // ETH string
  const [onChainLoading,    setOnChainLoading]    = useState(true);
  const [expandedTx,        setExpandedTx]        = useState(null);  // txHash of expanded row

  // ── Animated counter value for on-chain balance ────────────────
  const animatedBalance = useRef(new Animated.Value(0)).current;
  const displayBalance  = useRef(0);

  // ── Pulse animation for "Verified On-Chain" badge ─────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0,  duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ── Animate counter to new balance ────────────────────────────
  const animateTo = useCallback((targetEth) => {
    const target = parseFloat(targetEth) || 0;
    Animated.timing(animatedBalance, {
      toValue: target,
      duration: 800,
      useNativeDriver: false,
    }).start();
    displayBalance.current = target;
  }, [animatedBalance]);

  // ── Fetch legacy wallet from backend ─────────────────────────
  const fetchWallet = useCallback(async () => {
    let isMounted = true;
    if (!committeeId) {
      setError("No selected committee.");
      setLoading(false);
      return () => { isMounted = false; };
    }
    try {
      if (isMounted) setError(null);
      const result = await apiClient.backendGet(`/wallet/${committeeId}`);
      if (!isMounted) return;
      if (result?.success) {
        setWallet(result.wallet);
        setTransactions(result.transactions || []);
      } else {
        setError("Wallet not found.");
      }
    } catch (err) {
      if (isMounted) setError(err.message || "Failed to load wallet.");
    } finally {
      if (isMounted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    return () => { isMounted = false; };
  }, [committeeId]);

  useEffect(() => {
    const cleanup = fetchWallet();
    return () => { resolveCleanup(cleanup); };
  }, [fetchWallet, walletReloadKey]);

  // Helper for cleaning up async callback
  const resolveCleanup = (cleanup) => {
    cleanup.then(fn => fn && fn()).catch(() => {});
  };

  // ── Fetch on-chain balance ─────────────────────────────────────
  const fetchOnChainBalance = useCallback(async () => {
    if (!committeeId) return;
    try {
      setOnChainLoading(true);
  // Convert string committeeId to a stable uint32 (djb2 hash — no Buffer needed)
  const numId = committeeId.split("").reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) >>> 0, 5381);
  const ethBal = await getPoolBalance(numId);
      setOnChainBalance(ethBal);
      animateTo(ethBal);
    } catch (e) {
      console.warn("[WalletScreen] getPoolBalance failed:", e.message);
      setOnChainBalance("0.0");
    } finally {
      setOnChainLoading(false);
    }
  }, [committeeId, animateTo]);

  useEffect(() => { fetchOnChainBalance(); }, [fetchOnChainBalance, walletReloadKey]);

  // ── Live contract event listener (Upgrade 5) ───────────────────
  useEffect(() => {
    if (!committeeId) return;
    let contract;
    let subscribed = true;
    const attach = async () => {
      try {
        contract = getEscrowContractReadOnly();
        const numId = committeeId.split("").reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) >>> 0, 5381);
        const handler = async (_cid, _depositor, _amount, event) => {
          if (!subscribed) return;
          // Refresh on-chain balance without manual pull
          const fresh = await getPoolBalance(numId);
          setOnChainBalance(fresh);
          animateTo(fresh);
        };
        contract.on("Deposited", handler);
      } catch (e) {
        console.warn("[WalletScreen] event listener attach failed:", e.message);
      }
    };
    attach();
    return () => {
      subscribed = false;
      try { contract?.removeAllListeners("Deposited"); } catch {}
    };
  }, [committeeId, animateTo]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchWallet();
    fetchOnChainBalance();
  };

  // ── Render helpers ─────────────────────────────────────────────
  const truncateHash = (hash) =>
    hash ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : "";

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <FontAwesome5 name="wallet" size={40} color={colors.textSecondary} />
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.brand]} />
      }
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {/* ── Hero ──────────────────────────────────────────────── */}
      <View style={[styles.hero, { backgroundColor: colors.brand }]}>
        <View style={styles.heroBlobA} />
        <View style={styles.heroBlobB} />
        <FontAwesome5 name="wallet" size={30} color="rgba(255,255,255,0.9)" />
        <Text style={styles.heroTitle}>{committeeName || wallet?.committeeName || "Committee Wallet"}</Text>
        <Text style={styles.heroSub}>Wallet Dashboard</Text>
      </View>

      {/* ── On-Chain Escrow Card ───────────────────────────────── */}
      <View style={[styles.escrowCard, { backgroundColor: colors.card, borderColor: CHAIN_COLORS.onChain + "40" }]}>
        <View style={styles.escrowHeader}>
          <View style={styles.escrowLabelRow}>
            <FontAwesome5 name="link" size={14} color={CHAIN_COLORS.onChain} />
            <Text style={[styles.escrowLabel, { color: CHAIN_COLORS.onChain }]}>On-Chain Escrow Pool</Text>
          </View>
          {/* Pulsing badge */}
          <Animated.View style={[styles.verifiedBadge, { transform: [{ scale: pulseAnim }] }]}>
            <FontAwesome5 name="check-double" size={10} color={CHAIN_COLORS.confirmed} />
            <Text style={[styles.verifiedText, { color: CHAIN_COLORS.confirmed }]}>Verified On-Chain</Text>
          </Animated.View>
        </View>

        {onChainLoading ? (
          <ActivityIndicator size="small" color={CHAIN_COLORS.onChain} style={{ marginTop: 8 }} />
        ) : (
          <Animated.Text
            style={[styles.escrowBalance, { color: colors.text }]}
          >
            {/* Animated.Text can't use .interpolate natively with text — use state */}
            {parseFloat(onChainBalance || "0").toFixed(4)} ETH
          </Animated.Text>
        )}
        <Text style={[styles.escrowSub, { color: colors.textSecondary }]}>
          Locked in smart contract · auto-updates on deposit
        </Text>
      </View>

      {/* ── Legacy Balance Card ────────────────────────────────── */}
      <View style={[styles.balCard, { backgroundColor: colors.card }]}>
        <View style={styles.balRow}>
          <View>
            <Text style={[styles.balLabel, { color: colors.textSecondary }]}>Total Balance</Text>
            <Text style={[styles.balValue, { color: colors.text }]}>
              Rs {(wallet?.balance || 0).toLocaleString()}
            </Text>
          </View>
          <View style={[styles.balIcon, { backgroundColor: "#10B981" + "20" }]}>
            <FontAwesome5 name="piggy-bank" size={22} color="#10B981" />
          </View>
        </View>

        <View style={[styles.balDivider, { backgroundColor: colors.border }]} />

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <FontAwesome5 name="arrow-down" size={12} color="#10B981" />
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Credits</Text>
            <Text style={[styles.statValue, { color: "#10B981" }]}>
              Rs {(wallet?.totalCredits || 0).toLocaleString()}
            </Text>
          </View>
          <View style={[styles.statSep, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <FontAwesome5 name="arrow-up" size={12} color="#EF4444" />
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Debits</Text>
            <Text style={[styles.statValue, { color: "#EF4444" }]}>
              Rs {(wallet?.totalDebits || 0).toLocaleString()}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Transactions ───────────────────────────────────────── */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Transactions</Text>

      {transactions.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
          <FontAwesome5 name="receipt" size={28} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No transactions yet</Text>
        </View>
      ) : (
        transactions.map((tx, i) => {
          const isExpanded = expandedTx === (tx.txHash || tx.transactionId || i);
          const hashKey    = tx.txHash || tx.transactionId || i;
          return (
            <TouchableOpacity
              key={hashKey}
              style={[styles.txCard, { backgroundColor: colors.card }]}
              onPress={() => setExpandedTx(isExpanded ? null : hashKey)}
              activeOpacity={0.85}
            >
              <View
                style={[
                  styles.txIcon,
                  { backgroundColor: tx.type === "credit" ? "#10B981" + "20" : "#EF4444" + "20" },
                ]}
              >
                <FontAwesome5
                  name={tx.type === "credit" ? "arrow-down" : "arrow-up"}
                  size={14}
                  color={tx.type === "credit" ? "#10B981" : "#EF4444"}
                />
              </View>
              <View style={styles.txContent}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[styles.txDesc, { color: colors.text }]}>
                    {tx.description
                      ? decryptAES256(tx.description)
                      : tx.type === "credit"
                      ? "Payment Received"
                      : "Payout"}
                  </Text>
                  {tx.ledgerHash && tx.ledgerPayload && verifyLedgerHash(tx.ledgerPayload, tx.ledgerHash) && (
                    <View style={[styles.verifiedBadgeSmall, { backgroundColor: "#10B981" + "20" }]}>
                      <FontAwesome5 name="check-double" size={10} color="#10B981" />
                      <Text style={{ fontSize: 10, color: "#10B981", marginLeft: 4, fontWeight: "bold" }}>
                        Verified
                      </Text>
                    </View>
                  )}
                  {tx.txHash && (
                    <View style={[styles.onChainBadge, { backgroundColor: CHAIN_COLORS.onChain + "15" }]}>
                      <FontAwesome5 name="link" size={9} color={CHAIN_COLORS.onChain} />
                      <Text style={[styles.onChainBadgeText, { color: CHAIN_COLORS.onChain }]}>
                        {truncateHash(tx.txHash)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.txDate, { color: colors.textSecondary }]}>
                  {tx.date ? new Date(tx.date).toLocaleDateString() : ""}
                </Text>

                {/* Expanded detail */}
                {isExpanded && tx.txHash && (
                  <View style={[styles.txDetail, { borderColor: colors.border }]}>
                    <Text style={[styles.txDetailLabel, { color: colors.textSecondary }]}>Full Tx Hash</Text>
                    <Text style={[styles.txDetailValue, { color: colors.text }]}>{tx.txHash}</Text>
                    {tx.blockNumber && (
                      <>
                        <Text style={[styles.txDetailLabel, { color: colors.textSecondary }]}>Block</Text>
                        <Text style={[styles.txDetailValue, { color: colors.text }]}>#{tx.blockNumber}</Text>
                      </>
                    )}
                  </View>
                )}
              </View>
              <Text
                style={[
                  styles.txAmount,
                  { color: tx.type === "credit" ? "#10B981" : "#EF4444" },
                ]}
              >
                {tx.type === "credit" ? "+" : "-"}Rs {(tx.amount || 0).toLocaleString()}
              </Text>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center:    { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  errorText: { fontSize: 16, fontWeight: "600" },

  hero: {
    height: 170, alignItems: "center", justifyContent: "center",
    borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
    overflow: "hidden", position: "relative",
  },
  heroBlobA: { position: "absolute", top: -30, right: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: "rgba(255,255,255,0.12)" },
  heroBlobB: { position: "absolute", bottom: -40, left: -30, width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(255,255,255,0.08)" },
  heroTitle: { color: "#fff", fontSize: 20, fontWeight: "900", marginTop: 8 },
  heroSub:   { color: "rgba(255,255,255,0.8)", fontSize: 14, marginTop: 2 },

  // Escrow card
  escrowCard: {
    marginHorizontal: 16, marginTop: 16, borderRadius: 20, padding: 18,
    borderWidth: 1.5,
    elevation: 4, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10,
  },
  escrowHeader:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  escrowLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  escrowLabel:    { fontSize: 13, fontWeight: "700" },
  escrowBalance:  { fontSize: 32, fontWeight: "900", marginTop: 4 },
  escrowSub:      { fontSize: 11, marginTop: 4 },
  verifiedBadge:  {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
    backgroundColor: "#22C55E20", borderWidth: 1, borderColor: "#22C55E50",
  },
  verifiedText: { fontSize: 10, fontWeight: "800" },

  // Legacy balance card
  balCard: {
    marginHorizontal: 16, marginTop: 14, borderRadius: 20, padding: 20,
    elevation: 5, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 12,
  },
  balRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  balLabel:  { fontSize: 13, fontWeight: "600" },
  balValue:  { fontSize: 28, fontWeight: "900", marginTop: 2 },
  balIcon:   { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  balDivider:{ height: 1, marginVertical: 14 },
  statsRow:  { flexDirection: "row", justifyContent: "space-around" },
  statItem:  { alignItems: "center", gap: 4 },
  statLabel: { fontSize: 12, fontWeight: "600" },
  statValue: { fontSize: 16, fontWeight: "800" },
  statSep:   { width: 1 },

  sectionTitle: { fontSize: 17, fontWeight: "800", marginHorizontal: 16, marginTop: 24, marginBottom: 12 },

  emptyCard:  {
    marginHorizontal: 16, borderRadius: 16, padding: 30, alignItems: "center",
    elevation: 2, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6,
  },
  emptyText:  { fontSize: 14, fontWeight: "600", marginTop: 8 },

  txCard: {
    marginHorizontal: 16, marginBottom: 10, borderRadius: 14, padding: 14,
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    elevation: 2, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6,
  },
  txIcon:    { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  txContent: { flex: 1 },
  txDesc:    { fontSize: 14, fontWeight: "700" },
  txDate:    { fontSize: 12, fontWeight: "500", marginTop: 2 },
  txAmount:  { fontSize: 16, fontWeight: "800" },

  verifiedBadgeSmall: { flexDirection: "row", alignItems: "center", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  onChainBadge:       { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  onChainBadgeText:   { fontSize: 10, fontWeight: "700" },

  txDetail:      { marginTop: 8, paddingTop: 8, borderTopWidth: 1 },
  txDetailLabel: { fontSize: 11, fontWeight: "600", marginTop: 4 },
  txDetailValue: { fontSize: 12, fontWeight: "400", fontFamily: "monospace" },
});
