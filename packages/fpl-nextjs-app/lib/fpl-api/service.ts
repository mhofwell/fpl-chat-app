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
import { fetchWithCache } from './cache-helper';
import { cacheInvalidator } from './cache-invalidator';
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
                return bootstrapData.teams.map((apiTeam: FplTeam) => ({
                    id: apiTeam.id,
                    name: apiTeam.name,
                    short_name: apiTeam.short_name,
                    code: apiTeam.code,
                    played: apiTeam.played,
                    form: apiTeam.form,
                    loss: apiTeam.loss,
                    points: apiTeam.points,
                    position: apiTeam.position,
                    strength: apiTeam.strength,
                    draw: apiTeam.draw,
                    win: apiTeam.win,
                    strength_overall_home: apiTeam.strength_overall_home,
                    strength_overall_away: apiTeam.strength_overall_away,
                    strength_attack_home: apiTeam.strength_attack_home,
                    strength_attack_away: apiTeam.strength_attack_away,
                    strength_defence_home: apiTeam.strength_defence_home,
                    strength_defence_away: apiTeam.strength_defence_away,
                    pulse_id: apiTeam.pulse_id,
                }));
            },
            'bootstrap-static'
        );
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
                let basicPlayers = bootstrapData.elements.map((apiPlayer: FplElement) => ({
                    id: apiPlayer.id,
                    web_name: apiPlayer.web_name,
                    full_name: `${apiPlayer.first_name} ${apiPlayer.second_name}`,
                    first_name: apiPlayer.first_name,
                    second_name: apiPlayer.second_name,
                    team_id: apiPlayer.team,
                    element_type: apiPlayer.element_type,
                    position: apiPlayer.element_type === 1 ? 'GKP' : apiPlayer.element_type === 2 ? 'DEF' : apiPlayer.element_type === 3 ? 'MID' : 'FWD',
                    form: apiPlayer.form,
                    points_per_game: apiPlayer.points_per_game,
                    total_points: apiPlayer.total_points,
                    minutes: apiPlayer.minutes,
                    goals_scored: apiPlayer.goals_scored,
                    assists: apiPlayer.assists,
                    clean_sheets: apiPlayer.clean_sheets,
                    goals_conceded: apiPlayer.goals_conceded,
                    own_goals: apiPlayer.own_goals,
                    penalties_saved: apiPlayer.penalties_saved,
                    penalties_missed: apiPlayer.penalties_missed,
                    yellow_cards: apiPlayer.yellow_cards,
                    red_cards: apiPlayer.red_cards,
                    saves: apiPlayer.saves,
                    bonus: apiPlayer.bonus,
                    bps: apiPlayer.bps,
                    status: apiPlayer.status,
                    news: apiPlayer.news,
                    news_added: apiPlayer.news_added,
                    chance_of_playing_next_round: apiPlayer.chance_of_playing_next_round,
                    chance_of_playing_this_round: apiPlayer.chance_of_playing_this_round,
                    influence: apiPlayer.influence,
                    creativity: apiPlayer.creativity,
                    threat: apiPlayer.threat,
                    ict_index: apiPlayer.ict_index,
                    ep_next: apiPlayer.ep_next,
                    ep_this: apiPlayer.ep_this,
                    selected_by_percent: apiPlayer.selected_by_percent,
                    transfers_in: apiPlayer.transfers_in,
                    transfers_out: apiPlayer.transfers_out,
                    dreamteam_count: apiPlayer.dreamteam_count,
                    now_cost: apiPlayer.now_cost,
                    cost_change_start: apiPlayer.cost_change_start,
                    cost_change_event: apiPlayer.cost_change_event,
                    cost_change_event_fall: apiPlayer.cost_change_event_fall,
                    cost_change_start_fall: apiPlayer.cost_change_start_fall,
                    current_season_performance: [] as PlayerGameweekHistoryPoint[],
                    previous_season_summary: null as PlayerSeasonSummaryStats | null,
                }));

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
                return bootstrapData.events.map((gw: FplEvent) => ({
                    id: gw.id,
                    name: gw.name,
                    deadline_time: gw.deadline_time,
                    is_current: gw.is_current,
                    is_next: gw.is_next,
                    finished: gw.finished,
                    data_checked: gw.data_checked,
                    is_previous: gw.is_previous,
                    average_entry_score: gw.average_entry_score,
                    is_player_stats_synced: false,
                }));
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
                        const seasonStatsRecords = playerDetailData.history_past.map((season: PlayerHistoryPast) => ({
                            player_id: playerId,
                            season_name: season.season_name,
                            element_code: season.element_code,
                            start_cost: season.start_cost,
                            end_cost: season.end_cost,
                            minutes: season.minutes,
                            goals_scored: season.goals_scored,
                            assists: season.assists,
                            clean_sheets: season.clean_sheets,
                            goals_conceded: season.goals_conceded,
                            own_goals: season.own_goals,
                            penalties_saved: season.penalties_saved,
                            penalties_missed: season.penalties_missed,
                            yellow_cards: season.yellow_cards,
                            red_cards: season.red_cards,
                            saves: season.saves,
                            bonus: season.bonus,
                            bps: season.bps,
                            influence: season.influence, // Stored as text as per your migration.sql
                            creativity: season.creativity, // Stored as text
                            threat: season.threat,       // Stored as text
                            ict_index: season.ict_index,   // Stored as text
                            total_points: season.total_points,
                            // created_at and updated_at are handled by DB
                        }));

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
                        const gameweekStatsRecords = playerDetailData.history.map((gwStat: PlayerHistory) => ({
                            player_id: playerId, 
                            gameweek_id: gwStat.round, // 'round' from API maps to gameweek_id
                            minutes: gwStat.minutes,
                            goals_scored: gwStat.goals_scored,
                            assists: gwStat.assists,
                            clean_sheets: gwStat.clean_sheets,
                            goals_conceded: gwStat.goals_conceded,
                            own_goals: gwStat.own_goals,
                            penalties_saved: gwStat.penalties_saved,
                            penalties_missed: gwStat.penalties_missed,
                            yellow_cards: gwStat.yellow_cards,
                            red_cards: gwStat.red_cards,
                            saves: gwStat.saves,
                            bonus: gwStat.bonus,
                            bps: gwStat.bps,
                            influence: parseFloat(gwStat.influence || '0.0').toFixed(1) as unknown as number, // DB expects NUMERIC
                            creativity: parseFloat(gwStat.creativity || '0.0').toFixed(1) as unknown as number,
                            threat: parseFloat(gwStat.threat || '0.0').toFixed(1) as unknown as number,
                            ict_index: parseFloat(gwStat.ict_index || '0.0').toFixed(1) as unknown as number,
                            total_points: gwStat.total_points,
                            // created_at and updated_at are handled by DB
                        }));

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
            // if (gameweekInfo.is_player_stats_synced) {
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
                    playerStatsToUpsert.push({
                        player_id: elementDetail.id,
                        gameweek_id: gameweekId,
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
                        influence: parseFloat(stats.influence || '0.0').toFixed(1) as unknown as number,
                        creativity: parseFloat(stats.creativity || '0.0').toFixed(1) as unknown as number,
                        threat: parseFloat(stats.threat || '0.0').toFixed(1) as unknown as number,
                        ict_index: parseFloat(stats.ict_index || '0.0').toFixed(1) as unknown as number,
                        total_points: stats.total_points || 0,
                        // created_at and updated_at handled by DB
                    });
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

            // 3. Prepare data for Redis cache (domain objects or structured raw data)
            // These mappings are simplified from your older version for brevity
            // Ensure your Team, Gameweek, Player types in @fpl-chat-app/types are comprehensive
            const teamsForCache: Team[] = bootstrapData.teams.map((t: FplTeam) => ({ ...t } as Team)); // Adjust mapping
            const gameweeksForCache: Gameweek[] = bootstrapData.events.map((e: FplEvent) => ({ ...e, name: e.name || `Gameweek ${e.id}` } as Gameweek));
            const playersForCache: Player[] = bootstrapData.elements.map((el: FplElement) => ({
                ...el,
                full_name: `${el.first_name} ${el.second_name}`,
                team_id: el.team, // Map 'team' to 'team_id'
                position: el.element_type === 1 ? 'GKP' : el.element_type === 2 ? 'DEF' : el.element_type === 3 ? 'MID' : 'FWD',
                current_season_performance: [], // Will be enriched by getPlayers if called
                previous_season_summary: null,  // Will be enriched
            } as Player));
            
            // Raw FPL fixtures are fine for fpl:fixtures cache if that's what downstream consumers expect
            const fixturesForCache: FplFixture[] = fplFixturesAll;


            // 4. Update Redis Cache using pipeline
            const pipeline = redis.pipeline();
            pipeline.set('fpl:bootstrap-static', JSON.stringify(bootstrapData), 'EX', calculateTtl('bootstrap-static'));
            pipeline.set('fpl:teams', JSON.stringify(teamsForCache), 'EX', calculateTtl('bootstrap-static')); // Derived from bootstrap
            pipeline.set('fpl:gameweeks', JSON.stringify(gameweeksForCache), 'EX', calculateTtl('bootstrap-static')); // Derived from bootstrap
            pipeline.set('fpl:players:basic', JSON.stringify(playersForCache), 'EX', calculateTtl('bootstrap-static')); // Basic players, before enrichment
            pipeline.set('fpl:fixtures:all', JSON.stringify(fixturesForCache), 'EX', calculateTtl('fixtures'));
            
            // Cache live data for current gameweek if any
            const currentGameweek = bootstrapData.events.find((gw: FplEvent) => gw.is_current);
            if (currentGameweek) {
                const liveData = await this.getLiveGameweek(currentGameweek.id); // Uses its own caching
                if (liveData) { // getLiveGameweek now returns null on error
                    pipeline.set(`fpl:gameweek:${currentGameweek.id}:live:raw`, JSON.stringify(liveData), 'EX', calculateTtl('live'));
                }
            }
            await pipeline.exec();
            console.log('Core FPL data updated in Redis cache.');

            // 5. Update Database Tables
            // These are already handled by the `seed-database.ts` initial population
            // and by on-demand calls to getPlayerDetail or dedicated sync functions.
            // However, a full sync might also update fixtures and player stats for recently completed GWS.

            await this.updateFixtureResults(); // Persists finished fixture scores to DB

            const completedGameweeks = gameweeksForCache.filter((gw: Gameweek) => gw.finished && !gw.is_player_stats_synced);
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

