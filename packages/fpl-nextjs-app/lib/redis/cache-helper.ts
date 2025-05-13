import redis from './redis-client';
import { fplMemoryCache, memoryCacheUtils } from './memory-cache';

// Default TTL values
export const TTL = {
    BOOTSTRAP: 4 * 60 * 60, // 4 hours
    FIXTURES: 12 * 60 * 60, // 12 hours
    GAMEWEEK: 60 * 60, // 1 hour
    LIVE: 15 * 60, // 15 minutes
    PLAYER: 2 * 60 * 60, // 2 hours
};

/**
 * Convert a string TTL identifier to its numeric value in seconds
 * @param ttlType String identifier for the TTL type
 * @returns TTL value in seconds
 */
export function getTtlValue(ttlType: string | number): number {
    if (typeof ttlType === 'number') {
        return ttlType; // Already a number, just return it
    }
    
    // Map string identifiers to TTL values
    switch (ttlType) {
        case 'bootstrap-static':
            return TTL.BOOTSTRAP;
        case 'fixtures':
            return TTL.FIXTURES;
        case 'gameweek':
        case 'events':
            return TTL.GAMEWEEK;
        case 'live':
            return TTL.LIVE;
        case 'player-detail':
            return TTL.PLAYER;
        default:
            console.warn(`Unknown TTL type: ${ttlType}, using default BOOTSTRAP TTL`);
            return TTL.BOOTSTRAP;
    }
}

// Configure memory cache usage
const MEMORY_CACHE_ENABLED = process.env.MEMORY_CACHE_ENABLED !== 'false'; // Enabled by default
const MEMORY_CACHE_TTL_FACTOR = 0.8; // Memory cache TTL is 80% of Redis TTL to avoid edge cases

// Type for batch fetch options
export interface BatchFetchOptions {
    useParallel?: boolean; // Whether to use Promise.all for parallel fetches
    continueOnError?: boolean; // Whether to continue when individual items fail
    logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'none'; // Control logging verbosity
}

/**
 * Fetch data from cache or use provided function to get and cache it
 * Uses memory cache first, then Redis, then falls back to fetch function
 */
