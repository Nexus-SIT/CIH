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

  // If the road is clear, any vehicle can pass at normal cost
  if (!isFlooded) {
    return { allowed: true, cost: baseCost };
  }

  // Handle flooded roads based on vehicle capabilities
  switch ((vehicleType || 'standard').toLowerCase()) {
    case 'ambulance':
    case 'heavy_rescue':
      // Emergency/heavy vehicles can traverse flooded roads, but they are slowed down (penalty applied)
      return { 
        allowed: true, 
        cost: baseCost * (config.floodPenaltyMultiplier / 5) // Lower penalty (e.g. 20x instead of 100x)
      };
      
    case 'standard':
    default:
      // Light passenger vehicles absolutely cannot traverse flooded roads
      return { 
        allowed: false, 
        cost: Infinity 
      };
  }
}
