// screens/Admin/AdminReports.js

import React, { useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

export default function AdminReports() {
  const { colors } = useTheme();
  const styles = getStyles(colors);

  const [reportType, setReportType] = useState("users"); // "users" or "initiators"

  // Dummy data
  const usersData = [
    { id: "u1", name: "Fatima Shahbaz", totalPayments: 5, totalAmount: 25000 },
    { id: "u2", name: "Ali Khan", totalPayments: 3, totalAmount: 15000 },
    { id: "u3", name: "Ayesha Iqbal", totalPayments: 4, totalAmount: 20000 },
  ];

  const initiatorsData = [
    { id: "i1", name: "Sara Ahmed", committeesCreated: 3, activeCommittees: 2 },
    { id: "i2", name: "Omar Raza", committeesCreated: 5, activeCommittees: 4 },
    { id: "i3", name: "Hira Ali", committeesCreated: 2, activeCommittees: 1 },
  ];

  const renderUser = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.name}>{item.name}</Text>
      <View style={styles.infoRow}>
        <Text style={styles.label}>Total Payments</Text>
        <Text style={styles.value}>{item.totalPayments}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.label}>Total Amount Paid</Text>
        <Text style={styles.value}>PKR {item.totalAmount.toLocaleString()}</Text>
      </View>
    </View>
  );

  const renderInitiator = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.name}>{item.name}</Text>
      <View style={styles.infoRow}>
        <Text style={styles.label}>Committees Created</Text>
        <Text style={styles.value}>{item.committeesCreated}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.label}>Active Committees</Text>
        <Text style={styles.value}>{item.activeCommittees}</Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.heading, { color: colors.brand }]}>Administrative Reports</Text>

      {/* Report Type Selector */}
      <View style={styles.selector}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={[
            styles.selectorBtn,
            reportType === "users" ? [styles.activeBtn, { backgroundColor: colors.brand }] : null,
          ]}
          onPress={() => setReportType("users")}
        >
          <Text style={[styles.selectorText, reportType === "users" && { color: '#fff' }]}>Users</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          style={[
            styles.selectorBtn,
            reportType === "initiators" ? [styles.activeBtn, { backgroundColor: colors.brand }] : null,
          ]}
          onPress={() => setReportType("initiators")}
        >
          <Text style={[styles.selectorText, reportType === "initiators" && { color: '#fff' }]}>Initiators</Text>
        </TouchableOpacity>
      </View>

      {/* Report List */}
      <FlatList
        data={reportType === "users" ? usersData : initiatorsData}
        keyExtractor={(item) => item.id}
        renderItem={reportType === "users" ? renderUser : renderInitiator}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={true}
      />
    </View>
  );
}

const getStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    heading: {
      fontSize: 20,
      fontWeight: "800",
      marginTop: 20,
      marginBottom: 20,
      textAlign: "center",
      letterSpacing: 0.5
    },
    selector: {
      flexDirection: "row",
      paddingHorizontal: 16,
      gap: 12,
      marginBottom: 24,
    },
    selectorBtn: {
      flex: 1,
      height: 44,
      borderRadius: 12,
      backgroundColor: "#fff",
      borderWidth: 1,
      borderColor: "#e2e8f0",
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    activeBtn: {
      borderColor: 'transparent',
      elevation: 4,
      shadowOpacity: 0.2,
    },
    selectorText: {
      fontWeight: "700",
      fontSize: 14,
      color: "#64748b",
    },
    card: {
      backgroundColor: "#fff",
      borderRadius: 20,
      padding: 16,
      marginBottom: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 4,
      borderWidth: 1,
      borderColor: "#f1f5f9",
    },
    name: {
      fontSize: 18,
      fontWeight: "700",
      color: "#0f172a",
      marginBottom: 12,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: '#f1f5f9'
    },
    label: {
      fontSize: 14,
      color: "#64748b",
      fontWeight: '500'
    },
    value: {
      fontSize: 14,
      color: "#0f172a",
      fontWeight: '700'
    }
  });