export async function fetchWithCache<T>(
    cacheKey: string,
    fetchFn: () => Promise<T>,
    ttl: number | string = TTL.BOOTSTRAP
): Promise<T> {
    // Convert string TTL to numeric value if needed
    const ttlSeconds = getTtlValue(ttl);
    // Try memory cache first if enabled
    if (MEMORY_CACHE_ENABLED) {
        const memoryResult = fplMemoryCache.get<T>(cacheKey);
        if (memoryResult !== undefined) {
            console.log(`Memory cache hit for ${cacheKey}`);
            return memoryResult;
        }
    }
    
    // Try Redis cache
    try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
            try {
                const parsed = JSON.parse(cachedData) as T;
                console.log(`Redis cache hit for ${cacheKey}`);
                
                // Store in memory cache for future requests if enabled
                if (MEMORY_CACHE_ENABLED) {
                    const memoryTtl = Math.floor(ttlSeconds * MEMORY_CACHE_TTL_FACTOR * 1000); // Convert to ms and apply factor
                    fplMemoryCache.set(cacheKey, parsed, memoryTtl);
                }
                
                return parsed;
            } catch (parseError) {
                console.warn(`Error parsing cached data for ${cacheKey}:`, parseError);
                // Continue to fetch if parse error
            }
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
            // Store in Redis
            await redis.set(cacheKey, JSON.stringify(data), 'EX', ttlSeconds);
            console.log(`Cached data for ${cacheKey} with TTL ${ttlSeconds}s`);
            
            // Store in memory cache if enabled
            if (MEMORY_CACHE_ENABLED) {
                const memoryTtl = Math.floor(ttlSeconds * MEMORY_CACHE_TTL_FACTOR * 1000); // Convert to ms and apply factor
                fplMemoryCache.set(cacheKey, data, memoryTtl);
            }
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
 * Batch fetch data from Redis cache
 * 
 * This function allows batch fetching of multiple keys in a single Redis roundtrip,
 * and optionally fetches and caches missing items in parallel using Promise.all.
 * 
 * @param items Array of items to fetch, each with a cacheKey and fetchFn
 * @param ttl TTL for cache entries (seconds)
 * @param options Options for batch fetch behavior
 * @returns Array of fetched items in the same order as provided
 */
export async function batchFetchWithCache<T>(
    items: Array<{
        cacheKey: string;
        fetchFn: () => Promise<T>;
    }>,
    ttl: number | string = TTL.BOOTSTRAP,
    options: BatchFetchOptions = {}
): Promise<T[]> {
    // Convert string TTL to numeric value if needed
    const ttlSeconds = getTtlValue(ttl);
    const {
        useParallel = true,
        continueOnError = false,
        logLevel = 'info'
    } = options;

    const logger = {
        debug: (msg: string) => logLevel === 'debug' && console.log(msg),
        info: (msg: string) => ['debug', 'info'].includes(logLevel) && console.log(msg),
        warn: (msg: string) => ['debug', 'info', 'warn'].includes(logLevel) && console.warn(msg),
        error: (msg: string) => logLevel !== 'none' && console.error(msg)
    };

    if (items.length === 0) return [];

    // Extract all cache keys
    const cacheKeys = items.map(item => item.cacheKey);
    
    // First check memory cache if enabled
    const memoryResults: (T | undefined)[] = new Array(items.length).fill(undefined);
    let memoryHits = 0;
    
    if (MEMORY_CACHE_ENABLED) {
        for (let i = 0; i < items.length; i++) {
            const memoryResult = fplMemoryCache.get<T>(items[i].cacheKey);
            if (memoryResult !== undefined) {
                memoryResults[i] = memoryResult;
                memoryHits++;
            }
        }
        
        if (memoryHits > 0) {
            logger.debug(`Memory cache hit for ${memoryHits} out of ${items.length} keys`);
        }
    }
    
    // Determine which keys we still need to fetch from Redis
    const redisKeyIndices: number[] = [];
    const redisKeys: string[] = [];
    
    for (let i = 0; i < items.length; i++) {
        if (memoryResults[i] === undefined) {
            redisKeyIndices.push(i);
            redisKeys.push(items[i].cacheKey);
        }
    }
    
    // If everything was in memory cache, return immediately
    if (redisKeys.length === 0) {
        logger.info(`All ${items.length} items were in memory cache, returning immediately`);
        return memoryResults as T[];
    }
    
    // Batch fetch remaining keys from Redis
    logger.debug(`Batch fetching ${redisKeys.length} keys from Redis`);
    
    let redisResults: (string | null)[] = [];
    try {
        if (redisKeys.length > 0) {
            redisResults = await redis.mget(...redisKeys);
        }
    } catch (error) {
        logger.error(`Error batch fetching from Redis: ${error}`);
        // Fall back to empty results
        redisResults = new Array(redisKeys.length).fill(null);
    }

    // Process results and identify items we need to fetch
    const fetchTasks: {
        index: number;
        cacheKey: string;
        fetchFn: () => Promise<T>;
    }[] = [];

    const results: (T | Error)[] = memoryResults.slice();

    // Second pass: process Redis results
    for (let i = 0; i < redisKeyIndices.length; i++) {
        const originalIndex = redisKeyIndices[i];
        const cachedData = redisResults[i];
        
        if (cachedData) {
            try {
                results[originalIndex] = JSON.parse(cachedData) as T;
                logger.debug(`Redis cache hit for ${items[originalIndex].cacheKey}`);
                
                // Add to memory cache if enabled
                if (MEMORY_CACHE_ENABLED) {
                    const memoryTtl = Math.floor(ttlSeconds * MEMORY_CACHE_TTL_FACTOR * 1000);
                    fplMemoryCache.set(items[originalIndex].cacheKey, results[originalIndex], memoryTtl);
                }
            } catch (error) {
                logger.warn(`Error parsing cache for ${items[originalIndex].cacheKey}: ${error}`);
                // Add to fetch queue if parsing failed
                fetchTasks.push({
                    index: originalIndex,
                    cacheKey: items[originalIndex].cacheKey,
                    fetchFn: items[originalIndex].fetchFn
                });
            }
        } else {
            // Not in cache, need to fetch
            logger.debug(`Cache miss for ${items[originalIndex].cacheKey}`);
            fetchTasks.push({
                index: originalIndex,
                cacheKey: items[originalIndex].cacheKey,
                fetchFn: items[originalIndex].fetchFn
            });
        }
    }

    // If everything was cached, return immediately
    if (fetchTasks.length === 0) {
        logger.info(`All ${items.length} items were cached, returning immediately`);
        return results as T[];
    }

    logger.info(`Fetching ${fetchTasks.length} missing items out of ${items.length} total`);

    // Second pass: fetch missing items
    if (useParallel) {
        // Fetch all missing items in parallel
        await Promise.all(
            fetchTasks.map(async task => {
                try {
                    const data = await task.fetchFn();
                    results[task.index] = data;

                    // Cache the result in Redis
                    try {
                        await redis.set(task.cacheKey, JSON.stringify(data), 'EX', ttlSeconds);
                        logger.debug(`Cached data for ${task.cacheKey} in Redis (TTL: ${ttlSeconds}s)`);
                        
                        // Also cache in memory if enabled
                        if (MEMORY_CACHE_ENABLED) {
                            const memoryTtl = Math.floor(ttlSeconds * MEMORY_CACHE_TTL_FACTOR * 1000);
                            fplMemoryCache.set(task.cacheKey, data, memoryTtl);
                            logger.debug(`Cached data for ${task.cacheKey} in memory (TTL: ${memoryTtl}ms)`);
                        }
                    } catch (cacheError) {
                        logger.warn(`Failed to cache data for ${task.cacheKey}: ${cacheError}`);
                    }
                } catch (error) {
                    logger.error(`Error fetching data for ${task.cacheKey}: ${error}`);
                    if (continueOnError) {
                        results[task.index] = error as Error;
                    } else {
                        throw error;
                    }
                }
            })
        );
    } else {
        // Fetch items sequentially
        for (const task of fetchTasks) {
            try {
                const data = await task.fetchFn();
                results[task.index] = data;

                // Cache the result in Redis
                try {
                    await redis.set(task.cacheKey, JSON.stringify(data), 'EX', ttlSeconds);
                    logger.debug(`Cached data for ${task.cacheKey} in Redis (TTL: ${ttlSeconds}s)`);
                    
                    // Also cache in memory if enabled
                    if (MEMORY_CACHE_ENABLED) {
                        const memoryTtl = Math.floor(ttlSeconds * MEMORY_CACHE_TTL_FACTOR * 1000);
                        fplMemoryCache.set(task.cacheKey, data, memoryTtl);
                        logger.debug(`Cached data for ${task.cacheKey} in memory (TTL: ${memoryTtl}ms)`);
                    }
                } catch (cacheError) {
                    logger.warn(`Failed to cache data for ${task.cacheKey}: ${cacheError}`);
                }
            } catch (error) {
                logger.error(`Error fetching data for ${task.cacheKey}: ${error}`);
                if (continueOnError) {
                    results[task.index] = error as Error;
                } else {
                    throw error;
                }
            }
        }
    }

    // Check if any entries are errors and we're not continuing on error
    if (!continueOnError) {
        const errorEntries = results.filter(r => r instanceof Error);
        if (errorEntries.length > 0) {
            throw new Error(`Failed to fetch ${errorEntries.length} items`);
        }
    }

    return results as T[];
}

/**
 * Batch set multiple key-value pairs in Redis and memory cache
 * @param items Array of key-value pairs to cache
 * @param ttl TTL for cache entries (seconds)
 */
export async function batchCacheSet<T>(
    items: Array<{
        cacheKey: string;
        data: T;
    }>,
    ttl: number | string = TTL.BOOTSTRAP
): Promise<void> {
    // Convert string TTL to numeric value if needed
    const ttlSeconds = getTtlValue(ttl);
    if (items.length === 0) return;

    // Use Redis pipeline for better performance
    const pipeline = redis.pipeline();
    
    for (const item of items) {
        pipeline.set(item.cacheKey, JSON.stringify(item.data), 'EX', ttlSeconds);
        
        // Also store in memory cache if enabled
        if (MEMORY_CACHE_ENABLED) {
            const memoryTtl = Math.floor(ttlSeconds * MEMORY_CACHE_TTL_FACTOR * 1000);
            fplMemoryCache.set(item.cacheKey, item.data, memoryTtl);
        }
    }
    
    try {
        await pipeline.exec();
        console.log(`Batch cached ${items.length} items with TTL ${ttlSeconds}s`);
    } catch (error) {
        console.error('Error batch caching data in Redis:', error);
    }
}

/**
 * Invalidate specific cache keys from both Redis and memory cache
 */
export async function invalidateCache(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    
    try {
        // Invalidate in Redis
        await redis.del(...keys);
        console.log(`Invalidated ${keys.length} keys from Redis`);
        
        // Also invalidate in memory cache if enabled
        if (MEMORY_CACHE_ENABLED) {
            for (const key of keys) {
                fplMemoryCache.delete(key);
            }
            console.log(`Invalidated ${keys.length} keys from memory cache`);
        }
    } catch (error) {
        console.error('Error invalidating cache:', error);
    }
}

/**
 * Invalidate all keys matching a pattern from both Redis and memory cache
 */
export async function invalidatePattern(pattern: string): Promise<void> {
    try {
        // Find matching keys in Redis
        const keys = await redis.keys(pattern);
        
        if (keys.length > 0) {
            // Invalidate in Redis
            await redis.del(...keys);
            console.log(`Invalidated ${keys.length} keys matching pattern '${pattern}' from Redis`);
        }
        
        // Also invalidate in memory cache if enabled
        if (MEMORY_CACHE_ENABLED) {
            const deletedCount = fplMemoryCache.deletePattern(pattern);
            if (deletedCount > 0) {
                console.log(`Invalidated ${deletedCount} keys matching pattern '${pattern}' from memory cache`);
            }
        }
    } catch (error) {
        console.error(`Error invalidating pattern ${pattern}:`, error);
    }
}
