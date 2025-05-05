// lib/jobs/fpl-data-sync.ts
import { fplApiService } from '../fpl-api/service';
import { createClient } from '@/utils/supabase/server';
import { Team, Player, Gameweek, Fixture } from '@/types/fpl';
import { SupabaseClient } from '@supabase/supabase-js';

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

    try {
        // First update Redis cache
        await fplApiService.updateAllData();

        // Then update database
        await updateDatabaseFromCache();

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
async function updateDatabaseFromCache() {
    // Get Supabase client
    const supabase = await createClient();

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
            }));
            
            const { error } = await supabase
                .from('players')
                .upsert(playerRecords, { onConflict: 'id' });
                
            if (error) throw error;
        }
        console.log('Players updated successfully');
    } catch (error) {
        console.error('Error updating players:', error);
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
