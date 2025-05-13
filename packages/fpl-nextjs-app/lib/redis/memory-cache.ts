/**
 * In-memory cache module that serves as a fast local cache layer before hitting Redis
 * 
 * This helps to reduce Redis calls for frequently accessed data that doesn't
 * change often, especially during high traffic periods.
 * 
 * Features:
 * - TTL-based expiration similar to Redis
 * - Memory-usage limits with LRU eviction policy
 * - Size restrictions to avoid memory leaks
 * - Type-safe API
 */

// Configuration
const DEFAULT_OPTIONS = {
    ttl: 60000, // 1 minute in milliseconds
    maxEntries: 1000, // Maximum number of entries before LRU eviction
    maxMemoryMB: 100, // Approximate maximum memory usage
};

// Type for cache entry
interface CacheEntry<T> {
    data: T;
    expiry: number; // Timestamp when this entry expires
    lastAccessed: number; // For LRU eviction
    size: number; // Approximate byte size
}

// Type for memory cache options
export interface MemoryCacheOptions {
    ttl?: number; // TTL in milliseconds
    maxEntries?: number; // Maximum number of entries
    maxMemoryMB?: number; // Maximum memory usage in MB
    namespace?: string; // Optional namespace for keys
    debug?: boolean; // Enable debug logging
}

/**
 * Estimate the size of an object in bytes
 * This is an approximation and not 100% accurate
 */
function estimateObjectSize(obj: any): number {
    const stringify = JSON.stringify(obj);
    
    // Each character in a string is 2 bytes in JS
    const jsonSize = stringify.length * 2;
    
    // Add overhead for object properties and structure
    return jsonSize + 48; // Add approximate overhead
}

/**
 * In-memory cache class with TTL and LRU eviction
 */
export class MemoryCache {
    private cache: Map<string, CacheEntry<any>>;
    private options: Required<Omit<MemoryCacheOptions, 'namespace' | 'debug'>>;
    private currentSize: number;
    private namespace: string;
    private debug: boolean;
    
    constructor(options: MemoryCacheOptions = {}) {
        this.options = {
            ttl: options.ttl ?? DEFAULT_OPTIONS.ttl,
            maxEntries: options.maxEntries ?? DEFAULT_OPTIONS.maxEntries,
            maxMemoryMB: options.maxMemoryMB ?? DEFAULT_OPTIONS.maxMemoryMB,
        };
        
        this.cache = new Map();
        this.currentSize = 0;
        this.namespace = options.namespace ?? '';
        this.debug = options.debug ?? false;
        
        // Set up periodic cleanup to avoid memory leaks
        setInterval(() => this.cleanupExpiredEntries(), 60000); // Run every minute
    }
    
    /**
     * Set a value in the cache with an optional TTL
     */
    set<T>(key: string, value: T, ttl?: number): void {
        const cacheKey = this.getNamespacedKey(key);
        const now = Date.now();
        const size = estimateObjectSize(value);
        
        // Check if we have an existing entry to update
        const existingEntry = this.cache.get(cacheKey);
        if (existingEntry) {
            // Update current size tracking
            this.currentSize -= existingEntry.size;
        }
        
        // Create new entry
        const entry: CacheEntry<T> = {
            data: value,
            expiry: now + (ttl ?? this.options.ttl),
            lastAccessed: now,
            size,
        };
        
        // Check if adding this would exceed memory limits
        if (this.currentSize + size > this.options.maxMemoryMB * 1024 * 1024) {
            this.evictEntries(size);
        }
        
        // Check if we're at max entries limit
        if (!existingEntry && this.cache.size >= this.options.maxEntries) {
            this.evictLRU();
        }
        
        // Add to cache and update size tracking
        this.cache.set(cacheKey, entry);
        this.currentSize += size;
        
        if (this.debug) {
            console.log(`[MemoryCache] Set key: ${cacheKey}, size: ${size} bytes, expires: ${new Date(entry.expiry).toISOString()}`);
            console.log(`[MemoryCache] Current cache stats: ${this.cache.size} entries, ~${Math.round(this.currentSize / 1024)} KB used`);
        }
    }
    
