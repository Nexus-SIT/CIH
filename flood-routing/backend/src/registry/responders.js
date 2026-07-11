// In-memory Map to store active responder sessions
const responders = new Map();

/**
 * Registers a new responder session or overwrites an existing one.
 * 
 * @param {string} responderId - Unique ID for the responder/device.
 * @param {string} vehicleType - Type of vehicle (e.g., "ambulance", "standard").
 * @param {number} initialLat - Starting latitude.
 * @param {number} initialLng - Starting longitude.
 * @returns {object} The created responder session.
 */
export function register(responderId, vehicleType, initialLat, initialLng) {
  const session = {
    responderId,
    vehicleType: vehicleType || 'standard',
    currentLat: initialLat,
    currentLng: initialLng,
    activeRouteId: null,
    lastUpdated: Date.now()
  };
  
  responders.set(responderId, session);
  return session;
}

/**
 * Updates the location and optionally the active route of an existing responder.
 * 
 * @param {string} responderId - Unique ID for the responder.
 * @param {number} lat - New latitude.
 * @param {number} lng - New longitude.
 * @param {string|null} [activeRouteId] - Optional active route ID.
 * @returns {object|null} The updated session, or null if the responder wasn't found.
 */
export function updateLocation(responderId, lat, lng, activeRouteId = undefined) {
  const session = responders.get(responderId);
  if (!session) {
    return null;
  }

  session.currentLat = lat;
  session.currentLng = lng;
  
  if (activeRouteId !== undefined) {
    session.activeRouteId = activeRouteId;
  }
  
  session.lastUpdated = Date.now();
  
  return session;
}

/**
 * Retrieves all currently active responder sessions.
 * 
 * @returns {Array<object>} Array of all responder session objects.
 */
export function getAll() {
  return Array.from(responders.values());
}

/**
 * Removes a responder from the registry (e.g., on disconnect or sign-off).
 * 
 * @param {string} responderId - Unique ID for the responder to remove.
 * @returns {boolean} True if the responder existed and was removed, false otherwise.
 */
export function remove(responderId) {
  return responders.delete(responderId);
}
