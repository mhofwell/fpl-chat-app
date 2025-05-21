// app/api/chat/stream/mvp-tools.ts

import { ToolDefinition } from '@/app/types/tool-types';

export const fplMVPToolsForClaude: ToolDefinition[] = [
  // Original MVP tools
  {
    name: 'fpl_league_data',
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
          enum: ['goals', 'assists', 'cards', 'clean_sheets', 'saves', 'minutes', 'bonus', 'points'],
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
    name: 'fpl_player_data',
    description: `Get comprehensive player data with search and filter capabilities. Returns:
- Comprehensive player information including stats, form, availability
- Search functionality to find players by name, team, or position
- Filter options to narrow results by performance metrics
Format: Human-readable text with structured sections`,
    input_schema: {
      type: 'object' as const,
      properties: {
        playerQuery: {
          type: 'string',
          description: 'Player name or FPL ID to search for'
        },
        teamId: {
          type: 'number',
          description: 'Optional: Filter by team ID'
        },
        teamName: {
          type: 'string',
          description: 'Optional: Filter by team name'
        },
        position: {
          type: 'string',
          enum: ['GKP', 'DEF', 'MID', 'FWD'],
          description: 'Optional: Filter by position'
        },
        includeHistory: {
          type: 'boolean',
          description: 'Include player match history (default: false)'
        },
        includeFixtures: {
          type: 'boolean',
          description: 'Include upcoming fixtures (default: false)'
        },
        includeRawData: {
          type: 'boolean',
          description: 'Include raw data in response (default: false)'
        }
      },
      required: ['playerQuery']
    }
  },
  
  // Tools migrated from SSE API
  
  // get-team tool
  {
    name: 'fpl_team_data',
    description: `Get detailed information about a Premier League team. Returns:
- Team name, short name, and FPL ID
- Key stats: points, position, form, strength ratings
- Upcoming fixtures with difficulty ratings
- Optional: List of key players for the team

Format: Human-readable sections with structured data.
Example: "TEAM_INFO: Liverpool (LIV), Position: 2, Form: WWDWW, Strength: 4/5"`,
    input_schema: {
      type: 'object' as const,
      properties: {
        teamQuery: {
          type: 'string',
          description: 'Team name (supports partial/fuzzy match) or exact FPL team ID.'
        },
        includeFixtures: {
          type: 'boolean',
          description: 'Include upcoming fixtures for the team.'
        },
        includePlayers: {
          type: 'boolean',
          description: 'Include a list of key players for the team.'
        },
        includeRawData: {
          type: 'boolean',
          description: 'Include raw JSON data alongside structured text.'
        }
      },
      required: ['teamQuery']
    }
  },
  
  // get-gameweek tool
  {
    name: 'fpl_get_gameweek',
    description: `Get information about a specific Premier League gameweek. Returns:
- Gameweek name, status, and deadline
- List of fixtures with teams, kickoff times, and FPL difficulty ratings
- Format: Human-readable sections with structured data
Example: "Gameweek 12 (Current), Deadline: Friday, 10 Nov 2023 18:30"`,
    input_schema: {
      type: 'object' as const,
      properties: {
        gameweekId: {
          type: 'number',
          description: 'Specify a gameweek by its ID.'
        },
        type: {
          type: 'string',
          enum: ['current', 'next', 'previous'],
          description: 'Specify gameweek by type (current, next, or previous).'
        },
        includeFixtures: {
          type: 'boolean',
          description: 'Whether to include fixtures for the gameweek.'
        },
        includeRawData: {
          type: 'boolean',
          description: 'Include raw JSON data alongside structured text.'
        }
      }
    }
  },
  
  // search-fixtures tool
  {
    name: 'fpl_fixture_data',
    description: `Search for Premier League fixtures based on various criteria. Returns:
- Match details: teams, gameweek, kickoff time
- Team statistics and difficulty ratings
- For past matches: score and key events (goals, assists, cards)
- For upcoming matches: venue and difficulty rating
Format: Human-readable results with structured data`,
    input_schema: {
      type: 'object' as const,
      properties: {
        teamQuery: {
          type: 'string',
          description: 'One or two team names (e.g., "Arsenal", "Liverpool vs Man City"). Supports partial/fuzzy match.'
        },
        gameweekId: {
          type: 'number',
          description: 'Filter by a specific gameweek ID.'
        },
        difficultyMin: {
          type: 'number',
          description: 'Minimum FPL difficulty rating (1-5) for at least one team in the match.'
        },
        difficultyMax: {
          type: 'number',
          description: 'Maximum FPL difficulty rating (1-5) for at least one team in the match.'
        },
        sortBy: {
          type: 'string',
          enum: ['kickoff_time_asc', 'kickoff_time_desc', 'difficulty_desc', 'difficulty_asc'],
          description: 'Sort order for the fixtures. Default is by kickoff time ascending.'
        },
        includeDetails: {
          type: 'boolean',
          description: 'If a single specific past match is found, include detailed stats like score, scorers, cards, bonus.'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of fixtures to return in a list.'
        },
        includeRawData: {
          type: 'boolean',
          description: 'Include raw JSON data alongside structured text.'
        }
      }
    }
  },
  
  // compare-entities tool
  {
    name: 'fpl_player_comparison',
    description: `Compare multiple players (2-5) across various statistical categories. Returns:
- Side-by-side comparison of key metrics
- For players: stats, form, upcoming fixtures
- Optional comparison of fixtures and recent form
Format: Tabular comparison with detailed sections`,
    input_schema: {
      type: 'object' as const,
      properties: {
        playerQueries: {
          type: 'string',
          description: 'Comma-separated list of 2-5 player names or IDs to compare (e.g., "Salah, Kane, Son")'
        },
        categories: {
          type: 'string',
          description: 'Comma-separated list of stats to compare (e.g., "points, goals, assists, minutes")',
          enum: ['points', 'goals', 'assists', 'minutes', 'clean_sheets', 'bonus', 'yellow_cards', 'red_cards', 'saves', 'price', 'form', 'selected']
        },
        includeFixtures: {
          type: 'boolean',
          description: 'Include upcoming fixtures comparison'
        },
        includeHistory: {
          type: 'boolean',
          description: 'Include recent form comparison'
        },
        includeRawData: {
          type: 'boolean',
          description: 'Include raw data in response'
        }
      },
      required: ['playerQueries']
    }
  },
  
  // form-analysis tool
  {
    name: 'fpl_form_analysis',
    description: `Analyze recent form trends for a player or team with detailed metrics. Returns:
- Summary of performance metrics for a custom timeframe (default: last 5 gameweeks)
- Smart trend analysis with context-aware insights
- Comparison with previous equivalent timeframe (optional)
- Form rating on a 1-10 scale
Format: Human-readable sections with detailed metrics and analysis`,
    input_schema: {
      type: 'object' as const,
      properties: {
        entityType: {
          type: 'string',
          enum: ['player', 'team'],
          description: 'Type of entity to analyze (player or team)'
        },
        entityQuery: {
          type: 'string',
          description: 'Name or ID of the player/team to analyze'
        },
        timeframe: {
          type: 'number',
          description: 'Number of gameweeks to analyze (default: 5)'
        },
        metricFocus: {
          type: 'string',
          description: 'Comma-separated list of metrics to focus on (e.g., "goals, xG, bonus")'
        },
        compareWithPrevious: {
          type: 'boolean',
          description: 'Compare with previous equivalent timeframe (default: false)'
        },
        includeRawData: {
          type: 'boolean',
          description: 'Include raw data in response (default: false)'
        }
      },
      required: ['entityType', 'entityQuery']
    }
  },
  
  // fixture-difficulty tool
  {
    name: 'fpl_fixture_difficulty',
    description: `Analyze upcoming fixture difficulty for teams with position-specific insights. Returns:
- Overall fixture difficulty rating
- Breakdown by position (defense/attack)
- Upcoming match analysis with FDR ratings
- Strategic insights based on fixture difficulty
Format: Human-readable analysis with structured sections`,
    input_schema: {
      type: 'object' as const,
      properties: {
        teamQuery: {
          type: 'string',
          description: 'Team name or ID to analyze'
        },
        range: {
          type: 'number',
          description: 'Number of fixtures to analyze (default: 5)'
        },
        position: {
          type: 'string',
          enum: ['GKP', 'DEF', 'MID', 'FWD'],
          description: 'Optional: Analyze difficulty specific to position'
        },
        includeRawData: {
          type: 'boolean',
          description: 'Include raw data in response'
        }
      },
      required: ['teamQuery']
    }
  }
];