import React, { useEffect, useState } from "react";
import { View, Text, Button, Alert, StyleSheet } from "react-native";
import { getFirestore, collection, query, where, getDocs, updateDoc, doc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import app from "../../firebaseConfig";

const db = getFirestore(app);

export default function RepayLoanScreen() {
  const [loanId, setLoanId] = useState(null);
  const user = getAuth().currentUser;

  useEffect(() => {
    const fetchLoan = async () => {
      const q = query(
        collection(db, "loans"),
        where("userId", "==", user.uid),
        where("status", "==", "Approved")
      );
      const snap = await getDocs(q);
      if (!snap.empty) setLoanId(snap.docs[0].id);
    };
    fetchLoan();
  }, []);

  const repayLoan = async () => {
    await updateDoc(doc(db, "loans", loanId), {
      status: "Repaid",
      repaidAt: new Date(),
    });
    Alert.alert("Loan marked as repaid");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Repay Loan</Text>
      {loanId ? (
        <Button title="Mark Loan as Repaid" onPress={repayLoan} />
      ) : (
        <Text>No active loan</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 20 },
});
