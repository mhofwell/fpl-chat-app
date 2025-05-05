// lib/fpl-api/service.ts
import { fplApi } from './client';
import redis from '../redis/redis-client';
import { Team, Player, Gameweek, Fixture } from '@/types/fpl';
import {
    FplElement,
    FplEvent,
    FplFixture,
    FplTeam,
    BootstrapStaticResponse,
    PlayerDetailResponse,
    GameweekLiveResponse,
} from '@/types/fpl-api-responses';
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
                return bootstrapData.teams.map((team: FplTeam) => ({
                    id: team.id,
                    name: team.name,
                    short_name: team.short_name,
                    last_updated: new Date().toISOString(),
                }));
            },
            'bootstrap-static'
        );
    },

    /**
     * Get all players with Redis caching and optional filtering
     */
    async getPlayers(options?: {
        teamId?: number;
        position?: string;
    }): Promise<Player[]> {
        // Generate cache key based on filters
        const cacheKey = `fpl:players${options?.teamId ? `:team:${options.teamId}` : ''}${options?.position ? `:pos:${options.position}` : ''}`;

        return fetchWithCache<Player[]>(
            cacheKey,
            async () => {
                const bootstrapData = await fplApi.getBootstrapStatic();
                let players = bootstrapData.elements.map(
                    (player: FplElement) => {
                        // Map position ID to string
                        let position;
                        switch (player.element_type) {
                            case 1:
                                position = 'GKP';
                                break;
                            case 2:
                                position = 'DEF';
                                break;
                            case 3:
                                position = 'MID';
                                break;
                            case 4:
                                position = 'FWD';
                                break;
                            default:
                                position = 'Unknown';
                        }

                        return {
                            id: player.id,
                            web_name: player.web_name,
                            full_name: `${player.first_name} ${player.second_name}`,
                            team_id: player.team,
                            position,
                            // Additional properties - cached but not persisted
                            first_name: player.first_name,
                            second_name: player.second_name,
                            element_type: player.element_type,
                            form: player.form,
                            points_per_game: player.points_per_game,
                            total_points: player.total_points,
                            selected_by_percent: player.selected_by_percent,
                        };
                    }
                );

                // Apply filters if provided
                if (options?.teamId) {
                    players = players.filter(
                        (player: Player) => player.team_id === options.teamId
                    );
                }

                if (options?.position) {
                    players = players.filter(
                        (player: Player) => player.position === options.position
                    );
                }

                return players;
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
        // Generate cache key based on filters
        const cacheKey = `fpl:fixtures${gameweekId ? `:gw:${gameweekId}` : ''}`;

        return fetchWithCache<FplFixture[]>(
            cacheKey,
            async () => {
                const fixturesData = await fplApi.getFixtures();
                let fixtures = fixturesData.map((fixture: FplFixture) => ({
                    id: fixture.id,
                    gameweek_id: fixture.event,
                    home_team_id: fixture.team_h,
                    away_team_id: fixture.team_a,
                    kickoff_time: fixture.kickoff_time,
                    finished: fixture.finished,
                    // Include scores for finished matches
                    team_h_score: fixture.finished
                        ? fixture.team_h_score
                        : null,
                    team_a_score: fixture.finished
                        ? fixture.team_a_score
                        : null,
                    last_updated: new Date().toISOString(),
                }));

                // Filter by gameweek if specified
                if (gameweekId) {
                    fixtures = fixtures.filter(
                        (fixture: Fixture) => fixture.gameweek_id === gameweekId
                    );
                }

                return fixtures;
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
                return await fplApi.getPlayerDetail(playerId);
            },
            'player-detail'
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
                liveData.elements[playerId.toString()]
            ) {
                const playerData = liveData.elements[playerId.toString()];

                // Cache the result
                await redis.set(
                    cacheKey,
                    JSON.stringify(playerData),
                    'EX',
                    60 * 15
                ); // 15 minutes
                return playerData;
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
                // Map position ID to string
                let position;
                switch (player.element_type) {
                    case 1:
                        position = 'GKP';
                        break;
                    case 2:
                        position = 'DEF';
                        break;
                    case 3:
                        position = 'MID';
                        break;
                    case 4:
                        position = 'FWD';
                        break;
                    default:
                        position = 'Unknown';
                }

                return {
                    id: player.id,
                    web_name: player.web_name,
                    full_name: `${player.first_name} ${player.second_name}`,
                    team_id: player.team,
                    position,
                    first_name: player.first_name,
                    second_name: player.second_name,
                    element_type: player.element_type,
                    form: player.form,
                    points_per_game: player.points_per_game,
                    total_points: player.total_points,
                    selected_by_percent: player.selected_by_percent,
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
                team_h_score: fixture.team_h_score,
                team_a_score: fixture.team_a_score,
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

            // Update player stats for completed gameweeks
            const completedGameweeks = gameweeks.filter((gw: Gameweek) => gw.finished);
            for (const gameweek of completedGameweeks) {
                await this.updatePlayerStats(gameweek.id);
            }

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
