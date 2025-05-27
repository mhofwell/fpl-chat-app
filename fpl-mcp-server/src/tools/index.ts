// src/tools/index.ts - No changes needed here if you already have this structure
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getCurrentGameweek } from './fpl/gameweek';
import { getTeam } from './fpl/team';
import { getPlayer } from './fpl/player';
import { getGameweekFixtures } from './fpl/fixtures';
import { getTopScorers } from './fpl/top-scorers';
import { echoMessage } from './echo';

export function registerTools(server: McpServer) {
    // Echo tool for testing
    server.tool('echo', { message: z.string() }, echoMessage);

    // FPL tools
    server.tool('get-current-gameweek', {}, getCurrentGameweek);
    server.tool('get-team', { teamId: z.number() }, getTeam);
    server.tool(
        'get-player',
        {
            playerId: z.number().optional(),
            playerName: z.string().optional(),
            includeRawData: z.boolean().optional(),
        },
        getPlayer
    );
    server.tool(
        'get-gameweek-fixtures',
        { gameweekId: z.number() },
        getGameweekFixtures
    );
    server.tool(
        'get-top-scorers',
        { 
            limit: z.number().optional().default(10),
            position: z.string().optional()
        },
        getTopScorers
    );
}
