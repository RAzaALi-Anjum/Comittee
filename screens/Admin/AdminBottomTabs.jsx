import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator } from "@react-navigation/stack";
import { TouchableOpacity, View } from "react-native";
import { getScreenOptions, getTabBarOptions } from "../../theme/NavigationTheme";
import { useTheme } from "../../theme/ThemeProvider";

// Screens
import AdminComplaintsScreen from "./AdminComplaintsScreen";
import AdminDashboard from "./AdminDashboard";
import AdminDummyScreen from "./AdminDummyScreen";
import AdminMapScreen from "./AdminMapScreen";
import AdminPaymentHistoryScreen from "./AdminPaymentHistoryScreen";
import AdminPaymentVerificationScreen from "./AdminPaymentVerificationScreen";
import AdminReports from "./AdminReports";
import AdminViewAllCommittees from "./AdminViewAllCommittees";
import AdminViewAllInitiators from "./AdminViewAllInitiators";
import AdminViewAllUsers from "./AdminViewAllUsers";
import AdminViewCommitteeDetails from "./AdminViewCommitteeDetails";
import AdminWarningScreen from "./AdminWarningScreen";
import ApproveRequests from "./ApproveRequests";
import LoanDetailsScreen from "./LoanDetailsScreen";
import MonitorLoanScreen from "./MonitorLoanScreen";
import RecoverLoanScreen from "./RecoverLoanScreen";
import AdminNotifications from "./AdminNotifications";


const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function AdminHomeStack({ navigation }) {
  const { colors, language: appLang } = useTheme();
  const tr = (en, ur) => (appLang === "ur" ? ur : en);
  const screenOpts = getScreenOptions(colors);

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        ...screenOpts,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="AdminDashboard"
        component={AdminDashboard}
        options={({ navigation }) => ({
          headerShown: true,
          title: tr("Admin Panel", "ایڈمن پینل"),
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => navigation.getParent()?.toggleDrawer()}
              style={{ marginLeft: 20 }}
            >
              <Ionicons name="menu-outline" size={26} color="#fff" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>
              <TouchableOpacity
                onPress={() => navigation.navigate("AdminMapScreen")}
                style={{ marginRight: 16 }}
              >
                <Ionicons name="map-outline" size={22} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.navigate("AdminNotifications")}
                style={{ marginRight: 10 }}
              >
                <Ionicons name="notifications-outline" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          ),
        })}
      />
      <Stack.Screen name="AdminMapScreen" component={AdminMapScreen} options={{ title: tr("User Locations", "صارفین کے مقامات") }} />
      <Stack.Screen name="ApproveRequests" component={ApproveRequests} options={{ title: tr("Approve Requests", "درخواستیں منظور") }} />
      <Stack.Screen name="AdminViewAllCommittees" component={AdminViewAllCommittees} options={{ title: tr("All Committees", "تمام کمیٹیاں") }} />
      <Stack.Screen name="AdminViewCommitteeDetails" component={AdminViewCommitteeDetails} options={{ title: tr("Committee Details", "کمیٹی کی تفصیلات") }} />
      <Stack.Screen name="AdminViewAllUsers" component={AdminViewAllUsers} options={{ title: tr("All Users", "تمام صارفین") }} />
      <Stack.Screen name="AdminViewAllInitiators" component={AdminViewAllInitiators} options={{ title: tr("All Initiators", "تمام انیشی ایٹرز") }} />
      <Stack.Screen name="AdminWarningScreen" component={AdminWarningScreen} options={{ title: tr("Warnings", "انتباہات") }} />
      <Stack.Screen name="AdminComplaintsScreen" component={AdminComplaintsScreen} options={{ title: tr("Complaints", "شکایات") }} />
      <Stack.Screen name="AdminNotifications" component={AdminNotifications} options={{ title: tr("Notifications", "اطلاعات") }} />
      <Stack.Screen name="AdminPaymentHistoryScreen" component={AdminPaymentHistoryScreen} options={{ title: tr("Payment History", "ادائیگی کی تاریخ") }} />
      <Stack.Screen name="AdminPaymentVerificationScreen" component={AdminPaymentVerificationScreen} options={{ title: tr("Payment Verification", "ادائیگی کی تصدیق") }} />
      <Stack.Screen name="LoanDetailsScreen" component={LoanDetailsScreen} options={{ title: tr("Loan Details", "قرض کی تفصیلات") }} />
      <Stack.Screen name="MonitorLoanScreen" component={MonitorLoanScreen} options={{ title: tr("Monitor Loan", "لون مانیٹرنگ") }} />
      <Stack.Screen name="RecoverLoanScreen" component={RecoverLoanScreen} options={{ title: tr("Recover Loan", "لون ریکوری") }} />
    </Stack.Navigator>
  );
}

export default function AdminBottomTabs() {
  const { colors, language: appLang } = useTheme();
  const tr = (en, ur) => (appLang === "ur" ? ur : en);
  const tabOpts = getTabBarOptions(colors);

  return (
    <Tab.Navigator screenOptions={tabOpts}>
      <Tab.Screen
        name="HomeTab"
        component={AdminHomeStack}
        options={{
          tabBarLabel: tr("Control", "کنٹرول"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "settings" : "settings-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ReportsTab"
        component={AdminReports}
        options={{
          tabBarLabel: tr("Reports", "رپورٹس"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "bar-chart" : "bar-chart-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="MembersTab"
        component={AdminDummyScreen}
        options={{
          tabBarLabel: tr("Users", "صارفین"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "people" : "people-outline"} size={22} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
