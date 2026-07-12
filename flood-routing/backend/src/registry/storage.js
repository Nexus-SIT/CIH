import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory fallback database
let db = {
  helpRequests: [],
  volunteerReports: [],
  responders: []
};

let useFirebase = false;

// Attempt to initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '..', '..', 'firebase-service-account.json');
const databaseUrl = process.env.FIREBASE_DATABASE_URL;

if (fs.existsSync(serviceAccountPath) && databaseUrl) {
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    
    initializeApp({
      credential: cert(serviceAccount),
      databaseURL: databaseUrl
    });
    
    useFirebase = true;
    console.log('\n======================================================');
    console.log('✅✅✅ SUCCESSFULLY CONNECTED TO FIREBASE CLOUD ✅✅✅');
    console.log(`📡 URL: ${databaseUrl}`);
    console.log('======================================================\n');
    
    // We would ideally set up listeners here to sync from Firebase to memory:
    // admin.database().ref('registry').on('value', (snapshot) => { ... })
    // For this quick implementation, we will push writes to Firebase, 
    // and rely on our local memory maps for reads.
  } catch (err) {
    console.error('[Storage] Error initializing Firebase:', err);
  }
} else {
  console.log('[Storage] Firebase credentials or FIREBASE_DATABASE_URL not found.');
  console.log('[Storage] Falling back to local file persistence (registry-db.json).');
  
  // Local JSON fallback logic
  const localDbPath = path.join(__dirname, '..', '..', 'registry-db.json');
  if (fs.existsSync(localDbPath)) {
    try {
      const data = fs.readFileSync(localDbPath, 'utf8');
      db = JSON.parse(data);
    } catch (err) {
      console.error('[Storage] Error reading registry-db.json', err);
    }
  }
}

export function getInitialData(collection) {
  return db[collection] || [];
}

export function persistData(collection, dataMap) {
  const dataArray = Array.from(dataMap.entries());
  
  if (useFirebase) {
    // Write to Firebase asynchronously (fire and forget)
    // Convert array of entries back to an object for Firebase
    const dataObj = {};
    for (const [key, value] of dataArray) {
      dataObj[key] = value;
    }
    
    getDatabase().ref(`registry/${collection}`).set(dataObj)
      .catch(err => console.error(`[Firebase] Error saving ${collection}:`, err));
  } else {
    // Write to local JSON fallback
    db[collection] = dataArray;
    const localDbPath = path.join(__dirname, '..', '..', 'registry-db.json');
    try {
      fs.writeFileSync(localDbPath, JSON.stringify(db, null, 2));
    } catch (err) {
      console.error('[Storage] Error writing registry-db.json', err);
    }
  }
}
