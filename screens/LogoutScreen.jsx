import { CommonActions } from "@react-navigation/native";
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

export default function LogoutScreen({ navigation }) {
  const { colors } = useTheme();
  useEffect(() => {
    const doLogout = async () => {
      try {
        await authService.logout();
      } catch (e) {
        // ignore errors for logout flow
      } finally {
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: "Login" }],
          })
        );
      }
    };
    doLogout();
  }, [navigation]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.brand} />
      <Text style={[styles.text, { color: colors.brand }]}>Logging out...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  text: { marginTop: 12, fontWeight: "bold" },
});
