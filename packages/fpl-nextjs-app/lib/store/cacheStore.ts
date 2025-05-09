// lib/stores/cacheStore.ts
import { create } from 'zustand';
import { Cache, CacheTypes } from '@/types/cache';

interface CacheItem<T> {
    value: T;
    timestamp: number;
    ttl: number; // Time to live in milliseconds
}

interface CacheStore extends Cache {
    cache: Map<string, CacheItem<any>>;
    has: (key: string) => boolean;
    get: <T>(key: string) => T | null;
    set: <T>(key: string, value: T, ttl?: number) => void;
    delete: (key: string) => void;
    clear: () => void;
}

// Default TTL: 5 minutes
const DEFAULT_TTL = 5 * 60 * 1000;

export const useCacheStore = create<CacheStore>((set, get) => ({
    cache: new Map<string, CacheItem<any>>(),

    has: (key: string) => {
        const cache = get().cache;

        if (!cache.has(key)) {
            return false;
        }

        const item = cache.get(key);
        if (!item) return false;

        // Check if the item is expired
        const now = Date.now();
        if (now - item.timestamp > item.ttl) {
            // Item is expired, remove it
            get().delete(key);
            return false;
        }

        return true;
    },

    get: <T>(key: string): T | null => {
        const cache = get().cache;

        if (!get().has(key)) {
            return null;
        }

        const item = cache.get(key);
        return item ? (item.value as T) : null;
    },

    set: <T>(key: string, value: T, ttl: number = DEFAULT_TTL): void => {
        const cache = get().cache;
        const item: CacheItem<T> = {
            value,
            timestamp: Date.now(),
            ttl,
        };

        set({ cache: new Map(cache.set(key, item)) });
    },

    delete: (key: string): void => {
        const cache = get().cache;
        cache.delete(key);
        set({ cache: new Map(cache) });
    },

    clear: (): void => {
        set({ cache: new Map() });
    },
}));

// Helper to create a custom hook for specific cache entries
export function createCacheHook<T>(
    cacheKey: string,
    fetchFn: () => Promise<T>,
    ttl?: number
) {
    return () => {
        const { has, get, set } = useCacheStore();

        const getData = async (): Promise<T> => {
            if (has(cacheKey)) {
                return get<T>(cacheKey)!;
            }

            try {
                const data = await fetchFn();
                set<T>(cacheKey, data, ttl);
                return data;
            } catch (error) {
                console.error(`Error fetching data for ${cacheKey}:`, error);
                throw error;
            }
        };

        return { getData };
    };
}

// Create specific hooks for common data types
export function createFplDataHooks(apiClient: any) {
    return {
        useTeams: createCacheHook(
            CacheTypes.TEAMS,
            () => apiClient.getTeams(),
            60 * 60 * 1000 // 1 hour TTL
        ),

        useCurrentGameweek: createCacheHook(
            CacheTypes.CURRENT_GAMEWEEK,
            () => apiClient.getCurrentGameweek(),
            15 * 60 * 1000 // 15 minutes TTL
        ),

        usePlayers: createCacheHook(
            CacheTypes.PLAYERS,
            () => apiClient.getPlayers(),
            30 * 60 * 1000 // 30 minutes TTL
        ),

        useFixtures: (gameweekId: number) => {
            const cacheKey = `${CacheTypes.FIXTURES}_GW_${gameweekId}`;
            const { getData } = createCacheHook(
                cacheKey,
                () => apiClient.getFixtures(gameweekId),
                30 * 60 * 1000 // 30 minutes TTL
            )();

            return { getData };
        },
    };
}
