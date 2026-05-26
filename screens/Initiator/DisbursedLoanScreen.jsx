import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import app from "../../firebaseConfig";

const db = getFirestore(app);

export default function DisbursedLoanScreen() {
  const [loan, setLoan] = useState(null);
  const user = getAuth().currentUser;

  useEffect(() => {
    const fetchLoan = async () => {
      const q = query(
        collection(db, "loans"),
        where("userId", "==", user.uid),
        where("status", "==", "Approved")
      );
      const snap = await getDocs(q);
      if (!snap.empty) setLoan(snap.docs[0].data());
    };
    fetchLoan();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Loan Disbursement</Text>
      {loan ? (
        <>
          <Text>Amount: {loan.amount}</Text>
          <Text>Status: Disbursed</Text>
          <Text>Funds credited digitally</Text>
        </>
      ) : (
        <Text>No approved loan yet</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 20 },
});
