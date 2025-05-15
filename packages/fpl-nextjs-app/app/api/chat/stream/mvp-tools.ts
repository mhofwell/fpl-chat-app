// app/api/chat/stream/mvp-tools.ts

import { ToolDefinition } from '@/app/types/tool-types';

export const fplMVPToolsForClaude: ToolDefinition[] = [
  {
    name: 'fpl_get_league_leaders',
    description: `Get Premier League player rankings by real match statistics. Returns:
- Player name, team, and position
- Statistic value (e.g., goals scored)
- Games played and per-game average
- Current form rating
Format: "1. Mohamed Salah (LIV) - 28 goals in 36 games (0.78 per game) - Form: 3.8"`,
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
    description: `Get comprehensive stats for a specific player. Returns:
CurrentSeason: goals, assists, minutes, clean sheets, cards
FPLData: total points, current price, ownership %, form rating
Availability: injury status and news
Format: Human-readable text with structured sections`,
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
    description: `Search and filter players by various criteria. Returns:
- Player name, team, position
- Real stats: goals, assists, minutes played
- FPL data: points, price (£m), ownership %, form
Format: List of players with both real and fantasy data
Example: "Mohamed Salah - Liverpool FWD - Goals: 28, Points: 303, Price: £12.8"`,
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