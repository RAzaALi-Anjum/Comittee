import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity
} from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

export default function UserProfile({ navigation }) {
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [address, setAddress] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [city, setCity] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [occupation, setOccupation] = useState("");
  const [profilePicture, setProfilePicture] = useState(null);
  const [cnic, setCnic] = useState(null);
  const [bankStatement, setBankStatement] = useState(null);
  const [referenceName, setReferenceName] = useState("");
  const [referenceAddress, setReferenceAddress] = useState("");
  const [referenceContact, setReferenceContact] = useState("");

  // Pick image (profile, cnic, bank)
  const pickImage = async (setter) => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permission required", "Camera roll permission is required!");
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setter(result.assets[0].uri);
    }
  };

  const validateAndSave = async () => {
    if (
      !name ||
      !fatherName ||
      !address ||
      !contactNumber ||
      !city ||
      !email ||
      !age ||
      !gender ||
      !occupation ||
      !profilePicture ||
      !cnic ||
      !bankStatement ||
      !referenceName ||
      !referenceAddress ||
      !referenceContact
    ) {
      Alert.alert("Error", "Please fill all fields and upload all documents!");
      return;
    }

    const userProfile = {
      name,
      fatherName,
      address,
      contactNumber,
      city,
      email,
      age,
      gender,
      occupation,
      profilePicture,
      cnic,
      bankStatement,
      isComplete: true,
      referenceName,
      referenceAddress,
      referenceContact,
      createdAt: new Date().toISOString(),
    };

    try {
      const data = await userService.apiClient.post("users", userProfile);

      Alert.alert("Success", "Profile created successfully!", [
        {
          text: "OK",
          onPress: () =>
            navigation.reset({
              index: 0,
              routes: [
                {
                  name: "UserDashboard",
                  params: { userId: data.name }, // Pass the new user ID
                },
              ],
            }),
        },
      ]);
    } catch (error) {
      console.log(error);
      Alert.alert("Error", "Failed to save profile.");
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ padding: 20 }}>
      <Text style={[styles.heading, { color: colors.brand }]}>Complete Your Profile</Text>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} />

      <Text style={styles.label}>Father Name</Text>
      <TextInput style={styles.input} value={fatherName} onChangeText={setFatherName} />

      <Text style={styles.label}>Address</Text>
      <TextInput style={styles.input} value={address} onChangeText={setAddress} />

      <Text style={styles.label}>Contact Number</Text>
      <TextInput
        style={styles.input}
        value={contactNumber}
        onChangeText={setContactNumber}
        keyboardType="phone-pad"
      />

      <Text style={styles.label}>City</Text>
      <TextInput style={styles.input} value={city} onChangeText={setCity} />

      <Text style={styles.label}>Email</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" />

      <Text style={styles.label}>Age</Text>
      <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType="numeric" />

      <Text style={styles.label}>Gender</Text>
      <TextInput style={styles.input} value={gender} onChangeText={setGender} placeholder="Male / Female / Other" />

      <Text style={styles.label}>Occupation</Text>
      <TextInput style={styles.input} value={occupation} onChangeText={setOccupation} />

      <Text style={styles.label}>Profile Picture</Text>
      <TouchableOpacity style={[styles.uploadBtn, { backgroundColor: colors.brand }]} onPress={() => pickImage(setProfilePicture)}>
        <Text style={styles.uploadText}>Upload Profile Picture</Text>
      </TouchableOpacity>
      {profilePicture && <Image source={{ uri: profilePicture }} style={styles.preview} />}

      <Text style={styles.label}>CNIC</Text>
      <TouchableOpacity style={[styles.uploadBtn, { backgroundColor: colors.brand }]} onPress={() => pickImage(setCnic)}>
        <Text style={styles.uploadText}>Upload CNIC</Text>
      </TouchableOpacity>
      {cnic && <Image source={{ uri: cnic }} style={styles.preview} />}

      <Text style={styles.label}>Bank Statement (Last 6 Months)</Text>
      <TouchableOpacity style={[styles.uploadBtn, { backgroundColor: colors.brand }]} onPress={() => pickImage(setBankStatement)}>
        <Text style={styles.uploadText}>Upload Bank Statement</Text>
      </TouchableOpacity>
      {bankStatement && <Image source={{ uri: bankStatement }} style={styles.preview} />}

      <Text style={styles.label}>Reference Name</Text>
      <TextInput style={styles.input} value={referenceName} onChangeText={setReferenceName} />

      <Text style={styles.label}>Reference Address</Text>
      <TextInput style={styles.input} value={referenceAddress} onChangeText={setReferenceAddress} />

      <Text style={styles.label}>Reference Contact Number</Text>
      <TextInput style={styles.input} value={referenceContact} onChangeText={setReferenceContact} keyboardType="phone-pad" />

      <TouchableOpacity style={styles.submitBtn} onPress={validateAndSave}>
        <Text style={styles.submitText}>Complete Profile</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  heading: { fontSize: 24, fontWeight: "bold", textAlign: "center", marginBottom: 20 },
  label: { fontWeight: "bold", marginTop: 10 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 5, padding: 10, backgroundColor: "#fff", marginTop: 5 },
  uploadBtn: { marginTop: 10, padding: 12, borderRadius: 8, alignItems: "center" },
  uploadText: { color: "#fff", fontWeight: "bold" },
  preview: { width: 100, height: 100, marginTop: 10, borderRadius: 5 },
  submitBtn: { marginTop: 20, backgroundColor: "#4CAF50", padding: 15, borderRadius: 8, alignItems: "center" },
  submitText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