    /**
     * Get a value from the cache, returns undefined if not found or expired
     */
    get<T>(key: string): T | undefined {
        const cacheKey = this.getNamespacedKey(key);
        const entry = this.cache.get(cacheKey) as CacheEntry<T> | undefined;
        
        // Not in cache
        if (!entry) {
            if (this.debug) console.log(`[MemoryCache] Miss for key: ${cacheKey}`);
            return undefined;
        }
        
        // Expired entry
        const now = Date.now();
        if (entry.expiry < now) {
            if (this.debug) console.log(`[MemoryCache] Expired entry for key: ${cacheKey}`);
            this.cache.delete(cacheKey);
            this.currentSize -= entry.size;
            return undefined;
        }
        
        // Update last accessed time for LRU
        entry.lastAccessed = now;
        
        if (this.debug) console.log(`[MemoryCache] Hit for key: ${cacheKey}`);
        return entry.data;
    }
    
    /**
     * Check if a key exists and is not expired
     */
    has(key: string): boolean {
        const cacheKey = this.getNamespacedKey(key);
        const entry = this.cache.get(cacheKey);
        
        if (!entry) return false;
        
        // Check if expired
        if (entry.expiry < Date.now()) {
            this.cache.delete(cacheKey);
            this.currentSize -= entry.size;
            return false;
        }
        
        return true;
    }
    
    /**
     * Delete a key from the cache
     */
    delete(key: string): boolean {
        const cacheKey = this.getNamespacedKey(key);
        const entry = this.cache.get(cacheKey);
        
        if (!entry) return false;
        
        this.cache.delete(cacheKey);
        this.currentSize -= entry.size;
        
        if (this.debug) console.log(`[MemoryCache] Deleted key: ${cacheKey}`);
        return true;
    }
    
    /**
     * Clear the entire cache
     */
    clear(): void {
        this.cache.clear();
        this.currentSize = 0;
        if (this.debug) console.log('[MemoryCache] Cache cleared');
    }
    
    /**
     * Delete all keys matching a pattern (using simple wildcard matching)
     */
    deletePattern(pattern: string): number {
        const regex = new RegExp(pattern.replace('*', '.*'));
        let count = 0;
        
        for (const key of this.cache.keys()) {
            // Remove namespace prefix for pattern matching
            const rawKey = this.namespace ? key.substring(this.namespace.length + 1) : key;
            
            if (regex.test(rawKey)) {
                const entry = this.cache.get(key);
                if (entry) {
                    this.cache.delete(key);
                    this.currentSize -= entry.size;
                    count++;
                }
            }
        }
        
        if (this.debug && count > 0) console.log(`[MemoryCache] Deleted ${count} keys matching pattern: ${pattern}`);
        return count;
    }
    
    /**
     * Get cache stats
     */
    stats() {
        return {
            entries: this.cache.size,
            sizeBytes: this.currentSize,
            sizeKB: Math.round(this.currentSize / 1024),
            sizeMB: Math.round(this.currentSize / (1024 * 1024) * 100) / 100,
            maxEntries: this.options.maxEntries,
            maxSizeMB: this.options.maxMemoryMB,
        };
    }
    
    /**
     * Helper to create namespaced keys
     */
    private getNamespacedKey(key: string): string {
        return this.namespace ? `${this.namespace}:${key}` : key;
    }
    
    /**
     * Remove expired entries from cache
     */
    private cleanupExpiredEntries(): number {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [key, entry] of this.cache.entries()) {
            if (entry.expiry < now) {
                this.cache.delete(key);
                this.currentSize -= entry.size;
                cleaned++;
            }
        }
        
        if (this.debug && cleaned > 0) {
            console.log(`[MemoryCache] Cleaned up ${cleaned} expired entries`);
        }
        
