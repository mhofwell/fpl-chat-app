// lib/fpl-api/refresh-manager.ts

import { fplApiService } from './service';
import { createClient } from '@/utils/supabase/server';
import { createAdminSupabaseClient } from '@/utils/supabase/admin-client';
import redis from '../redis/redis-client';
import { cacheInvalidator } from './cache-invalidator';
import { syncBootstrapDerivedTablesFromApiData, syncFplData } from './fpl-data-sync';
import { BootstrapStaticResponse } from '@fpl-chat-app/types';
import { calculateTtl } from './client';
import { fplApi } from './client'; // Make sure fplApi is imported for direct API calls

/**
 * Handles FPL data refresh with different strategies based on game state
 */
export class RefreshManager {
    /**
     * Check if matches are currently live
     */
    async isLiveMatchesActive(): Promise<boolean> {
        return fplApiService.isGameweekActive();
    }

    /**
     * Check if we're in a post-match window (3-4 hours after match)
     */
    async isPostMatchWindow(): Promise<boolean> {
        try {
            const fixtures = await fplApiService.getFixtures();
            const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

            return fixtures.some((fixture) => {
                if (!fixture.finished || !fixture.kickoff_time) return false;

                // Match finish time (kickoff + ~2 hours)
                const kickoff = new Date(fixture.kickoff_time);
                const estimatedEndTime = new Date(
                    kickoff.getTime() + 2 * 60 * 60 * 1000
                );

                // Check if match ended within last 4 hours
                return (
                    estimatedEndTime > fourHoursAgo &&
                    estimatedEndTime <= new Date()
                );
            });
        } catch (error) {
            console.error('Error checking post-match window:', error);
            return false;
        }
    }

    /**
     * Check if we're in pre-deadline window (24 hours before deadline)
     */
    async isPreDeadlineWindow(): Promise<boolean> {
        try {
            const gameweeks = await fplApiService.getGameweeks();
            const nextGameweek = gameweeks.find((gw) => gw.is_next);

            if (!nextGameweek || !nextGameweek.deadline_time) return false;

            const deadline = new Date(nextGameweek.deadline_time);
            const now = new Date();
            const hoursTillDeadline =
                (deadline.getTime() - now.getTime()) / (60 * 60 * 1000);

            return hoursTillDeadline >= 0 && hoursTillDeadline <= 24;
        } catch (error) {
            console.error('Error checking pre-deadline window:', error);
            return false;
        }
    }

    /**
     * Determine current FPL state for logging
     */
    async getCurrentState(): Promise<{
        state:
            | 'live-match'
            | 'post-match'
            | 'pre-deadline'
            | 'regular'
            | 'off-season';
        details: Record<string, any>;
    }> {
        try {
            const isLive = await this.isLiveMatchesActive();
            if (isLive) {
                return {
                    state: 'live-match',
                    details: {
                        activeSince: await this.getActiveMatchStartTime(),
                    },
                };
            }

            const isPostMatch = await this.isPostMatchWindow();
            if (isPostMatch) {
                return {
                    state: 'post-match',
                    details: {
                        recentMatches: await this.getRecentlyFinishedMatches(),
                    },
                };
            }

            const isPreDeadline = await this.isPreDeadlineWindow();
            if (isPreDeadline) {
                return {
                    state: 'pre-deadline',
                    details: { nextDeadline: await this.getNextDeadline() },
                };
            }

            const gameweeks = await fplApiService.getGameweeks();
            const inSeason = gameweeks.some(
                (gw) => gw.is_current || gw.is_next
            );

            return {
                state: inSeason ? 'regular' : 'off-season',
                details: inSeason
                    ? {
                          currentGameweek: gameweeks.find((gw) => gw.is_current)
                              ?.id,
                      }
                    : {},
            };
        } catch (error) {
            console.error('Error determining FPL state:', error);
            return { state: 'regular', details: {} };
        }
    }

    /**
     * Get start time of currently active match (if any)
     */
    private async getActiveMatchStartTime(): Promise<string | null> {
        try {
            const fixtures = await fplApiService.getFixtures();
            const now = new Date();

            const activeMatch = fixtures.find((fixture) => {
                if (!fixture.kickoff_time) return false;

                const kickoff = new Date(fixture.kickoff_time);
                const expectedEnd = new Date(
                    kickoff.getTime() + 2 * 60 * 60 * 1000
                );

                return (
                    kickoff <= now && now <= expectedEnd && !fixture.finished
                );
            });

            return activeMatch?.kickoff_time || null;
        } catch (error) {
            console.error('Error getting active match start time:', error);
            return null;
        }
    }

