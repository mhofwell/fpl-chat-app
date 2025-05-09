// src/resources/fpl/fixtures.ts
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import redis from '../../lib/redis/redis-client';
import { Fixture } from '../../../../../types/fpl-domain.types';

export const fixturesResource = {
  name: 'fpl-fixtures',
  template: new ResourceTemplate('fpl://fixtures/{gameweekId?}', { list: undefined }),
  handler: async (uri: URL, variables: { gameweekId?: string }) => {
    try {
      const cachedData = await redis.get('fpl:fixtures');
      if (!cachedData) {
        return {
          contents: [{
            uri: uri.href,
            text: 'Fixtures data not available'
          }]
        };
      }

      const fixtures: Fixture[] = JSON.parse(cachedData);
      
      // If gameweekId is provided, return fixtures for that gameweek
      if (variables.gameweekId) {
        const gameweekFixtures = fixtures.filter(f => f.gameweek_id === parseInt(variables.gameweekId!));
        if (gameweekFixtures.length === 0) {
          return {
            contents: [{
              uri: uri.href,
              text: `No fixtures found for gameweek ${variables.gameweekId}`
            }]
          };
        }
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(gameweekFixtures, null, 2)
          }]
        };
      }
      
      // Otherwise return a summary of all fixtures
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(fixtures.map(f => ({ 
            id: f.id, 
            gameweek_id: f.gameweek_id,
            home_team: f.team_h,
            away_team: f.team_a,
            kickoff_time: f.kickoff_time
          })), null, 2)
        }]
      };
    } catch (error) {
      console.error('Error fetching fixtures:', error);
      return {
        contents: [{
          uri: uri.href,
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }
};