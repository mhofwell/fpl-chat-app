// lib/fpl-api/cache-manager-mvp.ts

import redis from '@/lib/redis/redis-client';
import { CacheTTL } from '@/types/fpl-mvp';
import { fplApiClient } from './fpl-api-client-mvp';

// Cache TTL configuration
export const CACHE_TTL: CacheTTL = {
  LIVE_MATCH: {
    fixtures: 15 * 60,        // 15 minutes
    live_gameweek: 15 * 60,   // 15 minutes
    player_stats: 15 * 60     // 15 minutes
  },
  REGULAR: {
    bootstrap_static: 60 * 60,    // 1 hour
    fixtures: 60 * 60,            // 1 hour
    player_details: 24 * 60 * 60, // 24 hours
    team_stats: 60 * 60          // 1 hour
  }
};

export class CacheManagerMVP {
  private cacheKeys = {
    BOOTSTRAP: 'fpl:bootstrap-static',
    FIXTURES: 'fpl:fixtures',
    FIXTURE_GW: (gw: number) => `fpl:fixtures:gw:${gw}`,
    PLAYER_DETAIL: (id: number) => `fpl:player:${id}:detail`,
    LIVE_GW: (gw: number) => `fpl:gameweek:${gw}:live`,
    PLAYER_STATS: 'fpl:players:stats',
    TEAM_STATS: 'fpl:teams:stats',
    LEAGUE_LEADERS: (cat: string) => `fpl:leaders:${cat}`,
    IS_MATCH_LIVE: 'fpl:match:live'
  };

  // Get or fetch bootstrap data
  async getBootstrapData(forceRefresh = false): Promise<any> {
    const cacheKey = this.cacheKeys.BOOTSTRAP;
    
    if (!forceRefresh) {
      const cached = await this.get(cacheKey);
      if (cached) return cached;
    }

    const data = await fplApiClient.getBootstrapStatic(forceRefresh);
    const ttl = await this.getTTL('bootstrap_static');
    await this.set(cacheKey, data, ttl);

    return data;
  }

  // Get or fetch fixtures
  async getFixtures(gameweek?: number, forceRefresh = false): Promise<any> {
    const cacheKey = gameweek 
      ? this.cacheKeys.FIXTURE_GW(gameweek)
      : this.cacheKeys.FIXTURES;
    
    if (!forceRefresh) {
      const cached = await this.get(cacheKey);
      if (cached) return cached;
    }

    const data = await fplApiClient.getFixtures(gameweek);
    const ttl = await this.getTTL('fixtures');
    await this.set(cacheKey, data, ttl);

    return data;
  }

  // Get or fetch player details
  async getPlayerDetail(playerId: number, forceRefresh = false): Promise<any> {
    const cacheKey = this.cacheKeys.PLAYER_DETAIL(playerId);
    
    if (!forceRefresh) {
      const cached = await this.get(cacheKey);
      if (cached) return cached;
    }

    const data = await fplApiClient.getPlayerDetail(playerId);
    const ttl = await this.getTTL('player_details');
    await this.set(cacheKey, data, ttl);

    return data;
  }

  // Get or fetch live gameweek data
  async getLiveGameweek(gameweek: number, forceRefresh = false): Promise<any> {
    const cacheKey = this.cacheKeys.LIVE_GW(gameweek);
    
    if (!forceRefresh) {
      const cached = await this.get(cacheKey);
      if (cached) return cached;
    }

    const data = await fplApiClient.getLiveGameweek(gameweek);
    const ttl = await this.getTTL('live_gameweek');
    await this.set(cacheKey, data, ttl);

    return data;
  }

  // Check if match is live (cached for efficiency)
  async isMatchLive(): Promise<boolean> {
    const cacheKey = this.cacheKeys.IS_MATCH_LIVE;
    const cached = await this.get(cacheKey);
    
    if (cached !== null) {
      return cached;
    }

    const isLive = await fplApiClient.isMatchLive();
    await this.set(cacheKey, isLive, 60); // Cache for 1 minute
    
    return isLive;
  }

  // Get appropriate TTL based on match status
  private async getTTL(dataType: keyof CacheTTL['REGULAR'] | keyof CacheTTL['LIVE_MATCH']): Promise<number> {
    const isLive = await this.isMatchLive();
    
    // Check if it's a live match specific key
    if (dataType in CACHE_TTL.LIVE_MATCH) {
      if (isLive) {
        return CACHE_TTL.LIVE_MATCH[dataType as keyof CacheTTL['LIVE_MATCH']];
      }
      // For live_match specific keys, use regular TTL when not live
      return CACHE_TTL.REGULAR.fixtures; // Default fallback
    }
    
    // For keys that exist in both, use live TTL if match is live
    if (isLive && dataType in CACHE_TTL.LIVE_MATCH) {
      return CACHE_TTL.LIVE_MATCH[dataType as keyof CacheTTL['LIVE_MATCH']];
    }
    
    return CACHE_TTL.REGULAR[dataType as keyof CacheTTL['REGULAR']];
  }

  // Basic cache operations
  private async get(key: string): Promise<any> {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Cache get error for ${key}:`, error);
      return null;
    }
  }

  private async set(key: string, value: any, ttl: number): Promise<void> {
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttl);
    } catch (error) {
      console.error(`Cache set error for ${key}:`, error);
    }
  }

  // Clear specific cache patterns
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      console.error(`Cache invalidation error for pattern ${pattern}:`, error);
    }
  }

  // Invalidate player-related caches
  async invalidatePlayerCaches(playerId?: number): Promise<void> {
    if (playerId) {
      await redis.del(this.cacheKeys.PLAYER_DETAIL(playerId));
    }
    
    // Invalidate aggregated stats
    await this.invalidatePattern('fpl:players:stats*');
    await this.invalidatePattern('fpl:leaders:*');
  }

  // Invalidate match-related caches during live games
  async invalidateLiveCaches(): Promise<void> {
    const currentGW = await fplApiClient.getCurrentGameweek();
    if (currentGW) {
      await redis.del(
        this.cacheKeys.LIVE_GW(currentGW),
        this.cacheKeys.FIXTURE_GW(currentGW),
        this.cacheKeys.IS_MATCH_LIVE
      );
    }
  }
}

// Export singleton instance
export const cacheManager = new CacheManagerMVP();