    /**
     * Get list of recently finished matches
     */
    private async getRecentlyFinishedMatches(): Promise<any[]> {
        try {
            const fixtures = await fplApiService.getFixtures();
            const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

            return fixtures
                .filter((fixture) => {
                    if (!fixture.finished || !fixture.kickoff_time)
                        return false;

                    const kickoff = new Date(fixture.kickoff_time);
                    const estimatedEndTime = new Date(
                        kickoff.getTime() + 2 * 60 * 60 * 1000
                    );

                    return (
                        estimatedEndTime > fourHoursAgo &&
                        estimatedEndTime <= new Date()
                    );
                })
                .map((fixture) => ({
                    id: fixture.id,
                    homeTeam: fixture.team_h,
                    awayTeam: fixture.team_a,
                    kickoff: fixture.kickoff_time,
                }));
        } catch (error) {
            console.error('Error getting recently finished matches:', error);
            return [];
        }
    }

    /**
     * Get next deadline time
     */
    private async getNextDeadline(): Promise<string | null> {
        try {
            const gameweeks = await fplApiService.getGameweeks();
            const nextGameweek = gameweeks.find((gw) => gw.is_next);

            return nextGameweek?.deadline_time || null;
        } catch (error) {
            console.error('Error getting next deadline:', error);
            return null;
        }
    }

    /**
     * Record refresh details in database
     */
    private async logRefresh(
        type: string,
        state: string,
        details?: any
    ): Promise<void> {
        try {
            const supabase = await createClient();

            await supabase.from('refresh_logs').insert({
                type,
                state,
                details,
                created_at: new Date().toISOString(),
            });

            // Also update the last refresh timestamp
            await supabase.from('system_meta').upsert(
                {
                    key: 'last_refresh',
                    value: JSON.stringify({
                        timestamp: new Date().toISOString(),
                        type,
                        state,
                    }),
                },
                { onConflict: 'key' }
            );
        } catch (error) {
            console.error('Error logging refresh:', error);
        }
    }

    /**
     * Perform high-frequency refresh (15min) - Live match data only
     */
    async performLiveRefresh(): Promise<{
        refreshed: boolean;
        state: string;
        details?: any;
    }> {
        try {
            // Check if we have live matches
            const isLive = await this.isLiveMatchesActive();

            if (!isLive) {
                // No live matches, skip refresh
                return { refreshed: false, state: 'skipped' };
            }

            console.log('Performing live data refresh');

            // Get current gameweek
            const currentGameweek = await fplApiService.getCurrentGameweek();
            if (!currentGameweek) {
                return { refreshed: false, state: 'no-current-gameweek' };
            }

            // Invalidate fixture cache for the current gameweek to ensure fresh fetch
            const fixtureCacheKeyForGameweek = `fpl:fixtures:gw:${currentGameweek.id}`;
            // Consider if the general 'fpl:fixtures' key also needs invalidation if
            // getFixtures(currentGameweek.id) might fall back or affect it.
            // For now, targeting the specific gameweek key.
            await cacheInvalidator.invalidateKeys([fixtureCacheKeyForGameweek]);
            console.log(
                `Invalidated fixtures cache for GW ${currentGameweek.id} during live refresh.`
            );

            // Only refresh live data for active gameweek
            await Promise.all([
                // Live player stats
                fplApiService.getLiveGameweek(currentGameweek.id),
                // Latest match scores - will now fetch fresh due to invalidation
                fplApiService.getFixtures(currentGameweek.id),
            ]);

            // Update fixtures in Redis with fresh data
            redis.set(
                'fpl:last_live_refresh',
                JSON.stringify({
                    timestamp: new Date().toISOString(),
                    gameweekId: currentGameweek.id,
                }),
                'EX',
                30 * 60 // 30 minute expiry
            );

            // Log the refresh
            await this.logRefresh('live', 'live-match', {
                gameweekId: currentGameweek.id,
            });

            return {
                refreshed: true,
                state: 'live-match',
                details: { gameweekId: currentGameweek.id },
            };
        } catch (error) {
            console.error('Error in live refresh:', error);
            return { refreshed: false, state: 'error' };
        }
    }

