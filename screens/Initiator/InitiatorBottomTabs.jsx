import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator } from "@react-navigation/stack";
import { onValue, ref } from "firebase/database";
import React, { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { database } from "../../firebaseConfig";
import { getScreenOptions, getTabBarOptions } from "../../theme/NavigationTheme";
import { useTheme } from "../../theme/ThemeProvider";

// Screens
import CommitteeDetails from "./CommitteeDetails";
import CreateCommittee from "./CreateCommittee";
import InitiatorDashboard from "./InitiatorDashboard";
import InitiatorLoanStatusScreen from "./InitiatorLoanStatusScreen";
import InitiatorParticipationRequestsScreen from "./InitiatorParticipationRequestsScreen";
import InitiatorPaymentScreen from "./InitiatorPaymentScreen";
import InitiatorProfile from "./InitiatorProfile";
import InitiatorTurnRequests from "./InitiatorTurnRequests";
import InitiatorViewAllCommittees from "./InitiatorViewCommittees";
import InitiatorViewMembers from "./InitiatorViewMembers";
import ParticipationRequestDetails from "./ParticipationRequestDetails";
import ViewApprovedCommittees from "./ViewApprovedCommittees";

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function InitiatorHomeStack({ navigation }) {
  const { colors, language: appLang } = useTheme();
  const tr = (en, ur) => (appLang === "ur" ? ur : en);
  const screenOpts = getScreenOptions(colors);

  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let unsubscribe;
    const setup = async () => {
      try {
        const stored = await AsyncStorage.getItem("userData");
        if (stored) {
          const parsed = JSON.parse(stored);
          const userId = parsed.userId || parsed.uid;
          if (userId) {
            const notifRef = ref(database, `notifications/${userId}`);
            unsubscribe = onValue(notifRef, (snapshot) => {
              const data = snapshot.val();
              if (data) {
                const count = Object.values(data).filter((n) => !n.read).length;
                setUnreadCount(count);
              } else {
                setUnreadCount(0);
              }
            });
          }
        }
      } catch (e) {
        console.error("Failed to setup notification listener", e);
      }
    };
    setup();
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        ...screenOpts,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="InitiatorDashboardScreen"
        component={InitiatorDashboard}
        options={{
          headerShown: true,
          title: tr("Initiator Panel", "انتظامی پینل"),
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.toggleDrawer()} style={{ marginLeft: 20 }}>
              <Ionicons name="menu-outline" size={26} color="#FFF" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={() => navigation.navigate("UserNotifications")} style={{ marginRight: 20 }}>
              <View>
                <Ionicons name="notifications-outline" size={24} color="#FFF" />
                {unreadCount > 0 && (
                  <View style={{
                    position: 'absolute',
                    right: -6,
                    top: -3,
                    backgroundColor: '#FF3B30',
                    borderRadius: 10,
                    minWidth: 18,
                    height: 18,
                    justifyContent: 'center',
                    alignItems: 'center',
                    paddingHorizontal: 4,
                    borderWidth: 1.5,
                    borderColor: colors.brand || '#007bff'
                  }}>
                    <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen name="CreateCommittee" component={CreateCommittee} options={{ headerShown: true, title: tr("Create Committee", "کمیٹی بنائیں") }} />
      <Stack.Screen name="ViewCommittees" component={InitiatorViewAllCommittees} options={{ headerShown: true, title: tr("View Committees", "کمیٹیاں دیکھیں") }} />
      <Stack.Screen name="Payments" component={InitiatorPaymentScreen} options={{ headerShown: true, title: tr("Payments", "ادائیگیاں") }} />
      <Stack.Screen name="MemberList" component={InitiatorViewMembers} options={{ headerShown: true, title: tr("Member List", "ممبران کی فہرست") }} />
      <Stack.Screen name="TurnAdjustmentRequest" component={InitiatorTurnRequests} options={{ headerShown: true, title: tr("Turn Adjustment", "باری کی تبدیلی") }} />
      <Stack.Screen name="ViewApprovedCommittees" component={ViewApprovedCommittees} options={{ headerShown: true, title: tr("Approved Committees", "منظور شدہ کمیٹیاں") }} />
      <Stack.Screen name="CommitteeDetails" component={CommitteeDetails} options={{ headerShown: true, title: tr("Committee Details", "کمیٹی کی تفصیلات") }} />
      <Stack.Screen name="LoanStatus" component={InitiatorLoanStatusScreen} options={{ headerShown: true, title: tr("Loan Status", "قرض کی صورتحال") }} />
      <Stack.Screen name="ParticipationRequests" component={InitiatorParticipationRequestsScreen} options={{ headerShown: true, title: tr("Participation Requests", "شمولیت کی درخواستیں") }} />
      <Stack.Screen name="ParticipationRequest" component={ParticipationRequestDetails} options={{ headerShown: true, title: tr("Request Details", "درخواست کی تفصیل") }} />
    </Stack.Navigator>
  );
}

export default function InitiatorBottomTabs() {
  const { colors, language: appLang } = useTheme();
  const tr = (en, ur) => (appLang === "ur" ? ur : en);
  const tabOpts = getTabBarOptions(colors);

  return (
    <Tab.Navigator screenOptions={tabOpts}>
      <Tab.Screen
        name="HomeTab"
        component={InitiatorHomeStack}
        options={{
          tabBarLabel: tr("Home", "ہوم"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={InitiatorProfile}
        options={{
          tabBarLabel: tr("Profile", "پروفائل"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
