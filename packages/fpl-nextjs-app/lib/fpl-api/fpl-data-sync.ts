// lib/jobs/fpl-data-sync.ts
import { fplApiService } from './service';
import { createClient } from '@/utils/supabase/server';
import { Team, Player, Gameweek, Fixture } from '@fpl-chat-app/types';
import { SupabaseClient } from '@supabase/supabase-js';
import { cacheInvalidator } from './cache-invalidator';
import { 
    FplElement, 
    FplEvent, 
    FplTeam, 
    BootstrapStaticResponse,
    PlayerHistory 
} from '@fpl-chat-app/types';
import * as transformers from './transformers';

// Maximum items per batch for efficient database operations
const BATCH_SIZE = 50;

/**
 * Synchronizes data between the FPL API and our Supabase database
 * This job should be scheduled to run daily and after matches
 */
export async function syncFplData() {
    console.log(
        `Starting FPL data synchronization job at ${new Date().toISOString()}`
    );

    const supabase = await createClient();

    try {
        // First update Redis cache
        await fplApiService.updateAllData();

        // Then update database
        await updateDatabaseFromCache(supabase);

        console.log(
            `FPL data synchronization completed successfully at ${new Date().toISOString()}`
        );
        return {
            success: true,
            message: 'Data synchronization completed successfully',
        };
    } catch (error) {
        console.error('Error during FPL data synchronization:', error);
        return {
            success: false,
            message: 'Data synchronization failed',
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Updates the database tables with data from our cached FPL data
 */
async function updateDatabaseFromCache(supabase: SupabaseClient) {
    try {
        // Get all data from Redis cache (already formatted in our schema)
        const [teams, players, gameweeks, fplFixtures] = await Promise.all([
            fplApiService.getTeams(),
            fplApiService.getPlayers(),
            fplApiService.getGameweeks(),
            fplApiService.getFixtures(),
        ]);

        // Convert FplFixture[] to Fixture[]
        const fixtures: Fixture[] = fplFixtures.map(fixture => ({
            id: fixture.id,
            gameweek_id: fixture.event ?? 0,
            home_team_id: fixture.team_h,
            away_team_id: fixture.team_a,
            kickoff_time: fixture.kickoff_time ?? '',
            finished: fixture.finished,
            started: fixture.started,
            team_h_score: fixture.team_h_score,
            team_a_score: fixture.team_a_score,
            last_updated: new Date().toISOString()
        }));

        console.log(
            `Retrieved data from cache: ${teams.length} teams, ${players.length} players, ${gameweeks.length} gameweeks, ${fixtures.length} fixtures`
        );

        // Process updates in separate transactions
        await Promise.all([
            updateTeams(supabase, teams),
            updatePlayers(supabase, players),
            updateGameweeks(supabase, gameweeks),
            updateFixtures(supabase, fixtures),
        ]);

        // After core entities are updated, especially 'gameweeks' with their 'finished' status
        await updatePlayerGameweekStatsForFinishedGameweeks(supabase);

        console.log('All database updates completed successfully');
    } catch (error) {
        console.error('Error updating database from cache:', error);
        throw error;
    }
}

/**
 * Update teams in batches
 */
async function updateTeams(supabase: SupabaseClient, teams: Team[]) {
    try {
        // Process in batches for better performance
        for (let i = 0; i < teams.length; i += BATCH_SIZE) {
            const batch = teams.slice(i, i + BATCH_SIZE);
            
            // Create batch of team records for upsert
            const teamRecords = batch.map(team => ({
                id: team.id,
                name: team.name,
                short_name: team.short_name,
                last_updated: new Date().toISOString(),
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
            }));
            
            const { error } = await supabase
                .from('teams')
                .upsert(teamRecords, { onConflict: 'id' });
                
            if (error) throw error;
        }
        console.log('Teams updated successfully');
    } catch (error) {
        console.error('Error updating teams:', error);
        throw error;
    }
}

/**
 * Update players in batches
 */
async function updatePlayers(supabase: SupabaseClient, players: Player[]) {
    try {
        // Process in batches for better performance
        for (let i = 0; i < players.length; i += BATCH_SIZE) {
            const batch = players.slice(i, i + BATCH_SIZE);
            
            // Create batch of player records for upsert
            const playerRecords = batch.map(player => ({
                id: player.id,
                web_name: player.web_name,
                full_name: player.full_name,
                team_id: player.team_id,
                position: player.position,
                last_updated: new Date().toISOString(),
                element_type: player.element_type,
            }));
            
            const { error } = await supabase
                .from('players')
                .upsert(playerRecords, { onConflict: 'id' });
                
            if (error) throw error;
        }
        console.log('Basic players table updated successfully');
    } catch (error) {
        console.error('Error updating basic players table:', error);
        throw error;
    }
}

/**
 * Update gameweeks in batches
 */
async function updateGameweeks(supabase: SupabaseClient, gameweeks: Gameweek[]) {
    try {
        // Process in batches for better performance
        for (let i = 0; i < gameweeks.length; i += BATCH_SIZE) {
            const batch = gameweeks.slice(i, i + BATCH_SIZE);
            
            // Create batch of gameweek records for upsert
            const gameweekRecords = batch.map(gameweek => ({
                id: gameweek.id,
                name: gameweek.name,
                deadline_time: gameweek.deadline_time,
                is_current: gameweek.is_current,
                is_next: gameweek.is_next,
                finished: gameweek.finished,
                last_updated: new Date().toISOString(),
            }));
            
            const { error } = await supabase
                .from('gameweeks')
                .upsert(gameweekRecords, { onConflict: 'id' });
                
            if (error) throw error;
        }
        console.log('Gameweeks updated successfully');
    } catch (error) {
        console.error('Error updating gameweeks:', error);
        throw error;
    }
}

/**
 * Update fixtures in batches
 */
async function updateFixtures(supabase: SupabaseClient, fixtures: Fixture[]) {
    try {
        // Process in batches for better performance
        for (let i = 0; i < fixtures.length; i += BATCH_SIZE) {
            const batch = fixtures.slice(i, i + BATCH_SIZE);
            
            // Create batch of fixture records for upsert
            const fixtureRecords = batch.map(fixture => ({
                id: fixture.id,
                gameweek_id: fixture.gameweek_id,
                home_team_id: fixture.home_team_id,
                away_team_id: fixture.away_team_id,
                kickoff_time: fixture.kickoff_time,
                finished: fixture.finished,
                team_h_score: fixture.team_h_score,
                team_a_score: fixture.team_a_score,
                last_updated: new Date().toISOString(),
            }));
            
            const { error } = await supabase
                .from('fixtures')
                .upsert(fixtureRecords, { onConflict: 'id' });
                
            if (error) throw error;
        }
        console.log('Fixtures updated successfully');
    } catch (error) {
        console.error('Error updating fixtures:', error);
        throw error;
    }
}

async function updatePlayerGameweekStatsForFinishedGameweeks(supabase: SupabaseClient) {
    console.log('Checking for newly finished gameweeks to update player stats...');
    try {
        const { data: gameweeksToProcess, error: gwError } = await supabase
            .from('gameweeks')
            .select('id, name')
            .eq('finished', true)
            .is('is_player_stats_synced', false) // Use 'is' to handle both null and false
            .order('id', { ascending: true });

        if (gwError) {
            console.error('Error fetching gameweeks to process:', gwError);
            throw gwError; // Rethrow to indicate a problem in this critical step
        }

        if (!gameweeksToProcess || gameweeksToProcess.length === 0) {
            console.log('No new finished gameweeks to process for player stats.');
            return;
        }

        console.log(`Found ${gameweeksToProcess.length} finished gameweeks to process: ${gameweeksToProcess.map(gw => `${gw.name} (ID: ${gw.id})`).join(', ')}`);

        for (const gw of gameweeksToProcess) {
            console.log(`Processing player stats for ${gw.name} (ID: ${gw.id})...`);
            try {
                // This service method needs to fetch from FPL API: event/{gw.id}/live/
                // Ensure getLiveGameweek returns a structure like { elements: [ { id: player_id, stats: { ... } } ] }
                const liveData = await fplApiService.getLiveGameweek(gw.id);

                if (!liveData || !liveData.elements || liveData.elements.length === 0) {
                    console.warn(`No live data or elements found for Gameweek ID: ${gw.id}.`);
                    // Optionally, mark as synced if you are sure no data means it's "processed" for an empty GW.
                    // For now, we'll skip and it will be picked up again if this is an error.
                    // If it's consistently empty and shouldn't be, it implies an issue with getGameweekLive or FPL API.
                    console.log(`Skipping Gameweek ID: ${gw.id} due to no live player data. It will be re-attempted next cycle if it remains unfinished.`);
                    continue;
                }

                // Convert the live data elements to PlayerHistory format and use transformers
                const playerStatsRecords = liveData.elements.map((playerElement: any) => {
                    // Create a PlayerHistory-like object from the live data
                    const playerHistoryData: PlayerHistory = {
                        element: playerElement.id,
                        fixture: 0, // Not relevant for this context
                        opponent_team: 0, // Not relevant for this context
                        round: gw.id,
                        was_home: false, // Not relevant for this context
                        kickoff_time: '', // Not relevant for this context
                        total_points: playerElement.stats.total_points || 0,
                        value: 0, // Not relevant for this context
                        minutes: playerElement.stats.minutes || 0,
                        goals_scored: playerElement.stats.goals_scored || 0,
                        assists: playerElement.stats.assists || 0,
                        clean_sheets: playerElement.stats.clean_sheets || 0,
                        goals_conceded: playerElement.stats.goals_conceded || 0,
                        own_goals: playerElement.stats.own_goals || 0,
                        penalties_saved: playerElement.stats.penalties_saved || 0,
                        penalties_missed: playerElement.stats.penalties_missed || 0,
                        yellow_cards: playerElement.stats.yellow_cards || 0,
                        red_cards: playerElement.stats.red_cards || 0,
                        saves: playerElement.stats.saves || 0,
                        bonus: playerElement.stats.bonus || 0,
                        bps: playerElement.stats.bps || 0,
                        influence: playerElement.stats.influence || '0.0',
                        creativity: playerElement.stats.creativity || '0.0',
                        threat: playerElement.stats.threat || '0.0',
                        ict_index: playerElement.stats.ict_index || '0.0',
                    };
                    
                    // Use the transformer function for consistency
                    return transformers.transformPlayerGameweekStats(
                        playerElement.id, 
                        playerHistoryData
                    );
                });

                if (playerStatsRecords.length > 0) {
                    // Upsert player stats in batches
                    for (let i = 0; i < playerStatsRecords.length; i += BATCH_SIZE) {
                        const batch = playerStatsRecords.slice(i, i + BATCH_SIZE);
                        const { error: upsertError } = await supabase
                            .from('player_gameweek_stats')
                            .upsert(batch, { onConflict: 'player_id, gameweek_id' });

                        if (upsertError) {
                            console.error(`Error upserting batch of player stats for Gameweek ID ${gw.id}:`, upsertError);
                            // Throw to stop processing this gameweek; it will be retried next time.
                            throw upsertError; 
                        }
                    }
                } else {
                    console.log(`No player stat records to upsert for Gameweek ID: ${gw.id} (liveData.elements was empty after filtering).`);
                }

                // If all batches for this gameweek are successful, mark the gameweek as synced
                const { error: updateGwError } = await supabase
                    .from('gameweeks')
                    .update({ 
                        is_player_stats_synced: true, 
                        last_updated: new Date().toISOString() 
                    })
                    .eq('id', gw.id);

                if (updateGwError) {
                    console.error(`CRITICAL: Error marking Gameweek ID ${gw.id} as synced after saving stats:`, updateGwError);
                    // This is a significant issue, as stats are saved but GW might be reprocessed.
                    // Throw to halt and signal manual intervention or a more robust retry for this specific update.
                    throw updateGwError;
                } else {
                    console.log(`Successfully processed player stats and marked ${gw.name} (ID: ${gw.id}) as synced.`);
                    // Invalidate the enriched players cache as its underlying data (player_gameweek_stats) has changed.
                    await cacheInvalidator.invalidatePattern('fpl:players:enriched*');
                    console.log(`Invalidated fpl:players:enriched* cache after updating gameweek ${gw.id} player stats.`);
                }

            } catch (err) {
                console.error(`Failed to process player stats for Gameweek ${gw.name} (ID: ${gw.id}):`, err);
                // Continue to the next gameweek, this one will be attempted again in the next sync cycle.
                console.log(`Gameweek ${gw.name} (ID: ${gw.id}) will be re-attempted in the next sync cycle.`);
            }
        }
        console.log('Finished processing player gameweek stats for all identified gameweeks.');

    } catch (error) {
        console.error('Error in updatePlayerGameweekStatsForFinishedGameweeks outer scope:', error);
        // Do not re-throw if other parts of syncFplData should attempt to run.
        // However, this indicates a failure in the stats sync loop itself.
        throw error; // Rethrowing to make it visible that this part of the sync failed.
    }
}

/**
 * Function to check if we need to update based on activity
 * Should be called on user queries or periodically
 */
export async function checkForUpdates() {
    try {
        // Check if gameweek is active (matches in progress)
        const isActive = await fplApiService.isGameweekActive();

        if (isActive) {
            console.log('Active gameweek detected, updating live data...');

            // If matches are in progress, update more frequently
            const currentGameweek = await fplApiService.getCurrentGameweek();
            if (currentGameweek) {
                // Update live data
                await fplApiService.getLiveGameweek(currentGameweek.id);

                // Also update fixtures to get latest match results
                const fplFixtures = await fplApiService.getFixtures(currentGameweek.id);
                
                // Convert FplFixture[] to Fixture[] format before handling
                const fixtures: Fixture[] = fplFixtures.map(fixture => ({
                    id: fixture.id,
                    gameweek_id: fixture.event ?? 0,
                    home_team_id: fixture.team_h,
                    away_team_id: fixture.team_a,
                    kickoff_time: fixture.kickoff_time ?? '',
                    finished: fixture.finished,
                    started: fixture.started,
                    team_h_score: fixture.team_h_score,
                    team_a_score: fixture.team_a_score,
                    last_updated: new Date().toISOString()
                }));
                
                // Update the database with the formatted fixtures
                const supabase = await createClient();
                await updateFixtures(supabase, fixtures);
            }
        }

        return { success: true, isActive };
    } catch (error) {
        console.error('Error checking for updates:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Synchronizes only the database tables derived directly from bootstrap-static data,
 * using a fresh BootstrapStaticResponse object.
 * This is intended for use when bootstrap-static is known to have changed.
 */
export async function syncBootstrapDerivedTablesFromApiData(
    supabase: SupabaseClient,
    bootstrapData: BootstrapStaticResponse
) {
    console.log('Starting targeted DB sync for bootstrap-derived tables...');
    try {
        // Map FPL API team data to our domain Team type
        const teamsToUpdate: Team[] = bootstrapData.teams.map((apiTeam: FplTeam) => ({
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
            unavailable: apiTeam.unavailable,
            last_updated: new Date().toISOString(),
        }));

        // Map FPL API player (element) data to our domain Player type (basic info only)
        const playersToUpdate: Player[] = bootstrapData.elements.map((apiPlayer: FplElement) => ({
            id: apiPlayer.id,
            web_name: apiPlayer.web_name,
            full_name: `${apiPlayer.first_name} ${apiPlayer.second_name}`,
            first_name: apiPlayer.first_name, // Storing for completeness, though not in 'players' table schema from snippet
            second_name: apiPlayer.second_name, // Storing for completeness
            team_id: apiPlayer.team,
            element_type: apiPlayer.element_type,
            position: apiPlayer.element_type === 1 ? 'GKP' : apiPlayer.element_type === 2 ? 'DEF' : apiPlayer.element_type === 3 ? 'MID' : 'FWD',
            // Fields below are more for enriched player, but basic sync uses a subset
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
            current_season_performance: [], // Not populated by this sync
            previous_season_summary: null, // Not populated by this sync
        }));

        // Map FPL API gameweek (event) data to our domain Gameweek type
        const gameweeksToUpdate: Gameweek[] = bootstrapData.events.map((apiEvent: FplEvent) => ({
            id: apiEvent.id,
            name: apiEvent.name,
            deadline_time: apiEvent.deadline_time,
            is_current: apiEvent.is_current,
            is_next: apiEvent.is_next,
            finished: apiEvent.finished,
            data_checked: apiEvent.data_checked, // Include if in your Gameweek domain type / DB schema
            is_previous: apiEvent.is_previous, // Include if in your Gameweek domain type / DB schema
            average_entry_score: apiEvent.average_entry_score, // Include if relevant
            // is_player_stats_synced is a DB-specific flag, not directly from bootstrap-static events
            last_updated: new Date().toISOString(),
        }));

        await updateTeams(supabase, teamsToUpdate);
        await updatePlayers(supabase, playersToUpdate); // This updates the 'players' table
        await updateGameweeks(supabase, gameweeksToUpdate);

        console.log('Targeted DB sync for bootstrap-derived tables completed successfully.');
        // Note: Invalidation of fpl:players:enriched* should happen in the caller (performIncrementalRefresh)
        // because this function's scope is only the DB update.
    } catch (error) {
        console.error('Error during targeted DB sync for bootstrap-derived tables:', error);
        throw error; // Re-throw to be caught by the caller
    }
}

