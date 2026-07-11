import { loadGraph } from './src/engine/graph.js';
import { updateFloodStatus } from './src/engine/reweight.js';
import { calculateRoute } from './src/engine/astar.js';
import config from './src/config.js';

async function runTest() {
  console.log("=========================================");
  console.log("       BACKEND A* ALGORITHM TESTER       ");
  console.log("=========================================\n");

  console.log("Loading graph from:", config.dataFilePath);
  console.time("Graph Load Time");
  await loadGraph(config.dataFilePath);
  console.timeEnd("Graph Load Time");
  
  // Example Kasargod Coordinates
  const startLat = 12.5015;
  const startLng = 74.9890;
  const endLat = 12.5100;
  const endLng = 75.0000;
  
  console.log(`\n--- Test 1: Calculate Route (Clear Map) ---`);
  console.log(`From: (${startLat}, ${startLng})`);
  console.log(`To:   (${endLat}, ${endLng})`);
  
  console.time("A* Execution Time (Clear)");
  const result1 = calculateRoute(startLat, startLng, endLat, endLng, 'standard');
  console.timeEnd("A* Execution Time (Clear)");
  
  console.log(`Path Found: ${result1.pathFound}`);
  console.log(`Nodes in Optimal Path: ${result1.path.length}`);
  console.log(`Total Route Distance: ${result1.distance ? result1.distance.toFixed(2) : 0} meters`);
  console.log(`Nodes Explored by A*: ${result1.explored.length}`);
  console.log(`\nRoute Array [lat, lng]:\n`, JSON.stringify(result1.path.map(n => [n.lat, n.lng])));

  console.log(`\n--- Test 2: Simulating Graph Update (Adding Flood Zone) ---`);
  // Add flood somewhere in the middle with a 400m radius
  const floodLat = 12.5050;
  const floodLng = 74.9950;
  const floodRadius = 400;
  console.log(`Flooding coordinate (${floodLat}, ${floodLng}) with radius ${floodRadius}m...`);
  
  console.time("Graph Update Time");
  const floodResult = updateFloodStatus(floodLat, floodLng, floodRadius, 'flooded', 'manual');
  console.timeEnd("Graph Update Time");
  console.log(`Graph edges marked as flooded: ${floodResult.updated.length}`);

  console.log(`\n--- Test 3: Calculate Route (With Flood Obstacle) ---`);
  console.time("A* Execution Time (Flooded)");
  const result2 = calculateRoute(startLat, startLng, endLat, endLng, 'standard');
  console.timeEnd("A* Execution Time (Flooded)");
  
  console.log(`Path Found: ${result2.pathFound}`);
  if (result2.pathFound) {
    console.log(`Nodes in Optimal Path: ${result2.path.length}`);
    console.log(`Total Route Distance: ${result2.distance.toFixed(2)} meters`);
    console.log(`Nodes Explored by A*: ${result2.explored.length}`);
    console.log(`\nDetour Route Array [lat, lng]:\n`, JSON.stringify(result2.path.map(n => [n.lat, n.lng])));
    
    // Output comparison
    if (result1.distance && result2.distance) {
      console.log(`\n--- A* Algorithm Impact Analysis ---`);
      console.log(`Extra distance driven to avoid flood: +${(result2.distance - result1.distance).toFixed(2)} meters`);
      console.log(`Extra nodes evaluated by A* to find detour: +${result2.explored.length - result1.explored.length}`);
    }
  } else {
    console.log("No safe route available around the flood zone!");
    console.log(`Nodes Explored by A* before giving up: ${result2.explored.length}`);
  }

  console.log("\n=========================================");
  console.log("               TEST COMPLETE               ");
  console.log("=========================================\n");
}

runTest().catch(console.error);
