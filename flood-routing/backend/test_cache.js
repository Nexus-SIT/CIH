// Tests caching behavior: second call should return instantly from cache
// Run with: node test_cache.js

import dotenv from 'dotenv';
dotenv.config();

import {
  getRainfall, getSoilData, getElevation, getDistanceToRiver,
  preFetchDemoPoints, getCacheStats
} from './src/engine/floodPredictor.js';

const POINTS = [
  { lat: 12.4996, lng: 74.9980 },
  { lat: 12.5050, lng: 75.0100 }
];

console.log('\n--- Test 1: preFetchDemoPoints ---');
await preFetchDemoPoints(POINTS);
console.log('Cache stats after pre-fetch:', getCacheStats());

console.log('\n--- Test 2: Same coord again (should hit cache, no HTTP calls) ---');
const t1 = Date.now();
const rainfall = await getRainfall(12.4996, 74.9980);
const elapsed = Date.now() - t1;
console.log(`Rainfall: ${rainfall} mm/hr  |  Elapsed: ${elapsed}ms  |  Cache hit if <5ms`);

console.log('\n--- Test 3: Slight coord variation (should still hit cache via rounding) ---');
// 12.49961 rounds to 12.4996 → same cache key
const t2 = Date.now();
const elevation = await getElevation(12.49961, 74.99801);
const elapsed2 = Date.now() - t2;
console.log(`Elevation: ${elevation}m  |  Elapsed: ${elapsed2}ms  |  Cache hit if <5ms`);

console.log('\n--- Final cache stats ---');
console.log(getCacheStats());
