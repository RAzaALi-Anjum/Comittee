import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createDrawerNavigator } from "@react-navigation/drawer";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import CustomDrawerContent from "../../components/navigation/CustomDrawerContent";
import { getDrawerOptions } from "../../theme/NavigationTheme";
import { useTheme } from "../../theme/ThemeProvider";
import BecomeInitiatorScreen from "../Initiator/BecomeInitiatorScreen";
import LogoutScreen from "../LogoutScreen";
import UserBottomTabs from "./UserBottomTabs";
import UserComplaintForm from "./UserComplaintForm";
import UserMapScreen from "./UserMapScreen";
import UserParticipationRequestsScreen from "./UserParticipationRequestsScreen";
import UserWarningScreen from "./UserWarningScreen";
import UserHistoryScreen from "./UserHistoryScreen";


const Drawer = createDrawerNavigator();

function SwitchToInitiator({ navigation }) {
  const { colors } = useTheme();
  React.useEffect(() => {
    navigation.navigate("InitiatorDashboard");
  }, [navigation]);
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}

export default function UserDrawerNavigator({ currentUserId }) {
  const { colors, language: appLang } = useTheme();
  const tr = (en, ur) => (appLang === "ur" ? ur : en);
  const drawerOpts = getDrawerOptions(colors);
  const [canSwitchToInitiator, setCanSwitchToInitiator] = useState(false);
  const [showBecomeInitiator, setShowBecomeInitiator] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await AsyncStorage.getItem("userData");
        if (data) {
          const user = JSON.parse(data);
          const isInitiator = user?.role === "initiator" || user?.initiatorStatus === "approved";
          setCanSwitchToInitiator(!!isInitiator);
          setShowBecomeInitiator(!isInitiator);
        } else {
          setCanSwitchToInitiator(false);
          setShowBecomeInitiator(true);
        }
      } catch {
        setCanSwitchToInitiator(false);
        setShowBecomeInitiator(true);
      }
    };
    load();
  }, []);

  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={drawerOpts}
    >
      <Drawer.Screen
        name="DashboardTabs"
        component={UserBottomTabs}
        options={{
          headerShown: false,
          drawerLabel: tr("Home Dashboard", "ہوم ڈیش بورڈ"),
          drawerIcon: ({ color }) => <Ionicons name="apps" size={22} color={color} />,
        }}
      />

      {canSwitchToInitiator && (
        <Drawer.Screen
          name="SwitchToInitiator"
          component={SwitchToInitiator}
          options={{
            drawerLabel: tr("Switch to Initiator", "انیشی ایٹر ویو"),
            drawerIcon: ({ color }) => <Ionicons name="swap-horizontal" size={22} color={color} />,
          }}
        />
      )}

      {showBecomeInitiator && (
        <Drawer.Screen
          name="BecomeInitiator"
          component={BecomeInitiatorScreen}
          options={{
            drawerLabel: tr("Become Committee Initiator", "انیشی ایٹر بنیں"),
            drawerIcon: ({ color }) => <Ionicons name="rocket" size={22} color={color} />,
          }}
        />
      )}

      <Drawer.Screen
        name="ViewWarnings"
        children={() => <UserWarningScreen userId={currentUserId} />}
        options={{
          drawerLabel: tr("Warnings", "سسٹم نوٹس"),
          drawerIcon: ({ color }) => <Ionicons name="warning" size={22} color={color} />,
        }}
      />

      <Drawer.Screen
        name="UserMap"
        component={UserMapScreen}
        options={{
          drawerLabel: tr("Live Members Map", "لائیو میمبرز نقشہ"),
          drawerIcon: ({ color }) => <Ionicons name="map" size={22} color={color} />,
        }}
      />


      <Drawer.Screen
        name="ParticipationStatus"
        component={UserParticipationRequestsScreen}
        options={{
          drawerLabel: tr("Committee Join Request Status", "شمولیت کی صورتحال"),
          drawerIcon: ({ color }) => <Ionicons name="clipboard" size={22} color={color} />,
        }}
      />

      <Drawer.Screen
        name="PaymentHistory"
        options={{
          drawerLabel: tr("Payment History", "ادائیگی کی تاریخ"),
          drawerIcon: ({ color }) => <Ionicons name="receipt" size={22} color={color} />,
        }}
      >
        {({ navigation, route }) => (
          <UserHistoryScreen
            navigation={navigation}
            route={{ ...route, params: { userId: currentUserId } }}
          />
        )}
      </Drawer.Screen>

      <Drawer.Screen
        name="Complaints"
        options={{
          drawerLabel: tr("User Complaints", "سپورٹ سینٹر"),
          drawerIcon: ({ color }) => <Ionicons name="chatbox-ellipses" size={22} color={color} />,
        }}
      >
        {({ navigation, route }) => (
          <UserComplaintForm
            navigation={navigation}
            route={route}
            userId={currentUserId}
          />
        )}
      </Drawer.Screen>

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
