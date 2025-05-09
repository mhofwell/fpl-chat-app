// src/resources/fpl/gameweeks.ts
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import redis from '../../lib/redis/redis-client';
import { Gameweek } from '../../../../../types/fpl-domain.types';

export const gameweeksResource = {
  name: 'fpl-gameweeks',
  template: new ResourceTemplate('fpl://gameweeks/{gameweekId?}', { list: undefined }),
  handler: async (uri: URL, variables: { gameweekId?: string }) => {
    try {
      const cachedData = await redis.get('fpl:gameweeks');
      if (!cachedData) {
        return {
          contents: [{
            uri: uri.href,
            text: 'Gameweeks data not available'
          }]
        };
      }

      const gameweeks: Gameweek[] = JSON.parse(cachedData);
      
      // If gameweekId is provided, return specific gameweek
      if (variables.gameweekId) {
        const gameweek = gameweeks.find(gw => gw.id === parseInt(variables.gameweekId!));
        if (!gameweek) {
          return {
            contents: [{
              uri: uri.href,
              text: `Gameweek with ID ${variables.gameweekId} not found`
            }]
          };
        }
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(gameweek, null, 2)
          }]
        };
      }
      
      // If current is specified, return current gameweek
      if (uri.href.includes('current')) {
        const currentGameweek = gameweeks.find(gw => gw.is_current);
        if (!currentGameweek) {
          return {
            contents: [{
              uri: uri.href,
              text: 'Current gameweek not found'
            }]
          };
        }
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(currentGameweek, null, 2)
          }]
        };
      }
      
      // Otherwise return a list of all gameweeks
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(gameweeks.map(gw => ({ 
            id: gw.id, 
            name: gw.name,
            is_current: gw.is_current,
            is_next: gw.is_next,
            deadline_time: gw.deadline_time
          })), null, 2)
        }]
      };
    } catch (error) {
      console.error('Error fetching gameweeks:', error);
      return {
        contents: [{
          uri: uri.href,
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }
};