    /**
     * Perform medium-frequency refresh (30min) - Post-match data
     */
    async performPostMatchRefresh(): Promise<{
        refreshed: boolean;
        state: string;
        details?: any;
    }> {
        try {
            // Check if we're in post-match window
            const isPostMatch = await this.isPostMatchWindow();
            const isLive = await this.isLiveMatchesActive();

            // Skip if live matches are happening (live refresh will handle it)
            // or if not in post-match window
            if (isLive || !isPostMatch) {
                return { refreshed: false, state: 'skipped' };
            }

            console.log('Performing post-match data refresh');

            // Update completed fixture data and player stats
            const currentGameweek = await fplApiService.getCurrentGameweek();
            if (currentGameweek) {
                // Invalidate relevant caches to ensure fresh data fetch
                const fixtureCacheKeyForGameweek = `fpl:fixtures:gw:${currentGameweek.id}`;
                const liveDataCacheKey = `fpl:gameweek:${currentGameweek.id}:live`;
                // Again, consider general 'fpl:fixtures' if necessary.
                await cacheInvalidator.invalidateKeys([
                    fixtureCacheKeyForGameweek,
                    liveDataCacheKey,
                ]);
                console.log(
                    `Invalidated fixtures and live data cache for GW ${currentGameweek.id} during post-match refresh.`
                );

                await Promise.all([
                    fplApiService.getFixtures(currentGameweek.id), // Will fetch fresh
                    fplApiService.getLiveGameweek(currentGameweek.id), // Will fetch fresh
                    // Also update the database with results
                    fplApiService.updateFixtureResults(),
                ]);

                // Log the refresh
                await this.logRefresh('post-match', 'post-match', {
                    gameweekId: currentGameweek.id,
                });

                return {
                    refreshed: true,
                    state: 'post-match',
                    details: { gameweekId: currentGameweek.id },
                };
            }

            return { refreshed: false, state: 'no-current-gameweek' };
        } catch (error) {
            console.error('Error in post-match refresh:', error);
            return { refreshed: false, state: 'error' };
        }
    }

