
import { Ionicons } from "@expo/vector-icons";
import { createDrawerNavigator } from "@react-navigation/drawer";
import CustomDrawerContent from "../../components/navigation/CustomDrawerContent";
import { getDrawerOptions } from "../../theme/NavigationTheme";
import { useTheme } from "../../theme/ThemeProvider";

// Screens
import LogoutScreen from "../LogoutScreen";
import A_Profile from "./A_Profile";
import AdminBottomTabs from "./AdminBottomTabs";
import AdminLoanRequestsScreen from "./AdminLoanRequestsScreen";
import AdminPaymentVerificationScreen from "./AdminPaymentVerificationScreen";
import ApproveRequests from "./ApproveRequests";
import InitiatorRequestsScreen from "./InitiatorRequestsScreen";


const Drawer = createDrawerNavigator();

export default function AdminDrawerNavigator() {
  const { colors, language: appLang } = useTheme();
  const tr = (en, ur) => (appLang === "ur" ? ur : en);
  const drawerOpts = getDrawerOptions(colors);

  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={drawerOpts}
    >
      <Drawer.Screen
        name="DashboardTabs"
        component={AdminBottomTabs}
        options={{
          headerShown: false,
          drawerLabel: tr("Admin Hub", "سسٹم ایڈمن مرکز"),
          drawerIcon: ({ color }) => <Ionicons name="apps" size={22} color={color} />,
        }}
      />

      <Drawer.Screen
        name="CommitteeRequests"
        component={ApproveRequests}
        options={{
          drawerLabel: tr("Approve Committees", "کمیٹیوں کی منظوری"),
          drawerIcon: ({ color }) => <Ionicons name="layers" size={22} color={color} />,
        }}
      />

      <Drawer.Screen
        name="LoanRequests"
        component={AdminLoanRequestsScreen}
        options={{
          drawerLabel: tr("Loans Requests", "قرضوں کی منظوری"),
          drawerIcon: ({ color }) => <Ionicons name="cash" size={22} color={color} />,
        }}
      />

      <Drawer.Screen
        name="InitiatorRequests"
        component={InitiatorRequestsScreen}
        options={{
          drawerLabel: tr("Initiator Approval", "انیشی ایٹرز کی منظوری"),
          drawerIcon: ({ color }) => <Ionicons name="person-add" size={22} color={color} />,
        }}
      />

      <Drawer.Screen
        name="PaymentVerification"
        component={AdminPaymentVerificationScreen}
        options={{
          drawerLabel: tr("Verify Payments", "ادائیگی کی تصدیق"),
          drawerIcon: ({ color }) => <Ionicons name="checkmark-done-circle" size={22} color={color} />,
        }}
      />

      <Drawer.Screen
        name="adminp"
        component={A_Profile}
        options={{
          drawerLabel: tr("Admin Profile", "ایڈمن پروفائل"),
          drawerIcon: ({ color }) => <Ionicons name="shield-checkmark" size={22} color={color} />,
        }}
      />

      <Drawer.Screen
        name="Logout"
        component={LogoutScreen}
        options={{
          drawerLabel: tr("Sign Out", "لاگ آؤٹ"),
          drawerIcon: ({ color }) => <Ionicons name="log-out" size={22} color={color} />,
        }}
      />
    </Drawer.Navigator>
  );
}
