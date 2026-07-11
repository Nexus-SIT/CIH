import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file if present
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  wsPort: parseInt(process.env.WS_PORT || '8080', 10),
  dataFilePath: process.env.DATA_FILE_PATH || '../data/kasargod.osm.pbf',
  floodPenaltyMultiplier: parseInt(process.env.FLOOD_PENALTY_MULTIPLIER || '100', 10),
  searchRadiusMeters: parseInt(process.env.SEARCH_RADIUS_METERS || '500', 10),
};

export default config;