    /**
     * Perform hourly refresh (60min) - Pre-deadline data
     * Now includes bootstrap-static check and update logic.
     */
    async performPreDeadlineRefresh(): Promise<{
        refreshed: boolean;
        state: string;
        details?: any;
        reason?: string;
    }> {
        try {
            const isPreDeadlineWindowActive = await this.isPreDeadlineWindow();
            if (!isPreDeadlineWindowActive) {
                return { refreshed: false, state: 'skipped', reason: 'Not in pre-deadline window.' };
            }

            console.log('Performing pre-deadline data refresh...');
            const currentState = await this.getCurrentState(); // Get current state for logging context
            console.log('[PreDeadline] Current state:', currentState);
            let bootstrapChanged = false;
            let bootstrapSyncDetails: any = {};

            // --- Start: Bootstrap-static handling (similar to performIncrementalRefresh) ---
            try {
                const freshBootstrapStaticData: BootstrapStaticResponse = await fplApi.getBootstrapStatic();
                const freshBootstrapStaticString = JSON.stringify(freshBootstrapStaticData);
                const cachedBootstrapStaticString = await redis.get('fpl:bootstrap-static');
                let areDataDifferent = !cachedBootstrapStaticString || freshBootstrapStaticString !== cachedBootstrapStaticString;

                if (areDataDifferent) {
                    console.log('[PreDeadline] Bootstrap-static data has changed. Updating Redis cache and syncing DB.');
                    bootstrapChanged = true;
                    const ttl = calculateTtl('bootstrap-static');
                    await redis.set('fpl:bootstrap-static', freshBootstrapStaticString, 'EX', ttl);
                    console.log(`[PreDeadline] Redis cache "fpl:bootstrap-static" updated with TTL: ${ttl}s.`);

                    const supabase = await createClient();
                    await syncBootstrapDerivedTablesFromApiData(supabase, freshBootstrapStaticData);
                    console.log('[PreDeadline] Bootstrap-derived DB tables synced successfully.');

                    await cacheInvalidator.invalidatePattern('fpl:players:enriched*');
                    console.log('[PreDeadline] Enriched players cache pattern "fpl:players:enriched*" invalidated due to bootstrap change.');
                    bootstrapSyncDetails = {
                        bootstrapChangeDetected: true,
                        bootstrapCacheUpdated: 'fpl:bootstrap-static',
                        bootstrapDbSyncStatus: 'Bootstrap-derived tables synced',
                        bootstrapEnrichedCacheInvalidated: 'fpl:players:enriched*',
                    };
                } else {
                    console.log('[PreDeadline] No changes detected in bootstrap-static data.');
                    bootstrapSyncDetails = { bootstrapChangeDetected: false };
                }
            } catch (bootstrapError) {
                console.error('[PreDeadline] Error during bootstrap-static handling:', bootstrapError);
                // Log this error but continue with other pre-deadline tasks if possible,
                // as they might operate on potentially stale but existing cache.
                bootstrapSyncDetails = {
                    bootstrapChangeDetected: false, // Or true if error happened after detection
                    bootstrapError: (bootstrapError as Error).message,
                };
            }
            // --- End: Bootstrap-static handling ---

            // Original pre-deadline tasks: Focus on player data (transfers, injuries) and gameweek info
            // These calls will use fplApiService, which respects existing caches.
            // If bootstrapChanged was true, these might now build from fresher underlying data if their specific caches were also invalidated
            // or depend on the (now updated) fpl:bootstrap-static.
            console.log('[PreDeadline] Fetching/refreshing players and gameweeks data for pre-deadline specific caches.');
            await Promise.all([
                fplApiService.getPlayers(), // Refreshes fpl:players:enriched* (if its TTL expired or invalidated by bootstrap)
                fplApiService.getGameweeks(), // Refreshes fpl:gameweeks (if its TTL expired or depends on bootstrap)
            ]);
            console.log('[PreDeadline] Players and Gameweeks data refreshed/fetched.');

            const gameweeks = await fplApiService.getGameweeks(); // Fetch again to get potentially updated list
            const nextGameweek = gameweeks.find((gw) => gw.is_next);
            const logDetails = {
                ...bootstrapSyncDetails,
                preDeadlineTasksRan: true,
                nextGameweekId: nextGameweek?.id,
                deadline: nextGameweek?.deadline_time,
            };

            await this.logRefresh('pre-deadline', 'pre-deadline', logDetails);

            return {
                refreshed: true, // Considered refreshed as pre-deadline tasks ran, and bootstrap might have been.
                state: 'pre-deadline',
                details: logDetails,
                reason: bootstrapChanged ? 'Bootstrap data changed and pre-deadline tasks ran.' : 'Pre-deadline tasks ran.',
            };

        } catch (error) {
            console.error('Error in pre-deadline refresh:', error);
            await this.logRefresh('pre-deadline', 'error', { error: (error as Error).message });
            return {
                refreshed: false,
                state: 'error',
                details: { error: (error as Error).message },
                reason: 'Error during pre-deadline refresh execution.',
            };
        }
    }

    /**
     * Perform regular refresh (2hr) - Normal gameweek data
     */
    async performRegularRefresh(): Promise<{
        refreshed: boolean;
        state: string;
        details?: any;
    }> {
        try {
            console.log('Performing regular data refresh');

            // Check current state to log properly
            const state = await this.getCurrentState();

            // Do a standard refresh of all data
            await fplApiService.updateAllData();

            // Log the refresh
            await this.logRefresh('regular', state.state, state.details);

            return {
                refreshed: true,
                state: state.state,
                details: state.details,
            };
        } catch (error) {
            console.error('Error in regular refresh:', error);
            return { refreshed: false, state: 'error' };
        }
    }

