import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator } from "@react-navigation/stack";
import { onValue, ref } from "firebase/database";
import { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { database } from "../../firebaseConfig";
import { getScreenOptions, getTabBarOptions } from "../../theme/NavigationTheme";
import { useTheme } from "../../theme/ThemeProvider";

// Screens
import BecomeInitiatorScreen from "../Initiator/BecomeInitiatorScreen";
import JoinCommittee from "./JoinCommittee";
import ProfileScreen from "./ProfileScreen";
import RecommendationScreen from "./RecommendationScreen";
import TurnChangeRequestForm from "./TurnChangeRequestForm";
import TurnSwapPaymentScreen from "./TurnSwapPaymentScreen";
import UserCommittees from "./UserCommittees";
import UserDashboard from "./UserDashboard";
import UserHistoryScreen from "./UserHistoryScreen";
import UserNotifications from "./UserNotifications";

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function UserHomeStack({ navigation }) {
  const { colors, language: appLang } = useTheme();
  const tr = (en, ur) => (appLang === "ur" ? ur : en);
  const screenOpts = getScreenOptions(colors);
  const [headerUnread, setHeaderUnread] = useState(0);

  useEffect(() => {
    let unsubscribe;
    const fetchUserAndSubscribe = async () => {
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
                const count = Object.values(data).filter(n => !n.read).length;
                setHeaderUnread(count);
              } else {
                setHeaderUnread(0);
              }
            });
          }
        }
      } catch (e) { }
    };
    fetchUserAndSubscribe();
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
        name="UserDashboardScreen"
        component={UserDashboard}
        options={{
          headerShown: true,
          title: tr("Dashboard", "ڈیش بورڈ"),
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.toggleDrawer()} style={{ marginLeft: 20 }}>
              <Ionicons name="menu-outline" size={26} color="#FFF" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={() => navigation.navigate("UserNotifications")} style={{ marginRight: 20 }}>
              <Ionicons name="notifications-outline" size={24} color="#FFF" />
              {headerUnread > 0 && (
                <View style={{
                  position: "absolute",
                  top: -2,
                  right: -2,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: colors.danger,
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderWidth: 1.5,
                  borderColor: colors.brand
                }}>
                  <Text style={{ color: '#FFF', fontSize: 8, fontWeight: '900' }}>
                    {headerUnread > 9 ? '9+' : headerUnread}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen name="JoinCommittee" component={JoinCommittee} options={{ headerShown: true, title: tr("Join Committee", "کمیٹی شامل ہوں") }} />
      <Stack.Screen name="ViewRecommendation" component={RecommendationScreen} options={{ headerShown: true, title: tr("Recommendations", "سفارشات") }} />
      <Stack.Screen name="TurnAdjustmentRequest" component={TurnChangeRequestForm} options={{ headerShown: true, title: tr("Turn Adjustment", "باری کی تبدیلی") }} />
      <Stack.Screen name="TurnChangeRequestForm" component={TurnChangeRequestForm} options={{ headerShown: true, title: tr("Turn Swap Request", "باری بدلنے کی درخواست") }} />
      <Stack.Screen name="TurnSwapPaymentScreen" component={TurnSwapPaymentScreen} options={{ headerShown: true, title: tr("Submit Payment", "ادائیگی جمع کریں") }} />
      <Stack.Screen name="UserCommittees" component={UserCommittees} options={{ headerShown: true, title: tr("My Committees", "میری کمیٹیاں") }} />
      <Stack.Screen name="PaymentHistory" component={UserHistoryScreen} options={{ headerShown: true, title: tr("Payment History", "ادائیگی کی تاریخ") }} />
      <Stack.Screen name="InitiatorStatus" component={BecomeInitiatorScreen} options={{ headerShown: true, title: tr("Become Initiator", "انیشی ایٹر بنیں") }} />
      <Stack.Screen name="UserNotifications" component={UserNotifications} options={{ headerShown: true, title: tr("Notifications", "اطلاعات") }} />
    </Stack.Navigator>
  );
}

export default function UserBottomTabs() {
  const { colors, language: appLang } = useTheme();
  const tr = (en, ur) => (appLang === "ur" ? ur : en);
  const tabOpts = getTabBarOptions(colors);

  return (
    <Tab.Navigator screenOptions={tabOpts}>
      <Tab.Screen
        name="HomeTab"
        component={UserHomeStack}
        options={{
          tabBarLabel: tr("Home", "ہوم"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ProfileUser"
        component={ProfileScreen}
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
