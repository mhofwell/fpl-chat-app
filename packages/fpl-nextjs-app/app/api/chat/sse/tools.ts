// app/api/chat/sse/tools.ts
import { ToolDefinition } from '@/app/types/tool-types';

export const toolsForClaude: ToolDefinition[] = [
  {
    name: 'get-player',
    description: 'Retrieves detailed information about a specific FPL player using their name, FPL ID, or other criteria. Can also filter by team and position.',
    input_schema: {
      type: 'object' as const,
      properties: {
        playerQuery: {
          type: 'string',
          description: "Player's name (full or partial), FPL ID, or a descriptive query."
        },
        teamId: {
          type: 'number',
          description: 'Optional: FPL ID of the team to filter by.'
        },
        teamName: {
          type: 'string',
          description: 'Optional: Name of the team to filter by (supports fuzzy matching if teamId is not provided).'
        },
        position: {
          type: 'string',
          description: 'Optional: Player position to filter by (e.g., GKP, DEF, MID, FWD).'
        },
        includeRawData: {
          type: 'boolean',
          description: 'Optional: Whether to include raw JSON data in the response. Defaults to false.'
        }
      },
      required: ['playerQuery']
    }
  },
  {
    name: 'get-team',
    description: 'Retrieves detailed information about a specific FPL team using its name or FPL ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        teamQuery: {
          type: 'string',
          description: "Team's name (full or partial, supports fuzzy matching) or exact FPL team ID."
        },
        includeFixtures: {
          type: 'boolean',
          description: 'Optional: Include upcoming fixtures for the team. Defaults to true.'
        },
        includePlayers: {
          type: 'boolean',
          description: 'Optional: Include a list of key players for the team. Defaults to false.'
        },
        includeRawData: {
          type: 'boolean',
          description: 'Optional: Whether to include raw JSON data in the response. Defaults to false.'
        }
      },
      required: ['teamQuery']
    }
  },
  {
    name: 'get-gameweek',
    description: 'Retrieves information about an FPL gameweek, specified by ID or type (current, next, previous). Can include fixtures.',
    input_schema: {
      type: 'object' as const,
      properties: {
        gameweekId: {
          type: 'number',
          description: 'Optional: ID of the gameweek to retrieve.'
        },
        type: {
          type: 'string',
          enum: ['current', 'next', 'previous'],
          description: 'Optional: Specify gameweek by type (current, next, or previous).'
        },
        includeFixtures: {
          type: 'boolean',
          description: 'Optional: Whether to include fixtures for the gameweek. Defaults to true.'
        },
        includeRawData: {
          type: 'boolean',
          description: 'Optional: Whether to include raw JSON data in the response. Defaults to false.'
        }
      },
      required: []
    }
  },
  {
    name: 'search-players',
    description: 'Searches for FPL players based on various criteria. Can sort by actual goals scored (use goals_desc) or FPL points. Use this for "top scorer" queries with sortBy="goals_desc".',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: "Optional: Player's name (partial match supported)."
        },
        teamName: {
          type: 'string',
          description: 'Optional: Team name to filter by (partial match supported).'
        },
        position: {
          type: 'string',
          enum: ['GKP', 'DEF', 'MID', 'FWD'],
          description: 'Optional: Filter by player position.'
        },
        minPrice: {
          type: 'number',
          description: 'Optional: Minimum price (e.g., 5.5 for £5.5m).'
        },
        maxPrice: {
          type: 'number',
          description: 'Optional: Maximum price (e.g., 10.0 for £10.0m).'
        },
        minTotalPoints: {
          type: 'integer',
          description: 'Optional: Minimum total points.'
        },
        minGoals: {
          type: 'integer',
          description: 'Optional: Minimum actual goals scored.'
        },
        sortBy: {
          type: 'string',
          enum: ['total_points_desc', 'now_cost_asc', 'now_cost_desc', 'form_desc', 'selected_by_percent_desc', 'price_rise_desc', 'price_rise_asc', 'goals_desc'],
          description: "Optional: Stat to sort players by. Use 'goals_desc' for actual goal scorers, 'total_points_desc' for FPL points. Defaults to 'total_points_desc'."
        },
        limit: {
          type: 'integer',
          description: 'Optional: Number of results to return. Defaults to 10.'
        },
        includeRawData: {
          type: 'boolean',
          description: 'Optional: Whether to include raw JSON data in the response. Defaults to false.'
        }
      },
      required: []
    }
  },
  {
    name: 'search-fixtures',
    description: 'Searches for FPL fixtures based on criteria like team(s), gameweek, difficulty, and allows sorting. Can provide details for past matches.',
    input_schema: {
      type: 'object' as const,
      properties: {
        teamQuery: {
          type: 'string',
          description: "Optional: One or two team names (e.g., 'Arsenal', or 'Liverpool vs Man City'). Supports partial/fuzzy matching."
        },
        gameweekId: {
          type: 'integer',
          description: 'Optional: Filter by a specific gameweek ID.'
        },
        difficultyMin: {
          type: 'integer',
          description: 'Optional: Minimum FPL difficulty rating (1-5).'
        },
        difficultyMax: {
          type: 'integer',
          description: 'Optional: Maximum FPL difficulty rating (1-5).'
        },
        sortBy: {
          type: 'string',
          enum: ['kickoff_time_asc', 'kickoff_time_desc', 'difficulty_desc', 'difficulty_asc'],
          description: "Optional: Sort order for the fixtures. Defaults to 'kickoff_time_asc'."
        },
        includeDetails: {
          type: 'boolean',
          description: 'Optional: If a single specific past match is found, include detailed stats. Defaults to true.'
        },
        limit: {
          type: 'integer',
          description: 'Optional: Maximum number of fixtures to return. Defaults to 10.'
        },
        includeRawData: {
          type: 'boolean',
          description: 'Optional: Whether to include raw JSON data in the response. Defaults to false.'
        }
      },
      required: []
    }
  },
  {
    name: 'compare-entities',
    description: 'Compares two FPL entities (players or teams) side-by-side on various metrics.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entity1Query: {
          type: 'string',
          description: 'Name or FPL ID of the first player or team.'
        },
        entity2Query: {
          type: 'string',
          description: 'Name or FPL ID of the second player or team.'
        },
        entityType: {
          type: 'string',
          enum: ['player', 'team'],
          description: "The type of entities to compare ('player' or 'team')."
        },
        includeRawData: {
          type: 'boolean',
          description: 'Optional: Whether to include raw JSON data in the response. Defaults to false.'
        }
      },
      required: ['entity1Query', 'entity2Query', 'entityType']
    }
  }
];