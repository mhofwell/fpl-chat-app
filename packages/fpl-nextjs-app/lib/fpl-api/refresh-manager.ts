// lib/fpl-api/refresh-manager.ts

import { fplApiService } from './service';
import { createClient } from '@/utils/supabase/server';
import redis from '../redis/redis-client';

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

            // Only refresh live data for active gameweek
            await Promise.all([
                // Live player stats
                fplApiService.getLiveGameweek(currentGameweek.id),
                // Latest match scores
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
                await Promise.all([
                    fplApiService.getFixtures(currentGameweek.id),
                    fplApiService.getLiveGameweek(currentGameweek.id),
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
     */
    async performPreDeadlineRefresh(): Promise<{
        refreshed: boolean;
        state: string;
        details?: any;
    }> {
        try {
            // Check if we're in pre-deadline window
            const isPreDeadline = await this.isPreDeadlineWindow();

            // Skip if not in pre-deadline window
            if (!isPreDeadline) {
                return { refreshed: false, state: 'skipped' };
            }

            console.log('Performing pre-deadline data refresh');

            // Focus on player data (transfers, injuries) and gameweek info
            await Promise.all([
                fplApiService.getPlayers(),
                fplApiService.getGameweeks(),
            ]);

            // Get next deadline details for logging
            const gameweeks = await fplApiService.getGameweeks();
            const nextGameweek = gameweeks.find((gw) => gw.is_next);

            // Log the refresh
            await this.logRefresh('pre-deadline', 'pre-deadline', {
                nextGameweekId: nextGameweek?.id,
                deadline: nextGameweek?.deadline_time,
            });

            return {
                refreshed: true,
                state: 'pre-deadline',
                details: {
                    nextGameweekId: nextGameweek?.id,
                    deadline: nextGameweek?.deadline_time,
                },
            };
        } catch (error) {
            console.error('Error in pre-deadline refresh:', error);
            return { refreshed: false, state: 'error' };
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
    }> {
        try {
            console.log('Performing full data refresh and database update');

            // Full data refresh
            await fplApiService.updateAllData();

            // Get current state for logging
            const state = await this.getCurrentState();

            // Log the refresh
            await this.logRefresh('full', 'full', {
                ...state.details,
                includesDatabaseUpdate: true,
            });

            return {
                refreshed: true,
                state: 'full',
                details: {
                    ...state.details,
                    includesDatabaseUpdate: true,
                },
            };
        } catch (error) {
            console.error('Error in full refresh:', error);
            return { refreshed: false, state: 'error' };
        }
    }

    /**
     * Admin-triggered manual refresh
     */
    async performManualRefresh(adminId: string): Promise<{
        refreshed: boolean;
        state: string;
        details?: any;
    }> {
        try {
            console.log(`Manual refresh triggered by admin: ${adminId}`);

            // Full data refresh
            await fplApiService.updateAllData();

            // Get current state for logging
            const state = await this.getCurrentState();

            // Log the manual refresh
            await this.logRefresh('manual', state.state, {
                ...state.details,
                triggeredBy: adminId,
            });

            return {
                refreshed: true,
                state: 'manual',
                details: {
                    ...state.details,
                    triggeredBy: adminId,
                },
            };
        } catch (error) {
            console.error('Error in manual refresh:', error);
            return { refreshed: false, state: 'error' };
        }
    }
}

// Export singleton instance
export const refreshManager = new RefreshManager();
