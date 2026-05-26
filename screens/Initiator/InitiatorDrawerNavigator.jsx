import { Ionicons } from "@expo/vector-icons";
import { createDrawerNavigator } from "@react-navigation/drawer";
import React from "react";
import { ActivityIndicator, View } from "react-native";
import CustomDrawerContent from "../../components/navigation/CustomDrawerContent";
import { getDrawerOptions } from "../../theme/NavigationTheme";
import { useTheme } from "../../theme/ThemeProvider";
import LogoutScreen from "../LogoutScreen";
import ApplyLoanScreen from "./ApplyLoanScreen";
import InitiatorBottomTabs from "./InitiatorBottomTabs";
import InitiatorComplaintForm from "./InitiatorComplaintForm";
import InitiatorLoanStatusScreen from "./InitiatorLoanStatusScreen";
import InitiatorWarningScreen from "./InitiatorWarningScreen";
import WalletScreen from "./WalletScreen";


const Drawer = createDrawerNavigator();

function SwitchToUser({ navigation }) {
  const { colors } = useTheme();
  React.useEffect(() => {
    navigation.navigate("UserDashboard");
  }, [navigation]);
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}

export default function InitiatorDrawerNavigator({ initiatorId }) {
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
        component={InitiatorBottomTabs}
        options={{
          headerShown: false,
          drawerLabel: tr("Initiator Dashboard", "انتظامی مرکز"),
          drawerIcon: ({ color }) => <Ionicons name="apps" size={22} color={color} />,
        }}
      />

      <Drawer.Screen
        name="SwitchToUser"
        component={SwitchToUser}
        options={{
          drawerLabel: tr("Switch to User", "صارف ویو"),
          drawerIcon: ({ color }) => <Ionicons name="swap-horizontal" size={22} color={color} />,
        }}
      />

      <Drawer.Screen
        name="CommitteeWallet"
        component={WalletScreen}
        options={{
          drawerLabel: tr("Committee Wallet", "کمیٹی والٹ"),
          drawerIcon: ({ color }) => <Ionicons name="wallet" size={22} color={color} />,
        }}
      />

      <Drawer.Screen
        name="ApplyLoan"
        component={ApplyLoanScreen}
        options={{
          drawerLabel: tr("Apply for Loan", "قرض کی درخواست"),
          drawerIcon: ({ color }) => <Ionicons name="cash" size={22} color={color} />,
        }}
      />

      <Drawer.Screen
        name="LoanStatus"
        component={InitiatorLoanStatusScreen}
        options={{
          drawerLabel: tr("Loan Request Tracker", "قرض کا ٹریکر"),
          drawerIcon: ({ color }) => <Ionicons name="stats-chart" size={22} color={color} />,
        }}
      />

      <Drawer.Screen
        name="Complaints"
        options={{
          drawerLabel: tr("Initiator Complaint", "شکایات سینٹر"),
          drawerIcon: ({ color }) => <Ionicons name="chatbox-ellipses" size={22} color={color} />,
        }}
      >
        {({ navigation, route }) => (
          <InitiatorComplaintForm
            navigation={navigation}
            route={route}
            initiatorId={initiatorId}
          />
        )}
      </Drawer.Screen>

      <Drawer.Screen
        name="ViewWarnings"
        children={() => <InitiatorWarningScreen initiatorId={initiatorId} />}
        options={{
          drawerLabel: tr("Warnings", "سسٹم نوٹس"),
          drawerIcon: ({ color }) => <Ionicons name="warning" size={22} color={color} />,
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
