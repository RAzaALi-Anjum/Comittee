import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { auth, db } from "../firebaseConfig";
import storageService from "../services/storageService";
import { useTheme } from "../theme/ThemeProvider";

import AdminDrawerNavigator from "./Admin/AdminDrawerNavigator";
import InitiatorDrawerNavigator from "./Initiator/InitiatorDrawerNavigator";
import UserDrawerNavigator from "./User/UserDrawerNavigator";

export default function UserAuthWrapper() {
  const { colors } = useTheme();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubUser = null;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clean up previous listener if it exists
      if (unsubUser) {
        unsubUser();
        unsubUser = null;
      }

      if (!firebaseUser) {
        await storageService.removeUserData();
        setUser(null);
        setLoading(false);
        return;
      }

      // 🔥 Firestore real-time user
      unsubUser = onSnapshot(doc(db, "users", firebaseUser.uid), async (snap) => {
        const data = snap.exists() ? snap.data() : {};
        const userData = { uid: firebaseUser.uid, ...data };
        await storageService.setUserData(userData);
        setUser(userData);
        setLoading(false);
      });
    });

    return () => {
      unsubAuth();
      if (unsubUser) unsubUser();
    };
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (user?.role === "admin") {
    return <AdminDrawerNavigator />;
  }

  if (user?.role === "initiator") {
    return <InitiatorDrawerNavigator />;
  }

  if (user?.initiatorStatus === "approved") {
    return <InitiatorDrawerNavigator />;
  }

  return <UserDrawerNavigator />;
}
