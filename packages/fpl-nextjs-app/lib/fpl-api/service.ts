import { fplApi } from './client';
import redis from '../redis/redis-client';
import { Team, Player, Gameweek, Fixture } from 'fpl-domain.types'; // Corrected path
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
} from 'fpl-api.types'; // Corrected path
import { calculateTtl } from './client';
import { fetchWithCache } from './cache-helper';
import { cacheInvalidator } from './cache-invalidator';
import { createClient } from '@/utils/supabase/server';

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
                    form: apiTeam.form,
                    played: apiTeam.played,
                    points: apiTeam.points,
                    position: apiTeam.position,
                    strength: apiTeam.strength,
                    strength_attack_home: apiTeam.strength_attack_home,
                    strength_attack_away: apiTeam.strength_attack_away,
                    strength_defence_home: apiTeam.strength_defence_home,
                    strength_defence_away: apiTeam.strength_defence_away,
                    win: apiTeam.win,
                    loss: apiTeam.loss,
                    draw: apiTeam.draw,
                    strength_overall_home: apiTeam.strength_overall_home,
                    strength_overall_away: apiTeam.strength_overall_away,
                    pulse_id: apiTeam.pulse_id,
                    last_updated: new Date().toISOString(),
                }));
            },
            'bootstrap-static'
        );
    },

    /**
     * Get all players with Redis caching and optional filtering
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
                    last_updated: new Date().toISOString(),
                    current_season_performance: [],
                    previous_season_summary: null,
                }));

                if (options?.teamId) {
                    basicPlayers = basicPlayers.filter((p: Player) => p.team_id === options.teamId);
                }
                if (options?.position) {
                    basicPlayers = basicPlayers.filter((p: Player) => p.position === options.position);
                }

                const supabase = await createClient();

                const enrichedPlayersPromises = basicPlayers.map(async (player: Player) => {
                    // Fetch current season performance
                    const { data: currentSeasonStats, error: csError } = await supabase
                        .from('player_gameweek_stats')
                        .select('gameweek_id, total_points, minutes') // Select only necessary fields
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
                    let { data: prevSeasonData, error: psError } = await supabase
                        .from('player_season_stats')
                        .select('season_name, total_points, minutes') // Select only necessary fields
                        .eq('player_id', player.id)
                        .order('season_name', { ascending: false })
                        .limit(1)
                        .single();

                    // If previous season data is not found, and it's the specific error indicating no rows
                    if (psError && psError.code === 'PGRST116') { // 'PGRST116' indicates that a single row was expected but not found
                        console.log(`No previous season summary for player ${player.id} in DB. Attempting to fetch details.`);
                        try {
                            // This will fetch from API, populate player_season_stats and player_gameweek_stats,
                            // and invalidate fpl:players:enriched* cache.
                            await this.getPlayerDetail(player.id); 
                            
                            // After getPlayerDetail runs and (potentially) populates the DB,
                            // re-attempt to fetch the previous_season_summary for the current player.
                            const { data: refreshedPrevSeasonData, error: refreshedPsError } = await supabase
                                .from('player_season_stats')
                                .select('season_name, total_points, minutes')
                                .eq('player_id', player.id)
                                .order('season_name', { ascending: false })
                                .limit(1)
                                .single();

                            if (refreshedPsError && refreshedPsError.code !== 'PGRST116') {
                                console.error(`Error re-fetching previous season summary for player ${player.id} after detail fetch:`, refreshedPsError);
                            } else if (refreshedPrevSeasonData) {
                                prevSeasonData = refreshedPrevSeasonData; // Assign the newly fetched data
                                console.log(`Successfully fetched and assigned previous_season_summary for player ${player.id} after detail fetch.`);
                            } else {
                                console.log(`Still no previous_season_summary for player ${player.id} after detail fetch and re-query.`);
                            }
                        } catch (detailFetchError) {
                            console.error(`Error calling getPlayerDetail for player ${player.id} within getPlayers:`, detailFetchError);
                        }
                    } else if (psError) { // Handle other errors for the initial fetch
                        console.error(`Error fetching previous season summary for player ${player.id}:`, psError);
                    }

                    // Populate previous_season_summary if data is available
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
            'bootstrap-static' // The primary source for this cache is still bootstrap-static.
                               // Enrichment happens on top. The invalidation of this cache key
                               // by getPlayerDetail is important.
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
                    name: `Gameweek ${gw.id}`,
                    deadline_time: gw.deadline_time,
                    is_current: gw.is_current,
                    is_next: gw.is_next,
                    finished: gw.finished,
                    last_updated: new Date().toISOString(),
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
     * Get fixtures for a specific gameweek
     */
    async getFixtures(gameweekId?: number): Promise<FplFixture[]> {
        const cacheKey = `fpl:fixtures${gameweekId ? `:gw:${gameweekId}` : ''}`;

        return fetchWithCache<FplFixture[]>(
            cacheKey,
            async () => {
                let fixturesData = await fplApi.getFixtures(); // Raw FplFixture[]

                // Filter by gameweek if specified, directly on the raw FplFixture objects
                if (gameweekId) {
                    fixturesData = fixturesData.filter(
                        (fixture: FplFixture) => fixture.event === gameweekId
                    );
                }
                return fixturesData; // Return the (potentially filtered) raw FplFixture array
            },
            'fixtures'
        );
    },

    /**
     * Get detailed player information
     */
    async getPlayerDetail(playerId: number): Promise<PlayerDetailResponse> {
        const cacheKey = `fpl:player:${playerId}:detail`;

        return fetchWithCache<PlayerDetailResponse>(
            cacheKey,
            async () => {
                const playerDetailData = await fplApi.getPlayerDetail(playerId);

                // After fetching from API, update anrichment tables in PostgreSQL
                if (playerDetailData) {
                    const supabase = await createClient();

                    // 1. Update player_season_stats (history_past)
                    if (playerDetailData.history_past && playerDetailData.history_past.length > 0) {
                        const seasonStatsRecords = playerDetailData.history_past.map((season: PlayerHistoryPast) => ({
                            player_id: playerId, // The current player's ID
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
                            influence: season.influence,
                            creativity: season.creativity,
                            threat: season.threat,
                            ict_index: season.ict_index,
                            total_points: season.total_points,
                            // last_updated will be set by the database trigger
                        }));

                        const { error: seasonStatsError } = await supabase
                            .from('player_season_stats')
                            .upsert(seasonStatsRecords, { onConflict: 'player_id, season_name' });

                        if (seasonStatsError) {
                            console.error(`Error upserting player_season_stats for player ${playerId}:`, seasonStatsError);
                            // Decide on error handling: throw, log, or continue
                        } else {
                            console.log(`Upserted player_season_stats for player ${playerId}`);
                        }
                    }

                    // 2. Update player_gameweek_stats (history - current season)
                    if (playerDetailData.history && playerDetailData.history.length > 0) {
                        const gameweekStatsRecords = playerDetailData.history.map((gwStat: PlayerHistory) => ({
                            player_id: playerId, // The current player's ID (element in history is also this player)
                            gameweek_id: gwStat.round, // 'round' usually corresponds to gameweek ID
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
                            influence: parseFloat(gwStat.influence || '0.0').toFixed(1),
                            creativity: parseFloat(gwStat.creativity || '0.0').toFixed(1),
                            threat: parseFloat(gwStat.threat || '0.0').toFixed(1),
                            ict_index: parseFloat(gwStat.ict_index || '0.0').toFixed(1),
                            total_points: gwStat.total_points,
                            // value: gwStat.value, 
                            // selected: gwStat.selected,
                            // transfers_balance: gwStat.transfers_balance,
                            // transfers_in: gwStat.transfers_in,
                            // transfers_out: gwStat.transfers_out,
                            // last_updated will be set by the database trigger
                        }));

                        const { error: gameweekStatsError } = await supabase
                            .from('player_gameweek_stats')
                            .upsert(gameweekStatsRecords, { onConflict: 'player_id, gameweek_id' });
                        
                        if (gameweekStatsError) {
                            console.error(`Error upserting player_gameweek_stats for player ${playerId} from detail history:`, gameweekStatsError);
                        } else {
                            console.log(`Upserted player_gameweek_stats for player ${playerId} from detail history`);
                            // Invalidate enriched player cache after this successful update
                            // This is important because getPlayers() uses player_gameweek_stats
                            // We might want a more targeted invalidation if possible, e.g., for just this player
                            // For now, a broader invalidation might be acceptable or a general one that handles this.
                            // Consider adding a specific invalidation for the 'fpl:players:enriched*' pattern
                            // or a more specific one if your `cacheInvalidator` supports it.
                            await cacheInvalidator.invalidatePattern('fpl:players:enriched*');
                             console.log(`Invalidated fpl:players:enriched* cache after player ${playerId} detail history update.`);
                        }
                    }
                }
                return playerDetailData;
            },
            'player-detail' // This 'category' for TTL calculation might need adjustment
                           // if the expectation is that `getPlayerDetail` now has side effects.
                           // The TTL should be for the raw API response cache.
                           // The DB persistence is a side effect.
        );
    },

    /**
     * Get player's gameweek stats (current season)
     */
    async getPlayerGameweekStats(
        playerId: number,
        gameweekId: number
    ): Promise<any> {
        // First try cache
        const cacheKey = `fpl:player:${playerId}:gameweek:${gameweekId}`;

        try {
            const cachedData = await redis.get(cacheKey);
            if (cachedData) {
                return JSON.parse(cachedData);
            }
        } catch (error) {
            console.warn(`Redis cache error for ${cacheKey}:`, error);
        }

        // Then try database for historical data
        try {
            const supabase = await createClient();
            const { data, error } = await supabase
                .from('player_gameweek_stats')
                .select('*')
                .eq('player_id', playerId)
                .eq('gameweek_id', gameweekId)
                .single();

            if (data && !error) {
                // Cache the result
                await redis.set(
                    cacheKey,
                    JSON.stringify(data),
                    'EX',
                    60 * 60 * 12
                ); // 12 hours
                return data;
            }
        } catch (dbError) {
            console.warn(`Database error for player stats:`, dbError);
        }

        // Finally try API for live data
        try {
            const liveData = await this.getLiveGameweek(gameweekId);
            if (
                liveData &&
                liveData.elements &&
                Array.isArray(liveData.elements) 
            ) {
                const playerData = liveData.elements.find(element => element.id === playerId);
                if (playerData) {
                    // Cache the result (playerData)
                    await redis.set(
                        cacheKey,
                        JSON.stringify(playerData.stats),
                        'EX',
                        60 * 15 
                    ); 
                    return playerData.stats;
                }
            }
        } catch (apiError) {
            console.error(`API error fetching live data:`, apiError);
        }

        return null;
    },

    /**
     * Get player's season stats from history
     */
    async getPlayerSeasonStats(
        playerId: number,
        season?: string
    ): Promise<any> {
        // Get player details which contains history_past
        const playerDetail = await this.getPlayerDetail(playerId);

        if (!playerDetail || !playerDetail.history_past) {
            return null;
        }

        // If season specified, find that season
        if (season) {
            return (
                playerDetail.history_past.find(
                    (s) => s.season_name === season
                ) || null
            );
        }

        // Otherwise return all seasons
        return playerDetail.history_past;
    },

    /**
     * Get live gameweek data
     */
    async getLiveGameweek(gameweekId: number): Promise<GameweekLiveResponse> {
        const cacheKey = `fpl:gameweek:${gameweekId}:live`;
        const shortTtl = 15 * 60; // 15 minutes TTL for live data

        try {
            // Try to get from cache first
            const cachedData = await redis.get(cacheKey);
            if (cachedData) {
                return JSON.parse(cachedData);
            }
        } catch (error) {
            console.warn(
                `Redis cache error for live gameweek ${gameweekId}:`,
                error
            );
        }

        // Fetch from API
        try {
            const liveData = await fplApi.getGameweekLive(gameweekId);

            // Store in cache with shorter TTL
            try {
                await redis.set(
                    cacheKey,
                    JSON.stringify(liveData),
                    'EX',
                    shortTtl
                );
            } catch (cacheError) {
                console.warn(
                    `Failed to cache live gameweek ${gameweekId}:`,
                    cacheError
                );
            }

            return liveData;
        } catch (error) {
            console.error(
                `Error fetching live gameweek for ID ${gameweekId}:`,
                error
            );
            throw error;
        }
    },

    /**
     * Check if any matches are currently in progress
     */
    async isGameweekActive(): Promise<boolean> {
        try {
            const currentGameweek = await this.getCurrentGameweek();
            if (!currentGameweek) return false;

            const fixtures = await this.getFixtures(currentGameweek.id);
            const now = new Date();

            return fixtures.some((fixture) => {
                if (!fixture.kickoff_time) return false;

                const kickoff = new Date(fixture.kickoff_time);
                // Consider matches active from kickoff until finished flag is true
                return kickoff <= now && !fixture.finished;
            });
        } catch (error) {
            console.error('Error checking if gameweek is active:', error);
            return false;
        }
    },

    /**
     * Update player stats in database for completed matches
     */
    async updatePlayerStats(gameweekId: number): Promise<boolean> {
        try {
            const supabase = await createClient();
            const liveData = await this.getLiveGameweek(gameweekId);

            if (!liveData || !liveData.elements) {
                return false;
            }

            // Check if gameweek is finished
            const gameweeks = await this.getGameweeks();
            const gameweek = gameweeks.find((gw) => gw.id === gameweekId);

            if (!gameweek || !gameweek.finished) {
                console.log(
                    `Gameweek ${gameweekId} not yet finished, skipping permanent stats update`
                );
                return false;
            }

            console.log(
                `Updating player stats for completed gameweek ${gameweekId}`
            );

            // Process player stats
            const playerStats = [];

            for (const [elementId, data] of Object.entries(liveData.elements)) {
                const stats = data.stats;
                if (stats.minutes > 0) {
                    // Only record if player played
                    playerStats.push({
                        player_id: parseInt(elementId),
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
                        total_points: stats.total_points || 0,
                        created_at: new Date().toISOString(),
                    });
                }
            }

            // Update in batches
            const BATCH_SIZE = 50;
            for (let i = 0; i < playerStats.length; i += BATCH_SIZE) {
                const batch = playerStats.slice(i, i + BATCH_SIZE);
                const { error } = await supabase
                    .from('player_gameweek_stats')
                    .upsert(batch, { onConflict: 'player_id, gameweek_id' });

                if (error) {
                    console.error(`Error updating player stats batch:`, error);
                }
            }

            console.log(
                `Updated stats for ${playerStats.length} players in gameweek ${gameweekId}`
            );
            return true;
        } catch (error) {
            console.error('Error updating player stats:', error);
            return false;
        }
    },

    /**
     * Update fixture results in database for completed fixtures
     */
    async updateFixtureResults(): Promise<boolean> {
        try {
            const supabase = await createClient();
            const fixtures = await this.getFixtures();

            // Filter for completed fixtures with scores
            const completedFixtures = fixtures.filter(
                (f) =>
                    f.finished &&
                    f.team_h_score !== null &&
                    f.team_a_score !== null
            );

            console.log(
                `Updating ${completedFixtures.length} completed fixture results`
            );

            // Update in batches
            const BATCH_SIZE = 50;
            for (let i = 0; i < completedFixtures.length; i += BATCH_SIZE) {
                const batch = completedFixtures
                    .slice(i, i + BATCH_SIZE)
                    .map((fixture) => ({
                        id: fixture.id,
                        team_h_score: fixture.team_h_score,
                        team_a_score: fixture.team_a_score,
                        finished: fixture.finished,
                        last_updated: new Date().toISOString(),
                    }));

                const { error } = await supabase
                    .from('fixtures')
                    .upsert(batch, { onConflict: 'id' });

                if (error) {
                    console.error(`Error updating fixture results:`, error);
                }
            }

            return true;
        } catch (error) {
            console.error('Error updating fixture results:', error);
            return false;
        }
    },

    /**
     * Updates all FPL data in Redis cache and database where appropriate
     * This would typically be called by a cron job
     */
    async updateAllData(): Promise<boolean> {
        try {
            console.log('Starting FPL data update...');

            // Get bootstrap-static data
            const bootstrapData = await fplApi.getBootstrapStatic();

            // Map the data to our formats
            const teams = bootstrapData.teams.map((team: FplTeam) => ({
                id: team.id,
                name: team.name,
                short_name: team.short_name,
                code: team.code,
                form: team.form,
                played: team.played,
                points: team.points,
                position: team.position,
                strength: team.strength,
                strength_attack_home: team.strength_attack_home,
                strength_attack_away: team.strength_attack_away,
                strength_defence_home: team.strength_defence_home,
                strength_defence_away: team.strength_defence_away,
                win: team.win,
                loss: team.loss,
                draw: team.draw,
                strength_overall_home: team.strength_overall_home,
                strength_overall_away: team.strength_overall_away,
                pulse_id: team.pulse_id,
                last_updated: new Date().toISOString(),
            }));

            const gameweeks = bootstrapData.events.map((gw: FplEvent) => ({
                id: gw.id,
                name: `Gameweek ${gw.id}`,
                deadline_time: gw.deadline_time,
                is_current: gw.is_current,
                is_next: gw.is_next,
                finished: gw.finished,
                last_updated: new Date().toISOString(),
            }));

            const players = bootstrapData.elements.map((player: FplElement) => {
                let positionString;
                switch (player.element_type) {
                    case 1: positionString = 'GKP'; break;
                    case 2: positionString = 'DEF'; break;
                    case 3: positionString = 'MID'; break;
                    case 4: positionString = 'FWD'; break;
                    default: positionString = 'Unknown';
                }

                return {
                    id: player.id,
                    web_name: player.web_name,
                    full_name: `${player.first_name} ${player.second_name}`,
                    first_name: player.first_name,
                    second_name: player.second_name,
                    team_id: player.team,
                    element_type: player.element_type,
                    position: positionString,

                    now_cost: player.now_cost,
                    cost_change_start: player.cost_change_start,
                    
                    form: player.form,
                    points_per_game: player.points_per_game,
                    total_points: player.total_points,
                    minutes: player.minutes,
                    goals_scored: player.goals_scored,
                    assists: player.assists,
                    clean_sheets: player.clean_sheets,
                    goals_conceded: player.goals_conceded,
                    own_goals: player.own_goals,
                    penalties_saved: player.penalties_saved,
                    penalties_missed: player.penalties_missed,
                    yellow_cards: player.yellow_cards,
                    red_cards: player.red_cards,
                    saves: player.saves,
                    bonus: player.bonus,
                    bps: player.bps,

                    status: player.status,
                    news: player.news,
                    news_added: player.news_added,
                    chance_of_playing_next_round: player.chance_of_playing_next_round,
                    chance_of_playing_this_round: player.chance_of_playing_this_round,

                    influence: player.influence,
                    creativity: player.creativity,
                    threat: player.threat,
                    ict_index: player.ict_index,

                    ep_next: player.ep_next,
                    ep_this: player.ep_this,

                    selected_by_percent: player.selected_by_percent,
                    transfers_in: player.transfers_in,
                    transfers_out: player.transfers_out,
                    dreamteam_count: player.dreamteam_count,
                    
                    last_updated: new Date().toISOString(),
                };
            });

            // Get fixtures data
            const fixturesData = await fplApi.getFixtures();
            const fixtures = fixturesData.map((fixture: FplFixture) => ({
                id: fixture.id,
                gameweek_id: fixture.event,
                home_team_id: fixture.team_h,
                away_team_id: fixture.team_a,
                kickoff_time: fixture.kickoff_time,
                finished: fixture.finished,
                started: fixture.started,
                team_h_score: fixture.team_h_score,
                team_a_score: fixture.team_a_score,
                stats: fixture.stats,
                last_updated: new Date().toISOString(),
            }));

            // Get live gameweek data for current gameweek
            const currentGameweek = bootstrapData.events.find(
                (gw: FplEvent) => gw.is_current
            );
            let liveData = null;
            if (currentGameweek) {
                liveData = await fplApi.getGameweekLive(currentGameweek.id);
            }

            // Use Redis pipeline for batched updates
            const pipeline = redis.pipeline();

            // Set bootstrap data
            pipeline.set(
                'fpl:bootstrap-static',
                JSON.stringify(bootstrapData),
                'EX',
                calculateTtl('bootstrap-static')
            );

            // Set teams
            pipeline.set(
                'fpl:teams',
                JSON.stringify(teams),
                'EX',
                calculateTtl('bootstrap-static')
            );

            // Set gameweeks
            pipeline.set(
                'fpl:gameweeks',
                JSON.stringify(gameweeks),
                'EX',
                calculateTtl('bootstrap-static')
            );

            // Set players
            pipeline.set(
                'fpl:players',
                JSON.stringify(players),
                'EX',
                calculateTtl('bootstrap-static')
            );

            // Set fixtures
            pipeline.set(
                'fpl:fixtures',
                JSON.stringify(fixtures),
                'EX',
                calculateTtl('fixtures')
            );

            // Set live data if available
            if (liveData && currentGameweek) {
                pipeline.set(
                    `fpl:gameweek:${currentGameweek.id}:live`,
                    JSON.stringify(liveData),
                    'EX',
                    calculateTtl('live')
                );
            }

            // Execute all Redis operations in a single round-trip
            await pipeline.exec();

            // Update database with completed fixture results
            await this.updateFixtureResults();

            // Set up deadline-based cache invalidation
            const upcomingGameweeks = gameweeks.filter((gw: Gameweek) => {
                const deadline = new Date(gw.deadline_time);
                return deadline > new Date();
            });

            if (upcomingGameweeks.length > 0) {
                await cacheInvalidator.setupScheduledInvalidation(
                    upcomingGameweeks
                );
            }

            console.log('Successfully updated all FPL data');
            return true;
        } catch (error) {
            console.error('Error updating FPL data:', error);
            throw error;
        }
    },

    /**
     * Initialize FPL service
     * Sets up cache invalidation timers based on gameweek deadlines
     */
    async initialize(): Promise<void> {
        try {
            // Fetch gameweeks to set up scheduled invalidation
            const gameweeks = await this.getGameweeks();

            // Set up invalidation schedule with proper timeout handling
            await cacheInvalidator.setupScheduledInvalidation(gameweeks);

            // Check if there's an active gameweek and set up more frequent invalidation
            const isActive = await this.isGameweekActive();
            if (isActive) {
                const currentGameweek = await this.getCurrentGameweek();
                if (currentGameweek) {
                    console.log(
                        `Setting up frequent invalidation for active Gameweek ${currentGameweek.id}`
                    );
                    // Invalidate live data every 5 minutes during active gameweek
                    setInterval(
                        async () => {
                            await cacheInvalidator.invalidateLiveData(
                                currentGameweek.id
                            );
                        },
                        5 * 60 * 1000
                    ); // 5 minutes
                }
            }

            console.log(
                'FPL service initialized with cache invalidation schedules'
            );
        } catch (error) {
            console.error('Error initializing FPL service:', error);
        }
    },
};
