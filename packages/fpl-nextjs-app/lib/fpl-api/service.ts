import { fplApi } from './client';
import redis from '../redis/redis-client';
import { Team, Player, Gameweek, Fixture } from '@fpl-chat-app/types'; // Corrected path
import {
    FplElement,
    FplEvent,
    FplFixture,
    FplTeam,
    BootstrapStaticResponse,
    PlayerDetailResponse,
    GameweekLiveResponse,
    PlayerHistoryPast,
    PlayerHistory,
    PlayerSeasonSummaryStats,
} from '@fpl-chat-app/types'; // Corrected path
import { calculateTtl } from './client';
import { fetchWithCache, batchFetchWithCache, batchCacheSet } from '../redis/cache-helper';
import { cacheInvalidator } from './cache-invalidator';
import * as formatters from './formatters';
import * as transformers from './transformers';
// import { createClient } from '@/utils/supabase/server';
import { createAdminSupabaseClient } from '@/utils/supabase/admin-client';

/**
 * Type for filtering players
 */
export interface PlayerFilterOptions {
    teamId?: number;
    position?: string;
}

/**
 * Type for fixtures by gameweek
 */
export interface GameweekFixtures {
    gameweekId: number;
    fixtures: Fixture[];
}

/**
 * Type for player details with team information
 */
export interface PlayerDetailWithTeam {
    playerId: number;
    playerName: string;
    teamName: string;
    details: PlayerDetailResponse;
}

/**
 * Type for player gameweek history point
 */
export interface PlayerGameweekHistoryPoint {
    gameweek: number;
    points: number;
    minutes: number;
}

/**
 * Type for player details with team information
 */
export interface PlayerDetailWithTeam {
    playerId: number;
    playerName: string;
    teamName: string;
    details: PlayerDetailResponse;
}

/**
 * Service for handling FPL data with Redis caching and Supabase persistence
 */