        return cleaned;
    }
    
    /**
     * Evict entries to make space for new ones
     */
    private evictEntries(sizeNeeded: number): number {
        const entries = Array.from(this.cache.entries())
            .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
        
        let freedSpace = 0;
        let evicted = 0;
        
        for (const [key, entry] of entries) {
            if (freedSpace >= sizeNeeded) break;
            
            this.cache.delete(key);
            freedSpace += entry.size;
            this.currentSize -= entry.size;
            evicted++;
        }
        
        if (this.debug) {
            console.log(`[MemoryCache] Evicted ${evicted} entries to free ~${Math.round(freedSpace / 1024)} KB`);
        }
        
        return evicted;
    }
    
    /**
     * Evict the least recently used entry
     */
    private evictLRU(): boolean {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        let oldestSize = 0;
        
        for (const [key, entry] of this.cache.entries()) {
            if (entry.lastAccessed < oldestTime) {
                oldestTime = entry.lastAccessed;
                oldestKey = key;
                oldestSize = entry.size;
            }
        }
        
        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.currentSize -= oldestSize;
            
            if (this.debug) {
                console.log(`[MemoryCache] LRU eviction for key: ${oldestKey}`);
            }
            
            return true;
        }
        
        return false;
    }
}

// Create a default memory cache instance with multiple namespaces
export const defaultMemoryCache = new MemoryCache({
    ttl: 60000, // 1 minute default
    maxEntries: 2000,
    maxMemoryMB: 50,
    debug: process.env.DEBUG_MEMORY_CACHE === 'true',
});

// FPL-specific memory cache with longer TTL for stable data
export const fplMemoryCache = new MemoryCache({
    ttl: 5 * 60000, // 5 minutes default
    maxEntries: 5000,
    maxMemoryMB: 100,
    namespace: 'fpl',
    debug: process.env.DEBUG_MEMORY_CACHE === 'true',
});

// Export utility functions that match Redis interface for easy swapping
export const memoryCacheUtils = {
    /**
     * Get a value with memory cache first, then fallback to Redis
     */
    async getWithMemoryCache<T>(
        key: string,
        redisGet: (key: string) => Promise<string | null>
    ): Promise<T | null> {
        // Try memory cache first
        const memoryResult = fplMemoryCache.get<T>(key);
        if (memoryResult !== undefined) {
            return memoryResult;
        }
        
        // Fall back to Redis
        const redisResult = await redisGet(key);
        if (redisResult === null) return null;
        
        try {
            const parsed = JSON.parse(redisResult) as T;
            
            // Add to memory cache
            fplMemoryCache.set(key, parsed);
            
            return parsed;
        } catch (e) {
            console.warn(`Error parsing Redis result for ${key}:`, e);
            return null;
        }
    },
    
    /**
     * Set a value in both memory cache and Redis
     */
    async setWithMemoryCache<T>(
        key: string,
        value: T,
        redisSet: (key: string, value: string, mode: string, duration: number) => Promise<string>,
        ttl: number
    ): Promise<void> {
        // Set in memory cache (use a slightly shorter TTL to avoid edge cases)
        const memoryTtl = Math.min(ttl * 1000, 30 * 60000); // Cap at 30 minutes for memory
        fplMemoryCache.set(key, value, memoryTtl);
        
        // Set in Redis
        await redisSet(key, JSON.stringify(value), 'EX', ttl);
    },
    
    /**
     * Delete a key from both memory cache and Redis
     */
    async deleteWithMemoryCache(
        key: string,
        redisDelete: (key: string) => Promise<number>
    ): Promise<void> {
        // Delete from memory cache
        fplMemoryCache.delete(key);
        
        // Delete from Redis
        await redisDelete(key);
    },
    
    /**
     * Delete keys matching a pattern from both memory cache and Redis
     */
    async deletePatternWithMemoryCache(
        pattern: string,
        redisDeletePattern: (pattern: string) => Promise<void>
    ): Promise<void> {
        // Delete from memory cache
        fplMemoryCache.deletePattern(pattern);
        
        // Delete from Redis
        await redisDeletePattern(pattern);
    },
};