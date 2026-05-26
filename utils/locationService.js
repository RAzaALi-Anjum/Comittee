import * as Location from "expo-location";
import apiClient from "../services/apiClient";

let trackingInterval = null;
let _currentCommitteeIds = [];

/**
 * Get user's current GPS coordinates.
 */
export const getUserLocation = async () => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Location permission is mandatory.");
  }
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return location.coords;
};

/**
 * Push current location to backend for all user committees.
 */
const pushLocation = async (committeeIds) => {
  try {
    const coords = await getUserLocation();
    const promises = committeeIds.map((commId) =>
      apiClient.backendPost("/location/update", {
        committeeId: commId,
        latitude: coords.latitude,
        longitude: coords.longitude,
      }).catch((err) => {
        console.warn(`[Location] Push failed for ${commId}:`, err.message);
      })
    );
    await Promise.all(promises);
  } catch (err) {
    console.warn("[Location] Push error:", err.message);
  }
};

/**
 * Start periodic location tracking for user's committees.
 * Pushes location every intervalMs (default 60s).
 */
export const startLocationTracking = (committeeIds, intervalMs = 60000) => {
  if (!committeeIds || committeeIds.length === 0) return;

  _currentCommitteeIds = committeeIds;

  // Push immediately
  pushLocation(_currentCommitteeIds);

  // Then push periodically
  if (trackingInterval) clearInterval(trackingInterval);
  trackingInterval = setInterval(() => {
    pushLocation(_currentCommitteeIds);
  }, intervalMs);
};

/**
 * Stop periodic location tracking.
 */
export const stopLocationTracking = () => {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }
  _currentCommitteeIds = [];
};

/**
 * Pause/resume location sharing for a specific committee.
 */
export const pauseLocationSharing = async (committeeId, paused) => {
  try {
    const result = await apiClient.backendPost("/location/pause", {
      committeeId,
      paused,
    });
    return result;
  } catch (err) {
    console.error("[Location] Pause toggle error:", err);
    throw err;
  }
};

/**
 * Fetch all member locations for a committee.
 */
export const getCommitteeLocations = async (committeeId) => {
  try {
    const result = await apiClient.backendGet(`/location/${committeeId}`);
    return result;
  } catch (err) {
    console.error("[Location] Fetch error:", err);
    throw err;
  }
};