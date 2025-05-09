// src/resources/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { gameweeksResource } from './fpl/gameweeks';
import { teamsResource } from './fpl/teams';
import { playersResource } from './fpl/players';
import { fixturesResource } from './fpl/fixtures';

export function registerResources(server: McpServer) {
  server.resource(
    gameweeksResource.name,
    gameweeksResource.template,
    gameweeksResource.handler
  );
  
  server.resource(
    teamsResource.name,
    teamsResource.template,
    teamsResource.handler
  );
  
  server.resource(
    playersResource.name,
    playersResource.template,
    playersResource.handler
  );
  
  server.resource(
    fixturesResource.name,
    fixturesResource.template,
    fixturesResource.handler
  );
}