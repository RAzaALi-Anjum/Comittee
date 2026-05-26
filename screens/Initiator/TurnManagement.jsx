import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import userService from "../../services/userService";
import { useTheme } from "../../theme/ThemeProvider";

export default function TurnManagement({ route, navigation }) {
  const { colors } = useTheme();
  const { committeeId, committeeName } = route.params;
  const [turns, setTurns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndices, setSelectedIndices] = useState([]); // For swapping
  const [requests, setRequests] = useState([]);

  // Fetch turns and requests
  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch Committee Turns
      const comData = await userService.getCommitteeById(committeeId);

      if (comData && comData.turns) {
        setTurns(comData.turns);
      } else if (comData && comData.usersParticipated) {
        const users = Array.isArray(comData.usersParticipated)
          ? comData.usersParticipated.filter(u => u)
          : Object.values(comData.usersParticipated).filter(u => u);
        setTurns(users);
      }

      // Fetch Turn Change Requests
      const reqData = await userService.getTurnRequests();
      if (reqData) {
        const comRequests = Object.entries(reqData)
          .map(([key, val]) => ({ ...val, id: key }))
          .filter(req => req.committeeId === committeeId && req.status === "Pending");
        setRequests(comRequests);
      } else {
        setRequests([]);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      Alert.alert("Error", "Failed to load turns.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [committeeId]);

  const handleUpdateTurns = async (newTurns) => {
    try {
      await userService.updateCommitteeTurns(committeeId, newTurns);
      setTurns(newTurns);
      Alert.alert("Success", "Turn order updated!");
      setSelectedIndices([]); // Reset selection
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to update turns.");
    }
  };

  const handleSwap = () => {
    if (selectedIndices.length !== 2) {
      Alert.alert("Invalid Selection", "Please select exactly two members to swap.");
      return;
    }
    const [i, j] = selectedIndices;
    const newTurns = [...turns];
    [newTurns[i], newTurns[j]] = [newTurns[j], newTurns[i]]; // Swap

    Alert.alert(
      "Confirm Swap",
      `Swap Turn ${i + 1} (${newTurns[i].name}) with Turn ${j + 1} (${newTurns[j].name})?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: () => handleUpdateTurns(newTurns) }
      ]
    );
  };

  const moveItem = (fromIndex, direction) => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= turns.length) return;

    const newTurns = [...turns];
    const item = newTurns[fromIndex];
    newTurns.splice(fromIndex, 1);
    newTurns.splice(toIndex, 0, item);

    // We update immediately or waiting for a "Save" button? 
    // Immediate for better UX in this simple list, but maybe confirm?
    // Let's just update local state then user can verify? 
    // Actually, immediate update to server is safer to avoid sync issues.
    handleUpdateTurns(newTurns);
  };

  const toggleSelection = (index) => {
    if (selectedIndices.includes(index)) {
      setSelectedIndices(selectedIndices.filter((i) => i !== index));
    } else {
      if (selectedIndices.length < 2) {
        setSelectedIndices([...selectedIndices, index]);
      } else {
        // Replace the first selected if 2 are already selected (optional, or just block)
        Alert.alert("Max Selection", "You can only select 2 members to swap.");
      }
    }
  };

  const handleRequestAction = async (req, action) => {
    // action: 'Approve' | 'Reject'
    try {
      // Update Request Status
      await userService.updateTurnRequestStatus(req.id, action);

      if (action === 'Approve') {
        // Execute the requested change
        // Example: User wants to move to specific index or swap?
        // Assuming request has 'targetIndex' or similar. 
        // Or maybe it's a swap request with another user.

        // Simplified: If 'targetIndex' is present, move user there.
        // If 'targetUserId' is present, swap with that user.

        const newTurns = [...turns];
        const userIndex = newTurns.findIndex(u => u.id === req.userId);

        if (userIndex === -1) {
          Alert.alert("Error", "User not found in turn list.");
          return;
        }

        if (req.type === 'Swap' && req.targetUserId) {
          // Try to find target by ID, Email, or Name
          const targetIndex = newTurns.findIndex(u =>
            (u.id && u.id === req.targetUserId) ||
            (u.email && u.email.toLowerCase() === req.targetUserId.toLowerCase()) ||
            (u.name && u.name.toLowerCase() === req.targetUserId.toLowerCase())
          );

          if (targetIndex !== -1) {
            [newTurns[userIndex], newTurns[targetIndex]] = [newTurns[targetIndex], newTurns[userIndex]];
            await handleUpdateTurns(newTurns);
          } else {
            Alert.alert("Warning", "Target user not found in turn list. Request approved but no swap performed.");
          }
        } else if (req.type === 'Move' && req.targetIndex !== undefined) {
          // Move logic
          const item = newTurns[userIndex];
          newTurns.splice(userIndex, 1);
          newTurns.splice(req.targetIndex, 0, item);
          await handleUpdateTurns(newTurns);
        }
      }

      // Refresh requests
      fetchData();

    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to process request");
    }
  };

  const renderTurnItem = ({ item, index }) => {
    const isSelected = selectedIndices.includes(index);
    return (
      <View style={[styles.turnRow, { backgroundColor: colors.card }, isSelected && [styles.selectedRow, { borderColor: colors.brand }]]}>
        <TouchableOpacity
          style={styles.selectionArea}
          onPress={() => toggleSelection(index)}
        >
          <Text style={[styles.turnIndex, { color: colors.text }]}>{index + 1}.</Text>
          <View style={styles.userInfo}>
            <Text style={[styles.userName, { color: colors.text }]}>{item.name}</Text>
            <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{item.email}</Text>
            {item.paymentStatus === 'Paid' && <Text style={[styles.paidBadge, { color: colors.success }]}>Paid</Text>}
          </View>
        </TouchableOpacity>

        <View style={styles.actions}>
          {index > 0 && (
            <TouchableOpacity onPress={() => moveItem(index, 'up')}>
              <Ionicons name="arrow-up-circle" size={24} color={colors.success} />
            </TouchableOpacity>
          )}
          {index < turns.length - 1 && (
            <TouchableOpacity onPress={() => moveItem(index, 'down')}>
              <Ionicons name="arrow-down-circle" size={24} color={colors.warning} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderRequestItem = ({ item }) => (
    <View style={[styles.requestCard, { backgroundColor: colors.card, borderLeftColor: colors.warning }]}>
      <Text style={[styles.reqText, { color: colors.text }]}><Text style={{ fontWeight: 'bold' }}>User:</Text> {item.userName}</Text>
      <Text style={[styles.reqText, { color: colors.text }]}><Text style={{ fontWeight: 'bold' }}>Type:</Text> {item.type}</Text>
      <Text style={[styles.reqText, { color: colors.text }]}><Text style={{ fontWeight: 'bold' }}>Reason:</Text> {item.reason}</Text>
      <View style={styles.reqActions}>
        <TouchableOpacity style={[styles.reqBtn, { backgroundColor: colors.success }]} onPress={() => handleRequestAction(item, 'Approve')}>
          <Text style={{ color: 'white' }}>Approve</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.reqBtn, { backgroundColor: colors.danger }]} onPress={() => handleRequestAction(item, 'Reject')}>
          <Text style={{ color: 'white' }}>Reject</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.heading, { color: colors.brand }]}>Manage Turns: {committeeName}</Text>

      {/* Requests Section */}
      {requests.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Pending Change Requests</Text>
          <FlatList
            data={requests}
            keyExtractor={item => item.id}
            renderItem={renderRequestItem}
            style={{ maxHeight: 200 }}
          />
        </View>
      )}

      {/* Manual Management Section */}
      <View style={styles.section}>
        <View style={styles.rowBetween}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Current Turn Order</Text>
          {selectedIndices.length === 2 && (
            <TouchableOpacity style={[styles.swapBtn, { backgroundColor: colors.brand }]} onPress={handleSwap}>
              <Text style={styles.swapBtnText}>Swap Selected (2)</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>Tap to select 2 members to swap. Use arrows to adjust priority.</Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.brand} />
        ) : (
          <FlatList
            data={turns}
            keyExtractor={(item, index) => index.toString()}
            renderItem={renderTurnItem}
            contentContainerStyle={{ paddingBottom: 50 }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  heading: { fontSize: 20, fontWeight: "bold", marginBottom: 15 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hint: { fontSize: 12, color: 'gray', marginBottom: 10, fontStyle: 'italic' },

  turnRow: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  selectedRow: {
    borderWidth: 2,
  },
  selectionArea: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  turnIndex: { fontWeight: 'bold', marginRight: 10, fontSize: 16, width: 30 },
  userInfo: { flex: 1 },
  userName: { fontWeight: 'bold', fontSize: 16 },
  userEmail: { fontSize: 12, color: 'gray' },
  paidBadge: { fontSize: 10, color: 'green', fontWeight: 'bold' },

  actions: { flexDirection: 'row', width: 60, justifyContent: 'space-between' },

  swapBtn: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  swapBtnText: { color: 'white', fontWeight: 'bold', fontSize: 12 },

  requestCard: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#E65100'
  },
  reqText: { marginBottom: 4 },
  reqActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 5 },
  reqBtn: { paddingHorizontal: 15, paddingVertical: 5, borderRadius: 5, marginLeft: 10 }
});
