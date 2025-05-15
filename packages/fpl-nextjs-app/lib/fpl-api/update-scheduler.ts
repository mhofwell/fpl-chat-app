// lib/fpl-api/update-scheduler.ts

import { cacheManager } from './cache-manager-mvp';
import { fplApiClient } from './fpl-api-client-mvp';

export class FPLDataUpdateScheduler {
  private updateIntervals: NodeJS.Timeout[] = [];

  // Start scheduled updates
  start() {
    // During-match updates (15 minutes)
    this.scheduleMatchDayUpdates();
    
    // Regular updates (1 hour)
    this.scheduleRegularUpdates();
    
    // Daily updates (for prices, news)
    this.scheduleDailyUpdates();
  }

  // Stop all scheduled updates
  stop() {
    this.updateIntervals.forEach(interval => clearInterval(interval));
    this.updateIntervals = [];
  }

  private async scheduleMatchDayUpdates() {
    // Check every 15 minutes if there's a live match
    const interval = setInterval(async () => {
      try {
        const isLive = await fplApiClient.isMatchLive();
        
        if (isLive) {
          console.log('Live match detected - updating data');
          await this.updateAllData();
        }
      } catch (error) {
        console.error('Error in match day update:', error);
      }
    }, 15 * 60 * 1000); // 15 minutes

    this.updateIntervals.push(interval);
  }

  private scheduleRegularUpdates() {
    // Update every hour regardless
    const interval = setInterval(async () => {
      try {
        console.log('Regular hourly update');
        await this.updateAllData();
      } catch (error) {
        console.error('Error in regular update:', error);
      }
    }, 60 * 60 * 1000); // 1 hour

    this.updateIntervals.push(interval);
  }

  private scheduleDailyUpdates() {
    // Update once daily at 2 AM for prices/news
    const interval = setInterval(async () => {
      const now = new Date();
      
      if (now.getHours() === 2) {
        try {
          console.log('Daily update - prices and news');
          await this.updateAllData(true); // Force refresh
        } catch (error) {
          console.error('Error in daily update:', error);
        }
      }
    }, 60 * 60 * 1000); // Check every hour

    this.updateIntervals.push(interval);
  }

  private async updateAllData(forceRefresh = false) {
    try {
      // Update bootstrap data (players, teams, gameweeks)
      await cacheManager.getBootstrapData(forceRefresh);
      
      // Update fixtures
      const currentGW = await fplApiClient.getCurrentGameweek();
      if (currentGW) {
        await cacheManager.getFixtures(currentGW, forceRefresh);
      }
      
      // Update all fixtures
      await cacheManager.getFixtures(undefined, forceRefresh);
      
      // Clear derived caches to force recalculation
      await cacheManager.invalidatePattern('fpl:leaders:*');
      await cacheManager.invalidatePattern('fpl:players:stats*');
      
      console.log('Data update completed successfully');
    } catch (error) {
      console.error('Error updating FPL data:', error);
    }
  }
}

// Usage in your app initialization
export const dataUpdateScheduler = new FPLDataUpdateScheduler();