    /**
     * Perform full refresh (daily) - Complete data refresh with DB update
     */
    async performFullRefresh(): Promise<{
        refreshed: boolean;
        state: string;
        details?: any;
        reason?: string;
    }> {
        try {
            console.log('Performing full data refresh: Updating all caches and synchronizing database.');

            // 1. Refresh all FPL data in Redis cache via fplApiService
            await fplApiService.updateAllData();
            console.log('All Redis caches updated via fplApiService.updateAllData().');

            // 2. Perform a full database synchronization using fpl-data-sync
            // This will update all relevant DB tables (teams, players, gameweeks, fixtures)
            // and then handle player_gameweek_stats for finished gameweeks,
            // which also includes invalidating fpl:players:enriched* cache.
            console.log('Starting full database synchronization via syncFplData...');
            const syncResult = await syncFplData(); // This is the comprehensive sync

            if (!syncResult.success) {
                console.error('Full database synchronization failed:', syncResult.message, syncResult.error);
                // Log this specific error but continue to log the overall refresh attempt
                await this.logRefresh('full', 'partial_error', {
                    redisUpdate: 'success',
                    dbSyncStatus: 'failed',
                    dbSyncMessage: syncResult.message,
                    dbSyncError: syncResult.error,
                });
                return {
                    refreshed: true, // Redis caches were updated
                    state: 'partial_error',
                    details: {
                        redisUpdate: 'success',
                        dbSyncStatus: 'failed',
                        dbSyncMessage: syncResult.message,
                        error: syncResult.error || 'DB sync failed',
                    },
                    reason: 'Redis caches updated, but full database sync failed.',
                };
            }
            console.log('Full database synchronization completed successfully.');

            const currentState = await this.getCurrentState(); // Get current state for logging context
            const logDetails = {
                ...currentState.details,
                redisUpdate: 'success',
                dbSyncStatus: 'success',
                includesDatabaseUpdate: true,
            };
            await this.logRefresh('full', 'full_success', logDetails); // Use a more specific state

            return {
                refreshed: true,
                state: 'full_success', // More specific state
                details: logDetails,
                reason: 'All caches updated and database fully synchronized.',
            };

        } catch (error) {
            console.error('Error during full refresh:', error);
            await this.logRefresh('full', 'error', {
                error: (error as Error).message,
            });
            return {
                refreshed: false,
                state: 'error',
                details: { error: (error as Error).message },
                reason: 'Error during full refresh execution.',
            };
        }
    }

    /**
     * Admin-triggered manual refresh
     */
    async performManualRefresh(adminId: string): Promise<{
        refreshed: boolean;
        state: string;
        details?: any;
        reason?: string;
    }> {
        try {
            console.log(`Manual refresh triggered by admin: ${adminId}. Updating all caches and synchronizing database.`);

            // 1. Refresh all FPL data in Redis cache via fplApiService
            await fplApiService.updateAllData();
            console.log('[ManualRefresh] All Redis caches updated via fplApiService.updateAllData().');

            // 2. Perform a full database synchronization using fpl-data-sync
            console.log('[ManualRefresh] Starting full database synchronization via syncFplData...');
            const syncResult = await syncFplData();

            if (!syncResult.success) {
                console.error('[ManualRefresh] Full database synchronization failed:', syncResult.message, syncResult.error);
                await this.logRefresh('manual', 'partial_error', {
                    triggeredBy: adminId,
                    redisUpdate: 'success',
                    dbSyncStatus: 'failed',
                    dbSyncMessage: syncResult.message,
                    dbSyncError: syncResult.error,
                });
                return {
                    refreshed: true, // Redis caches were updated
                    state: 'partial_error',
                    details: {
                        triggeredBy: adminId,
                        redisUpdate: 'success',
                        dbSyncStatus: 'failed',
                        dbSyncMessage: syncResult.message,
                        error: syncResult.error || 'DB sync failed',
                    },
                    reason: 'Redis caches updated, but full database sync failed during manual refresh.',
                };
            }
            console.log('[ManualRefresh] Full database synchronization completed successfully.');

            const currentState = await this.getCurrentState(); // Get current state for logging context
            const logDetails = {
                ...currentState.details,
                triggeredBy: adminId,
                redisUpdate: 'success',
                dbSyncStatus: 'success',
                includesDatabaseUpdate: true,
            };
            await this.logRefresh('manual', 'manual_success', logDetails);

            return {
                refreshed: true,
                state: 'manual_success',
                details: logDetails,
                reason: 'All caches updated and database fully synchronized by manual trigger.',
            };

        } catch (error) {
            console.error('Error in manual refresh:', error);
            await this.logRefresh('manual', 'error', {
                triggeredBy: adminId,
                error: (error as Error).message,
            });
            return {
                refreshed: false,
                state: 'error',
                details: {
                    triggeredBy: adminId,
                    error: (error as Error).message
                },
                reason: 'Error during manual refresh execution.',
            };
        }
    }

