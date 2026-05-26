import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    where
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import apiClient from "./apiClient";
import { Platform } from "react-native";


const userService = {
    async uploadFileToStorage(uri, storagePath, contentType = "image/jpeg") {
        try {
            // ── Route through backend (uses Firebase Admin SDK, bypasses Storage rules) ──
            const formData = new FormData();

            // Safely extract extension from URI or contentType to avoid invalid chars (like colons/slashes in content URIs)
            let ext = "jpg";
            if (contentType === "application/pdf" || contentType === "pdf") {
                ext = "pdf";
            } else if (contentType === "image/png" || contentType === "png") {
                ext = "png";
            } else {
                const cleanUri = uri.split("?")[0];
                const parts = cleanUri.split(".");
                if (parts.length > 1) {
                    const parsedExt = parts.pop().toLowerCase();
                    if (/^[a-z0-9]{3,4}$/.test(parsedExt)) {
                        ext = parsedExt;
                    }
                }
            }

            const mimeType = ext === "png" ? "image/png"
                : ext === "pdf" ? "application/pdf"
                : "image/jpeg";

            if (Platform.OS === "web") {
                const response = await fetch(uri);
                const fileBlob = await response.blob();
                formData.append("file", fileBlob, `upload-${Date.now()}.${ext}`);
            } else {
                formData.append("file", {
                    uri,
                    name: `upload-${Date.now()}.${ext}`,
                    type: contentType || mimeType,
                });
            }
            formData.append("storagePath", storagePath);

            const result = await apiClient.backendUpload("/upload/file", formData);
            if (result?.success && result?.url) {
                return result.url;
            }
            throw new Error(result?.error || "Backend upload returned no URL");
        } catch (e) {
            console.error("[uploadFileToStorage] Error:", e.message);
            throw e; // Let callers handle with their own fallback
        }
    },


    // --- Profile Methods ---
    async getProfileRTDB(userId) {
        try {
            // Try backend first (returns decrypted data)
            try {
                const result = await apiClient.backendGet(`/profile/${userId}`);
                if (result?.success && result.profile) {
                    return result.profile;
                }
            } catch (backendErr) {
                console.warn("[Profile] Backend decrypt unavailable:", backendErr.message);
            }
            // Fallback: read raw from Firebase (may be encrypted text)
            return await apiClient.get(`users/${userId}`);
        } catch (error) {
            console.error("Get Profile RTDB Error:", error);
            return null;
        }
    },

    async updateProfileRTDB(userId, data) {
        // Try backend first (encrypts data before saving)
        try {
            const result = await apiClient.backendPost("/profile/save", {
                userId,
                ...data,
            });
            if (result?.success) return result;
        } catch (backendErr) {
            console.warn("[Profile] Backend encrypt unavailable, saving directly:", backendErr.message);
        }
        // Fallback: direct Firebase save (no encryption)
        return await apiClient.patch(`users/${userId}`, data);
    },

    async createProfileRTDB(userId, data) {
        // Try backend first (encrypts data before saving)
        try {
            const result = await apiClient.backendPost("/profile/save", {
                userId,
                ...data,
            });
            if (result?.success) return result;
        } catch (backendErr) {
            console.warn("[Profile] Backend encrypt unavailable, saving directly:", backendErr.message);
        }
        // Fallback: direct Firebase save
        return await apiClient.put(`users/${userId}`, data);
    },

    async getUserKycForInitiator(userId, initiatorId) {
        return await apiClient.get(`users/${userId}/kycByInitiator/${initiatorId}`);
    },

    async updateUserKycForInitiator(userId, initiatorId, data) {
        return await apiClient.patch(`users/${userId}/kycByInitiator/${initiatorId}`, data);
    },

    async getProfileFirestore(userId) {
        try {
            const userRef = doc(db, "users", userId);
            const snap = await getDoc(userRef);
            return snap.exists() ? snap.data() : null;
        } catch (error) {
            console.error("Get Profile Firestore Error:", error);
            return null;
        }
    },

    async updateProfileFirestore(userId, data) {
        const userRef = doc(db, "users", userId);
        await setDoc(userRef, {
            ...data,
            updatedAt: serverTimestamp(),
        }, { merge: true });
    },

    async syncUserProfile(userId, firebaseUser, existingData = {}, options = {}) {
        const email = firebaseUser.email;
        const systemId = existingData.systemId || `USR-${userId.slice(0, 6).toUpperCase()}`;

        const profile = {
            email,
            systemId,
            fullName: existingData.fullName || email.split("@")[0],
            isComplete: existingData.isComplete || false,
            role: existingData.role || "user",
            initiatorStatus: existingData.initiatorStatus || "none",
        };

        const updates = [this.updateProfileFirestore(userId, profile)];

        // Only update RTDB if not skipped (e.g., backend already handled it during signup)
        if (!options.skipRTDB) {
            updates.push(this.updateProfileRTDB(userId, profile));
        }

        await Promise.all(updates);

        return profile;
    },

    // --- Committee Methods ---
    async getAllCommittees() {
        return await apiClient.get("committees");
    },

    async getCommitteeById(committeeId) {
        return await apiClient.get(`committees/${committeeId}`);
    },

    async updateCommitteeTurns(committeeId, turns) {
        return await apiClient.patch(`committees/${committeeId}`, { turns });
    },

    async updateCommitteeUsers(committeeId, users) {
        return await apiClient.patch(`committees/${committeeId}`, { usersParticipated: users });
    },

    async startCommittee(committeeId) {
        const nowIso = new Date().toISOString();
        const nowTs = Date.now();
        return await apiClient.patch(`committees/${committeeId}`, {
            status: "Started",
            active: true,
            activationDate: nowIso,
            activationTs: nowTs
        });
    },

    async createInitiatorRequest(userId) {
        const nowIso = new Date().toISOString();
        const nowTs = Date.now();
        // Attempt to enrich with name/email for admin display
        let name = null, email = null;
        try {
            const prof = await this.getProfileRTDB(userId);
            name = prof?.fullName || prof?.name || null;
            email = prof?.email || null;
        } catch { }
        const trackingNumber = Number(String(nowTs).slice(-8));
        const fsPayload = {
            userId,
            status: "pending",
            paymentStatus: "paid",
            trackingNumber,
            requestUserName: name || undefined,
            requestEmail: email || undefined,
            createdAt: serverTimestamp(),
        };
        // Write to Firestore (admin Firestore screen)
        const docRef = await addDoc(collection(db, "initiatorRequests"), fsPayload);
        // Also write to RTDB (admin live RTDB screen)
        try {
            await this.createInitiatorRequestRTDB({
                userId,
                status: "pending",
                paymentStatus: "paid",
                trackingNumber,
                requestUserName: name || null,
                requestEmail: email || null,
                createdAt: nowIso,
                createdAtTs: nowTs,
            });
        } catch { }
        return docRef;
    },

    async getInitiatorRequestsRTDB() {
        return await apiClient.get("initiatorRequests");
    },

    async createInitiatorRequestRTDB(data) {
        return await apiClient.post("initiatorRequests", data);
    },

    // --- Participation & Loan Methods ---
    async getParticipationRequests() {
        return await apiClient.get("participationRequests");
    },

    async createParticipationRequest(id, data) {
        return await apiClient.put(`participationRequests/${id}`, data);
    },

    async updateParticipationRequest(id, data) {
        return await apiClient.patch(`participationRequests/${id}`, data);
    },

    async deleteParticipationRequest(id) {
        return await apiClient.delete(`participationRequests/${id}`);
    },

    async createIncomingRequest(initiatorId, requestId, data) {
        return await apiClient.put(`users/${initiatorId}/incomingRequests/${requestId}`, data);
    },

    async createLoanApplication(userId, data) {
        return await addDoc(collection(db, "loans"), {
            ...data,
            userId,
            status: "Pending",
            appliedAt: serverTimestamp(),
        });
    },

    async getTurnRequests() {
        return await apiClient.get("turnRequests");
    },

    async updateTurnRequestStatus(requestId, status) {
        const nowIso = new Date().toISOString();
        const nowTs = Date.now();
        let data = { status, updatedAt: nowIso, updatedAtTs: nowTs };
        const s = String(status || "").toLowerCase();
        if (s === "accepted" || s === "approve" || s === "approved") {
            data = { ...data, acceptedAt: nowIso, acceptedAtTs: nowTs };
        } else if (s === "rejected" || s === "reject") {
            data = { ...data, rejectedAt: nowIso, rejectedAtTs: nowTs };
        }
        return await apiClient.patch(`turnRequests/${requestId}`, data);
    },

    async createTurnRequest(data) {
        return await apiClient.post("turnRequests", data);
    },

    async deleteTurnRequest(id) {
        return await apiClient.delete(`turnRequests/${id}`);
    },

    async updateTurnRequest(id, data) {
        return await apiClient.patch(`turnRequests/${id}`, data);
    },

    async getPayments() {
        return await apiClient.get("payments");
    },

    async getLoansByUser(userId) {
        const q = query(collection(db, "loans"), where("userId", "==", userId));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    async updateCommittee(committeeId, data) {
        return await apiClient.patch(`committees/${committeeId}`, data);
    },

    async getWarnings() {
        return await apiClient.get("warnings");
    },

    async getRemindersByUser(userId) {
        return await apiClient.get(`reminders/${userId}`);
    },

    async updateReminder(userId, committeeId, data) {
        return await apiClient.patch(`reminders/${userId}/${committeeId}`, data);
    },

    async createReminderLog(data) {
        return await apiClient.post("reminderLogs", data);
    },

    // ── Turn Swap Multi-Level Workflow ─────────────────────

    /** Step 1: User submits swap request */
    async submitTurnSwapRequest({ committeeId, toUserId, reason }) {
        return await apiClient.backendPost("/turn/swap-request", {
            committeeId, toUserId, reason,
        });
    },

    /** Step 2: Initiator approves or rejects */
    async handleSwapAsInitiator(requestId, action, reason = null) {
        return await apiClient.backendPost("/turn/swap-initiator-handle", {
            requestId, action, reason,
        });
    },

    /** Step 3: User submits payment proof */
    async submitSwapPayment(requestId, paymentMethod, paymentScreenshot) {
        return await apiClient.backendPost("/turn/swap-submit-payment", {
            requestId, paymentMethod, paymentScreenshot,
        });
    },

    /** Step 4: Admin verifies payment and executes swap */
    async verifySwapAsAdmin(requestId, action) {
        return await apiClient.backendPost("/turn/swap-admin-verify", {
            requestId, action,
        });
    },

    /** Fetch swap requests — role-aware on the backend */
    async getSwapRequests(filters = {}) {
        const params = new URLSearchParams();
        if (filters.committeeId) params.append("committeeId", filters.committeeId);
        if (filters.status) params.append("status", filters.status);
        if (filters.userId) params.append("userId", filters.userId);
        const query = params.toString();
        return await apiClient.backendGet(`/turn/swap-requests${query ? `?${query}` : ""}`);
    },

    /** Admin global wallet (turn swap fees) */
    async getAdminWallet() {
        return await apiClient.backendGet("/wallet/admin-wallet");
    },
};

export default userService;
