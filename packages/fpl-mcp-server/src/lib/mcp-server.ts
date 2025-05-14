// In src/lib/mcp-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import redis from './redis/redis-client';

// In-memory session storage (with Redis backup)
const sessions: Record<string, StreamableHTTPServerTransport> = {};
const servers: Record<string, McpServer> = {};

// Create MCP server
export const createMcpServer = () => {
    const server = new McpServer({
        name: 'FPL-MCP-Server',
        version: '1.0.0',
    });

    return server;
};

// Create a new transport for a session
export const createTransport = async (
    sessionId: string = randomUUID()
): Promise<StreamableHTTPServerTransport> => {
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId,
    });

    // Store transport in memory for immediate use
    sessions[sessionId] = transport;
    
    // Mark this session as active in Redis
    await redis.set(`mcp:session:${sessionId}:active`, 'true', 'EX', 86400); // 24 hour expiry

    // Setup cleanup when transport is closed
    transport.onclose = async () => {
        delete sessions[sessionId];
        delete servers[sessionId];
        await redis.del(`mcp:session:${sessionId}:active`);
        console.log(`Session ${sessionId} closed and removed from Redis`);
    };

    console.log(`Created new session ${sessionId} and stored in Redis`);
    return transport;
};

// Get transport by session ID
export const getTransport = async (
    sessionId: string
): Promise<StreamableHTTPServerTransport | undefined> => {
    console.log(`Looking for session ${sessionId}`);
    
    // First check in-memory cache
    let transport = sessions[sessionId];
    
    if (transport) {
        console.log(`Found transport for ${sessionId} in memory`);
        return transport;
    }
    
    // Check if session exists in Redis
    const exists = await redis.exists(`mcp:session:${sessionId}:active`);
    
    if (exists) {
        console.log(`Session ${sessionId} exists in Redis but not in memory, recreating...`);
        // Session exists in Redis but not in memory (server restart?)
        // Create a new transport with the same session ID
        transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => sessionId,
        });
        
        // Store it in memory
        sessions[sessionId] = transport;
        
        // Create and connect a new server if it doesn't exist
        if (!servers[sessionId]) {
            // Import createMcpServer here to avoid circular dependency
            const { createMcpServer } = await import('../server.js');
            const server = createMcpServer();
            await server.connect(transport);
            servers[sessionId] = server;
            console.log(`Recreated server for session ${sessionId}`);
        }
        
        // Refresh Redis TTL
        await redis.expire(`mcp:session:${sessionId}:active`, 86400);
        
        return transport;
    }
    
    console.log(`Session ${sessionId} not found in memory or Redis`);
    return undefined;
};

// Store server instance for session
export const storeServer = (sessionId: string, server: McpServer): void => {
    servers[sessionId] = server;
};

// Get server instance for session
export const getServer = (sessionId: string): McpServer | undefined => {
    return servers[sessionId];
};

// Get all active session IDs
export const getActiveSessions = async (): Promise<string[]> => {
    // Get in-memory sessions
    const memorySessionIds = Object.keys(sessions);
    
    // Get Redis sessions
    const redisSessions = await redis.keys('mcp:session:*:active');
    const redisSessionIds = redisSessions.map(key => {
        // Extract session ID from key format "mcp:session:{id}:active"
        const parts = key.split(':');
        return parts[2];
    });
    
    // Combine and deduplicate
    return [...new Set([...memorySessionIds, ...redisSessionIds])];
};
