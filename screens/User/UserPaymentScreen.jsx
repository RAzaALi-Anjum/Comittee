import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';

export default function UserPaymentScreen({ route }) {
  const { userId } = route.params;

  // Dummy data inside file
  const payments = [
    { id: 'p1', userId: 'u1', committeeId: 'c1', amount: 500, status: 'Paid', verified: 'Verified', loanRepayment: 'Completed' },
    { id: 'p2', userId: 'u2', committeeId: 'c1', amount: 500, status: 'Unpaid', verified: 'Pending', loanRepayment: 'Pending' },
    { id: 'p3', userId: 'u3', committeeId: 'c2', amount: 300, status: 'Paid', verified: 'Verified', loanRepayment: 'Pending' },
  ];

  const userPayments = payments.filter(p => p.userId === userId);

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.name}>Committee ID: {item.committeeId}</Text>
      <Text>Amount: ₨ {item.amount}</Text>
      <Text>Status: {item.status}</Text>
      <Text>Verified: {item.verified}</Text>
      <Text>Loan Repayment: {item.loanRepayment}</Text>
      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>Pay Now</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <FlatList
      data={userPayments}
      keyExtractor={item => item.id}
      renderItem={renderItem}
      contentContainerStyle={{ padding: 10 }}
    />
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', padding: 15, marginVertical: 8, borderRadius: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  name: { fontWeight: 'bold', fontSize: 16 },
  button: { marginTop: 10, backgroundColor: '#6ABF3A', padding: 10, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold' },
});
