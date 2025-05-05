import redis from '../redis/redis-client';

// Default TTL values
export const TTL = {
    BOOTSTRAP: 4 * 60 * 60, // 4 hours
    FIXTURES: 12 * 60 * 60, // 12 hours
    GAMEWEEK: 60 * 60, // 1 hour
    LIVE: 15 * 60, // 15 minutes
    PLAYER: 2 * 60 * 60, // 2 hours
};

/**
 * Fetch data from cache or use provided function to get and cache it
 */
export async function fetchWithCache<T>(
    cacheKey: string,
    fetchFn: () => Promise<T>,
    ttl: number = TTL.BOOTSTRAP
): Promise<T> {
    try {
        // Try to get from cache first
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
            console.log(`Cache hit for ${cacheKey}`);
            return JSON.parse(cachedData) as T;
        }

        console.log(`Cache miss for ${cacheKey}, fetching data...`);
    } catch (error) {
        console.warn(`Redis cache error for ${cacheKey}:`, error);
    }

    // Fetch fresh data
    try {
        const data = await fetchFn();

        // Store in cache
        try {
            await redis.set(cacheKey, JSON.stringify(data), 'EX', ttl);
            console.log(`Cached data for ${cacheKey} with TTL ${ttl}s`);
        } catch (cacheError) {
            console.warn(`Failed to cache data (${cacheKey}):`, cacheError);
        }

        return data;
    } catch (error) {
        console.error(`Error fetching data for ${cacheKey}:`, error);
        throw error;
    }
}

/**
 * Invalidate specific cache keys
 */
export async function invalidateCache(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
        await redis.del(...keys);
        console.log(`Invalidated cache keys: ${keys.join(', ')}`);
    } catch (error) {
        console.error('Error invalidating cache:', error);
    }
}

/**
 * Invalidate all keys matching a pattern
 */
export async function invalidatePattern(pattern: string): Promise<void> {
    try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
            await invalidateCache(keys);
        }
    } catch (error) {
        console.error(`Error invalidating pattern ${pattern}:`, error);
    }
}
