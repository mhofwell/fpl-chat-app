// app/api/chat/stream/mvp-tools.ts

import { ToolDefinition } from '@/app/types/tool-types';

export const fplMVPToolsForClaude: ToolDefinition[] = [
  {
    name: 'fpl_get_league_leaders',
    description: 'Get top players by REAL Premier League statistics (goals, assists, cards, etc.). Use this for "top scorer", "most goals", "most assists" queries.',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          enum: ['goals', 'assists', 'cards', 'clean_sheets', 'saves', 'minutes'],
          description: 'The real statistic to rank players by. Use "goals" for top scorers.'
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
    }
  },
  
  {
    name: 'fpl_get_player_stats',
    description: 'Get detailed statistics for a specific player including REAL STATS (goals, assists) and FPL data (fantasy points, price).',
    input_schema: {
      type: 'object' as const,
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
    }
  },
  
  {
    name: 'fpl_search_players',
    description: 'Search for players based on various criteria. Use sortBy="goals" for real goals, sortBy="points" for FPL points.',
    input_schema: {
      type: 'object' as const,
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
          description: 'Minimum REAL goals scored'
        },
        minAssists: {
          type: 'number',
          description: 'Minimum REAL assists'
        },
        teamName: {
          type: 'string',
          description: 'Filter by team name'
        },
        sortBy: {
          type: 'string',
          enum: ['goals', 'assists', 'points', 'form', 'price'],
          description: 'Sort by: "goals" for real goals, "points" for FPL points'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 10)'
        }
      }
    }
  }
];