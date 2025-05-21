// fpl-mcp-server/src/tools/fpl/index.ts
import { z } from 'zod';
import { FplToolDefinition } from '../../types/mcp-types';

// Import refactored tools
import { getPlayerData } from './player-data';
import { getTeamData } from './team-data';
import { getFixtureData } from './fixture-data';
import { getLeagueData } from './league-data';
import { comparePlayerData } from './player-comparison';
import { getFixtureDifficulty } from './fixture-difficulty';
import { getGameweek } from './gameweek'; // Keeping gameweek as it hasn't been refactored yet
import { getFormAnalysis } from './form-analysis'; // New form analysis tool

// Define all FPL tools using Zod schemas
export const fplTools: Record<string, FplToolDefinition> = {
  // Core Data Tools
  'fpl_player_data': {
    description: 'Get comprehensive data about a player including stats, form, fixtures and history',
    inputSchema: z.object({
      playerQuery: z.string().describe('Player name or FPL ID to search for'),
      teamId: z.number().optional().describe('Optional: Filter by team ID'),
      teamName: z.string().optional().describe('Optional: Filter by team name'),
      position: z.enum(['GKP', 'DEF', 'MID', 'FWD']).optional().describe('Optional: Filter by position'),
      includeHistory: z.boolean().optional().describe('Include player match history (default: false)'),
      includeFixtures: z.boolean().optional().describe('Include upcoming fixtures (default: false)'),
      includeRawData: z.boolean().optional().describe('Include raw data in response (default: false)')
    }),
    handler: getPlayerData
  },
  
  'fpl_team_data': {
    description: 'Get detailed information about a Premier League team including stats, players and fixtures',
    inputSchema: z.object({
      teamQuery: z.string().describe('Team name or FPL ID to search for'),
      includeFixtures: z.boolean().optional().describe('Include upcoming fixtures (default: true)'),
      includePlayers: z.boolean().optional().describe('Include key players for the team (default: false)'),
      includeForm: z.boolean().optional().describe('Include form analysis (default: false)'),
      includeRawData: z.boolean().optional().describe('Include raw data in response (default: false)')
    }),
    handler: getTeamData
  },
  
  'fpl_fixture_data': {
    description: 'Get information about Premier League fixtures with flexible filtering options',
    inputSchema: z.object({
      teamQuery: z.string().optional().describe('Team name or "Team1 vs Team2" format'),
      gameweekId: z.number().optional().describe('Filter by specific gameweek'),
      range: z.union([z.string(), z.number()]).optional().describe('"next", "previous" or number of fixtures'),
      difficultyMin: z.number().optional().describe('Minimum difficulty rating (1-5)'),
      difficultyMax: z.number().optional().describe('Maximum difficulty rating (1-5)'),
      sortBy: z.enum(['kickoff_time_asc', 'kickoff_time_desc', 'difficulty_desc', 'difficulty_asc']).optional()
        .describe('Sort order for fixtures'),
      includeStats: z.boolean().optional().describe('Include detailed match stats for completed fixtures'),
      limit: z.number().optional().describe('Maximum fixtures to return (default: 10)'),
      includeRawData: z.boolean().optional().describe('Include raw data in response')
    }),
    handler: getFixtureData
  },
  
  'fpl_league_data': {
    description: 'Get rankings of players across the league by various statistical categories',
    inputSchema: z.object({
      category: z.enum(['goals', 'assists', 'cards', 'clean_sheets', 'saves', 'minutes', 'bonus', 'points'])
        .describe('The statistic to rank players by'),
      position: z.enum(['GKP', 'DEF', 'MID', 'FWD']).optional().describe('Optional: Filter by position'),
      limit: z.number().optional().describe('Number of players to return (default: 10)'),
      includeDetails: z.boolean().optional().describe('Include additional details like form and price (default: true)'),
      includeRawData: z.boolean().optional().describe('Include raw data in response')
    }),
    handler: getLeagueData
  },
  
  // Analysis Tools
  'fpl_player_comparison': {
    description: 'Compare multiple players across various statistical categories',
    inputSchema: z.object({
      playerQueries: z.array(z.string()).describe('Array of player names or IDs to compare (2-5 players)'),
      categories: z.array(
        z.enum(['points', 'goals', 'assists', 'minutes', 'clean_sheets', 'bonus', 
                'yellow_cards', 'red_cards', 'saves', 'price', 'form', 'selected'])
      ).optional().describe('Stats to compare (defaults to points, goals, assists, minutes)'),
      includeFixtures: z.boolean().optional().describe('Include upcoming fixtures comparison'),
      includeHistory: z.boolean().optional().describe('Include recent form comparison'),
      includeRawData: z.boolean().optional().describe('Include raw data in response')
    }),
    handler: comparePlayerData
  },
  
  'fpl_fixture_difficulty': {
    description: 'Analyze upcoming fixture difficulty for teams with position-specific insights',
    inputSchema: z.object({
      teamQuery: z.string().describe('Team name or ID to analyze'),
      range: z.number().optional().describe('Number of fixtures to analyze (default: 5)'),
      position: z.enum(['GKP', 'DEF', 'MID', 'FWD']).optional().describe('Optional: Analyze difficulty specific to position'),
      includeRawData: z.boolean().optional().describe('Include raw data in response')
    }),
    handler: getFixtureDifficulty
  },
  
  // New form analysis tool
  'fpl_form_analysis': {
    description: 'Analyze recent form trends for a player or team with detailed metrics',
    inputSchema: z.object({
      entityType: z.enum(['player', 'team']).describe('Type of entity to analyze (player or team)'),
      entityQuery: z.string().describe('Name or ID of the player/team to analyze'),
      timeframe: z.number().optional().describe('Number of gameweeks to analyze (default: 5)'),
      metricFocus: z.array(z.string()).optional().describe('Optional list of metrics to focus on'),
      compareWithPrevious: z.boolean().optional().describe('Compare with previous equivalent timeframe'),
      includeRawData: z.boolean().optional().describe('Include raw data in response (default: false)')
    }),
    handler: getFormAnalysis
  },
  
  // Retained from original tools
  'fpl_get_gameweek': {
    description: 'Get information about a specific Premier League gameweek',
    inputSchema: z.object({
      gameweekId: z.number().optional().describe('Specify a gameweek by its ID.'),
      type: z.enum(['current', 'next', 'previous']).optional().describe('Specify gameweek by type (current, next, or previous).'),
      includeFixtures: z.boolean().optional().describe('Whether to include fixtures for the gameweek.'),
      includeRawData: z.boolean().optional().describe('Include raw JSON data alongside structured text.')
    }),
    handler: getGameweek
  }
};

// Export tool definitions for MCP server
export const toolDefinitions = Object.entries(fplTools).map(([name, tool]) => ({
  name,
  description: tool.description,
  inputSchema: tool.inputSchema
}));

// Export handlers for execution
export const toolHandlers = Object.entries(fplTools).reduce<Record<string, any>>((acc, [name, tool]) => {
  acc[name] = tool.handler;
  return acc;
}, {});