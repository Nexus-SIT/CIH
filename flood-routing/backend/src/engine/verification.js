import { getGraphBoundingBox } from './graph.js';
import config from '../config.js';

/**
 * Checks if a given coordinate is within the loaded graph's service area.
 * Adds a buffer to account for users slightly outside the precise node borders.
 * 
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} bufferKm - Buffer size in kilometers
 * @returns {boolean} True if within the service area, false otherwise.
 */
export function isWithinServiceArea(lat, lng, bufferKm = 5) {
  const bounds = getGraphBoundingBox();
  if (!bounds) return true; // If graph isn't loaded yet, default to allowing it to fail gracefully later

  // 1 degree of latitude is approx 111 km
  const latBuffer = bufferKm / 111;
  // Longitude varies by latitude, so we adjust using cos(lat)
  const lngBuffer = bufferKm / (111 * Math.cos(lat * (Math.PI / 180)));

  return (
    lat >= (bounds.minLat - latBuffer) &&
    lat <= (bounds.maxLat + latBuffer) &&
    lng >= (bounds.minLng - lngBuffer) &&
    lng <= (bounds.maxLng + lngBuffer)
  );
}

/**
 * Validates a request to mark an area as flooded.
 * @param {number} lat - Latitude of the flood center
 * @param {number} lng - Longitude of the flood center
 * @param {number} radiusMeters - Radius of the flood zone in meters
 * @returns {object} { isValid: boolean, error?: string }
 */
export function validateFloodRequest(lat, lng, radiusMeters) {
  if (lat === undefined || lng === undefined || radiusMeters === undefined) {
    return { isValid: false, error: 'Missing required fields: lat, lng, and radiusMeters are required.' };
  }

  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  const parsedRadius = parseFloat(radiusMeters);

  if (isNaN(parsedLat) || isNaN(parsedLng) || isNaN(parsedRadius)) {
    return { isValid: false, error: 'Malformed request: lat, lng, and radiusMeters must be valid numbers.' };
  }

  const MIN_RADIUS = 10;
  const MAX_RADIUS = 10000;
  
  if (parsedRadius < MIN_RADIUS || parsedRadius > MAX_RADIUS) {
    return { 
      isValid: false, 
      error: `radiusMeters must be between ${MIN_RADIUS} and ${MAX_RADIUS} meters.` 
    };
  }

  if (!isWithinServiceArea(parsedLat, parsedLng)) {
    return { 
      isValid: false, 
      error: 'Location is outside the supported service area. This system currently only covers the loaded region.' 
    };
  }

  return { isValid: true };
}
