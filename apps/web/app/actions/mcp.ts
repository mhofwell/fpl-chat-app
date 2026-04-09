'use server';
import type { McpToolResult } from '@/lib/types/fpl-types';

export async function initializeMcpSession(): Promise<string | null> {
    const MCP_SERVER_URL = `${process.env.FPL_MCP_SERVER_BASE_URL}:${process.env.FPL_MCP_SERVER_PORT}`;

    try {
        const response = await fetch(`${MCP_SERVER_URL}/mcp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'initialize',
                params: {
                    protocolVersion: '0.1.0',
                    capabilities: {
                        experimental: {},
                        sampling: {},
                    },
                    clientInfo: {
                        name: 'fpl-nextjs-app',
                        version: '1.0.0',
                    },
                },
                id: 1,
            }),
        });

        if (!response.ok) {
            console.error('Failed to initialize MCP session:', response.status);
            return null;
        }

        // Get session ID from response headers
        const sessionId = response.headers.get('mcp-session-id');
        if (!sessionId) {
            console.error('No session ID returned from MCP server');
            return null;
        }

        console.log('MCP session initialized:', sessionId);
        return sessionId;
    } catch (error) {
        console.error('Error initializing MCP session:', error);
        return null;
    }
}

export async function callMcpTool(
    toolName: string,
    args: Record<string, any>,
    sessionId: string
): Promise<McpToolResult> {
    const MCP_SERVER_URL = `${process.env.FPL_MCP_SERVER_BASE_URL}:${process.env.FPL_MCP_SERVER_PORT}`;

    try {
        const response = await fetch(`${MCP_SERVER_URL}/mcp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
                'mcp-session-id': sessionId,
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'tools/call',
                params: {
                    name: toolName,
                    arguments: args,
                },
                id: Date.now(),
            }),
        });

        if (!response.ok) {
            return {
                success: false,
                error: `HTTP error! status: ${response.status}`,
            };
        }

        const responseText = await response.text();
        let data;

        // Check if response is SSE format
        if (
            responseText.startsWith('event:') ||
            responseText.includes('data:')
        ) {
            // Parse SSE format
            const lines = responseText.split('\n');
            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const dataContent = line.substring(5).trim();
                    if (dataContent) {
                        data = JSON.parse(dataContent);
                        break;
                    }
                }
            }
        } else {
            // Regular JSON response
            data = JSON.parse(responseText);
        }

        if (data?.error) {
            return {
                success: false,
                error: data.error.message || 'Unknown error',
            };
        }

        return {
            success: true,
            result: data?.result,
        };
    } catch (error) {
        console.error('Error calling MCP tool:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
