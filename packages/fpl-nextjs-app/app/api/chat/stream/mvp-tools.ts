// app/api/chat/stream/mvp-tools.ts

import { ToolDefinition } from '@/app/types/tool-types';

export const fplMVPToolsForClaude: ToolDefinition[] = [
  {
    name: 'fpl_get_league_leaders',
    description: 'Returns rankings of Premier League players based on real match statistics (goals, assists, cards, clean sheets, saves, minutes). This tool focuses on actual match performance data.',
    input_schema: {
      type: 'object' as const,
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
    }
  },
  
  {
    name: 'fpl_get_player_stats',
    description: 'Returns comprehensive data for a specific player including both real match statistics (goals, assists, cards) and FPL fantasy data (points, form, ownership). Use this for detailed player analysis.',
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
    description: 'Search and filter Premier League players by various criteria. Can sort by real statistics (goals, assists) or FPL metrics (points, form, price). Returns both real and fantasy data for each player.',
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
          description: 'Sort results by this criteria'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 10)'
        }
      }
    }
  }
];