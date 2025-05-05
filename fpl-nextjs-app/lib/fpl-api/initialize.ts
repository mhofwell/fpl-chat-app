// lib/fpl-api/initialize.ts
import { fplApiService } from './service';
import { cacheInvalidator } from './cache-invalidator';

let isInitialized = false;

export async function initializeFplService() {
    if (isInitialized) return;

    try {
        console.log('Initializing FPL service from Next.js...');

        // First, update all data to ensure the cache is fresh
        await fplApiService.updateAllData();

        // Set up the cache invalidation schedules
        await fplApiService.initialize();

        // Clean up any stale data
        await cacheInvalidator.optimizeLiveDataCaching();

        console.log('FPL service initialization complete');
        isInitialized = true;
    } catch (error) {
        console.error('Failed to initialize FPL service:', error);
        // Don't set isInitialized to true so it can retry later
    }
}
