// In-memory Map to store pending volunteer flood reports
const volunteerReports = new Map();

/**
 * Creates a new volunteer report.
 * @param {number} lat - Latitude of the reported flood
 * @param {number} lng - Longitude of the reported flood
 * @param {number} radiusMeters - Radius in meters
 * @param {string} userRole - 'new_user', 'trusted_user', 'moderator'
 * @returns {object} The created report
 */
export function createReport(lat, lng, radiusMeters, userRole) {
  const reportId = 'vol-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
  
  // Assign weight based on role
  let weight = 1;
  if (userRole === 'trusted_user') weight = 3;
  if (userRole === 'moderator') weight = 10;

  const report = {
    id: reportId,
    lat,
    lng,
    radiusMeters,
    userRole,
    weight,
    status: 'pending', // "pending" | "resolved"
    timestamp: Date.now()
  };
  
  volunteerReports.set(reportId, report);
  return report;
}

/**
 * Retrieves all active (pending) volunteer reports.
 * @returns {Array<object>}
 */
export function getAllReports() {
  return Array.from(volunteerReports.values()).filter(req => req.status === 'pending');
}

/**
 * Retrieves a specific report by ID.
 * @param {string} reportId 
 * @returns {object|undefined}
 */
export function getReport(reportId) {
  return volunteerReports.get(reportId);
}

/**
 * Removes a report entirely (when approved or rejected).
 * @param {string} reportId 
 * @returns {boolean}
 */
export function removeReport(reportId) {
  return volunteerReports.delete(reportId);
}
