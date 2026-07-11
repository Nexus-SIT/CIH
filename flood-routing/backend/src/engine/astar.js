import { aStar } from 'ngraph.path';
import { getGraph, findNearestNode } from './graph.js';
import { applyVehicleRules } from './vehicle_rules.js';
import { redisClient, getGraphVersion } from './redisClient.js';

export async function calculateRoute(startLat, startLng, endLat, endLng, vehicleType = 'standard') {
  const graph = getGraph();
  const startNode = findNearestNode(startLat, startLng);
  const endNode = findNearestNode(endLat, endLng);
  
  if (!startNode || !endNode) {
    throw new Error('Could not find nearby nodes for start or end locations.');
  }

  const vType = vehicleType || 'standard';

  // --- Redis Caching Logic ---
  let cacheKey = null;
  if (redisClient.isReady) {
    const graphVersion = await getGraphVersion();
    cacheKey = `route_v${graphVersion}:${startNode.id}:${endNode.id}:${vType}`;
    try {
      const cachedResult = await redisClient.get(cacheKey);
      if (cachedResult) {
        return JSON.parse(cachedResult);
      }
    } catch (err) {
      console.error('[Redis] Failed to fetch route cache:', err);
    }
  }
  // ---------------------------

  const exploredSet = new Set();
  const explored = [];

  const pathfinder = aStar(graph, {
    distance(fromNode, toNode, link) {
      // Track exploration for the visualizer
      if (!exploredSet.has(toNode.id)) {
        exploredSet.add(toNode.id);
        explored.push([toNode.data.lat, toNode.data.lng]);
      }

      const rule = applyVehicleRules(vType, link);
      // Returning false/0 from ngraph.path aStar is treated as zero cost, NOT blocked.
      // We must return a massive penalty so the pathfinder avoids flooded edges entirely.
      if (!rule.allowed) return Number.MAX_SAFE_INTEGER;
      return rule.cost;
    },
    heuristic(fromNode, toNode) {
      // Haversine-based heuristic for better A* performance
      const lat1 = fromNode.data.lat * Math.PI / 180;
      const lat2 = toNode.data.lat * Math.PI / 180;
      const dLat = lat2 - lat1;
      const dLng = (toNode.data.lng - fromNode.data.lng) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
      return 6371e3 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
  });

  const rawPath = pathfinder.find(startNode.id, endNode.id);
  
  let result;
  // If no path is found, rawPath is empty or null depending on ngraph version (usually an empty array)
  if (!rawPath || rawPath.length === 0) {
    result = { 
      path: [], 
      explored: explored, 
      distance: null, 
      pathFound: false 
    };
  } else {
    // ngraph returns the path from end to start, so we reverse it
    const route = rawPath.map(n => ({
      id: n.id,
      lat: n.data.lat,
      lng: n.data.lng
    })).reverse();
    
    // calculate total distance and verify no flooded edges
    let distance = 0;
    let hasFloodedEdge = false;
    for(let i = 0; i < route.length - 1; i++) {
      const link = graph.getLink(route[i].id, route[i+1].id);
      if(link && link.data) {
        if (link.data.distance) {
          distance += link.data.distance;
        }
        if (link.data.status === 'flooded') {
          hasFloodedEdge = true;
        }
      }
    }
    
    // Safety net: if path still crosses flooded edges, treat as no safe route
    if (hasFloodedEdge) {
      result = { 
        path: [], 
        explored: explored, 
        distance: null, 
        pathFound: false 
      };
    } else {
      result = { path: route, explored: explored, distance, pathFound: true };
    }
  }

  // --- Store in Cache ---
  if (redisClient.isReady && cacheKey) {
    try {
      // Cache for 1 hour
      await redisClient.setEx(cacheKey, 3600, JSON.stringify(result));
    } catch (err) {
      console.error('[Redis] Failed to save route to cache:', err);
    }
  }
  // ----------------------

  return result;
}
