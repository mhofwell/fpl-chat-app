// In src/lib/mcp-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import { registerTools } from '../tools';

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Single server instance to be reused
let mcpServer: McpServer | null = null;

// Get or create the MCP server instance
export const getMcpServer = () => {
    if (!mcpServer) {
        mcpServer = new McpServer({
            name: 'FPL-MCP-Server',
            version: '1.0.0',
        });

        // Register all tools using the modular approach
        registerTools(mcpServer);
    }
    
    return mcpServer;
};

// Create a new transport with session management
export const createTransport = async (sessionId?: string): Promise<StreamableHTTPServerTransport> => {
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId || randomUUID(),
        onsessioninitialized: (id) => {
            // Store the transport when session is initialized
            transports[id] = transport;
            console.log(`Session initialized: ${id}`);
        }
    });
    
    // Set up cleanup handler
    transport.onclose = () => {
        if (transport.sessionId) {
            delete transports[transport.sessionId];
            console.log(`Session closed: ${transport.sessionId}`);
        }
    };
    
    return transport;
};

// Get existing transport by session ID
export const getTransport = (sessionId: string): StreamableHTTPServerTransport | undefined => {
    return transports[sessionId];
};

// Clean up all transports (for shutdown)
export const cleanupTransports = async () => {
    for (const sessionId in transports) {
        await transports[sessionId].close();
    }
};

