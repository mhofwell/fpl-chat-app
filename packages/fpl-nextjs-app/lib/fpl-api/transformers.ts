/**
 * Data transformation utility functions for FPL data
 * 
 * This module contains reusable transformation functions that convert
 * between API data formats and our application domain models.
 */

import { 
    FplElement, 
    FplTeam, 
    FplEvent, 
    FplFixture,
    BootstrapStaticResponse,
    Team,
    Player,
    Gameweek,
    Fixture,
    PlayerDetailResponse,
    PlayerHistory,
    PlayerHistoryPast
} from '@fpl-chat-app/types';

/**
 * Transform FPL API team data to our application Team model
 */
export function transformApiTeam(apiTeam: FplTeam): Team {
    return {
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
        unavailable: apiTeam.unavailable || false
    };
}

/**
 * Transform FPL API player (element) data to our application Player model
 */
export function transformApiPlayer(apiPlayer: FplElement): Player {
    return {
        id: apiPlayer.id,
        web_name: apiPlayer.web_name,
        full_name: `${apiPlayer.first_name} ${apiPlayer.second_name}`,
        first_name: apiPlayer.first_name,
        second_name: apiPlayer.second_name,
        team_id: apiPlayer.team,
        element_type: apiPlayer.element_type,
        position: apiPlayer.element_type === 1 
            ? 'GKP' 
            : apiPlayer.element_type === 2 
                ? 'DEF' 
                : apiPlayer.element_type === 3 
                    ? 'MID' 
                    : 'FWD',
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
        current_season_performance: [], // To be filled from DB
        previous_season_summary: null, // To be filled from DB
    };
}

/**
 * Transform FPL API gameweek (event) data to our application Gameweek model
 */
export function transformApiGameweek(apiEvent: FplEvent): Gameweek {
    return {
        id: apiEvent.id,
        name: apiEvent.name || `Gameweek ${apiEvent.id}`,
        deadline_time: apiEvent.deadline_time,
        is_current: apiEvent.is_current,
        is_next: apiEvent.is_next,
        finished: apiEvent.finished,
        data_checked: apiEvent.data_checked,
        is_previous: apiEvent.is_previous,
        average_entry_score: apiEvent.average_entry_score,
        is_player_stats_synced: false, // DB-specific flag
    };
}

/**
 * Transform FPL API fixture data to our application Fixture model
 */
export function transformApiFixture(apiFixture: FplFixture): Fixture {
    return {
        id: apiFixture.id,
        gameweek_id: apiFixture.event,
        home_team_id: apiFixture.team_h,
        away_team_id: apiFixture.team_a,
        kickoff_time: apiFixture.kickoff_time,
        finished: apiFixture.finished,
        started: apiFixture.started,
        team_h_difficulty: apiFixture.team_h_difficulty,
        team_a_difficulty: apiFixture.team_a_difficulty,
        team_h_score: apiFixture.team_h_score,
        team_a_score: apiFixture.team_a_score,
        stats: apiFixture.stats,
    };
}

/**
 * Transform player's past season history record for database storage
 */
export function transformPlayerSeasonStats(playerId: number, season: any) {
    // Safety checks to ensure minimum required properties are present
    if (!season || typeof season !== 'object') {
        throw new Error('Invalid season data provided to transformPlayerSeasonStats');
    }
    
    return {
        player_id: playerId,
        season_name: season.season_name || '',
        element_code: season.element_code || 0,
        start_cost: season.start_cost || 0,
        end_cost: season.end_cost || 0,
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
        // Handle optional stats fields with default empty strings
        influence: (season.influence || '0.0').toString(),
        creativity: (season.creativity || '0.0').toString(),
        threat: (season.threat || '0.0').toString(),
        ict_index: (season.ict_index || '0.0').toString(),
        total_points: season.total_points || 0,
    };
}

/**
 * Transform player's gameweek history record for database storage
 */
export function transformPlayerGameweekStats(playerId: number, gwStat: any) {
    // Safety checks to ensure minimum required properties are present
    if (!gwStat || typeof gwStat !== 'object') {
        throw new Error('Invalid gameweek stat data provided to transformPlayerGameweekStats');
    }
    
    // Convert possible string/null/undefined values to numbers with fixed precision
    // Use safe type conversion and defaults
    let influenceValue = '0.0';
    let creativityValue = '0.0';
    let threatValue = '0.0';
    let ictIndexValue = '0.0';
    
    // Safe parsing with fallbacks for influence stats
    try {
        if (gwStat.influence) {
            influenceValue = parseFloat(gwStat.influence.toString()).toFixed(1);
        }
    } catch (e) { /* Use default */ }
    
    try {
        if (gwStat.creativity) {
            creativityValue = parseFloat(gwStat.creativity.toString()).toFixed(1);
        }
    } catch (e) { /* Use default */ }
    
    try {
        if (gwStat.threat) {
            threatValue = parseFloat(gwStat.threat.toString()).toFixed(1);
        }
    } catch (e) { /* Use default */ }
    
    try {
        if (gwStat.ict_index) {
            ictIndexValue = parseFloat(gwStat.ict_index.toString()).toFixed(1);
        }
    } catch (e) { /* Use default */ }
    
    return {
        player_id: playerId,
        gameweek_id: gwStat.round || 0,
        minutes: gwStat.minutes || 0,
        goals_scored: gwStat.goals_scored || 0,
        assists: gwStat.assists || 0,
        clean_sheets: gwStat.clean_sheets || 0,
        goals_conceded: gwStat.goals_conceded || 0,
        own_goals: gwStat.own_goals || 0,
        penalties_saved: gwStat.penalties_saved || 0,
        penalties_missed: gwStat.penalties_missed || 0,
        yellow_cards: gwStat.yellow_cards || 0,
        red_cards: gwStat.red_cards || 0,
        saves: gwStat.saves || 0,
        bonus: gwStat.bonus || 0,
        bps: gwStat.bps || 0,
        // Use the numeric string values - Supabase will handle the type conversion
        influence: influenceValue,
        creativity: creativityValue,
        threat: threatValue,
        ict_index: ictIndexValue,
        total_points: gwStat.total_points || 0,
    };
}

/**
 * Transform all data from Bootstrap Static API
 */
export function transformBootstrapData(bootstrapData: BootstrapStaticResponse) {
    return {
        teams: bootstrapData.teams.map(transformApiTeam),
        players: bootstrapData.elements.map(transformApiPlayer),
        gameweeks: bootstrapData.events.map(transformApiGameweek),
    };
}

/**
 * Enrich player data with team information
 */
export function enrichPlayerWithTeam(
    player: Player, 
    teams: Record<number, Team>
) {
    const team = teams[player.team_id];
    if (!team) return player;
    
    return {
        ...player,
        team_name: team.name,
        team_short_name: team.short_name,
    };
}

/**
 * Convert gameweek live stats to simpler points summary
 */
export function extractPlayerGameweekSummary(
    gameweekId: number, 
    elementStats: any
) {
    if (!elementStats || !elementStats.stats) {
        return null;
    }
    
    const stats = elementStats.stats;
    return {
        gameweek: gameweekId,
        points: stats.total_points,
        minutes: stats.minutes,
        goals: stats.goals_scored,
        assists: stats.assists,
        clean_sheets: stats.clean_sheets,
        bonus: stats.bonus,
    };
}