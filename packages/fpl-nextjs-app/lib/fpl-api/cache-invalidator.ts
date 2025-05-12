// lib/fpl-api/cache-invalidator.ts
import redis from '../redis/redis-client';
import { Gameweek } from '@fpl-chat-app/types';

/**
 * FPL Cache Invalidation Service
 *
 * Uses an event-driven invalidation strategy targeted to FPL data patterns:
 * - Gameweek transitions (pre/post deadline, post-gameweek)
 * - Live data during matches
 * - Player data when transfers are active
 */
export const cacheInvalidator = {
    /**
     * Invalidate specific cache keys
     */
    async invalidateKeys(keys: string[]): Promise<void> {
        if (keys.length === 0) return;
        await redis.del(...keys);
    },

    /**
     * Invalidate all keys matching a pattern
     */
    async invalidatePattern(pattern: string): Promise<void> {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
            await this.invalidateKeys(keys);
        }
    },

    /**
     * Invalidate all FPL data (use sparingly)
     */
    async invalidateAllData(): Promise<void> {
        await this.invalidatePattern('fpl:*');
    },

    /**
     * Invalidate all player-related data
     * Use after transfer windows or when player status changes
     */
    async invalidatePlayerData(): Promise<void> {
        await Promise.all([
            this.invalidatePattern('fpl:players*'),
            this.invalidatePattern('fpl:player:*'),
        ]);
    },

    /**
     * Invalidate data for a specific gameweek
     * Use when gameweek status changes (before/during/after)
     */
    async invalidateGameweekData(gameweekId: number): Promise<void> {
        await Promise.all([
            redis.del(`fpl:gameweek:${gameweekId}:live`),
            redis.del(`fpl:fixtures:gw:${gameweekId}`),
        ]);

        // Also invalidate gameweeks list as current/next flags may change
        await redis.del('fpl:gameweeks');
    },

    /**
     * Invalidate live gameweek data only
     * Use during active gameweeks to ensure fresh match data
     */
    async invalidateLiveData(gameweekId: number): Promise<void> {
        await redis.del(`fpl:gameweek:${gameweekId}:live`);
    },

    /**
     * Optimize live data caching by removing unnecessary past gameweek data
     */
    async optimizeLiveDataCaching(): Promise<void> {
        try {
            // Get all gameweek live cache keys
            const liveKeys = await redis.keys('fpl:gameweek:*:live');

            // Get current gameweek from cache
            const gameweeksData = await redis.get('fpl:gameweeks');
            if (!gameweeksData) return;

            const gameweeks = JSON.parse(gameweeksData);
            const currentGameweek = gameweeks.find(
                (gw: Gameweek) => gw.is_current
            );

            if (!currentGameweek) return;

            // Identify keys for past gameweeks
            const pastGameweekKeys = liveKeys.filter((key) => {
                const gwMatch = key.match(/fpl:gameweek:(\d+):live/);
                if (!gwMatch) return false;

                const gwId = parseInt(gwMatch[1]);
                return gwId < currentGameweek.id && !key.includes('fixture');
            });

            // Remove past gameweek live data
            if (pastGameweekKeys.length > 0) {
                await redis.del(...pastGameweekKeys);
                console.log(
                    `Removed ${pastGameweekKeys.length} unnecessary past gameweek live cache entries`
                );
            }
        } catch (error) {
            console.error('Error optimizing live data cache:', error);
        }
    },

    /**
     * Schedule invalidation for upcoming deadline
     * @param deadlineTime ISO date string for the deadline
     * @param gameweekId The gameweek ID to invalidate after deadline
     */
    scheduleDeadlineInvalidation(
        deadlineTime: string,
        gameweekId: number
    ): NodeJS.Timeout {
        const deadlineDate = new Date(deadlineTime);
        const now = new Date();
        const timeUntilDeadline = Math.max(
            0,
            deadlineDate.getTime() - now.getTime()
        );

        // Maximum safe timeout duration (about 24.8 days)
        const MAX_TIMEOUT = 2147483647; // Max 32-bit signed integer

        if (timeUntilDeadline <= MAX_TIMEOUT) {
            // If within safe range, schedule normally
            return setTimeout(async () => {
                console.log(
                    `Invalidating data after deadline for Gameweek ${gameweekId}`
                );
                await this.invalidateGameweekData(gameweekId);
                await this.invalidatePlayerData();
            }, timeUntilDeadline + 60000);
        } else {
            // For long timeouts, use an intermediate timer
            console.log(
                `Setting intermediate timer for GW${gameweekId} (${deadlineTime})`
            );
            return setTimeout(() => {
                // Reschedule when we're closer to the deadline
                this.scheduleDeadlineInvalidation(deadlineTime, gameweekId);
            }, MAX_TIMEOUT);
        }
    },

    /**
     * Set up scheduled invalidation based on gameweek deadlines
     * Call this when server starts or when gameweek data is updated
     */
    async setupScheduledInvalidation(
        gameweeks: any[]
    ): Promise<NodeJS.Timeout[]> {
        const timeouts: NodeJS.Timeout[] = [];
        const now = new Date();

        // Schedule invalidation for upcoming deadlines
        for (const gw of gameweeks) {
            const deadline = new Date(gw.deadline_time);

            // Only schedule for future deadlines
            if (deadline > now) {
                const timeout = this.scheduleDeadlineInvalidation(
                    gw.deadline_time,
                    gw.id
                );
                timeouts.push(timeout);
                console.log(
                    `Scheduled invalidation for GW${gw.id} at ${gw.deadline_time}`
                );
            }
        }

        // Run cache optimization to clean up past gameweek data
        await this.optimizeLiveDataCaching();

        return timeouts;
    },
};
