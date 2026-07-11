import config from '../config.js';

/**
 * Adjusts the traversal cost and eligibility of an edge based on vehicle type and road status.
 * 
 * @param {string} vehicleType - Type of the vehicle (e.g., "ambulance", "standard")
 * @param {object} edge - The graph edge (link) containing data like distance and status
 * @returns {object} { allowed: boolean, cost: number } - Determines if the edge can be traversed and at what cost.
 */
export function applyVehicleRules(vehicleType, edge) {
  const isFlooded = edge.data && edge.data.status === 'flooded';
  const baseCost = edge.data ? edge.data.distance : 1;
  const vType = (vehicleType || 'standard').toLowerCase();

  if (vType === 'boat') {
    // Boats ONLY travel on flooded roads
    if (isFlooded) {
      return { allowed: true, cost: baseCost };
    } else {
      return { allowed: false, cost: Infinity };
    }
  }

  // For ambulance, 4x4, standard:
  // They ONLY travel on clear roads
  if (!isFlooded) {
    return { allowed: true, cost: baseCost };
  } else {
    return { allowed: false, cost: Infinity };
  }
}
