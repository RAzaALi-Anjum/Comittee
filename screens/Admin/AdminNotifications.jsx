import { FontAwesome5 } from '@expo/vector-icons';
import { onValue, orderByChild, query, ref } from 'firebase/database';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { database } from '../../firebaseConfig';
import { useTheme } from "../../theme/ThemeProvider";
import { formatDateTime } from "../../utils/date";
import { clearAllNotifications, deleteNotification, markNotificationRead } from '../../utils/notificationHelper';
import { decryptAES256 } from '../../utils/cryptoUtils';

export default function AdminNotifications({ navigation }) {
  const { colors, language: appLang } = useTheme();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const userId = "ADMIN";

  useEffect(() => {
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
      activeOpacity={0.7}
      style={[
        styles.card,
        !item.read && [styles.unread, { borderLeftColor: colors.brand }]
      ]}
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
          size={22}
          color={item.type === 'warning' ? '#f59e0b' : item.type === 'success' ? '#10b981' : '#3b82f6'}
        />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{decryptAES256(item.title)}</Text>
        <Text style={styles.message}>{decryptAES256(item.message)}</Text>
        <Text style={styles.date}>{formatDateTime(item.createdAt, appLang)}</Text>
      </View>
      {!item.read && <View style={styles.dot} />}
    </TouchableOpacity>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.brand }]}>Admin Notifications</Text>
        {notifications.length > 0 && (
          <TouchableOpacity onPress={() => {
            Alert.alert("Clear All", "Delete all notifications?", [
              { text: "Cancel", style: "cancel" },
              { text: "Clear", onPress: () => clearAllNotifications(userId) }
            ]);
          }}>
            <Text style={[styles.clearText, { color: colors.brand }]}>Clear All</Text>
          </TouchableOpacity>
        )}
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
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: 8,
    backgroundColor: '#fff'
  },
  headerTitle: { fontSize: 22, fontWeight: '800', letterSpacing: 0.5 },
  clearText: { fontWeight: '700', fontSize: 14 },
  card: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    backgroundColor: '#fff'
  },
  unread: {
    backgroundColor: '#fff',
    borderLeftWidth: 5,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14
  },
  textContainer: { flex: 1 },
  title: { fontWeight: '700', fontSize: 16, marginBottom: 4, letterSpacing: 0.2, color: '#0f172a' },
  message: { marginBottom: 6, fontSize: 14, lineHeight: 20, color: '#475569' },
  date: { fontSize: 11, fontWeight: '600', color: '#94a3b8' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    alignSelf: 'center',
    marginLeft: 10,
    backgroundColor: '#ef4444'
  },
  emptyText: { textAlign: 'center', marginTop: 100, fontSize: 16, fontWeight: '600', color: '#94a3b8' }
});
