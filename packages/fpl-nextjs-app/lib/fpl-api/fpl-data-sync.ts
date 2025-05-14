// lib/jobs/fpl-data-sync.ts
import { fplApiService } from './service';
import { createClient } from '@/utils/supabase/server';
import { createAdminSupabaseClient } from '@/utils/supabase/admin-client';
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

    // Use admin client for database operations to avoid permission issues
    const supabase = createAdminSupabaseClient();
    
    try {
        console.log('Connected to Supabase via admin client');
        
        // First update Redis cache
        await fplApiService.updateAllData();
        console.log('Redis caches updated successfully');

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
        console.log(`Starting player update with ${players.length} players`);
        
        // Process in batches for better performance
        for (let i = 0; i < players.length; i += BATCH_SIZE) {
            const batch = players.slice(i, i + BATCH_SIZE);
            console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1} of ${Math.ceil(players.length/BATCH_SIZE)}`);
            
            // Create batch of player records for upsert
            // Make sure to only include fields that exist in the players table
            const playerRecords = batch.map(player => ({
                id: player.id,
                web_name: player.web_name,
                full_name: player.full_name,
                team_id: player.team_id,
                position: player.position,
                element_type: player.element_type
            }));
            
            const { error } = await supabase
                .from('players')
                .upsert(playerRecords, { onConflict: 'id' });
                
            if (error) {
                console.error(`Batch ${Math.floor(i/BATCH_SIZE) + 1} error:`, error);
                throw new Error(`Player batch update failed: ${error.message || JSON.stringify(error)}`);
            }
        }
        console.log('Basic players table updated successfully');
    } catch (error) {
        console.error('Error updating basic players table:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown player update error';
        throw new Error(`Player update failed: ${errorMessage}`);
    }
}

/**
 * Update gameweeks in batches
 */
async function updateGameweeks(supabase: SupabaseClient, gameweeks: Gameweek[]) {
    try {
        if (!gameweeks || gameweeks.length === 0) {
            console.log('No gameweeks to update, skipping');
            return;
        }
        
        console.log(`Updating ${gameweeks.length} gameweeks in batches of ${BATCH_SIZE}`);
        
        // Process in batches for better performance
        for (let i = 0; i < gameweeks.length; i += BATCH_SIZE) {
            const batch = gameweeks.slice(i, i + BATCH_SIZE);
            console.log(`Processing gameweek batch ${Math.floor(i/BATCH_SIZE) + 1} of ${Math.ceil(gameweeks.length/BATCH_SIZE)}, containing ${batch.length} gameweeks`);
            
            // Create batch of gameweek records for upsert
            const gameweekRecords = batch.map(gameweek => ({
                id: gameweek.id,
                name: gameweek.name || `Gameweek ${gameweek.id}`,
                deadline_time: gameweek.deadline_time,
                is_current: gameweek.is_current,
                is_next: gameweek.is_next,
                finished: gameweek.finished,
                data_checked: gameweek.data_checked || false,
                is_previous: gameweek.is_previous || false,
                average_entry_score: gameweek.average_entry_score || 0,
                // Preserve is_player_stats_synced if it exists
                is_player_stats_synced: gameweek.is_player_stats_synced
            }));
            
            const { error } = await supabase
                .from('gameweeks')
                .upsert(gameweekRecords, { onConflict: 'id' });
                
            if (error) {
                console.error(`Batch ${Math.floor(i/BATCH_SIZE) + 1} error:`, error);
                throw new Error(`Gameweek batch update failed: ${error.message || JSON.stringify(error)}`);
            }
            
            console.log(`Gameweek batch ${Math.floor(i/BATCH_SIZE) + 1} updated successfully`);
        }
        console.log('All gameweeks updated successfully');
    } catch (error) {
        console.error('Error updating gameweeks:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown gameweek update error';
        throw new Error(`Gameweek update failed: ${errorMessage}`);
    }
}

/**
 * Update fixtures in batches
 */
async function updateFixtures(supabase: SupabaseClient, fixtures: Fixture[]) {
    try {
        if (!fixtures || fixtures.length === 0) {
            console.log('No fixtures to update, skipping');
            return;
        }
        
        console.log(`Updating ${fixtures.length} fixtures in batches of ${BATCH_SIZE}`);
        
        // Process in batches for better performance
        for (let i = 0; i < fixtures.length; i += BATCH_SIZE) {
            const batch = fixtures.slice(i, i + BATCH_SIZE);
            console.log(`Processing fixture batch ${Math.floor(i/BATCH_SIZE) + 1} of ${Math.ceil(fixtures.length/BATCH_SIZE)}, containing ${batch.length} fixtures`);
            
            // Create batch of fixture records for upsert
            const fixtureRecords = batch.map(fixture => ({
                id: fixture.id,
                gameweek_id: fixture.gameweek_id,
                home_team_id: fixture.home_team_id,
                away_team_id: fixture.away_team_id,
                kickoff_time: fixture.kickoff_time,
                finished: fixture.finished,
                started: fixture.started || false,
                team_h_score: fixture.team_h_score,
                team_a_score: fixture.team_a_score
            }));
            
            const { error } = await supabase
                .from('fixtures')
                .upsert(fixtureRecords, { onConflict: 'id' });
                
            if (error) {
                console.error(`Fixture batch ${Math.floor(i/BATCH_SIZE) + 1} error:`, error);
                throw new Error(`Fixture batch update failed: ${error.message || JSON.stringify(error)}`);
            }
            
            console.log(`Fixture batch ${Math.floor(i/BATCH_SIZE) + 1} updated successfully`);
        }
        console.log('All fixtures updated successfully');
    } catch (error) {
        console.error('Error updating fixtures:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown fixture update error';
        throw new Error(`Fixture update failed: ${errorMessage}`);
    }
}

async function updatePlayerGameweekStatsForFinishedGameweeks(supabase: SupabaseClient) {
    console.log('Checking for newly finished gameweeks to update player stats...');
    try {
        // Check if this is admin client or needs to be reinitialized as admin
        const isAdminClient = supabase.auth.admin !== undefined;
        if (!isAdminClient) {
            console.log('Switching to admin Supabase client for better permissions');
            supabase = createAdminSupabaseClient();
        }
        
        // Query for gameweeks that need player stats synced
        const { data: gameweeksToProcess, error: gwError } = await supabase
            .from('gameweeks')
            .select('id, name')
            .eq('finished', true)
            .is('is_player_stats_synced', false) // Use 'is' to handle both null and false
            .order('id', { ascending: true });

        if (gwError) {
            console.error('Error fetching gameweeks to process:', gwError);
            throw new Error(`Failed to fetch gameweeks to process: ${gwError.message || JSON.stringify(gwError)}`);
        }

        if (!gameweeksToProcess || gameweeksToProcess.length === 0) {
            console.log('No new finished gameweeks to process for player stats.');
            return;
        }

        console.log(`Found ${gameweeksToProcess.length} finished gameweeks to process: ${gameweeksToProcess.map(gw => `${gw.name} (ID: ${gw.id})`).join(', ')}`);

        // Process each gameweek one at a time
        for (const gw of gameweeksToProcess) {
            console.log(`Processing player stats for ${gw.name} (ID: ${gw.id})...`);
            try {
                // Fetch the live data for this gameweek
                console.log(`Fetching live data for gameweek ${gw.id} from FPL API via service...`);
                const liveData = await fplApiService.getLiveGameweek(gw.id);
                
                // Validate live data structure
                if (!liveData || !liveData.elements) {
                    console.warn(`Invalid live data structure for Gameweek ID: ${gw.id}. Will retry next cycle.`);
                    continue;
                }
                
                if (liveData.elements.length === 0) {
                    console.warn(`No player elements found in live data for Gameweek ID: ${gw.id}.`);
                    // In this case, we might still want to mark it as processed, since the FPL API returned valid data
                    // but there were simply no player stats to record.
                    console.log(`Marking Gameweek ID: ${gw.id} as synced despite no player data.`);
                    
                    const { error: updateEmptyGwError } = await supabase
                        .from('gameweeks')
                        .update({ 
                            is_player_stats_synced: true, 
                            last_updated: new Date().toISOString() 
                        })
                        .eq('id', gw.id);
                    
                    if (updateEmptyGwError) {
                        console.error(`Error marking empty Gameweek ID ${gw.id} as synced:`, updateEmptyGwError);
                    } else {
                        console.log(`Successfully marked empty ${gw.name} (ID: ${gw.id}) as synced.`);
                    }
                    continue;
                }

                console.log(`Processing ${liveData.elements.length} player records for gameweek ${gw.id}...`);

                // Convert the live data elements to PlayerHistory format and use transformers
                const playerStatsRecords = liveData.elements.map((playerElement: any) => {
                    if (!playerElement || !playerElement.id || !playerElement.stats) {
                        console.warn(`Invalid player element in live data for gameweek ${gw.id}, skipping:`, playerElement);
                        return null;
                    }
                    
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
                    
                    try {
                        // Use the transformer function for consistency
                        return transformers.transformPlayerGameweekStats(
                            playerElement.id, 
                            playerHistoryData
                        );
                    } catch (transformError) {
                        console.error(`Error transforming player ${playerElement.id} stats for gameweek ${gw.id}:`, transformError);
                        return null;
                    }
                }).filter(record => record !== null); // Remove any null records

                if (playerStatsRecords.length > 0) {
                    console.log(`Upserting ${playerStatsRecords.length} player stats records for gameweek ${gw.id} in batches of ${BATCH_SIZE}...`);
                    
                    // Upsert player stats in batches
                    let batchSuccessCount = 0;
                    for (let i = 0; i < playerStatsRecords.length; i += BATCH_SIZE) {
                        const batch = playerStatsRecords.slice(i, i + BATCH_SIZE);
                        console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1} of ${Math.ceil(playerStatsRecords.length/BATCH_SIZE)}, containing ${batch.length} player stats...`);
                        
                        const { error: upsertError } = await supabase
                            .from('player_gameweek_stats')
                            .upsert(batch, { onConflict: 'player_id, gameweek_id' });

                        if (upsertError) {
                            console.error(`Error upserting batch ${Math.floor(i/BATCH_SIZE) + 1} of player stats for Gameweek ID ${gw.id}:`, upsertError);
                            throw new Error(`Player stats batch upsert failed: ${upsertError.message || JSON.stringify(upsertError)}`);
                        }
                        
                        batchSuccessCount++;
                        console.log(`Batch ${Math.floor(i/BATCH_SIZE) + 1} successfully upserted for gameweek ${gw.id}`);
                    }
                    
                    console.log(`All ${batchSuccessCount} batches of player stats for gameweek ${gw.id} successfully upserted`);
                } else {
                    console.log(`No valid player stat records to upsert for Gameweek ID: ${gw.id} after filtering.`);
                }

                // If all batches for this gameweek are successful, mark the gameweek as synced
                console.log(`Marking gameweek ${gw.id} as synced...`);
                const { error: updateGwError } = await supabase
                    .from('gameweeks')
                    .update({ 
                        is_player_stats_synced: true, 
                        last_updated: new Date().toISOString() 
                    })
                    .eq('id', gw.id);

                if (updateGwError) {
                    console.error(`CRITICAL: Error marking Gameweek ID ${gw.id} as synced after saving stats:`, updateGwError);
                    throw new Error(`Failed to mark gameweek ${gw.id} as synced: ${updateGwError.message || JSON.stringify(updateGwError)}`);
                } else {
                    console.log(`Successfully processed player stats and marked ${gw.name} (ID: ${gw.id}) as synced.`);
                    // Invalidate the enriched players cache as its underlying data (player_gameweek_stats) has changed.
                    try {
                        await cacheInvalidator.invalidatePattern('fpl:players:enriched*');
                        console.log(`Invalidated fpl:players:enriched* cache after updating gameweek ${gw.id} player stats.`);
                    } catch (cacheError) {
                        // Non-critical error, just log it
                        console.error(`Warning: Failed to invalidate cache after gameweek ${gw.id} update:`, cacheError);
                    }
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
        // Rethrowing with a proper error message
        throw new Error(`Player gameweek stats synchronization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
                console.log(`Updating live data for current gameweek ${currentGameweek.id}...`);
                
                // Update live data
                await fplApiService.getLiveGameweek(currentGameweek.id);
                console.log('Live gameweek data updated in Redis cache');

                // Also update fixtures to get latest match results
                const fplFixtures = await fplApiService.getFixtures(currentGameweek.id);
                console.log(`Retrieved ${fplFixtures.length} fixtures for gameweek ${currentGameweek.id}`);
                
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
                
                // Update the database with the formatted fixtures - use admin client
                try {
                    const supabase = createAdminSupabaseClient();
                    console.log('Using admin Supabase client for database operations');
                    await updateFixtures(supabase, fixtures);
                    console.log('Fixtures successfully updated in database');
                } catch (dbError) {
                    console.error('Error updating fixtures in database:', dbError);
                    // Continue without disrupting the user experience
                }
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
        if (!bootstrapData || !bootstrapData.teams || !bootstrapData.elements || !bootstrapData.events) {
            throw new Error('Invalid bootstrap data structure received');
        }

        console.log(`Bootstrap data contains: ${bootstrapData.teams.length} teams, ${bootstrapData.elements.length} players, ${bootstrapData.events.length} gameweeks`);

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
            unavailable: apiTeam.unavailable || false,  // Provide default if null/undefined
            last_updated: new Date().toISOString(),
        }));

        // Map FPL API player (element) data to our domain Player type 
        // ONLY include fields that match the players table schema
        const playersToUpdate: Player[] = bootstrapData.elements.map((apiPlayer: FplElement) => ({
            id: apiPlayer.id,
            web_name: apiPlayer.web_name,
            full_name: `${apiPlayer.first_name} ${apiPlayer.second_name}`,
            first_name: apiPlayer.first_name,
            second_name: apiPlayer.second_name,
            team_id: apiPlayer.team,
            element_type: apiPlayer.element_type,
            position: apiPlayer.element_type === 1 ? 'GKP' : apiPlayer.element_type === 2 ? 'DEF' : apiPlayer.element_type === 3 ? 'MID' : 'FWD',
            last_updated: new Date().toISOString(),
            current_season_performance: [], // Default empty array for required property
            previous_season_summary: null // Default null for required property
        }));

        // Map FPL API gameweek (event) data to our domain Gameweek type
        const gameweeksToUpdate: Gameweek[] = bootstrapData.events.map((apiEvent: FplEvent) => ({
            id: apiEvent.id,
            name: apiEvent.name || `Gameweek ${apiEvent.id}`,  // Provide default if null/undefined
            deadline_time: apiEvent.deadline_time,
            is_current: apiEvent.is_current,
            is_next: apiEvent.is_next,
            finished: apiEvent.finished,
            data_checked: apiEvent.data_checked, 
            is_previous: apiEvent.is_previous,
            average_entry_score: apiEvent.average_entry_score,
            // Preserve existing is_player_stats_synced if we're updating
            last_updated: new Date().toISOString(),
        }));

        console.log(`Starting database updates for: ${teamsToUpdate.length} teams, ${playersToUpdate.length} players, ${gameweeksToUpdate.length} gameweeks`);
        
        // Process in separate try/catch blocks to identify which update is failing
        try {
            await updateTeams(supabase, teamsToUpdate);
            console.log('Teams table updated successfully');
        } catch (teamsError) {
            console.error('Error updating teams table:', teamsError);
            throw new Error(`Teams update failed: ${teamsError instanceof Error ? teamsError.message : 'Unknown error'}`);
        }
        
        try {
            await updatePlayers(supabase, playersToUpdate);
            console.log('Players table updated successfully');
        } catch (playersError) {
            console.error('Error updating players table:', playersError);
            throw new Error(`Players update failed: ${playersError instanceof Error ? playersError.message : 'Unknown error'}`);
        }
        
        try {
            await updateGameweeks(supabase, gameweeksToUpdate);
            console.log('Gameweeks table updated successfully');
        } catch (gameweeksError) {
            console.error('Error updating gameweeks table:', gameweeksError);
            throw new Error(`Gameweeks update failed: ${gameweeksError instanceof Error ? gameweeksError.message : 'Unknown error'}`);
        }

        console.log('Targeted DB sync for bootstrap-derived tables completed successfully.');
        // Note: Invalidation of fpl:players:enriched* should happen in the caller (performIncrementalRefresh)
        // because this function's scope is only the DB update.
        return {
            success: true,
            teamsUpdated: teamsToUpdate.length,
            playersUpdated: playersToUpdate.length,
            gameweeksUpdated: gameweeksToUpdate.length
        };
    } catch (error) {
        console.error('Error during targeted DB sync for bootstrap-derived tables:', error);
        throw error; // Re-throw to be caught by the caller
    }
}

