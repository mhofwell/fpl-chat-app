// types/cache.ts

/**
 * Enum of standard cache keys for common FPL data types
 */
export enum CacheTypes {
    TEAMS = 'teams',
    PLAYERS = 'players',
    FIXTURES = 'fixtures',
    CURRENT_GAMEWEEK = 'current_gameweek',
    PLAYER_DETAIL = 'player_detail',
    GAMEWEEK_LIVE = 'gameweek_live',
}

/**
 * Interface for a cache item with value, timestamp, and TTL
 */
export interface CacheItem<T> {
    value: T;
    timestamp: number;
    ttl: number; // Time to live in milliseconds
}

/**
 * Base interface for cache operations
 */
export interface Cache {
    /**
     * Check if a key exists in the cache and is not expired
     * @param key The cache key to check
     */
    has(key: string): boolean;

    /**
     * Get a value from the cache
     * @param key The cache key to get
     * @returns The cached value or null if not found or expired
     */
    get<T>(key: string): T | null;

    /**
     * Set a value in the cache with optional TTL
     * @param key The cache key
     * @param value The value to cache
     * @param ttl Optional time to live in milliseconds
     */
    set<T>(key: string, value: T, ttl?: number): void;

    /**
     * Delete a key from the cache
     * @param key The cache key to delete
     */
    delete(key: string): void;

    /**
     * Clear all items from the cache
     */
    clear(): void;
}

/**
 * Extended interface for the cache store with internal storage
 */
export interface CacheStore extends Cache {
    /**
     * Internal map that stores cache items
     */
    cache: Map<string, CacheItem<any>>;
}

/**
 * Type for a function that fetches data for caching
 */
export type DataFetchFunction<T> = () => Promise<T>;

/**
 * Interface for the return value of a cache hook
 */
export interface CacheHookResult<T> {
    /**
     * Function to get data, either from cache or by fetching it
     */
    getData(): Promise<T>;
}
