import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisClient = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: false // Disable infinite retries if Redis isn't running locally
  }
});

redisClient.on('error', (err) => {
  if (err.code !== 'ECONNREFUSED') {
    console.log('Redis Client Error', err);
  }
});

// Connect automatically on import
(async () => {
  try {
    await redisClient.connect();
    console.log(`[Redis] Connected to ${redisUrl}`);
  } catch (err) {
    console.error('[Redis] Connection failed:', err);
  }
})();

/**
 * Increments the global graph version in Redis.
 * Used to invalidate the route cache when flood status changes.
 */
export async function incrementGraphVersion() {
  if (!redisClient.isReady) return;
  try {
    const version = await redisClient.incr('graph_version');
    console.log(`[Redis] Graph version incremented to ${version}`);
    return version;
  } catch (err) {
    console.error('[Redis] Failed to increment graph version:', err);
  }
}

/**
 * Gets the current global graph version.
 * If none exists, initializes to 1.
 */
export async function getGraphVersion() {
  if (!redisClient.isReady) return 1;
  try {
    let version = await redisClient.get('graph_version');
    if (!version) {
      await redisClient.set('graph_version', '1');
      version = '1';
    }
    return parseInt(version, 10);
  } catch (err) {
    console.error('[Redis] Failed to get graph version:', err);
    return Date.now(); // Fallback to current time to avoid serving stale cache
  }
}
