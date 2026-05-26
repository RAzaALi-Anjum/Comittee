// ============================================================
// Location Routes — Live GPS location tracking per committee
// ============================================================
const express = require("express");
const { body } = require("express-validator");
const { encryptData, decryptData } = require("../utils/encryption");
const { adminDb } = require("../utils/firebaseAdmin");
const { verifyToken } = require("../middleware/auth");
const { validateRequest } = require("../middleware/validate");
const { logEvent } = require("../utils/auditLogger");

const router = express.Router();

// ─── UPDATE LOCATION ────────────────────────────────────
// User pushes their GPS coordinates for a committee
router.post(
    "/update",
    verifyToken,
    [
        body("committeeId").notEmpty().withMessage("Committee ID is required"),
        body("latitude").isNumeric().withMessage("Latitude is required"),
        body("longitude").isNumeric().withMessage("Longitude is required"),
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { committeeId, latitude, longitude } = req.body;
            const userId = req.user.userId;

            // Verify user is a member of this committee
            const committeeSnap = await adminDb.ref(`committees/${committeeId}`).once("value");
            const committee = committeeSnap.val();

            if (!committee || !committee.usersParticipated) {
                return res.status(404).json({ error: "Committee not found" });
            }

            const members = Array.isArray(committee.usersParticipated)
                ? committee.usersParticipated.filter(Boolean)
                : Object.values(committee.usersParticipated).filter(Boolean);

            const isMember = members.some(
                (m) => m && (m.userId === userId || m.uid === userId || m.id === userId)
            );

            if (!isMember) {
                return res.status(403).json({ error: "You are not a member of this committee" });
            }

            // Check if user has paused location sharing
            const pauseSnap = await adminDb.ref(`locationSettings/${committeeId}/${userId}/paused`).once("value");
            if (pauseSnap.val() === true) {
                return res.json({
                    success: true,
                    message: "Location sharing is paused. Location not updated.",
                    paused: true,
                });
            }

            // Get user name for display
            const userSnap = await adminDb.ref(`users/${userId}/fullName`).once("value");
            let fullName = userSnap.val();
            if (fullName) {
                fullName = decryptData(fullName);
            }

            // Store encrypted location
            const locationData = {
                latitude: encryptData(String(latitude)),
                longitude: encryptData(String(longitude)),
                fullName: fullName ? encryptData(fullName) : null,
                lastUpdated: new Date().toISOString(),
                userId,
            };

            await adminDb.ref(`locations/${committeeId}/${userId}`).set(locationData);

            return res.json({
                success: true,
                message: "Location updated",
            });
        } catch (err) {
            console.error("[Location/Update] Error:", err);
            return res.status(500).json({ error: "Failed to update location" });
        }
    }
);

// ─── GET COMMITTEE MEMBERS LOCATIONS ────────────────────
// Returns all member locations for a specific committee
router.get(
    "/:committeeId",
    verifyToken,
    async (req, res) => {
        try {
            const { committeeId } = req.params;
            const userId = req.user.userId;

            // Verify user is a member
            const committeeSnap = await adminDb.ref(`committees/${committeeId}`).once("value");
            const committee = committeeSnap.val();

            if (!committee || !committee.usersParticipated) {
                return res.status(404).json({ error: "Committee not found" });
            }

            const members = Array.isArray(committee.usersParticipated)
                ? committee.usersParticipated.filter(Boolean)
                : Object.values(committee.usersParticipated).filter(Boolean);

            const isMember = members.some(
                (m) => m && (m.userId === userId || m.uid === userId || m.id === userId)
            );

            if (!isMember) {
                return res.status(403).json({ error: "Access denied. Not a committee member." });
            }

            // Get all locations for this committee
            const locSnap = await adminDb.ref(`locations/${committeeId}`).once("value");
            const locData = locSnap.val();

            const committeeName = committee.name || committee.committeeName || "Committee";

            if (!locData) {
                return res.json({
                    success: true,
                    committee_name: committeeName,
                    members: [],
                });
            }

            // Decrypt and build response
            const memberLocations = [];
            for (const [uid, loc] of Object.entries(locData)) {
                // Check if user has paused sharing
                const pauseSnap = await adminDb.ref(`locationSettings/${committeeId}/${uid}/paused`).once("value");
                if (pauseSnap.val() === true) continue;

                memberLocations.push({
                    user_id: uid,
                    full_name: loc.fullName ? decryptData(loc.fullName) : "Unknown",
                    latitude: loc.latitude ? parseFloat(decryptData(loc.latitude)) : 0.0,
                    longitude: loc.longitude ? parseFloat(decryptData(loc.longitude)) : 0.0,
                    last_updated: loc.lastUpdated || null,
                });
            }

            return res.json({
                success: true,
                committee_name: committeeName,
                members: memberLocations,
            });
        } catch (err) {
            console.error("[Location/Get] Error:", err);
            return res.status(500).json({ error: "Failed to retrieve locations" });
        }
    }
);

// ─── PAUSE / RESUME LOCATION SHARING ────────────────────
router.post(
    "/pause",
    verifyToken,
    [
        body("committeeId").notEmpty().withMessage("Committee ID is required"),
        body("paused").isBoolean().withMessage("Paused must be boolean"),
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { committeeId, paused } = req.body;
            const userId = req.user.userId;

            await adminDb.ref(`locationSettings/${committeeId}/${userId}`).update({
                paused: paused,
                updatedAt: new Date().toISOString(),
            });

            // If pausing, remove current location data
            if (paused) {
                await adminDb.ref(`locations/${committeeId}/${userId}`).remove();
            }

            await logEvent("LOCATION_TOGGLE", userId, {
                committeeId,
                paused,
                ip: req.ip,
            });

            return res.json({
                success: true,
                paused,
                message: paused ? "Location sharing paused" : "Location sharing resumed",
            });
        } catch (err) {
            console.error("[Location/Pause] Error:", err);
            return res.status(500).json({ error: "Failed to update location settings" });
        }
    }
);

module.exports = router;
