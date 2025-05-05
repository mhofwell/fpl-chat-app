import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fplAssistantPrompt } from './fpl-assistant';
import { z } from 'zod';

// Export all prompts for external use
export const prompts = {
  fplAssistant: fplAssistantPrompt,
};

/**
 * Registers all prompts with the MCP server
 * @param server The MCP server instance
 */
export const registerPrompts = (server: McpServer) => {
  // Register each prompt with the server
  server.prompt(
    "fpl-assistant",
    { query: z.string().optional() },
    ({ query }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: query || "Tell me about the current gameweek."
          }
        }
      ]
    })
  );
  
  // Log registration
  console.log('Prompts registered successfully');
};
