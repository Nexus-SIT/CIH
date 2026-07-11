import { getGraph } from './graph.js';
import { incrementGraphVersion } from './redisClient.js';

// Haversine distance in meters
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Distance from a point (lat, lng) to a line segment (latA, lngA) -> (latB, lngB) in meters
function distanceToSegment(lat, lng, latA, lngA, latB, lngB) {
  const R = 6371e3;
  // Convert to approximate local Cartesian coordinates in meters
  const x0 = lng * Math.cos(lat * Math.PI / 180) * R * Math.PI / 180;
  const y0 = lat * R * Math.PI / 180;
  
  const x1 = lngA * Math.cos(latA * Math.PI / 180) * R * Math.PI / 180;
  const y1 = latA * R * Math.PI / 180;
  
  const x2 = lngB * Math.cos(latB * Math.PI / 180) * R * Math.PI / 180;
  const y2 = latB * R * Math.PI / 180;
  
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  
  let param = 0;
  if (lengthSq !== 0) {
    const dot = ((x0 - x1) * dx + (y0 - y1) * dy);
    param = dot / lengthSq;
  }
  
  let xx, yy;
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * dx;
    yy = y1 + param * dy;
  }
  
  const dX = x0 - xx;
  const dY = y0 - yy;
  return Math.sqrt(dX * dX + dY * dY);
}

/**
 * Updates the flood status of edges within a given radius.
 *
 * Source priority rules:
 *   - "ai" can always override any edge regardless of current source.
 *   - "manual" CANNOT override an edge that is currently flooded/impassable with source "ai".
 *   - null (legacy/clear) behaves like "manual".
 *
 * @param {number} lat          - Latitude of the flood center
 * @param {number} lng          - Longitude of the flood center
 * @param {number} radiusMeters - Radius in meters
 * @param {string} status       - New status ('flooded' | 'clear')
 * @param {string|null} source  - Who is marking this: 'ai' | 'manual' | null
 * @returns {{ updated: Array, skippedDueToPriority: Array }}
 */
export function updateFloodStatus(lat, lng, radiusMeters, status, source = 'manual') {
  const graph = getGraph();
  if (!graph) throw new Error('Graph is not loaded');

  const updated = [];
  const skippedDueToPriority = [];

  graph.forEachLink((link) => {
    const fromNode = graph.getNode(link.fromId);
    const toNode   = graph.getNode(link.toId);

    // Check if the edge segment passes through the flood radius
    const distToEdge = distanceToSegment(
      lat, lng,
      fromNode.data.lat, fromNode.data.lng,
      toNode.data.lat,   toNode.data.lng
    );

    if (distToEdge > radiusMeters) return; // outside radius, skip

    const currentSource = link.data.source;
    const currentStatus = link.data.status;

    // Priority enforcement:
    // A "manual" (or null) request cannot clear/override an AI-marked flooded edge
    const isAiLocked = currentSource === 'ai' && currentStatus !== 'clear';
    const isManualRequest = source !== 'ai';

    if (isAiLocked && isManualRequest) {
      skippedDueToPriority.push({
        fromId: link.fromId,
        toId:   link.toId,
        reason: `Edge is AI-locked (source: ai, status: ${currentStatus}). Manual requests cannot override it.`,
      });
      return;
    }

    // Apply the change if anything actually changes
    if (currentStatus !== status || currentSource !== source) {
      link.data.status = status;
      link.data.source = source;
      updated.push({
        fromId: link.fromId,
        toId:   link.toId,
        status,
        source,
      });
    }
  });

  if (updated.length > 0) {
    // Invalidate route cache by bumping graph version
    incrementGraphVersion();
  }

  return { updated, skippedDueToPriority };
}