    async performIncrementalRefresh(): Promise<{
        refreshed: boolean;
        state: string;
        details?: any;
    }> {
        const currentState = await this.getCurrentState();
        console.log('Performing incremental refresh...', { state: currentState.state });

        try {
            // Fetch fresh bootstrap data from the FPL API
            console.log('Fetching fresh bootstrap-static data from FPL API...');
            const freshBootstrapStaticData: BootstrapStaticResponse = await fplApi.getBootstrapStatic();
            
            if (!freshBootstrapStaticData || !freshBootstrapStaticData.teams || !freshBootstrapStaticData.elements || !freshBootstrapStaticData.events) {
                console.error('Received invalid bootstrap data structure from FPL API');
                return {
                    refreshed: false,
                    state: currentState.state,
                    details: { dbSyncStatus: 'Received invalid bootstrap data structure from FPL API' },
                };
            }
            
            console.log(`Bootstrap data contains: ${freshBootstrapStaticData.teams.length} teams, ${freshBootstrapStaticData.elements.length} players, ${freshBootstrapStaticData.events.length} gameweeks`);
            
            // Compare with cached data
            const freshBootstrapStaticString = JSON.stringify(freshBootstrapStaticData);
            const cachedBootstrapStaticString = await redis.get('fpl:bootstrap-static');
            let areDataDifferent = !cachedBootstrapStaticString || freshBootstrapStaticString !== cachedBootstrapStaticString;

            if (areDataDifferent) {
                console.log('Bootstrap-static data has changed. Updating Redis cache and syncing DB.');
                
                // Update Redis cache
                try {
                    const ttl = calculateTtl('bootstrap-static');
                    await redis.set('fpl:bootstrap-static', freshBootstrapStaticString, 'EX', ttl);
                    console.log(`Redis cache "fpl:bootstrap-static" updated with TTL: ${ttl}s.`);
                } catch (redisError) {
                    console.error('Error updating Redis cache:', redisError);
                    // Continue with DB sync even if Redis update fails
                }

                try {
                    // Use admin client for better database permissions
                    const supabase = createAdminSupabaseClient();
                    console.log('Created admin Supabase client for database operations');
                    
                    // Test the connection with a simple query
                    try {
                        const { data: testData, error: testError } = await supabase
                            .from('teams')
                            .select('count')
                            .limit(1);
                        
                        if (testError) {
                            console.error('Admin client connection test failed:', testError);
                            throw new Error(`Database connection failed: ${testError.message}`);
                        }
                        console.log('Admin client connection test successful');
                    } catch (connError) {
                        console.error('Failed to connect to database:', connError);
                        throw connError;
                    }
                    
                    // Sync database tables
                    const syncResult = await syncBootstrapDerivedTablesFromApiData(supabase, freshBootstrapStaticData);
                    console.log('Bootstrap-derived DB tables synced successfully:', syncResult);

                    // Invalidate relevant caches
                    await cacheInvalidator.invalidatePattern('fpl:players:enriched*');
                    console.log('Enriched players cache pattern "fpl:players:enriched*" invalidated.');

                    // Log the successful refresh
                    const logDetails = { 
                        dbSyncStatus: 'Bootstrap-derived tables synced',
                        teamsUpdated: syncResult.teamsUpdated,
                        playersUpdated: syncResult.playersUpdated,
                        gameweeksUpdated: syncResult.gameweeksUpdated
                    };
                    await this.logRefresh('incremental', currentState.state, logDetails);
                    
                    return {
                        refreshed: true,
                        state: currentState.state,
                        details: logDetails,
                    };
                } catch (syncOrInvalidationError) {
                    console.error('Error during DB sync or enriched cache invalidation:', syncOrInvalidationError);
                    
                    // Create a detailed error report for troubleshooting
                    const errorDetails = {
                        dbSyncStatus: 'Bootstrap-derived tables sync failed',
                        errorMessage: syncOrInvalidationError instanceof Error ? syncOrInvalidationError.message : 'Unknown error',
                        errorStack: syncOrInvalidationError instanceof Error ? syncOrInvalidationError.stack : undefined,
                        redisUpdateStatus: 'completed'
                    };
                    
                    await this.logRefresh('incremental', 'error', errorDetails);
                    
                    return {
                        refreshed: false,
                        state: 'error',
                        details: errorDetails,
                    };
                }
            } else {
                console.log('Bootstrap-static data unchanged, no update needed.');
                return {
                    refreshed: false,
                    state: currentState.state,
                    details: { dbSyncStatus: 'Bootstrap-static data unchanged' },
                };
            }
        } catch (error) {
            console.error('Error in incremental refresh:', error);
            
            // Log the error with detailed information
            const errorDetails = {
                dbSyncStatus: 'Incremental refresh failed',
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                errorStack: error instanceof Error ? error.stack : undefined,
                phase: 'bootstrap_data_fetch'
            };
            
            await this.logRefresh('incremental', 'error', errorDetails);
            
            return {
                refreshed: false,
                state: 'error',
                details: errorDetails,
            };
        }
    }
}

// Export singleton instance
export const refreshManager = new RefreshManager();
