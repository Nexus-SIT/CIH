import fs from 'fs';
import path from 'path';
import { Transform } from 'stream';
import createGraph from 'ngraph.graph';
import parse from 'osm-pbf-parser';
import sax from 'sax';
import config from '../config.js';

let graph = null;
let nodeCoordinates = new Map(); // Temporary map for parsing
let riverNodes = []; // Store river/waterway node coordinates

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

function addWayToGraph(refs, tags, wayId) {
  if (tags && tags.highway && refs && refs.length > 1) {
    for (let i = 0; i < refs.length; i++) {
      const nodeId = refs[i];
      const coords = nodeCoordinates.get(nodeId);
      
      if (coords && !graph.getNode(nodeId)) {
        graph.addNode(nodeId, {
          id: nodeId,
          lat: coords.lat,
          lng: coords.lon,
        });
      }
      
      if (i > 0) {
        const prevId = refs[i - 1];
        const prevCoords = nodeCoordinates.get(prevId);
        if (coords && prevCoords) {
          const dist = calculateDistance(
            prevCoords.lat, prevCoords.lon,
            coords.lat, coords.lon
          );
          const oneway = tags.oneway === 'yes';
          
          graph.addLink(prevId, nodeId, { distance: dist, weight: dist, status: 'clear', source: null, wayId });
          if (!oneway) {
            graph.addLink(nodeId, prevId, { distance: dist, weight: dist, status: 'clear', source: null, wayId });
          }
        }
      }
    }
  }

  // Parse waterways/water body nodes to compute distance to river
  if (tags && (tags.waterway || tags.water || tags.natural === 'water') && refs) {
    for (const nodeId of refs) {
      const coords = nodeCoordinates.get(nodeId);
      if (coords) {
        riverNodes.push({
          id: nodeId,
          lat: coords.lat,
          lng: coords.lon
        });
      }
    }
  }
}

export async function loadGraph(filePath) {
  return new Promise((resolve, reject) => {
    graph = createGraph();
    riverNodes = []; // Reset river nodes
    const resolvedPath = path.resolve(filePath);

    if (!fs.existsSync(resolvedPath)) {
      return reject(new Error(`File not found at ${resolvedPath}`));
    }

    if (resolvedPath.endsWith('.osm')) {
      // XML Parser for .osm
      const stream = fs.createReadStream(resolvedPath);
      const saxStream = sax.createStream(true);
      
      let currentWayRefs = [];
      let currentWayTags = {};
      let currentWayId = null;
      let isNode = false;
      let isWay = false;

      saxStream.on('opentag', (node) => {
        if (node.name === 'node') {
          isNode = true;
          nodeCoordinates.set(node.attributes.id, {
            lat: parseFloat(node.attributes.lat),
            lon: parseFloat(node.attributes.lon)
          });
        } else if (node.name === 'way') {
          isWay = true;
          currentWayId = node.attributes.id;
          currentWayRefs = [];
          currentWayTags = {};
        } else if (isWay && node.name === 'nd') {
          currentWayRefs.push(node.attributes.ref);
        } else if (isWay && node.name === 'tag') {
          currentWayTags[node.attributes.k] = node.attributes.v;
        }
      });

      saxStream.on('closetag', (nodeName) => {
        if (nodeName === 'node') isNode = false;
        if (nodeName === 'way') {
          isWay = false;
          addWayToGraph(currentWayRefs, currentWayTags, currentWayId);
        }
      });

      saxStream.on('end', () => {
        nodeCoordinates.clear();
        console.log(`Graph built from XML! Nodes: ${graph.getNodesCount()}, Edges: ${graph.getLinksCount()}`);
        resolve(graph);
      });

      saxStream.on('error', (err) => reject(err));
      stream.pipe(saxStream);
    } else {
      // PBF Parser
      const osm = parse();
      const transform = new Transform({
        objectMode: true,
        transform: (items, enc, next) => {
          for (const item of items) {
            if (item.type === 'node') {
              nodeCoordinates.set(item.id, { lat: item.lat, lon: item.lon });
            } else if (item.type === 'way') {
              addWayToGraph(item.refs, item.tags, item.id);
            }
          }
          next();
        },
      });

      fs.createReadStream(resolvedPath)
        .pipe(osm)
        .pipe(transform)
        .on('finish', () => {
          nodeCoordinates.clear();
          console.log(`Graph built from PBF! Nodes: ${graph.getNodesCount()}, Edges: ${graph.getLinksCount()}`);
          resolve(graph);
        })
        .on('error', (err) => reject(err));
    }
  });
}

export function getGraph() {
  return graph;
}

export function getRiverNodes() {
  return riverNodes;
}

let graphBoundsCache = null;

export function getGraphBoundingBox() {
  if (graphBoundsCache) return graphBoundsCache;
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

export function findNearestNode(lat, lng) {
  if (!graph) throw new Error('Graph is not loaded');

  let nearestNode = null;
  let minDistance = Infinity;

  graph.forEachNode((node) => {
    const dist = calculateDistance(lat, lng, node.data.lat, node.data.lng);
    if (dist < minDistance) {
      minDistance = dist;
      nearestNode = node;
    }
  });

  if (!nearestNode) return null;
  
  return {
    id: nearestNode.id,
    ...nearestNode.data,
    distanceToPoint: minDistance
  };
}

export function getAllNodesAndEdges() {
  if (!graph) throw new Error('Graph is not loaded');

  const nodes = [];
  const edges = [];

  graph.forEachNode((node) => {
    nodes.push(node.data);
  });

  graph.forEachLink((link) => {
    edges.push({
      fromId: link.fromId,
      toId: link.toId,
      ...link.data
    });
  });

  return { nodes, edges };
}
