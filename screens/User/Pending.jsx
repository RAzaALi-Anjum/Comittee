import { Text, View } from "react-native";

export default function Pending() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}>
      <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 8 }}>Request Pending</Text>
      <Text style={{ textAlign: "center", color: "#555" }}>
        Your request has been submitted and is pending review. You will be notified once it is approved.
      </Text>
    </View>
  );
}
