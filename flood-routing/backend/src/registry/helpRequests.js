// In-memory Map to store help/SOS requests
const helpRequests = new Map();

/**
 * Creates a new help request.
 * @param {number} lat - Latitude of the person in distress
 * @param {number} lng - Longitude of the person in distress
 * @param {string} [message] - Optional SOS message
 * @returns {object} The created help request
 */
export function createRequest(lat, lng, message = '') {
  const requestId = 'sos-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
  
  const request = {
    requestId,
    lat,
    lng,
    message,
    status: 'pending', // "pending" | "acknowledged" | "resolved"
    timestamp: Date.now(),
    assignedResponderId: null
  };
  
  helpRequests.set(requestId, request);
  return request;
}

/**
 * Retrieves all active (non-resolved) help requests.
 * @returns {Array<object>}
 */
export function getAllRequests() {
  return Array.from(helpRequests.values()).filter(req => req.status !== 'resolved');
}

/**
 * Retrieves a specific help request by ID.
 * @param {string} requestId 
 * @returns {object|undefined}
 */
export function getRequest(requestId) {
  return helpRequests.get(requestId);
}

/**
 * Acknowledges a help request and assigns a responder.
 * @param {string} requestId 
 * @param {string} responderId 
 * @returns {object|null} The updated request or null if not found
 */
export function acknowledgeRequest(requestId, responderId) {
  const request = helpRequests.get(requestId);
  if (!request) return null;
  
  request.status = 'acknowledged';
  request.assignedResponderId = responderId;
  return request;
}

/**
 * Marks a help request as resolved.
 * @param {string} requestId 
 * @returns {object|null} The updated request or null if not found
 */
export function resolveRequest(requestId) {
  const request = helpRequests.get(requestId);
  if (!request) return null;
  
  request.status = 'resolved';
  return request;
}

/**
 * Removes a help request entirely.
 * @param {string} requestId 
 * @returns {boolean}
 */
export function removeRequest(requestId) {
  return helpRequests.delete(requestId);
}
