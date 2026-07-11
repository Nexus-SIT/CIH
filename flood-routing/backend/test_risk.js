// Test predictFloodRisk combining function
// Run with: node test_risk.js

import dotenv from 'dotenv';
dotenv.config();

import { predictFloodRisk } from './src/engine/floodPredictor.js';

const TEST_CASES = [
  { label: 'Kasargod centre (low-lying, coastal)', lat: 12.4996, lng: 74.9980 },
  { label: 'Higher elevation inland point',         lat: 12.5200, lng: 75.0400 },
];

for (const { label, lat, lng } of TEST_CASES) {
  console.log(`\n📍 ${label} (${lat}, ${lng})`);
  const result = await predictFloodRisk(lat, lng);
  console.log(`   riskScore : ${result.riskScore}`);
  console.log(`   riskLevel : ${result.riskLevel}`);
  console.log(`   factors   :`, result.factors);
}
