// lib/mcp/client.ts
'use server';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Cache for MCP clients by session ID
const mcpClients = new Map<string, { client: Client; transport: StreamableHTTPClientTransport }>();

/**
 * Get or create an MCP client for a given session
 */
export async function getMcpClient(sessionId?: string): Promise<{ client: Client; sessionId: string }> {
    // If we have a session ID, try to get existing client
    if (sessionId && mcpClients.has(sessionId)) {
        const cached = mcpClients.get(sessionId)!;
        return { client: cached.client, sessionId };
    }

    // Create new client
    const client = new Client({
        name: 'fpl-nextjs-app',
        version: '1.0.0',
    });

    // Configure MCP server URL
    const MCP_SERVER_URL = process.env.EXPRESS_MCP_SERVER_PRIVATE 
        ? `http://${process.env.EXPRESS_MCP_SERVER_PRIVATE}:${process.env.EXPRESS_MCP_SERVER_PORT || '3001'}`
        : 'http://localhost:3001';

    // Create transport
    const transport = new StreamableHTTPClientTransport(
        new URL(`${MCP_SERVER_URL}/mcp`)
    );

    try {
        // Connect the client
        await client.connect(transport);

        // Wait a moment for the transport to establish session
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Get the session ID from the transport after connection
        const newSessionId = transport.sessionId || sessionId || `session-${Date.now()}`;
        console.log('MCP Client connected with session:', newSessionId);

        // Cache the client and transport
        mcpClients.set(newSessionId, { client, transport });

        // Set up cleanup on disconnect
        client.onclose = () => {
            mcpClients.delete(newSessionId);
        };

        return { client, sessionId: newSessionId };
    } catch (error) {
        console.error('Failed to connect MCP client:', error);
        throw error;
    }
}

/**
 * Close an MCP client session
 */
export async function closeMcpClient(sessionId: string): Promise<void> {
    const cached = mcpClients.get(sessionId);
    if (cached) {
        await cached.client.close();
        mcpClients.delete(sessionId);
    }
}

/**
 * List available tools from the MCP server
 */
export async function listMcpTools(sessionId?: string) {
    try {
        const { client } = await getMcpClient(sessionId);
        const result = await client.listTools();
        return result.tools;
    } catch (error) {
        console.error('Failed to list MCP tools:', error);
        throw error;
    }
}

/**
 * Call an MCP tool
 */
export async function callMcpTool(
    toolName: string, 
    args: Record<string, any>, 
    sessionId?: string
): Promise<{ result: any; sessionId: string; error?: string }> {
    try {
        const { client, sessionId: activeSessionId } = await getMcpClient(sessionId);
        
        // Call the tool through the MCP client
        const result = await client.callTool({
            name: toolName,
            arguments: args,
        });

        return {
            result: result.content,
            sessionId: activeSessionId,
        };
    } catch (error) {
        console.error('Failed to call MCP tool:', error);
        return {
            result: null,
            sessionId: sessionId || 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}