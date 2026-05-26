import { getApps, initializeApp } from "firebase/app";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: "AIzaSyA7OqBbsMCDS_EOZbMsfORaPYniIiJW9kg",
  authDomain: "com1-e2378.firebaseapp.com",
  databaseURL: "https://com1-e2378-default-rtdb.firebaseio.com",
  projectId: "com1-e2378",
  storageBucket: "com1-e2378.firebasestorage.app",
  messagingSenderId: "892245769326",
  appId: "1:892245769326:web:c5bdd7ff6277988120ba7f",
  measurementId: "G-KB046WZ2P3"
};

// Guard against duplicate-app error on hot reload
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

let authInstance;
try {
  if (Platform.OS === "web") {
    authInstance = getAuth(app);
  } else {
    authInstance = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  }
} catch (e) {
  // initializeAuth throws if already initialized — fall back to getAuth
  authInstance = getAuth(app);
}

export const auth = authInstance;
export const database = getDatabase(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
