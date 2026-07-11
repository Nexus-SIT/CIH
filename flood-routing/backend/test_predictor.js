// Quick test for all floodPredictor functions
// Run with: node test_predictor.js
// Kasargod sample coordinate: 12.4996, 74.9980

import dotenv from 'dotenv';
dotenv.config();

import { getRainfall, getSoilData, getElevation, getDistanceToRiver } from './src/engine/floodPredictor.js';

const TEST_CASES = [
  { name: "Inland Kasargod", lat: 12.5200, lng: 75.0400 },
  { name: "Kathmandu, Nepal (High Elevation)", lat: 27.7172, lng: 85.3240 },
  { name: "Manaus, Brazil (Amazon - Heavy Clay)", lat: -3.1190, lng: -60.0217 }
];

console.log(`\nTesting floodPredictor.js functions for multiple locations...\n`);

for (const { name, lat, lng } of TEST_CASES) {
  console.log('='.repeat(65));
  console.log(`📍 ${name} (${lat}, ${lng})`);
  
  const [rainfall, soil, elevation, riverDist] = await Promise.allSettled([
    getRainfall(lat, lng),
    getSoilData(lat, lng),
    getElevation(lat, lng),
    getDistanceToRiver(lat, lng),
  ]);

  console.log(`\n1. Rainfall (mm/hr):       ${rainfall.value ?? 'FAILED: ' + rainfall.reason}`);
  console.log(`2. Clay content (%):       ${soil.value ?? 'FAILED: ' + soil.reason}`);
  console.log(`3. Elevation (m):          ${elevation.value ?? 'FAILED: ' + elevation.reason}`);
  console.log(`4. River distance (m):     ${riverDist.value ?? 'FAILED: ' + riverDist.reason}\n`);
}
console.log('='.repeat(65));
