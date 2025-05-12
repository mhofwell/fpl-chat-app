// scripts/seed-database.ts
import { createClient } from '@supabase/supabase-js';
import { fplApiService } from '../lib/fpl-api/service';
import dotenv from 'dotenv';
import { Gameweek, Player, Team, Fixture } from '../../../types/fpl-domain.types';
import { PlayerDetailResponse } from '../../../types/fpl-api.types';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

// Create Supabase client with service role key for admin access
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Maximum batch size for database operations
const BATCH_SIZE = 50;

async function seedDatabase() {
    console.log('Starting database seed process...');
    try {
        // Step 1: Get all data from FPL API
        console.log('Fetching data from FPL API...');
        const teams: Team[] = await fplApiService.getTeams();
        const players: Player[] = await fplApiService.getPlayers();
        const gameweeks: Gameweek[] = await fplApiService.getGameweeks();
        const fplFixturesApi = await fplApiService.getFixtures();

        // Convert FplFixture[] to Fixture[]
        const fixturesDbObjects = fplFixturesApi.map((fixture) => ({
            id: fixture.id,
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
            last_updated: new Date().toISOString(),
        }));

        console.log(
            `Fetched ${teams.length} teams, ${players.length} players, ${gameweeks.length} gameweeks, and ${fixturesDbObjects.length} fixtures.`
        );

        // Step 2: Insert or update teams
        console.log('Seeding teams table...');
        for (const team of teams) {
            const { error } = await supabase.from('teams').upsert({
                id: team.id,
                name: team.name,
                short_name: team.short_name,
                code: team.code,
                played: team.played,
                form: team.form,
                loss: team.loss,
                points: team.points,
                position: team.position,
                strength: team.strength,
                unavailable: team.unavailable,
                win: team.win,
                strength_overall_home: team.strength_overall_home,
                strength_overall_away: team.strength_overall_away,
                strength_attack_home: team.strength_attack_home,
                strength_attack_away: team.strength_attack_away,
                strength_defence_home: team.strength_defence_home,
                strength_defence_away: team.strength_defence_away,
                pulse_id: team.pulse_id,
                last_updated: new Date().toISOString(),
            });
            if (error) {
                console.error(`Error inserting team ${team.name}:`, error);
            }
        }

        // Step 3: Insert or update gameweeks
        console.log('Seeding gameweeks table...');
        for (const gameweek of gameweeks) {
            const { error } = await supabase.from('gameweeks').upsert({
                id: gameweek.id,
                name: gameweek.name,
                deadline_time: gameweek.deadline_time,
                is_current: gameweek.is_current,
                is_next: gameweek.is_next,
                finished: gameweek.finished,
                data_checked: gameweek.data_checked,
                is_previous: gameweek.is_previous,
                average_entry_score: gameweek.average_entry_score,
                highest_score: gameweek.highest_score,
                is_player_stats_synced: false,
                last_updated: new Date().toISOString(),
            });
            if (error) {
                console.error(
                    `Error inserting gameweek ${gameweek.name}:`,
                    error
                );
            }
        }

        // Step 4: Insert or update players (in batches to avoid rate limits)
        console.log('Seeding players table...');
        for (let i = 0; i < players.length; i += BATCH_SIZE) {
            const batch = players.slice(i, i + BATCH_SIZE).map((player) => ({
                id: player.id,
                web_name: player.web_name,
                full_name: player.full_name,
                first_name: player.first_name,
                second_name: player.second_name,
                team_id: player.team_id,
                element_type: player.element_type,
                position: player.position,
                last_updated: new Date().toISOString(),
            }));
            const { error } = await supabase.from('players').upsert(batch);
            if (error) {
                console.error(
                    `Error inserting player batch ${Math.floor(i / BATCH_SIZE) + 1}:`,
                    error
                );
            } else {
                console.log(
                    `Inserted player batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(players.length / BATCH_SIZE)}`
                );
            }
            // Add a small delay to avoid overwhelming the database
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // Step 5: Insert or update fixtures (in batches)
        console.log('Seeding fixtures table...');
        for (let i = 0; i < fixturesDbObjects.length; i += BATCH_SIZE) {
            const batch = fixturesDbObjects.slice(i, i + BATCH_SIZE);
            const { error } = await supabase.from('fixtures').upsert(batch);
            if (error) {
                console.error(
                    `Error inserting fixture batch ${Math.floor(i / BATCH_SIZE) + 1}:`,
                    error
                );
            } else {
                console.log(
                    `Inserted fixture batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(fixturesDbObjects.length / BATCH_SIZE)}`
                );
            }
            // Add a small delay to avoid overwhelming the database
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // Step 6: Insert historical player gameweek stats for completed gameweeks
        console.log('Seeding player gameweek stats...');
        const completedGameweeks = gameweeks.filter(
            (gw: Gameweek) => gw.finished
        );

        for (const gameweek of completedGameweeks) {
            console.log(`Processing historical stats for ${gameweek.name}...`);

            try {
                // Get live data for the completed gameweek
                const liveData = await fplApiService.getLiveGameweek(
                    gameweek.id
                );

                if (liveData && liveData.elements) {
                    const playerStats = [];

                    // Transform live data into player_gameweek_stats records
                    for (const [elementId, data] of Object.entries(
                        liveData.elements
                    )) {
                        const stats = data.stats;
                        if (stats.minutes > 0) {
                            // Only record if player played
                            playerStats.push({
                                player_id: parseInt(elementId),
                                gameweek_id: gameweek.id,
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
                                influence: parseFloat(stats.influence || '0.0').toFixed(1),
                                creativity: parseFloat(stats.creativity || '0.0').toFixed(1),
                                threat: parseFloat(stats.threat || '0.0').toFixed(1),
                                ict_index: parseFloat(stats.ict_index || '0.0').toFixed(1),
                                total_points: stats.total_points || 0,
                                created_at: new Date().toISOString(),
                            });
                        }
                    }

                    // Insert stats in batches
                    for (let i = 0; i < playerStats.length; i += BATCH_SIZE) {
                        const batch = playerStats.slice(i, i + BATCH_SIZE);
                        const { error } = await supabase
                            .from('player_gameweek_stats')
                            .upsert(batch, {
                                onConflict: 'player_id, gameweek_id',
                            });

                        if (error) {
                            console.error(
                                `Error inserting player gameweek stats batch for ${gameweek.name}:`,
                                error
                            );
                        } else {
                            console.log(
                                `Inserted ${batch.length} player gameweek stats for ${gameweek.name}`
                            );
                        }

                        // Add a small delay
                        await new Promise((resolve) =>
                            setTimeout(resolve, 1000)
                        );
                    }
                }
            } catch (error) {
                console.error(
                    `Error processing live data for ${gameweek.name}:`,
                    error
                );
                // Continue with next gameweek even if one fails
            }
        }

        // Step 7: Create player season stats (aggregate from player history)
        console.log('Generating player season stats...');

        // Get popular players (top selection %)
        const popularPlayers = [...players]
            .sort((a, b) => {
                const aPercent = parseFloat(a.selected_by_percent || '0');
                const bPercent = parseFloat(b.selected_by_percent || '0');
                return bPercent - aPercent;
            })
            .slice(0, 20); // Top 20 most selected players

        const topPlayerIds = popularPlayers.map((player) => player.id);
        console.log(
            `Processing season stats for ${topPlayerIds.length} popular players`
        );

        for (const playerId of topPlayerIds) {
            try {
                const playerDetail: PlayerDetailResponse =
                    await fplApiService.getPlayerDetail(playerId);

                if (
                    playerDetail &&
                    playerDetail.history_past &&
                    playerDetail.history_past.length > 0
                ) {
                    // Process past seasons data
                    const pastSeasons = playerDetail.history_past;

                    for (const season of pastSeasons) {
                        const { error } = await supabase
                            .from('player_season_stats')
                            .upsert(
                                {
                                    player_id: playerId,
                                    season_name: season.season_name,
                                    element_code: season.element_code,
                                    start_cost: season.start_cost,
                                    end_cost: season.end_cost,
                                    minutes: season.minutes || 0,
                                    goals_scored: season.goals_scored || 0,
                                    assists: season.assists || 0,
                                    clean_sheets: season.clean_sheets || 0,
                                    goals_conceded: season.goals_conceded || 0,
                                    own_goals: season.own_goals || 0,
                                    penalties_saved: season.penalties_saved || 0,
                                    penalties_missed: season.penalties_missed || 0,
                                    yellow_cards: season.yellow_cards || 0,
                                    red_cards: season.red_cards || 0,
                                    saves: season.saves || 0,
                                    bonus: season.bonus || 0,
                                    bps: season.bps || 0,
                                    influence: season.influence,
                                    creativity: season.creativity,
                                    threat: season.threat,
                                    ict_index: season.ict_index,
                                    total_points: season.total_points || 0,
                                    created_at: new Date().toISOString(),
                                },
                                { onConflict: 'player_id, season_name' }
                            );

                        if (error) {
                            console.error(
                                `Error inserting season stats for player ${playerId}:`,
                                error
                            );
                        } else {
                            console.log(
                                `Inserted season stats for player ${playerId}, season ${season.season_name}`
                            );
                        }
                    }
                }
            } catch (playerError) {
                console.error(
                    `Error fetching details for player ${playerId}:`,
                    playerError
                );
            }

            // Add a delay between player requests to avoid API rate limits
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        // Step 8: Create default profiles and preferences for existing users
        console.log('Setting up user profiles and preferences...');
        const { data: users, error: usersError } =
            await supabase.auth.admin.listUsers();

        if (usersError) {
            console.error('Error fetching users:', usersError);
        } else if (users && users.users) {
            for (const user of users.users) {
                // Create profile if it doesn't exist
                const { data: existingProfile } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('id', user.id)
                    .single();

                if (!existingProfile) {
                    const { error: profileError } = await supabase
                        .from('profiles')
                        .insert({
                            id: user.id,
                            username: user.email?.split('@')[0] || null,
                            full_name: user.user_metadata?.full_name || null,
                            avatar_url: null,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                        });

                    if (profileError) {
                        console.error(
                            `Error creating profile for user ${user.id}:`,
                            profileError
                        );
                    } else {
                        console.log(`Created profile for user ${user.id}`);
                    }
                }

                // Create user preferences if they don't exist
                const { data: existingPreferences } = await supabase
                    .from('user_preferences')
                    .select('id')
                    .eq('id', user.id)
                    .single();

                if (!existingPreferences) {
                    const { error: prefError } = await supabase
                        .from('user_preferences')
                        .insert({
                            id: user.id,
                            favorite_team_id: null,
                            dark_mode: false,
                            email_notifications: true,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                        });

                    if (prefError) {
                        console.error(
                            `Error creating preferences for user ${user.id}:`,
                            prefError
                        );
                    } else {
                        console.log(`Created preferences for user ${user.id}`);
                    }
                }
            }
        }

        // Step 9: Initialize default chats for each user
        if (users && users.users) {
            console.log('Creating default chats for users...');
            for (const user of users.users) {
                // Check if user already has chats
                const { data: existingChats } = await supabase
                    .from('chats')
                    .select('id')
                    .eq('user_id', user.id)
                    .limit(1);

                if (!existingChats || existingChats.length === 0) {
                    // Create a welcome chat
                    const { data: chat, error: chatError } = await supabase
                        .from('chats')
                        .insert({
                            user_id: user.id,
                            title: 'Welcome to FPL Chat',
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                        })
                        .select()
                        .single();

                    if (chatError) {
                        console.error(
                            `Error creating default chat for user ${user.id}:`,
                            chatError
                        );
                    } else if (chat) {
                        // Add a welcome message
                        const { error: msgError } = await supabase
                            .from('messages')
                            .insert({
                                chat_id: chat.id,
                                content:
                                    'Welcome to FPL Chat! Ask me anything about Fantasy Premier League.',
                                role: 'assistant',
                                created_at: new Date().toISOString(),
                            });

                        if (msgError) {
                            console.error(
                                `Error creating welcome message for user ${user.id}:`,
                                msgError
                            );
                        } else {
                            console.log(
                                `Created default chat for user ${user.id}`
                            );
                        }
                    }
                }
            }
        }

        console.log('Database seed completed successfully!');
    } catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
}

// Run the seed function
seedDatabase()
    .then(() => {
        console.log('Seed process complete');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Seed process failed:', error);
        process.exit(1);
    });
