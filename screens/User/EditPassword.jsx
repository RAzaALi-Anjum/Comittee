import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const EditPassword = ({ navigation }) => {
  const [userId, setUserId] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const data = await AsyncStorage.getItem('userData');
        if (data) {
          const { userId, fullName, email, token } = JSON.parse(data);
          setUserId(userId);
          setFullName(fullName);
          setEmail(email);
          setToken(token);
        } else {
          Alert.alert('Error', 'Session expired. Please login again.');
          navigation.replace('Welcome');
        }
      } catch (err) {
        console.log(err);
        Alert.alert('Error', 'Failed to load profile');
      }
    };

    loadUserData();
  }, []);

  const handlePasswordUpdate = async () => {
    try {
      if (!password) {
        Alert.alert('Error', 'Please enter a new password');
        return;
      }

      // 🔁 Update password in Firebase Authentication
      const authResponse = await fetch(
        'https://identitytoolkit.googleapis.com/v1/accounts:update?key=AIzaSyA7OqBbsMCDS_EOZbMsfORaPYniIiJW9kg',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken: token,
            password: password,
            returnSecureToken: true,
          }),
        }
      );

      const result = await authResponse.json();

      if (!authResponse.ok) {
        Alert.alert('Failed', result.error?.message || 'Could not update password');
        return;
      }

      const newToken = result.idToken;

      // 🔐 Update AsyncStorage (with new token, password not stored)
      await AsyncStorage.setItem(
        'userData',
        JSON.stringify({
          userId,
          fullName,
          email,
          token: newToken,
        })
      );

      Alert.alert('Success', 'Password updated successfully');
      setPassword('');
    } catch (error) {
      console.log(error);
      Alert.alert('Error', 'Failed to update password');
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('userData');
    navigation.replace('Welcome');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>User Profile</Text>

      <TextInput
        style={[styles.input, styles.disabledInput]}
        value={fullName}
        placeholder="Full Name"
        editable={false}
        placeholderTextColor="#aaa"
      />
      <TextInput
        style={[styles.input, styles.disabledInput]}
        value={email}
        placeholder="Email"
        editable={false}
        placeholderTextColor="#aaa"
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="New Password"
        placeholderTextColor="#aaa"
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handlePasswordUpdate}>
        <Text style={styles.buttonText}>Update Password</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
};

export default EditPassword;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.8)',
    padding: 20,
    justifyContent: 'center',
  },
  heading: {
    color: '#000',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
  },
  input: {
    backgroundColor: 'white',
    color: 'black',
    padding: 12,
    marginBottom: 15,
    borderRadius: 8,
    borderColor: '#333',
    borderWidth: 1,
  },
  disabledInput: {
    backgroundColor: '#e5e5e5',
    color: '#666',
  },
  button: {
    backgroundColor: '#4CAF50',
    padding: 14,
    borderRadius: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: '#f87171',
    padding: 14,
    borderRadius: 8,
    marginTop: 20,
    alignItems: 'center',
  },
  logoutText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
