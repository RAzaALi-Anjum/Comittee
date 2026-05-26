// ============================================================
// Profile Routes — Save & Retrieve encrypted user profiles
// ============================================================
const express = require("express");
const { body } = require("express-validator");
const { encryptFields, decryptFields } = require("../utils/encryption");
const { adminDb } = require("../utils/firebaseAdmin");
const { optionalToken, verifyToken, verifyRole } = require("../middleware/auth");
const { validateRequest } = require("../middleware/validate");
const { logEvent } = require("../utils/auditLogger");

const router = express.Router();

// Sensitive profile fields that must be encrypted
const SENSITIVE_FIELDS = [
    "name",
    "fullName",
    "fatherName",
    "address",
    "contactNumber",
    "cnicNumber",
    "occupation",
    "city",
    "email",
    "age",
    "gender",
    "referenceName",
    "referenceFatherName",
    "referenceAddress",
    "referenceContact",
    "referenceCnicNumber",
    "pendingReferenceName",
    "pendingReferenceAddress",
    "pendingReferenceContact",
    "pendingReferenceCnicNumber"
];

// ─── SAVE PROFILE ───────────────────────────────────────
router.post(
    "/save",
    optionalToken,
    [
        body("userId").notEmpty().withMessage("User ID is required"),
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { userId, ...profileData } = req.body;

            // Verify user is saving their own profile or is admin
            if (req.user.userId !== userId && req.user.role !== "admin") {
                await logEvent("ROLE_VIOLATION", req.user.userId, {
                    action: "save_profile",
                    targetUser: userId,
                    ip: req.ip,
                });
                return res.status(403).json({ error: "Access denied" });
            }

            // Encrypt sensitive fields
            const encryptedProfile = encryptFields(profileData, SENSITIVE_FIELDS);

            // Add metadata
            encryptedProfile.updatedAt = new Date().toISOString();
            encryptedProfile.isComplete = profileData.isComplete !== undefined ? profileData.isComplete : true;

            // Save to Firebase RTDB
            await adminDb.ref(`users/${userId}`).update(encryptedProfile);

            await logEvent("DATA_ACCESS", userId, {
                action: "profile_save",
                encryptedFields: SENSITIVE_FIELDS.filter((f) => profileData[f]),
                ip: req.ip,
            });

            return res.json({ success: true, message: "Profile saved securely" });
        } catch (err) {
            console.error("[Profile/Save] Error:", err);
            return res.status(500).json({ error: "Failed to save profile" });
        }
    }
);

// ─── GET PROFILE (DECRYPTED) ────────────────────────────
router.get(
    "/:userId",
    optionalToken,
    async (req, res) => {
        try {
            const { userId } = req.params;

            const snapshot = await adminDb.ref(`users/${userId}`).once("value");
            const userData = snapshot.val();

            if (!userData) {
                console.log(`[Profile/Get] User ${userId} not found in RTDB`);
                return res.status(404).json({ error: "User not found" });
            }

            const isTargetInitiator = userData.role === "initiator" || userData.initiatorStatus === "approved";
            const isRequesterAdminOrSelfOrInitiator = req.user && (
                req.user.userId === userId ||
                req.user.role === "admin" ||
                req.user.role === "initiator"
            );

            // Only allow self, admin, initiator access, OR allow viewing if the target is an initiator
            if (!isRequesterAdminOrSelfOrInitiator && !isTargetInitiator) {
                await logEvent("ROLE_VIOLATION", req.user ? req.user.userId : "anonymous", {
                    action: "get_profile",
                    targetUser: userId,
                    ip: req.ip,
                });
                return res.status(403).json({ error: "Access denied" });
            }

            console.log(`[Profile/Get] Found user ${userId}. Attempting decryption...`);
            // Decrypt sensitive fields
            try {
                const decryptedProfile = decryptFields(userData, SENSITIVE_FIELDS);
                delete decryptedProfile.passwordHash;

                // Strip highly sensitive fields if requester is not admin/self/initiator
                if (!isRequesterAdminOrSelfOrInitiator) {
                    delete decryptedProfile.cnicNumber;
                    delete decryptedProfile.address;
                    delete decryptedProfile.fatherName;
                    delete decryptedProfile.referenceName;
                    delete decryptedProfile.referenceFatherName;
                    delete decryptedProfile.referenceAddress;
                    delete decryptedProfile.referenceContact;
                    delete decryptedProfile.referenceCnicNumber;
                    delete decryptedProfile.pendingReferenceName;
                    delete decryptedProfile.pendingReferenceAddress;
                    delete decryptedProfile.pendingReferenceContact;
                    delete decryptedProfile.pendingReferenceCnicNumber;
                }

                await logEvent("DATA_ACCESS", req.user ? req.user.userId : "anonymous", {
                    action: "profile_view",
                    targetUser: userId,
                    ip: req.ip,
                });

                console.log(`[Profile/Get] Successfully decrypted profile for ${userId}`);
                return res.json({ success: true, profile: decryptedProfile });
            } catch (decErr) {
                console.error(`[Profile/Get] Decryption error for ${userId}:`, decErr);
                return res.status(500).json({ error: "Failed to decrypt profile fields" });
            }
        } catch (err) {
            console.error(`[Profile/Get] Route error for ${req.params.userId}:`, err);
            return res.status(500).json({ error: "Failed to retrieve profile" });
        }
    }
);

// ─── GET ALL USERS (ADMIN ONLY — DECRYPTED) ─────────────
router.get(
    "/",
    verifyToken,
    verifyRole("admin"),
    async (req, res) => {
        try {
            const snapshot = await adminDb.ref("users").once("value");
            const usersData = snapshot.val();

            if (!usersData) {
                return res.json({ success: true, users: [] });
            }

            const users = Object.keys(usersData).map((uid) => {
                const user = decryptFields(usersData[uid], SENSITIVE_FIELDS);
                delete user.passwordHash;
                return { userId: uid, ...user };
            });

            await logEvent("DATA_ACCESS", req.user.userId, {
                action: "all_users_view",
                count: users.length,
                ip: req.ip,
            });

            return res.json({ success: true, users });
        } catch (err) {
            console.error("[Profile/GetAll] Error:", err);
            return res.status(500).json({ error: "Failed to retrieve users" });
        }
    }
);

module.exports = router;
