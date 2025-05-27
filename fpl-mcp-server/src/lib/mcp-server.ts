// In src/lib/mcp-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import redis from './redis/redis-client';
import { registerTools } from '../tools';

// No session storage needed for stateless approach

// Create MCP server
export const createMcpServer = () => {
    const server = new McpServer({
        name: 'FPL-MCP-Server',
        version: '1.0.0',
    });

    // Register all tools using the modular approach
    registerTools(server);

    return server;
};

// Create a new transport (stateless)
export const createTransport = async (): Promise<StreamableHTTPServerTransport> => {
    const transport = new StreamableHTTPServerTransport({
        // No session ID needed for stateless
    });
    return transport;
};

// Create and connect a stateless MCP handler
export const handleMcpRequest = async (req: any, res: any, body: any) => {
    // Create a new transport and server for each request
    const transport = await createTransport();
    const server = createMcpServer();
    await server.connect(transport);
    
    // Handle the request
    await transport.handleRequest(req, res, body);
};

