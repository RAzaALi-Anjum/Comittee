import React from "react";
import { View, Text } from "react-native";

export default function AdminDummyScreen({ route }) {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text style={{ fontSize: 22, fontWeight: "bold" }}>
        {route?.name} Admin Screen
      </Text>
    </View>
  );
}
