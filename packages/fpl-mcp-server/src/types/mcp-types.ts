// src/types/mcp-types.ts
import { z } from 'zod';

// Define standard MCP tool response structure
export interface McpToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

// Context passed to MCP tool handlers
export interface McpToolContext {
  // Add any context properties the MCP server provides
  // This is typically empty or contains user/session info
}

// Generic handler type for all tools
export type McpToolHandler<T = any> = (
  params: T,
  context: McpToolContext
) => Promise<McpToolResponse>;

// Standard FPL tool definition structure with Zod schema
export interface FplToolDefinition {
  description: string;
  inputSchema: z.ZodType<any>;
  handler: McpToolHandler;
}