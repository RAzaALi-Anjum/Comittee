import AsyncStorage from "@react-native-async-storage/async-storage";

// Backend server URL — uses LAN IP so mobile devices can connect
// On web, localhost works. On mobile, we need the PC's network IP.
import Constants from "expo-constants";
import { Platform } from "react-native";

const BASE_URL = "https://com1-e2378-default-rtdb.firebaseio.com";

const getHostIp = () => {
    // Expo SDK 54+ uses expoConfig.hostUri
    const hostUri = Constants?.expoConfig?.hostUri;
    if (hostUri) {
        return hostUri.split(":")[0];
    }
    // Fallback for older Expo versions
    if (Constants?.debuggerHost) {
        return Constants.debuggerHost.split(":")[0];
    }
    return null;
};

const getBackendUrl = () => {
    if (Platform.OS === "web") {
        return "http://localhost:5000/api";
    }
    const host = getHostIp();
    if (Platform.OS === "android") {
        if (!host || host === "localhost" || host === "127.0.0.1") {
            return "http://10.0.2.2:5000/api";
        }
    }
    if (host) {
        return `http://${host}:5000/api`;
    }
    return "http://192.168.1.18:5000/api";
};

const BACKEND_URL = getBackendUrl();

const handleSessionExpiration = async () => {
    try {
        console.warn("Session expired or token invalid. Clearing storage and signing out...");
        await AsyncStorage.removeItem("userData");
        const { auth } = require("../firebaseConfig");
        if (auth) {
            await auth.signOut();
        }
    } catch (e) {
        console.error("Error during session expiration cleanup:", e);
    }
};

