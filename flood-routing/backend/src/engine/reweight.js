import { getGraph } from './graph.js';

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

/**
 * Updates the flood status of edges within a given radius.
 * @param {number} lat - Latitude of the flood center
 * @param {number} lng - Longitude of the flood center
 * @param {number} radiusMeters - Radius in meters
 * @param {string} status - New status (e.g., 'flooded', 'clear')
 * @returns {Array} List of affected edges to broadcast
 */
export function updateFloodStatus(lat, lng, radiusMeters, status) {
  const graph = getGraph();
  if (!graph) throw new Error('Graph is not loaded');

  const affectedEdges = [];
  
  graph.forEachLink((link) => {
    const fromNode = graph.getNode(link.fromId);
    const toNode = graph.getNode(link.toId);
    
    // Check if either end of the edge is within the radius
    const distFrom = calculateDistance(lat, lng, fromNode.data.lat, fromNode.data.lng);
    const distTo = calculateDistance(lat, lng, toNode.data.lat, toNode.data.lng);
    
    if (distFrom <= radiusMeters || distTo <= radiusMeters) {
      if (link.data.status !== status) {
        link.data.status = status;
        affectedEdges.push({
          fromId: link.fromId,
          toId: link.toId,
          status: status
        });
      }
    }
  });
  
  return affectedEdges;
}
