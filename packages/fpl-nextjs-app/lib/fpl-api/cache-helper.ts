// lib/fpl-api/cache-helper.ts
import redis from '../redis/redis-client';
import { calculateTtl } from './client';

export async function fetchWithCache<T>(
    cacheKey: string,
    fetchFn: () => Promise<T>,
    ttlType: string
): Promise<T> {
    try {
        // Try to get from cache first
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
            return JSON.parse(cachedData) as T;
        }
    } catch (error) {
        console.warn(`Redis cache error for ${cacheKey}:`, error);
    }

    // Fetch fresh data
    try {
        const data = await fetchFn();

        // Store in cache
        try {
            const ttl = calculateTtl(ttlType);
            await redis.set(cacheKey, JSON.stringify(data), 'EX', ttl);
        } catch (cacheError) {
            console.warn(`Failed to cache data (${cacheKey}):`, cacheError);
        }

        return data;
    } catch (error) {
        console.error(`Error fetching data for ${cacheKey}:`, error);
        throw error;
    }
}
