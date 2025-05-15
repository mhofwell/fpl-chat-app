// fpl-mcp-server/src/tools/fpl/index.ts

import { mvpHandlers } from './mvp-handlers';

// Define the FPL MVP tools
export const fplMVPTools = {
  'fpl_get_league_leaders': {
    description: 'Get top players by real Premier League statistics (goals, assists, cards, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['goals', 'assists', 'cards', 'clean_sheets', 'saves', 'minutes'],
          description: 'The statistic to rank players by'
        },
        position: {
          type: 'string',
          enum: ['GKP', 'DEF', 'MID', 'FWD'],
          description: 'Optional: Filter by position'
        },
        limit: {
          type: 'number',
          description: 'Number of players to return (default: 10)'
        },
        includeDetails: {
          type: 'boolean',
          description: 'Include additional details like form and price (default: true)'
        }
      },
      required: ['category']
    },
    handler: mvpHandlers.getLeagueLeaders
  },
  
  'fpl_get_player_stats': {
    description: 'Get detailed statistics for a specific player including real stats and FPL data',
    inputSchema: {
      type: 'object',
      properties: {
        playerName: {
          type: 'string',
          description: 'Player name (supports fuzzy matching)'
        },
        playerId: {
          type: 'number',
          description: 'FPL player ID'
        },
        includeForm: {
          type: 'boolean',
          description: 'Include last 5 games data (default: true)'
        }
      },
      // Note: Either playerName or playerId is required
      required: []
    },
    handler: mvpHandlers.getPlayerStats
  },
  
  'fpl_search_players': {
    description: 'Search for players based on various criteria (name, team, position, stats)',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Player name to search for'
        },
        position: {
          type: 'string',
          enum: ['GKP', 'DEF', 'MID', 'FWD'],
          description: 'Filter by position'
        },
        minGoals: {
          type: 'number',
          description: 'Minimum goals scored'
        },
        minAssists: {
          type: 'number',
          description: 'Minimum assists'
        },
        teamName: {
          type: 'string',
          description: 'Filter by team name'
        },
        sortBy: {
          type: 'string',
          enum: ['goals', 'assists', 'points', 'form', 'price'],
          description: 'Sort results by this metric (default: goals)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 10)'
        }
      },
      required: []
    },
    handler: mvpHandlers.searchPlayers
  }
};

// Export tool definitions for MCP server
export const toolDefinitions = Object.entries(fplMVPTools).map(([name, tool]) => ({
  name,
  description: tool.description,
  inputSchema: tool.inputSchema
}));

// Export handlers for execution
export const toolHandlers = Object.entries(fplMVPTools).reduce((acc, [name, tool]) => {
  acc[name] = tool.handler;
  return acc;
}, {} as Record<string, Function>);