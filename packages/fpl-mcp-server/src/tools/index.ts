// src/tools/index.ts - No changes needed here if you already have this structure
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getCurrentGameweek } from './fpl/gameweek';
import { getTeam } from './fpl/team';
import { getPlayer } from './fpl/player';
import { getGameweekFixtures } from './fpl/fixtures';
import { echoMessage } from './echo';

export function registerTools(server: McpServer) {
    // Echo tool for testing
    server.tool('echo', { message: z.string() }, echoMessage);

    // FPL tools
    server.tool('get-current-gameweek', {}, getCurrentGameweek);
    server.tool('get-team', {
        teamQuery: z.string().describe("Team name (supports partial/fuzzy match) or exact FPL team ID."),
        includeFixtures: z.boolean().optional().default(true).describe("Include upcoming fixtures for the team."),
        includePlayers: z.boolean().optional().default(false).describe("Include a list of key players for the team."),
        includeRawData: z.boolean().optional().default(false).describe("Include raw JSON data alongside structured text.")
    }, getTeam);
    server.tool('get-player', {
        playerQuery: z.string().optional().describe("Player name, FPL ID, or descriptive query. Supports partial matches and IDs."),
        teamId: z.number().optional().describe("Filter by FPL team ID (optional)"),
        teamName: z.string().optional().describe("Filter by team name (optional, supports fuzzy matching if teamId not provided)"),
        position: z.string().optional().describe("Filter by player position (e.g., GKP, DEF, MID, FWD) (optional)"),
        includeRawData: z.boolean().optional().default(false).describe("Include raw JSON data alongside structured text (for debugging/specific needs)")
    }, getPlayer);
    server.tool(
        'get-gameweek-fixtures',
        { gameweekId: z.number() },
        getGameweekFixtures
    );
}
