import { useEffect } from "react";
import { createStackNavigator } from "@react-navigation/stack";

// SCREENS
import HomeScreen from "./screens/HomeScreen";
import LoginScreen from "./screens/LoginScreen";
import ForgotPasswordScreen from "./screens/ForgotPasswordScreen";
import SignupScreen from "./screens/SignupScreen";
import CompleteProfile from "./screens/User/CompleteProfile";

// AUTH WRAPPER (🔥 MOST IMPORTANT)
import UserAuthWrapper from "./screens/UserAuthWrapper";

// OPTIONAL DIRECT SCREENS (inside drawers se bhi open ho sakti hain)
import AdminComplaintsScreen from "./screens/Admin/AdminComplaintsScreen";
import AdminDrawerNavigator from "./screens/Admin/AdminDrawerNavigator";
import AdminLoanRequestsScreen from "./screens/Admin/AdminLoanRequestsScreen";
import AdminPaymentVerificationScreen from "./screens/Admin/AdminPaymentVerificationScreen";
import AdminWarningScreen from "./screens/Admin/AdminWarningScreen";
import LoanDetailsScreen from "./screens/Admin/LoanDetailsScreen";
import CreateCommittee from "./screens/Initiator/CreateCommittee";
import InitiatorDrawerNavigator from "./screens/Initiator/InitiatorDrawerNavigator";
import InitiatorDummyScreen from "./screens/Initiator/InitiatorDummyScreen";
import InitiatorViewAllCommittees from "./screens/Initiator/InitiatorViewCommittees";
import TurnManagement from "./screens/Initiator/TurnManagement";
import EditPassword from "./screens/User/EditPassword";
import EditProfile from "./screens/User/EditProfile";
import CnicScanScreen from "./screens/User/CnicScanScreen";
import InitiatorProfileScreen from "./screens/User/InitiatorProfileScreen";
import JoinCommittees from "./screens/User/JoinCommittees";
import PaymentScreen from "./screens/User/PaymentScreen";
import Pending from "./screens/User/Pending";
import RecommendationScreen from "./screens/User/RecommendationScreen";
import TurnChangeRequestForm from "./screens/User/TurnChangeRequestForm";
import UserCommittees from "./screens/User/UserCommittees";
import UserDrawerNavigator from "./screens/User/UserDrawerNavigator";
import UserHistoryScreen from "./screens/User/UserHistoryScreen";
import UserMapScreen from "./screens/User/UserMapScreen";
import UserNotifications from "./screens/User/UserNotifications";
import WalletScreen from "./screens/Initiator/WalletScreen";
import WelcomeScreen from "./screens/WelcomeScreen";
import { getScreenOptions } from "./theme/NavigationTheme";
import { ThemeProvider, useTheme } from "./theme/ThemeProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import { WalletProvider } from "./context/WalletContext";
import { registerForPushNotifications } from "./utils/pushNotificationSetup";

const Stack = createStackNavigator();

