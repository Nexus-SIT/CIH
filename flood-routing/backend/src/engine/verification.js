import { getGraph } from './graph.js';
import config from '../config.js';

let graphBoundsCache = null;

/**
 * Calculates and caches the bounding box of the currently loaded graph.
 * @returns {object} { minLat, maxLat, minLng, maxLng }
 */
function getGraphBounds() {
  if (graphBoundsCache) return graphBoundsCache;

  const graph = getGraph();
  if (!graph) return null;

  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;

  graph.forEachNode((node) => {
    const { lat, lng } = node.data;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  });

  graphBoundsCache = { minLat, maxLat, minLng, maxLng };
  return graphBoundsCache;
}

/**
 * Validates a request to mark an area as flooded.
 * @param {number} lat - Latitude of the flood center
 * @param {number} lng - Longitude of the flood center
 * @param {number} radiusMeters - Radius of the flood zone in meters
 * @returns {object} { isValid: boolean, error?: string }
 */
export function validateFloodRequest(lat, lng, radiusMeters) {
  // 1. Basic Type and Presence Checks
  if (lat === undefined || lng === undefined || radiusMeters === undefined) {
    return { isValid: false, error: 'Missing required fields: lat, lng, and radiusMeters are required.' };
  }

  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  const parsedRadius = parseFloat(radiusMeters);

  if (isNaN(parsedLat) || isNaN(parsedLng) || isNaN(parsedRadius)) {
    return { isValid: false, error: 'Malformed request: lat, lng, and radiusMeters must be valid numbers.' };
  }

  // 2. Sanity Check for Radius (e.g., between 10 meters and 10 kilometers)
  const MIN_RADIUS = 10;
  const MAX_RADIUS = 10000; // 10km maximum to prevent someone from flooding the entire state in one API call
  
  if (parsedRadius < MIN_RADIUS || parsedRadius > MAX_RADIUS) {
    return { 
      isValid: false, 
      error: `radiusMeters must be between ${MIN_RADIUS} and ${MAX_RADIUS} meters.` 
    };
  }

  // 3. Graph Bounding Box Check
  const bounds = getGraphBounds();
  
  // If the graph hasn't loaded yet, we can't validate against bounds, but we shouldn't crash
  if (bounds) {
    // Add a small buffer (e.g., 0.05 degrees) to allow marking floods just outside the strict node bounds
    const buffer = 0.05; 
    if (
      parsedLat < (bounds.minLat - buffer) || parsedLat > (bounds.maxLat + buffer) ||
      parsedLng < (bounds.minLng - buffer) || parsedLng > (bounds.maxLng + buffer)
    ) {
      return { 
        isValid: false, 
        error: `Coordinates (${parsedLat}, ${parsedLng}) are outside the loaded graph's bounding box.` 
      };
    }
  } else {
     // Basic earth coordinate validation if graph isn't ready
     if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
        return { isValid: false, error: 'Coordinates are out of valid Earth bounds.' };
     }
  }

  // If all checks pass
  return { isValid: true };
}