export const fplApiService = {
    /**
     * Get all teams with Redis caching
     */
    async getTeams(): Promise<Team[]> {
        return fetchWithCache<Team[]>(
            'fpl:teams',
            async () => {
                const bootstrapData = await fplApi.getBootstrapStatic();
                return bootstrapData.teams.map(transformers.transformApiTeam);
            },
            'bootstrap-static'
        );
    },
    
    /**
     * Get multiple teams by ID with efficient batch fetching
     * @param teamIds Array of team IDs to fetch
     * @returns Teams mapped by their ID
     */
    async getTeamsByIds(teamIds: number[]): Promise<Record<number, Team>> {
        // Deduplicate team IDs
        const uniqueTeamIds = Array.from(new Set(teamIds));
        
        if (uniqueTeamIds.length === 0) {
            return {};
        }
        
        // If requesting too many teams, more efficient to get all teams
        if (uniqueTeamIds.length > 10) {
            const allTeams = await this.getTeams();
            return allTeams.reduce((acc, team) => {
                if (uniqueTeamIds.includes(team.id)) {
                    acc[team.id] = team;
                }
                return acc;
            }, {} as Record<number, Team>);
        }
        
        // For a smaller set, use batch fetch
        const batchItems = uniqueTeamIds.map(teamId => ({
            cacheKey: `fpl:team:${teamId}`,
            fetchFn: async () => {
                // If no specific team endpoint exists, get all teams and filter
                const allTeams = await this.getTeams();
                return allTeams.find(t => t.id === teamId) || null;
            }
        }));
        
        // Use the new batch fetch function
        const teams = await batchFetchWithCache(batchItems, calculateTtl('bootstrap-static'), {
            useParallel: true,
            continueOnError: true,
            logLevel: 'info'
        });
        
        // Convert array result to object mapped by team ID
        return teams.reduce((acc, team, index) => {
            if (team && !(team instanceof Error)) {
                acc[uniqueTeamIds[index]] = team;
            }
            return acc;
        }, {} as Record<number, Team>);
    },

    /**
     * Get all players with Redis caching, enriched with current season performance
     * and previous season summary from PostgreSQL.
     */
    async getPlayers(options?: PlayerFilterOptions): Promise<Player[]> {
        const baseCacheKey = `fpl:players:enriched${options?.teamId ? `:team:${options.teamId}` : ''}${options?.position ? `:pos:${options.position}` : ''}`;

        return fetchWithCache<Player[]>(
            baseCacheKey,
            async () => {
                const bootstrapData = await fplApi.getBootstrapStatic();
                let basicPlayers = bootstrapData.elements.map(transformers.transformApiPlayer);

                if (options?.teamId) {
                    basicPlayers = basicPlayers.filter((p: Player) => p.team_id === options.teamId);
                }
                if (options?.position) {
                    basicPlayers = basicPlayers.filter((p: Player) => p.position === options.position);
                }

                const supabaseAdmin = createAdminSupabaseClient();

                const enrichedPlayersPromises = basicPlayers.map(async (player: Player) => {
                    // Fetch current season performance
                    const { data: currentSeasonStats, error: csError } = await supabaseAdmin
                        .from('player_gameweek_stats')
                        .select('gameweek_id, total_points, minutes')
                        .eq('player_id', player.id)
                        .order('gameweek_id', { ascending: true });

                    if (csError) {
                        console.error(`Error fetching current season stats for player ${player.id}:`, csError);
                    }
                    
                    player.current_season_performance = currentSeasonStats?.map(s => ({
                        gameweek: s.gameweek_id,
                        points: s.total_points,
                        minutes: s.minutes,
                    })) || [];

                    // Attempt to fetch previous season summary
                    let { data: prevSeasonData, error: psError } = await supabaseAdmin
                        .from('player_season_stats')
                        .select('season_name, total_points, minutes')
                        .eq('player_id', player.id)
                        .order('season_name', { ascending: false })
                        .limit(1)
                        .single();

                    if (psError && psError.code === 'PGRST116') {
                        console.log(`No previous season summary for player ${player.id} in DB. Attempting to fetch details.`);
                        try {
                            await this.getPlayerDetail(player.id); 
                            
                            const { data: refreshedPrevSeasonData, error: refreshedPsError } = await supabaseAdmin
                                .from('player_season_stats')
                                .select('season_name, total_points, minutes')
                                .eq('player_id', player.id)
                                .order('season_name', { ascending: false })
                                .limit(1)
                                .single();

                            if (refreshedPsError && refreshedPsError.code !== 'PGRST116') {
                                console.error(`Error re-fetching previous season summary for player ${player.id} after detail fetch:`, refreshedPsError);
                            } else if (refreshedPrevSeasonData) {
                                prevSeasonData = refreshedPrevSeasonData;
                                console.log(`Successfully fetched and assigned previous_season_summary for player ${player.id} after detail fetch.`);
                            } else {
                                console.log(`Still no previous_season_summary for player ${player.id} after detail fetch and re-query.`);
                            }
                        } catch (detailFetchError) {
                            console.error(`Error calling getPlayerDetail for player ${player.id} within getPlayers:`, detailFetchError);
                        }
                    } else if (psError) {
                        console.error(`Error fetching previous season summary for player ${player.id}:`, psError);
                    }

                    if (prevSeasonData) {
                        player.previous_season_summary = {
                            season_name: prevSeasonData.season_name,
                            total_points: prevSeasonData.total_points,
                            minutes: prevSeasonData.minutes,
                        };
                    }
                    return player;
                });

                const resolvedEnrichedPlayers = await Promise.all(enrichedPlayersPromises);
                return resolvedEnrichedPlayers;
            },
            'bootstrap-static'
        );
    },

    /**
     * Get all gameweeks with Redis caching
     */
    async getGameweeks(): Promise<Gameweek[]> {
        return fetchWithCache<Gameweek[]>(
            'fpl:gameweeks',
            async () => {
                const bootstrapData = await fplApi.getBootstrapStatic();
                return bootstrapData.events.map(transformers.transformApiGameweek);
            },
            'bootstrap-static'
        );
    },

    /**
     * Get current gameweek
     */
    async getCurrentGameweek(): Promise<Gameweek | null> {
        const gameweeks = await this.getGameweeks();
        return gameweeks.find((gw) => gw.is_current) || null;
    },

    /**
     * Get next gameweek
     */
    async getNextGameweek(): Promise<Gameweek | null> {
        const gameweeks = await this.getGameweeks();
        return gameweeks.find((gw) => gw.is_next) || null;
    },

    /**
     * Get fixtures, optionally filtered by gameweek.
     * Returns raw FplFixture objects as per your newer service.ts structure.
     */
    async getFixtures(gameweekId?: number): Promise<FplFixture[]> {
        const cacheKey = `fpl:fixtures${gameweekId ? `:gw:${gameweekId}` : ':all'}`;

        return fetchWithCache<FplFixture[]>(
            cacheKey,
            async () => {
                let fixturesData = await fplApi.getFixtures();

                if (gameweekId) {
                    fixturesData = fixturesData.filter(
                        (fixture: FplFixture) => fixture.event === gameweekId
                    );
                }
                return fixturesData;
            },
            'fixtures'
        );
    },
    
    /**
     * Get fixtures in the application's Fixture format, optionally filtered by gameweek
     */
    async getFormattedFixtures(gameweekId?: number): Promise<Fixture[]> {
        const fixturesData = await this.getFixtures(gameweekId);
        return fixturesData.map(transformers.transformApiFixture);
    },

    /**
     * Get detailed player information from FPL API and persist/update
     * historical data in PostgreSQL.
     */
    async getPlayerDetail(playerId: number): Promise<PlayerDetailResponse> {
        const cacheKey = `fpl:player:${playerId}:detail:raw`; // Cache for the raw API response

        return fetchWithCache<PlayerDetailResponse>(
            cacheKey,
            async () => {
                const playerDetailData = await fplApi.getPlayerDetail(playerId);

                if (playerDetailData) {
                    const supabaseAdmin = createAdminSupabaseClient();

                    // 1. Update player_season_stats (history_past)
                    if (playerDetailData.history_past && playerDetailData.history_past.length > 0) {
                        const seasonStatsRecords = playerDetailData.history_past.map(
                            (season: PlayerHistoryPast) => transformers.transformPlayerSeasonStats(playerId, season)
                        );

                        const { error: seasonStatsError } = await supabaseAdmin
                            .from('player_season_stats')
                            .upsert(seasonStatsRecords, { onConflict: 'player_id, season_name' });

                        if (seasonStatsError) {
                            console.error(`Error upserting player_season_stats for player ${playerId}:`, seasonStatsError);
                        } else {
                            console.log(`Upserted player_season_stats for player ${playerId}`);
                        }
                    }

                    // 2. Update player_gameweek_stats (history - current season from player detail)
                    if (playerDetailData.history && playerDetailData.history.length > 0) {
                        const gameweekStatsRecords = playerDetailData.history.map(
                            (gwStat: PlayerHistory) => transformers.transformPlayerGameweekStats(playerId, gwStat)
                        );

                        const { error: gameweekStatsError } = await supabaseAdmin
                            .from('player_gameweek_stats')
                            .upsert(gameweekStatsRecords, { onConflict: 'player_id, gameweek_id' });
                        
                        if (gameweekStatsError) {
                            console.error(`Error upserting player_gameweek_stats for player ${playerId} from detail history:`, gameweekStatsError);
                        } else {
                            console.log(`Upserted player_gameweek_stats for player ${playerId} from detail history`);
                            // Invalidate enriched player cache after this successful update because getPlayers() uses player_gameweek_stats
                            await cacheInvalidator.invalidatePattern('fpl:players:enriched*');
                             console.log(`Invalidated fpl:players:enriched* cache after player ${playerId} detail history update.`);
                        }
                    }
                }
                return playerDetailData;
            },
            'player-detail' // Cache category for the raw API response
        );
    },

    /**
     * Get player's gameweek stats (current season)
     */
    async getPlayerGameweekStats(
        playerId: number,
        gameweekId: number
    ): Promise<PlayerGameweekHistoryPoint | null> {
        const cacheKey = `fpl:player:${playerId}:gwstats:${gameweekId}`;
        try {
            const cachedData = await redis.get(cacheKey);
            if (cachedData) return JSON.parse(cachedData);
        } catch (error) { console.warn(`Redis cache error for ${cacheKey}:`, error); }

        try {
            const supabaseAdmin = createAdminSupabaseClient();
            const { data, error } = await supabaseAdmin
                .from('player_gameweek_stats')
                .select('gameweek_id, total_points, minutes')
                .eq('player_id', playerId)
                .eq('gameweek_id', gameweekId)
                .single();

            if (data && !error) {
                const result = { gameweek: data.gameweek_id, points: data.total_points, minutes: data.minutes };
                await redis.set(cacheKey, JSON.stringify(result), 'EX', 60 * 60 * 12); // 12 hours
                return result;
            }
        } catch (dbError) { console.warn(`Database error fetching player_gameweek_stats for player ${playerId} GW ${gameweekId}:`, dbError); }

        // Fallback to live API if appropriate (though player_gameweek_stats should be the source of truth for completed GWs)
        // This part might need refinement based on whether you expect to get historical from live API.
        // The `seed-database` and `getPlayerDetail` should populate historical data.
        try {
            const liveData = await this.getLiveGameweek(gameweekId);
            if (liveData && liveData.elements && Array.isArray(liveData.elements)) {
                const elementDetail = liveData.elements.find(el => el.id === playerId);
                if (elementDetail && elementDetail.stats) {
                    const stats = elementDetail.stats;
                    const result = { gameweek: gameweekId, points: stats.total_points, minutes: stats.minutes };
                    await redis.set(cacheKey, JSON.stringify(result), 'EX', 60 * 15); // Shorter TTL for live
                    return result;
                }
            }
        } catch (apiError) { console.error(`API error fetching live gameweek ${gameweekId} for player stats:`, apiError); }
        return null;
    },
    
    /**
     * Get multiple players' gameweek stats in batch (current season)
     * @param playerIds Array of player IDs to fetch stats for
     * @param gameweekId Gameweek ID to fetch stats for
     * @returns Map of player ID to their gameweek stats
     */
    async getPlayersGameweekStatsBatch(
        playerIds: number[],
        gameweekId: number
    ): Promise<Record<number, PlayerGameweekHistoryPoint>> {
        // Deduplicate player IDs
        const uniquePlayerIds = Array.from(new Set(playerIds));
        
        if (uniquePlayerIds.length === 0) {
            return {};
        }
        
        // Create batch fetch items
        const batchItems = uniquePlayerIds.map(playerId => ({
            cacheKey: `fpl:player:${playerId}:gwstats:${gameweekId}`,
            fetchFn: async () => {
                return await this.getPlayerGameweekStats(playerId, gameweekId);
            }
        }));
        
        // Use batch fetch
        const results = await batchFetchWithCache(batchItems, 60 * 60 * 12, { // 12 hours TTL
            useParallel: true,
            continueOnError: true
        });
        
        // Convert to map by player ID, filtering out nulls and errors
        return results.reduce((acc, result, index) => {
            if (result && !(result instanceof Error)) {
                acc[uniquePlayerIds[index]] = result;
            }
            return acc;
        }, {} as Record<number, PlayerGameweekHistoryPoint>);
    },

    /**
     * Get player's season stats from history
     */
    async getPlayerSeasonStats(
        playerId: number,
        seasonName?: string
    ): Promise<PlayerHistoryPast | PlayerHistoryPast[] | null> {
        // This method now primarily relies on getPlayerDetail to populate the DB,
        // and then data should be queried directly from player_season_stats table if needed elsewhere,
        // or via the enriched getPlayers() method.
        // For direct access for this specific function, let's query the DB after ensuring detail is fetched.
        await this.getPlayerDetail(playerId); // Ensures data is in DB if available from API

        const supabaseAdmin = createAdminSupabaseClient();
        let query = supabaseAdmin
            .from('player_season_stats')
            .select('*') // Select all fields as PlayerHistoryPast has many
            .eq('player_id', playerId);

        if (seasonName) {
            const { data, error } = await query.eq('season_name', seasonName).single();
            if (error && error.code !== 'PGRST116') console.error(`Error fetching player_season_stats for player ${playerId}, season ${seasonName}:`, error);
            return data || null;
        } else {
            const { data, error } = await query.order('season_name', { ascending: false });
            if (error) console.error(`Error fetching all player_season_stats for player ${playerId}:`, error);
            return data || [];
        }
    },
    
    /**
     * Get players by IDs with efficient batch fetching
     * @param playerIds Array of player IDs to fetch
     * @returns Record of player ID to player object
     */
    async getPlayersByIds(playerIds: number[]): Promise<Record<number, Player>> {
        // Deduplicate player IDs
        const uniquePlayerIds = Array.from(new Set(playerIds));
        
        if (uniquePlayerIds.length === 0) {
            return {};
        }
        
        // If requesting many players, more efficient to get all players and filter
        if (uniquePlayerIds.length > 20) {
            const allPlayers = await this.getPlayers();
            return allPlayers.reduce((acc, player) => {
                if (uniquePlayerIds.includes(player.id)) {
                    acc[player.id] = player;
                }
                return acc;
            }, {} as Record<number, Player>);
        }
        
        // For smaller sets, use batch fetch
        const batchItems = uniquePlayerIds.map(playerId => ({
            cacheKey: `fpl:player:${playerId}:enriched`,
            fetchFn: async () => {
                const allPlayers = await this.getPlayers();
                return allPlayers.find(p => p.id === playerId) || null;
            }
        }));
        
        // Use the batch fetch function
        const players = await batchFetchWithCache(batchItems, calculateTtl('bootstrap-static'), {
            useParallel: true,
            continueOnError: true
        });
        
        // Convert array result to record by player ID
        return players.reduce((acc, player, index) => {
            if (player && !(player instanceof Error)) {
                acc[uniquePlayerIds[index]] = player;
            }
            return acc;
        }, {} as Record<number, Player>);
    },

    /**
     * Get live gameweek data
     */
    async getLiveGameweek(gameweekId: number): Promise<GameweekLiveResponse | null> {
        const cacheKey = `fpl:gameweek:${gameweekId}:live:raw`;
        const shortTtl = 15 * 60; // 15 minutes

        try {
            const cachedData = await redis.get(cacheKey);
            if (cachedData) return JSON.parse(cachedData);
        } catch (error) { console.warn(`Redis cache error for live gameweek ${gameweekId}:`, error); }

        try {
            const liveData = await fplApi.getGameweekLive(gameweekId);
            if (liveData) { // Check if liveData is not null/undefined
                await redis.set(cacheKey, JSON.stringify(liveData), 'EX', shortTtl);
            }
            return liveData;
        } catch (error) {
            console.error(`Error fetching live gameweek for ID ${gameweekId}:`, error);
            // Do not throw, allow service to continue, return null
            return null;
        }
    },

    /**
     * Check if any matches are currently in progress
     */
    async isGameweekActive(): Promise<boolean> {
        try {
            const currentGameweek = await this.getCurrentGameweek();
            if (!currentGameweek) return false;

            const fixturesResponse = await this.getFixtures(currentGameweek.id); // Returns FplFixture[]
            const now = new Date();

            return fixturesResponse.some((fixture: FplFixture) => {
                if (!fixture.kickoff_time) return false;
                const kickoff = new Date(fixture.kickoff_time);
                // A match is active from kickoff until its 'finished' flag is true.
                return kickoff <= now && !fixture.finished;
            });
        } catch (error) {
            console.error('Error checking if gameweek is active:', error);
            return false;
        }
    },

    /**
     * Update player stats in database for a completed gameweek using live data.
     * This is typically called by a cron job after a gameweek finishes.
     */
    async updatePlayerStats(gameweekId: number): Promise<boolean> {
        try {
            const gameweeks = await this.getGameweeks();
            const gameweekInfo = gameweeks.find((gw) => gw.id === gameweekId);

            if (!gameweekInfo || !gameweekInfo.finished) {
                console.log(`Gameweek ${gameweekId} not yet finished or not found, skipping player_gameweek_stats update.`);
                return false;
            }
            // Additional check: ensure is_player_stats_synced is false if you want to avoid re-syncing
            // if (gameweekInfo.is_player_stats_synced === true) {
            //     console.log(`Player stats for Gameweek ${gameweekId} already synced.`);
            //     return true;
            // }


            const liveData = await this.getLiveGameweek(gameweekId);
            if (!liveData || !liveData.elements || !Array.isArray(liveData.elements)) {
                console.error(`No live elements data or incorrect format for Gameweek ${gameweekId}. Cannot update player stats.`);
                return false;
            }

            console.log(`Updating player_gameweek_stats for completed gameweek ${gameweekId}`);
            const supabaseAdmin = createAdminSupabaseClient();
            const playerStatsToUpsert = [];

            for (const elementDetail of liveData.elements) {
                const stats = elementDetail.stats;
                if (stats && stats.minutes > 0) {
                    // Create a PlayerHistory-like object from elementDetail.stats
                    const playerHistoryData: PlayerHistory = {
                        element: elementDetail.id,
                        fixture: 0, // Not relevant for this context
                        opponent_team: 0, // Not relevant for this context
                        round: gameweekId,
                        was_home: false, // Not relevant for this context
                        kickoff_time: '', // Not relevant for this context
                        total_points: stats.total_points || 0,
                        value: 0, // Not relevant for this context
                        minutes: stats.minutes || 0,
                        goals_scored: stats.goals_scored || 0,
                        assists: stats.assists || 0,
                        clean_sheets: stats.clean_sheets || 0,
                        goals_conceded: stats.goals_conceded || 0,
                        own_goals: stats.own_goals || 0,
                        penalties_saved: stats.penalties_saved || 0,
                        penalties_missed: stats.penalties_missed || 0,
                        yellow_cards: stats.yellow_cards || 0,
                        red_cards: stats.red_cards || 0,
                        saves: stats.saves || 0,
                        bonus: stats.bonus || 0,
                        bps: stats.bps || 0,
                        influence: stats.influence || '0.0',
                        creativity: stats.creativity || '0.0',
                        threat: stats.threat || '0.0',
                        ict_index: stats.ict_index || '0.0',
                    };
                    
                    // Use the transformer function for consistency
                    playerStatsToUpsert.push(transformers.transformPlayerGameweekStats(
                        elementDetail.id, 
                        playerHistoryData
                    ));
                }
            }

            if (playerStatsToUpsert.length > 0) {
                const BATCH_SIZE = 50; // Consistent with seed script
                for (let i = 0; i < playerStatsToUpsert.length; i += BATCH_SIZE) {
                    const batch = playerStatsToUpsert.slice(i, i + BATCH_SIZE);
                    const { error } = await supabaseAdmin
                        .from('player_gameweek_stats')
                        .upsert(batch, { onConflict: 'player_id, gameweek_id' });

                    if (error) {
                        console.error(`Error upserting player_gameweek_stats batch for GW ${gameweekId}:`, error);
                        // Decide if one batch failure should stop all for this GW
                    }
                }
                console.log(`Upserted stats for ${playerStatsToUpsert.length} players in gameweek ${gameweekId}`);
            } else {
                console.log(`No player stats with minutes > 0 to upsert for gameweek ${gameweekId}`);
            }
            
            // Mark gameweek as synced
            const { error: updateGwError } = await supabaseAdmin
                .from('gameweeks')
                .update({ is_player_stats_synced: true }) // updated_at handled by trigger
                .eq('id', gameweekId);
            if (updateGwError) console.error(`Failed to update is_player_stats_synced for GW ${gameweekId}:`, updateGwError);
            else console.log(`Marked GW ${gameweekId} as player_stats_synced.`);

            return true;
        } catch (error) {
            console.error(`Error in updatePlayerStats for GW ${gameweekId}:`, error);
            return false;
        }
    },

    /**
     * Update fixture results in database for completed fixtures
     */
    async updateFixtureResults(): Promise<boolean> {
        try {
            const supabaseAdmin = createAdminSupabaseClient();
            const fplFixtures = await this.getFixtures(); // Gets all raw FplFixture[]

            const completedFixturesToUpsert = fplFixtures
                .filter(f => f.finished && f.team_h_score !== null && f.team_a_score !== null)
                .map((fixture: FplFixture) => ({
                    id: fixture.id, // PK
                    code: fixture.code,
                    gameweek_id: fixture.event,
                    home_team_id: fixture.team_h,
                    away_team_id: fixture.team_a,
                    kickoff_time: fixture.kickoff_time,
                    finished: fixture.finished,
                    finished_provisional: fixture.finished_provisional,
                    started: fixture.started,
                    minutes: fixture.minutes,
                    team_h_score: fixture.team_h_score,
                    team_a_score: fixture.team_a_score,
                    team_h_difficulty: fixture.team_h_difficulty,
                    team_a_difficulty: fixture.team_a_difficulty,
                    pulse_id: fixture.pulse_id,
                    // last_updated / updated_at handled by DB
                }));
            
            if (completedFixturesToUpsert.length === 0) {
                console.log('No completed fixture results to update in DB.');
                return true;
            }

            console.log(`Updating ${completedFixturesToUpsert.length} completed fixture results in DB.`);
            const BATCH_SIZE = 50;
            for (let i = 0; i < completedFixturesToUpsert.length; i += BATCH_SIZE) {
                const batch = completedFixturesToUpsert.slice(i, i + BATCH_SIZE);
                const { error } = await supabaseAdmin
                    .from('fixtures')
                    .upsert(batch, { onConflict: 'id' });

                if (error) {
                    console.error('Error upserting fixture results batch to DB:', error);
                    // Potentially return false or throw, depending on desired error handling
                }
            }
            return true;
        } catch (error) {
            console.error('Error updating fixture results in DB:', error);
            return false;
        }
    },

    /**
     * Updates all FPL data in Redis cache and database where appropriate
     * This would typically be called by a cron job
     */
    async updateAllData(): Promise<boolean> {
        try {
            console.log('Starting full FPL data update (Redis and DB)...');

            // 1. Fetch fresh bootstrap-static data (contains events, teams, elements)
            const bootstrapData = await fplApi.getBootstrapStatic();
            if (!bootstrapData) {
                console.error('Failed to fetch bootstrap-static data. Aborting updateAllData.');
                return false;
            }

            // 2. Fetch fresh fixtures data
            const fplFixturesAll = await fplApi.getFixtures(); // Raw FPL API fixtures
            if (!fplFixturesAll) {
                console.error('Failed to fetch fixtures data. Aborting updateAllData.');
                return false;
            }

            // 3. Prepare data for Redis cache using transformers
            const { teams: teamsForCache, players: playersForCache, gameweeks: gameweeksForCache } = 
                transformers.transformBootstrapData(bootstrapData);
            
            // Raw FPL fixtures are fine for fpl:fixtures cache if that's what downstream consumers expect
            const fixturesForCache: FplFixture[] = fplFixturesAll;


            // 4. Update Redis Cache using batch set
            const cacheItems = [
                { cacheKey: 'fpl:bootstrap-static', data: bootstrapData },
                { cacheKey: 'fpl:teams', data: teamsForCache },
                { cacheKey: 'fpl:gameweeks', data: gameweeksForCache },
                { cacheKey: 'fpl:players:basic', data: playersForCache },
                { cacheKey: 'fpl:fixtures:all', data: fixturesForCache }
            ];
            
            // Use our new batchCacheSet function for better performance
            await batchCacheSet(cacheItems, calculateTtl('bootstrap-static'));
            
            // Cache live data for current gameweek if any
            const currentGameweek = bootstrapData.events.find((gw: FplEvent) => gw.is_current);
            if (currentGameweek) {
                const liveData = await this.getLiveGameweek(currentGameweek.id); // Uses its own caching
                if (liveData) { // getLiveGameweek now returns null on error
                    await redis.set(`fpl:gameweek:${currentGameweek.id}:live:raw`, JSON.stringify(liveData), 'EX', calculateTtl('live'));
                }
            }
            console.log('Core FPL data updated in Redis cache.');

            // 5. Update Database Tables
            // These are already handled by the `seed-database.ts` initial population
            // and by on-demand calls to getPlayerDetail or dedicated sync functions.
            // However, a full sync might also update fixtures and player stats for recently completed GWS.

            await this.updateFixtureResults(); // Persists finished fixture scores to DB

            const completedGameweeks = gameweeksForCache.filter((gw: Gameweek) => gw.finished && gw.is_player_stats_synced !== true);
            for (const gameweek of completedGameweeks) {
                console.log(`Syncing player stats for recently completed Gameweek ${gameweek.id}`);
                await this.updatePlayerStats(gameweek.id); // Persists player_gameweek_stats
            }
            
            // Note: Bootstrap static data (teams, basic player info, gameweeks) is usually seeded once
            // and then updated if there are structural changes or new season data.
            // The `fpl:players:enriched` cache is populated by `getPlayers()` on demand.

            // 6. Setup cache invalidation schedules
            const upcomingGameweeks = gameweeksForCache.filter((gw: Gameweek) => {
                if (!gw.deadline_time) return false;
                const deadline = new Date(gw.deadline_time);
                return deadline > new Date();
            });
            if (upcomingGameweeks.length > 0) {
                await cacheInvalidator.setupScheduledInvalidation(upcomingGameweeks);
            }

            console.log('Full FPL data update process completed.');
            return true;
        } catch (error) {
            console.error('Error in updateAllData:', error);
            // Consider re-throwing if this is a critical failure for a cron job
            return false;
        }
    },

    /**
     * Initialize FPL service
     * Sets up cache invalidation timers based on gameweek deadlines
     */
    async initialize(): Promise<void> {
        try {
            console.log('Initializing FPL Service...');
            const gameweeks = await this.getGameweeks(); // Ensures gameweeks are cached/fetched
            if (gameweeks && gameweeks.length > 0) {
                await cacheInvalidator.setupScheduledInvalidation(gameweeks);

                const isActive = await this.isGameweekActive();
                if (isActive) {
                    const currentGameweek = await this.getCurrentGameweek();
                    if (currentGameweek) {
                        console.log(`Setting up frequent invalidation for active Gameweek ${currentGameweek.id}`);
                        // This interval should be managed (cleared) if the service stops or gameweek ends
                        // For a long-running service, consider a more robust scheduling mechanism than setInterval
                        // For now, this matches your older version's intent.
                        setInterval(async () => {
                            if (await this.isGameweekActive()) { // Re-check if still active
                                await cacheInvalidator.invalidateLiveData(currentGameweek.id);
                            }
                        }, 5 * 60 * 1000); // 5 minutes
                    }
                }
            }
            console.log('FPL service initialized with cache invalidation schedules.');
        } catch (error) {
            console.error('Error initializing FPL service:', error);
        }
    },
};

