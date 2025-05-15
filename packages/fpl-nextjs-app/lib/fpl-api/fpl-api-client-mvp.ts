// lib/fpl-api/fpl-api-client-mvp.ts

import { FPLBootstrapData, FPLFixture, APILimits } from '@/types/fpl-mvp';
import { RateLimiter } from './rate-limiter-mvp';

const FPL_BASE_URL = 'https://fantasy.premierleague.com/api';

// Conservative rate limits for MVP
const API_LIMITS: APILimits = {
  requestsPerMinute: 10,
  requestsPerHour: 300,
  requestsPerDay: 2000,
  batchSize: 10,
  batchDelay: 100
};

export class FPLApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'FPLApiError';
  }
}

export class FPLApiClientMVP {
  private rateLimiter: RateLimiter;
  private bootstrapCache: { data: FPLBootstrapData | null; timestamp: number } = {
    data: null,
    timestamp: 0
  };

  constructor() {
    this.rateLimiter = new RateLimiter(API_LIMITS);
  }

  private async fetchWithRetry(url: string, retries = 3): Promise<any> {
    // Check rate limits
    const canProceed = await this.rateLimiter.checkLimit();
    if (!canProceed) {
      throw new FPLApiError('Rate limit exceeded', 429, 60);
    }

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'FPL-Chat-App/1.0',
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          if (response.status === 503 || response.status === 502) {
            throw new FPLApiError('FPL API is currently unavailable', response.status, 300);
          }
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
            throw new FPLApiError('Rate limited by FPL API', 429, retryAfter);
          }
          throw new FPLApiError(`API request failed: ${response.statusText}`, response.status);
        }

        const data = await response.json();
        return data;

      } catch (error) {
        if (error instanceof FPLApiError) {
          throw error;
        }

        // Network error - retry with exponential backoff
        if (attempt < retries - 1) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }

        throw new FPLApiError('Network error: Unable to reach FPL API', 0);
      }
    }
  }

  // Get bootstrap-static data (players, teams, gameweeks)
  async getBootstrapStatic(forceRefresh = false): Promise<FPLBootstrapData> {
    // Check cache first (1 hour for regular, 15 min for live matches)
    const now = Date.now();
    const cacheAge = now - this.bootstrapCache.timestamp;
    const maxAge = await this.isMatchLive() ? 15 * 60 * 1000 : 60 * 60 * 1000;

    if (!forceRefresh && this.bootstrapCache.data && cacheAge < maxAge) {
      return this.bootstrapCache.data;
    }

    const data = await this.fetchWithRetry(`${FPL_BASE_URL}/bootstrap-static/`);
    
    // Update cache
    this.bootstrapCache = {
      data,
      timestamp: now
    };

    return data;
  }

  // Get fixtures (with optional gameweek filter)
  async getFixtures(gameweek?: number): Promise<FPLFixture[]> {
    let url = `${FPL_BASE_URL}/fixtures/`;
    if (gameweek) {
      url += `?event=${gameweek}`;
    }

    return await this.fetchWithRetry(url);
  }

  // Get specific fixture details
  async getFixture(fixtureId: number): Promise<FPLFixture> {
    const fixtures = await this.getFixtures();
    const fixture = fixtures.find(f => f.id === fixtureId);
    
    if (!fixture) {
      throw new FPLApiError(`Fixture ${fixtureId} not found`, 404);
    }

    return fixture;
  }

  // Get player detailed history
  async getPlayerDetail(playerId: number): Promise<any> {
    return await this.fetchWithRetry(`${FPL_BASE_URL}/element-summary/${playerId}/`);
  }

  // Get live gameweek data
  async getLiveGameweek(gameweek: number): Promise<any> {
    return await this.fetchWithRetry(`${FPL_BASE_URL}/event/${gameweek}/live/`);
  }

  // Check if matches are currently live
  async isMatchLive(): Promise<boolean> {
    try {
      const data = await this.getBootstrapStatic();
      const currentGW = data.events.find(e => e.is_current);
      
      if (!currentGW) return false;

      const now = new Date();
      const fixtures = await this.getFixtures(currentGW.id);
      
      return fixtures.some(fixture => {
        if (!fixture.kickoff_time) return false;
        
        const kickoff = new Date(fixture.kickoff_time);
        const endTime = new Date(kickoff.getTime() + 120 * 60 * 1000); // 2 hours after kickoff
        
        return now >= kickoff && now <= endTime && !fixture.finished;
      });

    } catch (error) {
      console.error('Error checking live match status:', error);
      return false;
    }
  }

  // Get current gameweek
  async getCurrentGameweek(): Promise<number | null> {
    try {
      const data = await this.getBootstrapStatic();
      const current = data.events.find(e => e.is_current);
      return current ? current.id : null;
    } catch {
      return null;
    }
  }

  // Batch fetch players (for efficiency)
  async batchFetchPlayerDetails(playerIds: number[]): Promise<Map<number, any>> {
    const results = new Map();
    
    // Process in batches to avoid overwhelming the API
    for (let i = 0; i < playerIds.length; i += API_LIMITS.batchSize) {
      const batch = playerIds.slice(i, i + API_LIMITS.batchSize);
      
      const batchPromises = batch.map(async (id) => {
        try {
          const data = await this.getPlayerDetail(id);
          return { id, data };
        } catch (error) {
          console.error(`Error fetching player ${id}:`, error);
          return { id, data: null };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      for (const result of batchResults) {
        if (result.data) {
          results.set(result.id, result.data);
        }
      }

      // Delay between batches
      if (i + API_LIMITS.batchSize < playerIds.length) {
        await new Promise(resolve => setTimeout(resolve, API_LIMITS.batchDelay));
      }
    }

    return results;
  }
}

// Export singleton instance
export const fplApiClient = new FPLApiClientMVP();