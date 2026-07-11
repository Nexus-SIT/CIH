// Quick test for all floodPredictor functions
// Run with: node test_predictor.js
// Kasargod sample coordinate: 12.4996, 74.9980

import dotenv from 'dotenv';
dotenv.config();

import { getRainfall, getSoilData, getElevation, getDistanceToRiver } from './src/engine/floodPredictor.js';

const TEST_LAT = 12.4996;
const TEST_LNG = 74.9980;

console.log(`\nTesting floodPredictor.js functions for (${TEST_LAT}, ${TEST_LNG})\n`);
console.log('='.repeat(55));

const [rainfall, soil, elevation, riverDist] = await Promise.allSettled([
  getRainfall(TEST_LAT, TEST_LNG),
  getSoilData(TEST_LAT, TEST_LNG),
  getElevation(TEST_LAT, TEST_LNG),
  getDistanceToRiver(TEST_LAT, TEST_LNG),
]);

console.log(`\n1. Rainfall (mm/hr):       ${rainfall.value ?? 'FAILED: ' + rainfall.reason}`);
console.log(`2. Clay content (%):       ${soil.value ?? 'FAILED: ' + soil.reason}`);
console.log(`3. Elevation (m):          ${elevation.value ?? 'FAILED: ' + elevation.reason}`);
console.log(`4. River distance (m):     ${riverDist.value ?? 'FAILED: ' + riverDist.reason}`);
console.log('\n' + '='.repeat(55));
