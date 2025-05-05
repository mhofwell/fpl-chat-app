// scripts/seed-database.ts
import { createClient } from '@supabase/supabase-js';
import { fplApiService } from '../lib/fpl-api/service';
import dotenv from 'dotenv';
import { Gameweek, Player, Team, Fixture } from '@/types/fpl';
import { PlayerDetailResponse } from '@/types/fpl-api-responses';

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
        const fplFixtures = await fplApiService.getFixtures();

        // Convert FplFixture[] to Fixture[]
        const fixtures: Fixture[] = fplFixtures.map((fixture) => ({
            id: fixture.id,
            gameweek_id: fixture.event ?? 0,
            home_team_id: fixture.team_h,
            away_team_id: fixture.team_a,
            kickoff_time: fixture.kickoff_time ?? '',
            finished: fixture.finished,
            team_h_score: fixture.team_h_score,
            team_a_score: fixture.team_a_score,
            last_updated: new Date().toISOString(),
        }));

        console.log(
            `Fetched ${teams.length} teams, ${players.length} players, ${gameweeks.length} gameweeks, and ${fixtures.length} fixtures.`
        );

        // Step 2: Insert or update teams
        console.log('Seeding teams table...');
        for (const team of teams) {
            const { error } = await supabase.from('teams').upsert({
                id: team.id,
                name: team.name,
                short_name: team.short_name,
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
                team_id: player.team_id,
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
        for (let i = 0; i < fixtures.length; i += BATCH_SIZE) {
            const batch = fixtures.slice(i, i + BATCH_SIZE).map((fixture) => ({
                id: fixture.id,
                gameweek_id: fixture.gameweek_id || fixture.event,
                home_team_id: fixture.home_team_id || fixture.team_h,
                away_team_id: fixture.away_team_id || fixture.team_a,
                kickoff_time: fixture.kickoff_time,
                finished: fixture.finished,
                // Add scores for finished fixtures if available
                team_h_score:
                    fixture.finished && 'team_h_score' in fixture
                        ? fixture.team_h_score
                        : null,
                team_a_score:
                    fixture.finished && 'team_a_score' in fixture
                        ? fixture.team_a_score
                        : null,
                last_updated: new Date().toISOString(),
            }));
            const { error } = await supabase.from('fixtures').upsert(batch);
            if (error) {
                console.error(
                    `Error inserting fixture batch ${Math.floor(i / BATCH_SIZE) + 1}:`,
                    error
                );
            } else {
                console.log(
                    `Inserted fixture batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(fixtures.length / BATCH_SIZE)}`
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
                                    season: season.season_name,
                                    minutes: season.minutes || 0,
                                    goals_scored: season.goals_scored || 0,
                                    assists: season.assists || 0,
                                    clean_sheets: season.clean_sheets || 0,
                                    total_points: season.total_points || 0,
                                    created_at: new Date().toISOString(),
                                },
                                { onConflict: 'player_id, season' }
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