function AppStack() {
  const { colors } = useTheme();
  const screenOpts = getScreenOptions(colors);

  return (
    <Stack.Navigator
      initialRouteName="Welcome"
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    >
      {/* HOME */}
      <Stack.Screen name="Home" component={HomeScreen} />

      {/* AUTH */}
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />

      {/* PROFILE COMPLETION */}
      <Stack.Screen name="CompleteProfile" component={CompleteProfile} />
      <Stack.Screen
        name="Pending"
        component={Pending}
        options={{ headerShown: true, title: "Pending", ...screenOpts }}
      />

      {/* 🔥 ROLE-BASED ENTRY POINT */}
      <Stack.Screen name="UserAuthWrapper" component={UserAuthWrapper} />

      <Stack.Screen name="UserDashboard" component={UserDrawerNavigator} />
      <Stack.Screen
        name="UserNotifications"
        component={UserNotifications}
        options={{ headerShown: true, title: "Notifications", ...screenOpts }}
      />
      <Stack.Screen name="EditProfile" component={EditProfile} options={{ headerShown: false }} />
      <Stack.Screen
        name="EditPassword"
        component={EditPassword}
        options={{ headerShown: true, title: "Change Password", ...screenOpts }}
      />
      <Stack.Screen
        name="PaymentHistory"
        component={UserHistoryScreen}
        options={{ headerShown: true, title: "Payment History", ...screenOpts }}
      />

      <Stack.Screen name="AdminDashboard" component={AdminDrawerNavigator} />
      <Stack.Screen name="InitiatorDashboard" component={InitiatorDrawerNavigator} />

      {/* EXTRA / OPTIONAL SCREENS */}
      <Stack.Screen
        name="CreateCommittee"
        component={CreateCommittee}
        options={{ headerShown: true, title: "Create Committee", ...screenOpts }}
      />
      <Stack.Screen
        name="MyCommittees"
        component={InitiatorViewAllCommittees}
        options={{ headerShown: true, title: "My Committees", ...screenOpts }}
      />
      <Stack.Screen
        name="TurnManagement"
        component={TurnManagement}
        options={{ headerShown: true, title: "Manage Turns", ...screenOpts }}
      />
      <Stack.Screen
        name="JoinCommittees"
        component={JoinCommittees}
        options={{ headerShown: true, title: "Join Committees", ...screenOpts }}
      />
      <Stack.Screen
        name="RecommendationScreen"
        component={RecommendationScreen}
        options={{ headerShown: true, title: "Recommendations", ...screenOpts }}
      />
      <Stack.Screen
        name="InitiatorProfile"
        component={InitiatorProfileScreen}
        options={{ headerShown: true, title: "Initiator Profile", ...screenOpts }}
      />
      <Stack.Screen
        name="TurnChangeRequestForm"
        component={TurnChangeRequestForm}
        options={{ headerShown: true, title: "Request Turn Change", ...screenOpts }}
      />
      <Stack.Screen
        name="AdminComplaintsScreen"
        component={AdminComplaintsScreen}
        options={{ headerShown: true, title: "Complaints", ...screenOpts }}
      />
      <Stack.Screen
        name="AdminWarningScreen"
        component={AdminWarningScreen}
        options={{ headerShown: true, title: "Admin Warnings", ...screenOpts }}
      />
      <Stack.Screen
        name="Reports"
        component={InitiatorDummyScreen}
        options={{ headerShown: true, title: "Reports", ...screenOpts }}
      />
      <Stack.Screen
        name="Notifications"
        component={InitiatorDummyScreen}
        options={{ headerShown: true, title: "Notifications", ...screenOpts }}
      />
      <Stack.Screen
        name="MemberList"
        component={InitiatorDummyScreen}
        options={{ headerShown: true, title: "Member List", ...screenOpts }}
      />
      <Stack.Screen
        name="UserCommittees"
        component={UserCommittees}
        options={{ headerShown: true, title: "My Committees", ...screenOpts }}
      />
      <Stack.Screen
        name="UserMapScreen"
        component={UserMapScreen}
        options={{ headerShown: true, title: "Live Committee Map", ...screenOpts }}
      />
      <Stack.Screen
        name="PaymentScreen"
        component={PaymentScreen}
        options={{ headerShown: true, title: "Payment", ...screenOpts }}
      />
      <Stack.Screen
        name="AdminLoans"
        component={AdminLoanRequestsScreen}
        options={{ headerShown: true, title: "Admin Loan Requests", ...screenOpts }}
      />
      <Stack.Screen
        name="LoanDetails"
        component={LoanDetailsScreen}
        options={{ headerShown: true, title: "Loan Details", ...screenOpts }}
      />
      <Stack.Screen
        name="CnicScan"
        component={CnicScanScreen}
        options={{ headerShown: true, title: "CNIC Scanner", ...screenOpts }}
      />
      <Stack.Screen
        name="WalletScreen"
        component={WalletScreen}
        options={{ headerShown: true, title: "Committee Wallet", ...screenOpts }}
      />
      <Stack.Screen
        name="AdminPaymentVerification"
        component={AdminPaymentVerificationScreen}
        options={{ headerShown: true, title: "Verify Payments", ...screenOpts }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  // Register for push notifications on app launch
  useEffect(() => {
    const timer = setTimeout(() => {
      registerForPushNotifications().catch(() => {});
    }, 2000); // Delay to avoid blocking startup
    return () => clearTimeout(timer);
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <WalletProvider>
          <AppStack />
        </WalletProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
