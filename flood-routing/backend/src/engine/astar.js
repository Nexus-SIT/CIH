import { aStar } from 'ngraph.path';
import { getGraph, findNearestNode } from './graph.js';
import { applyVehicleRules } from './vehicle_rules.js';

export function calculateRoute(startLat, startLng, endLat, endLng, vehicleType = 'standard') {
  const graph = getGraph();
  const startNode = findNearestNode(startLat, startLng);
  const endNode = findNearestNode(endLat, endLng);
  
  if (!startNode || !endNode) {
    throw new Error('Could not find nearby nodes for start or end locations.');
  }

  const pathfinder = aStar(graph, {
    distance(fromNode, toNode, link) {
      const rule = applyVehicleRules(vehicleType, link);
      if (!rule.allowed) return false;
      return rule.cost;
    }
  });

  const rawPath = pathfinder.find(startNode.id, endNode.id);
  
  // If no path is found, rawPath is empty or null depending on ngraph version (usually an empty array)
  if (!rawPath || rawPath.length === 0) {
    return { 
      path: [], 
      explored: [], 
      distance: null, 
      pathFound: false 
    };
  }

  // ngraph returns the path from end to start, so we reverse it
  const route = rawPath.map(n => ({
    id: n.id,
    lat: n.data.lat,
    lng: n.data.lng
  })).reverse();
  
  // calculate total distance
  let distance = 0;
  for(let i = 0; i < route.length - 1; i++) {
    const link = graph.getLink(route[i].id, route[i+1].id);
    if(link && link.data && link.data.distance) {
      distance += link.data.distance;
    }
  }
  
  return { path: route, explored: [], distance, pathFound: true };
}