const apiClient = {
    // ── Firebase RTDB Direct Access (existing) ───────────
    async request(endpoint, options = {}) {
        const url = `${BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}.json`;

        const defaultHeaders = {
            "Content-Type": "application/json",
        };

        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    ...defaultHeaders,
                    ...options.headers,
                },
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData?.error?.message || `Request failed with status ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`API Request Error [${options.method || "GET"} ${url}]:`, error);
            throw error;
        }
    },

    get(endpoint) {
        return this.request(endpoint, { method: "GET" });
    },

    post(endpoint, data) {
        return this.request(endpoint, {
            method: "POST",
            body: JSON.stringify(data),
        });
    },

    put(endpoint, data) {
        return this.request(endpoint, {
            method: "PUT",
            body: JSON.stringify(data),
        });
    },

    patch(endpoint, data) {
        return this.request(endpoint, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    },

    delete(endpoint) {
        return this.request(endpoint, { method: "DELETE" });
    },

    // ── Secure Backend API Access (NEW) ──────────────────
    async getAuthToken() {
        try {
            const userData = await AsyncStorage.getItem("userData");
            if (userData) {
                const parsed = JSON.parse(userData);
                return parsed.backendToken || parsed.token || null;
            }
            return null;
        } catch {
            return null;
        }
    },

    async backendRequest(endpoint, options = {}) {
        const url = `${BACKEND_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
        const token = await this.getAuthToken();

        const defaultHeaders = {
            "Content-Type": "application/json",
        };

        if (token) {
            defaultHeaders["Authorization"] = `Bearer ${token}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    ...defaultHeaders,
                    ...options.headers,
                },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            const responseData = await response.json().catch(() => ({}));

            if (!response.ok) {
                // 1) Auto-Refresh Token on 401
                if (response.status === 401 && endpoint !== "/auth/refresh") {
                    const userDataStr = await AsyncStorage.getItem("userData");
                    if (userDataStr) {
                        const userData = JSON.parse(userDataStr);
                        if (userData.refreshToken) {
                            try {
                                const refreshUrl = `${BACKEND_URL}/auth/refresh`;
                                const refreshController = new AbortController();
                                const refreshTimeoutId = setTimeout(() => refreshController.abort(), 10000);
                                const refreshRes = await fetch(refreshUrl, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ refreshToken: userData.refreshToken }),
                                    signal: refreshController.signal,
                                });
                                clearTimeout(refreshTimeoutId);
                                const refreshData = await refreshRes.json().catch(() => ({}));
                                
                                if (refreshRes.ok && refreshData.accessToken) {
                                    // Save new token
                                    userData.backendToken = refreshData.accessToken;
                                    await AsyncStorage.setItem("userData", JSON.stringify(userData));
                                    
                                    // Retry original request with new token
                                    defaultHeaders["Authorization"] = `Bearer ${refreshData.accessToken}`;
                                    const retryController = new AbortController();
                                    const retryTimeoutId = setTimeout(() => retryController.abort(), 10000);
                                    const retryRes = await fetch(url, {
                                        ...options,
                                        headers: {
                                            ...defaultHeaders,
                                            ...options.headers,
                                        },
                                        signal: retryController.signal,
                                    });
                                    clearTimeout(retryTimeoutId);
                                    const retryData = await retryRes.json().catch(() => ({}));
                                    if (!retryRes.ok) {
                                        const err = new Error(retryData?.error || `Retry failed with status ${retryRes.status}`);
                                        err.status = retryRes.status;
                                        throw err;
                                    }
                                    return retryData;
                                } else {
                                    // Refresh token request failed with status
                                    if (refreshRes.status === 400 || refreshRes.status === 401 || refreshRes.status === 403) {
                                        await handleSessionExpiration();
                                    } else {
                                        const err = new Error(refreshData?.error || `Token refresh failed with status ${refreshRes.status}`);
                                        err.status = refreshRes.status;
                                        throw err;
                                    }
                                }
                            } catch (refreshErr) {
                                console.warn("Auto-refresh failed:", refreshErr.message);
                                const isNetworkError = refreshErr.name === "AbortError" || 
                                                       refreshErr.message?.includes("aborted") || 
                                                       refreshErr.message?.includes("timeout") ||
                                                       refreshErr.message?.includes("Network request failed") ||
                                                       refreshErr.message?.includes("Failed to fetch");
                                if (!isNetworkError) {
                                    await handleSessionExpiration();
                                } else {
                                    throw refreshErr;
                                }
                            }
                        } else {
                            // No refresh token available
                            await handleSessionExpiration();
                        }
                    } else {
                        // No user data available
                        await handleSessionExpiration();
                    }
                }

                const err = new Error(responseData?.error || `Backend request failed with status ${response.status}`);
                err.status = response.status;
                throw err;
            }

            return responseData;
        } catch (error) {
            clearTimeout(timeoutId);
            const isTimeout = error.name === "AbortError" || error.message?.includes("aborted") || error.message?.includes("timeout");
            const finalError = isTimeout ? new Error("Network request timed out") : error;

            // 2) Suppress expected 404 logs for Profile
            if (finalError.status === 404 && endpoint.startsWith("/profile/")) {
                // Ignore console.error for "User not found"
            } else {
                console.error(`Backend Request Error [${options.method || "GET"} ${url}]:`, finalError.message);
            }
            throw finalError;
        }
    },

    async backendGet(endpoint) {
        return this.backendRequest(endpoint, { method: "GET" });
    },

    async backendPost(endpoint, data) {
        return this.backendRequest(endpoint, {
            method: "POST",
            body: JSON.stringify(data),
        });
    },

    async backendUpload(endpoint, formData) {
        const token = await this.getAuthToken();
        const url = `${BACKEND_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

        const headers = {};
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }
        // Do NOT set Content-Type for multipart/form-data — fetch sets it with boundary

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        try {
            const response = await fetch(url, {
                method: "POST",
                headers,
                body: formData,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            const responseData = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(responseData?.error || `Upload failed with status ${response.status}`);
            }

            return responseData;
        } catch (error) {
            clearTimeout(timeoutId);
            const isTimeout = error.name === "AbortError" || error.message?.includes("aborted") || error.message?.includes("timeout");
            const finalError = isTimeout ? new Error("Network request timed out") : error;
            console.error(`Backend Upload Error [${url}]:`, finalError.message);
            throw finalError;
        }
    },

    getMlBaseUrl() {
        if (Platform.OS === "web") {
            return "http://localhost:8000";
        }
        const host = getHostIp();
        if (Platform.OS === "android") {
            if (!host || host === "localhost" || host === "127.0.0.1") {
                return "http://10.0.2.2:8000";
            }
        }
        if (host) {
            return `http://${host}:8000`;
        }
        return "http://192.168.1.18:8000";
    }
};

export default apiClient;
