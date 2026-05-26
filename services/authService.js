import {
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut,
} from "firebase/auth";
import { auth } from "../firebaseConfig";
import apiClient from "./apiClient";
import storageService from "./storageService";

const authService = {
    async login(email, password) {
        try {
            // 1. Authenticate with Firebase Auth (existing behavior)
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // 2. Call backend for bcrypt verification + JWT tokens
            try {
                const backendRes = await apiClient.backendPost("/auth/login", {
                    email,
                    password,
                    userId: user.uid,
                });

                // Store backend JWT token
                if (backendRes?.accessToken) {
                    const userData = await storageService.getUserData();
                    await storageService.setUserData({
                        ...userData,
                        backendToken: backendRes.accessToken,
                        refreshToken: backendRes.refreshToken,
                    });
                }
            } catch (backendErr) {
                // Backend is optional — app still works with Firebase Auth alone
                console.warn("[Auth] Backend login enhancement unavailable:", backendErr.message);
            }

            return user;
        } catch (error) {
            console.error("Login Error:", error.code, error.message);
            throw this.handleError(error);
        }
    },

    async signup(email, password, fullName) {
        try {
            // 1. Create Firebase Auth user (existing behavior)
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // 2. Call backend for bcrypt hashing + JWT tokens
            try {
                const backendRes = await apiClient.backendPost("/auth/signup", {
                    email,
                    password,
                    fullName: fullName || email.split("@")[0],
                    userId: user.uid,
                });

                // Store backend JWT token
                if (backendRes?.accessToken) {
                    const userData = await storageService.getUserData();
                    await storageService.setUserData({
                        ...userData,
                        backendToken: backendRes.accessToken,
                        refreshToken: backendRes.refreshToken,
                    });
                }
            } catch (backendErr) {
                // Backend is optional — app still works with Firebase Auth alone
                console.warn("[Auth] Backend signup enhancement unavailable:", backendErr.message);
            }

            return user;
        } catch (error) {
            console.error("Signup Error:", error.code, error.message);
            throw this.handleError(error);
        }
    },

    async logout() {
        try {
            // Call backend logout to clear refresh token
            try {
                await apiClient.backendPost("/auth/logout", {});
            } catch { }

            await signOut(auth);
            await storageService.removeUserData();
        } catch (error) {
            console.error("Logout Error:", error);
            throw error;
        }
    },

    async refreshToken() {
        try {
            const userData = await storageService.getUserData();
            if (!userData?.refreshToken) return null;

            const res = await apiClient.backendPost("/auth/refresh", {
                refreshToken: userData.refreshToken,
            });

            if (res?.accessToken) {
                await storageService.setUserData({
                    ...userData,
                    backendToken: res.accessToken,
                });
                return res.accessToken;
            }
            return null;
        } catch (error) {
            console.warn("[Auth] Token refresh failed:", error.message);
            return null;
        }
    },

    async resetPassword(email) {
        try {
            // Use custom backend reset flow
            const result = await apiClient.backendPost("/password-reset/request", {
                email: email.trim().toLowerCase(),
            });
            return result;
        } catch (error) {
            // Fallback to Firebase if backend is unavailable
            if (error.message?.includes("timed out") || error.message?.includes("Network")) {
                try {
                    await sendPasswordResetEmail(auth, email);
                    return { success: true, message: "Password reset link sent (via Firebase)" };
                } catch (fbErr) {
                    throw this.handleError(fbErr);
                }
            }
            throw error;
        }
    },

    async validateResetToken(token) {
        try {
            const result = await apiClient.backendGet(`/password-reset/validate/${token}`);
            return result;
        } catch (error) {
            return { valid: false, reason: "Network error" };
        }
    },

    async resetPasswordWithToken(token, newPassword) {
        try {
            const result = await apiClient.backendPost("/password-reset/reset", {
                token,
                newPassword,
            });
            return result;
        } catch (error) {
            throw error;
        }
    },

    handleError(error) {
        let message = "An unexpected error occurred. Please try again.";

        switch (error.code) {
            case "auth/invalid-email":
                message = "Invalid email address.";
                break;
            case "auth/user-disabled":
                message = "This user account has been disabled.";
                break;
            case "auth/user-not-found":
                message = "User not found.";
                break;
            case "auth/wrong-password":
                message = "Incorrect password.";
                break;
            case "auth/email-already-in-use":
                message = "This email is already registered.";
                break;
            case "auth/weak-password":
                message = "Password is too weak. Must be at least 6 characters.";
                break;
            case "auth/invalid-credential":
                message = "Invalid email or password.";
                break;
            case "auth/network-request-failed":
                message = "Network error. Please check your connection.";
                break;
            default:
                message = error.message || message;
        }

        const err = new Error(message);
        err.code = error.code;
        return err;
    }
};

export default authService;

