import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  wsPort: parseInt(process.env.WS_PORT || '8080', 10),
  dataFilePath: process.env.DATA_FILE_PATH
    ? path.resolve(__dirname, process.env.DATA_FILE_PATH)
    : path.resolve(__dirname, '../../data/map(2).osm'),  // ← fixed default: matches actual file, resolved from __dirname
  floodPenaltyMultiplier: parseInt(process.env.FLOOD_PENALTY_MULTIPLIER || '100', 10),
  searchRadiusMeters: parseInt(process.env.SEARCH_RADIUS_METERS || '500', 10),
  openWeatherApiKey: process.env.OPENWEATHER_API_KEY || '',
};

export default config;