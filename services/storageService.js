import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEYS = {
  USER_DATA: "userData",
  THEME_PREF: "theme_pref",
  LANGUAGE: "language",
};

const storageService = {
  async setItem(key, value) {
    try {
      const stringValue = typeof value === "string" ? value : JSON.stringify(value);
      await AsyncStorage.setItem(key, stringValue);
    } catch (error) {
      console.error(`Error saving to storage: ${key}`, error);
    }
  },

  async getItem(key, isJson = true) {
    try {
      const value = await AsyncStorage.getItem(key);
      if (value && isJson) {
        return JSON.parse(value);
      }
      return value;
    } catch (error) {
      console.error(`Error reading from storage: ${key}`, error);
      return null;
    }
  },

  async removeItem(key) {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing from storage: ${key}`, error);
    }
  },

  async clear() {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      console.error("Error clearing storage", error);
    }
  },

  // Helper for userData
  async getUserData() {
    return this.getItem(STORAGE_KEYS.USER_DATA);
  },

  async setUserData(data) {
    try {
      const current = await this.getUserData() || {};
      const currentUid = current.uid || current.userId || current.id;
      const incomingUid = data.uid || data.userId || data.id;
      if (currentUid && incomingUid && currentUid !== incomingUid) {
        return this.setItem(STORAGE_KEYS.USER_DATA, data);
      }
      const merged = { ...current, ...data };
      return this.setItem(STORAGE_KEYS.USER_DATA, merged);
    } catch {
      return this.setItem(STORAGE_KEYS.USER_DATA, data);
    }
  },

  async removeUserData() {
    return this.removeItem(STORAGE_KEYS.USER_DATA);
  },
};

export { STORAGE_KEYS };
export default storageService;
