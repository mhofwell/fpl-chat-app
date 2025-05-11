// src/tools/index.ts - No changes needed here if you already have this structure
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getTeam } from './fpl/team';
import { getPlayer } from './fpl/player';
import { getGameweek } from './fpl/gameweek'; // Main function for gameweek data
import { searchFixtures } from './fpl/search-fixtures';
import { searchPlayers } from './fpl/search-players'; // We will create this file next
import { compareEntities } from './fpl/compare-entities'; // We will create the main function later

export function registerTools(server: McpServer) {
    // FPL tools
    server.tool('get-team', {
        teamQuery: z.string().describe("Team name (supports partial/fuzzy match) or exact FPL team ID."),
        includeFixtures: z.boolean().optional().default(true).describe("Include upcoming fixtures for the team."),
        includePlayers: z.boolean().optional().default(false).describe("Include a list of key players for the team."),
        includeRawData: z.boolean().optional().default(false).describe("Include raw JSON data alongside structured text.")
    }, getTeam);
    server.tool('get-player', {
        playerQuery: z.string().describe("Player name, FPL ID, or descriptive query. Supports partial matches and IDs."),
        teamId: z.number().optional().describe("Filter by FPL team ID (optional)"),
        teamName: z.string().optional().describe("Filter by team name (optional, supports fuzzy matching if teamId not provided)"),
        position: z.string().optional().describe("Filter by player position (e.g., GKP, DEF, MID, FWD) (optional)"),
        includeRawData: z.boolean().optional().default(false).describe("Include raw JSON data alongside structured text (for debugging/specific needs)")
    }, getPlayer);
    server.tool('get-gameweek', {
        gameweekId: z.number().optional().describe("Specify a gameweek by its ID."),
        type: z.enum(['current', 'next', 'previous']).optional().describe("Specify gameweek by type (current, next, or previous)."),
        includeFixtures: z.boolean().optional().default(true).describe("Whether to include fixtures for the gameweek."),
        includeRawData: z.boolean().optional().default(false).describe("Include raw JSON data alongside structured text.")
    }, getGameweek);
    server.tool('search-fixtures', {
        teamQuery: z.string().optional().describe("One or two team names (e.g., 'Arsenal', 'Liverpool vs Man City'). Supports partial/fuzzy match."),
        gameweekId: z.number().int().positive().optional().describe("Filter by a specific gameweek ID."),
        difficultyMin: z.number().int().min(1).max(5).optional().describe("Minimum FPL difficulty rating (1-5) for at least one team in the match."),
        difficultyMax: z.number().int().min(1).max(5).optional().describe("Maximum FPL difficulty rating (1-5) for at least one team in the match."),
        sortBy: z.enum([
            'kickoff_time_asc', // Default sort
            'kickoff_time_desc',
            'difficulty_desc', // Sort by highest difficulty first
            'difficulty_asc'   // Sort by lowest difficulty first
        ]).optional().describe("Sort order for the fixtures. Default is by kickoff time ascending."),
        includeDetails: z.boolean().optional().default(true).describe("If a single specific past match is found, include detailed stats like score, scorers, cards, bonus."),
        limit: z.number().int().positive().optional().default(10).describe("Maximum number of fixtures to return in a list."),
        includeRawData: z.boolean().optional().default(false).describe("Include raw JSON data alongside structured text.")
    }, searchFixtures);

    server.tool('search-players', {
        query: z.string().optional().describe("Player name (partial match supported)."),
        teamName: z.string().optional().describe("Team name to filter by (partial match supported)."),
        position: z.enum(['GKP', 'DEF', 'MID', 'FWD']).optional().describe("Filter by player position."),
        minPrice: z.number().optional().describe("Minimum price (e.g., 5.5 for £5.5m)."),
        maxPrice: z.number().optional().describe("Maximum price (e.g., 10.0 for £10.0m)."),
        minTotalPoints: z.number().int().optional().describe("Minimum total points."),
        sortBy: z.enum([
            'total_points_desc',
            'now_cost_asc',
            'now_cost_desc',
            'form_desc', // Assumes 'form' is a comparable numeric string or we parse it
            'selected_by_percent_desc', // Assumes 'selected_by_percent' is comparable
            'price_rise_desc', // Added
            'price_rise_asc'   // Added
        ]).optional().default('total_points_desc').describe("Stat to sort players by and direction."),
        limit: z.number().int().positive().optional().default(10).describe("Number of results to return."),
        includeRawData: z.boolean().optional().default(false).describe("Include raw JSON data alongside structured text.")
    }, searchPlayers);

    server.tool('compare-entities', {
        entity1Query: z.string().describe("Name or FPL ID of the first player/team."),
        entity2Query: z.string().describe("Name or FPL ID of the second player/team."),
        entityType: z.enum(['player', 'team']).describe("The type of entities to compare ('player' or 'team')."),
        includeRawData: z.boolean().optional().default(false).describe("Include raw JSON data alongside structured text.")
    }, compareEntities);
}
