import { FontAwesome5 } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onValue, orderByChild, query, ref } from 'firebase/database';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { database } from '../../firebaseConfig';
import { useTheme } from '../../theme/ThemeProvider';
import { formatDateTime } from '../../utils/date';
import { clearAllNotifications, deleteNotification, markAllNotificationsRead, markNotificationRead } from '../../utils/notificationHelper';

export default function InitiatorNotifications({ navigation }) {
  const { colors, language: appLang } = useTheme();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const stored = await AsyncStorage.getItem("userData");
        if (stored) {
          const parsed = JSON.parse(stored);
          setUserId(parsed.userId || parsed.uid);
        }
      } catch (e) {
        console.error("Failed to load user", e);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    if (!userId) return;

    const notifRef = query(ref(database, `notifications/${userId}`), orderByChild('createdAt'));
    const unsubscribe = onValue(notifRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const arr = Object.entries(data).map(([key, val]) => ({
          id: key,
          ...val
        })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Newest first
        setNotifications(arr);
      } else {
        setNotifications([]);
      }
    });

    return () => unsubscribe();
  }, [userId]);

  const handlePress = (item) => {
    markNotificationRead(userId, item.id);
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, !item.read && styles.unread]}
      onPress={() => handlePress(item)}
      onLongPress={() => {
        Alert.alert("Delete Notification", "Are you sure?", [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", onPress: () => deleteNotification(userId, item.id) }
        ]);
      }}
    >
      <View style={styles.iconContainer}>
        <FontAwesome5
          name={item.type === 'warning' ? 'exclamation-triangle' : item.type === 'success' ? 'check-circle' : 'info-circle'}
          size={24}
          color={item.type === 'warning' ? '#e67e22' : item.type === 'success' ? '#27ae60' : '#3498db'}
        />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.message}>{item.message}</Text>
        <Text style={styles.date}>{formatDateTime(item.createdAt, appLang)}</Text>
      </View>
      {!item.read && <View style={styles.dot} />}
    </TouchableOpacity>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.brand }]}>Initiator Notifications</Text>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity onPress={() => markAllNotificationsRead(userId)} style={{ marginRight: 15 }}>
            <Text style={[styles.actionText, { color: colors.brand }]}>Read All</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => {
            Alert.alert("Clear All", "Delete all notifications?", [
              { text: "Cancel", style: "cancel" },
              { text: "Clear", onPress: () => clearAllNotifications(userId) }
            ]);
          }}>
            <Text style={[styles.actionText, { color: colors.brand }]}>Clear All</Text>
          </TouchableOpacity>
        </View>
      </View>
      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.emptyText}>No notifications</Text>}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center', backgroundColor: '#fff', elevation: 2 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  actionText: { fontWeight: 'bold' },
  card: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 15, marginTop: 10, padding: 15, borderRadius: 10, elevation: 1 },
  unread: { backgroundColor: '#fff9e6', borderLeftWidth: 4, borderLeftColor: '#800000' },
  iconContainer: { justifyContent: 'center', marginRight: 15 },
  textContainer: { flex: 1 },
  title: { fontWeight: 'bold', fontSize: 16, marginBottom: 5, color: '#333' },
  message: { color: '#666', marginBottom: 5 },
  date: { fontSize: 12, color: '#999' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#e74c3c', alignSelf: 'center', marginLeft: 10 },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#999', fontSize: 16 }
});
