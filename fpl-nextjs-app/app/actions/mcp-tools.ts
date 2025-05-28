// app/actions/mcp-tools.ts
'use server';

import fetch from 'node-fetch';
import { createClient } from '@/utils/supabase/server';

// Define types for MCP communication
type ToolCallParams = {
    name: string;
    arguments: Record<string, any>;
    sessionId?: string;
};

type ToolResult = {
    content: Array<{ text: string }> | null;
    error?: string;
    sessionId?: string;
};


/**
 * Initialize a new MCP session
 */
export async function initializeMcpSession(): Promise<string | undefined> {
    const MCP_SERVER_URL = process.env.EXPRESS_MCP_SERVER_PRIVATE 
        ? `http://${process.env.EXPRESS_MCP_SERVER_PRIVATE}:${process.env.EXPRESS_MCP_SERVER_PORT || '3001'}`
        : 'http://localhost:3001';

    try {
        console.log('Initializing MCP session...');
        console.log('MCP_SERVER_URL:', MCP_SERVER_URL);
        
        // Send an initialization request with timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), 5000);
        });
        
        const fetchPromise = fetch(`${MCP_SERVER_URL}/mcp`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream'
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
            })
        });
        
        const response = await Promise.race([fetchPromise, timeoutPromise]);

        console.log('Initialize response status:', response.status);
        console.log('Initialize response headers:', Object.fromEntries(response.headers.entries()));
        
        // Get the session ID from response headers (don't parse body for SSE)
        const sessionId = response.headers.get('mcp-session-id');

        if (!sessionId) {
            console.error('Failed to initialize MCP session: No session ID returned');
            console.error('Response headers:', Object.fromEntries(response.headers.entries()));
            // Try to read response for debugging
            try {
                const responseText = await response.text();
                console.error('Response body:', responseText);
            } catch (e) {
                console.error('Could not read response body:', e);
            }
            return undefined;
        }

        console.log(`MCP session initialized: ${sessionId}`);
        return sessionId;
    } catch (error) {
        console.error('Error initializing MCP session:', error);
        if (error instanceof Error) {
            console.error('Error name:', error.name);
            console.error('Error message:', error.message);
            if (error.message === 'Request timeout') {
                console.error('MCP session initialization timed out after 5 seconds');
            }
        }
        return undefined;
    }
}

/**
 * Server-side MCP client that communicates with the MCP Express server
 */
async function callMcpServerTool(params: ToolCallParams): Promise<ToolResult> {
    const MCP_SERVER_URL = process.env.EXPRESS_MCP_SERVER_PRIVATE 
        ? `http://${process.env.EXPRESS_MCP_SERVER_PRIVATE}:${process.env.EXPRESS_MCP_SERVER_PORT || '3001'}`
        : 'http://localhost:3001';
    const TIMEOUT_MS = 10000; // 10 second timeout

    try {

        // Construct a proper JSON-RPC 2.0 request
        const jsonRpcRequest = {
            jsonrpc: "2.0",
            method: "invokeTool",
            params: {
                name: params.name,
                arguments: params.arguments
            },
            id: Date.now()
        };

        console.log(`Sending JSON-RPC request: ${JSON.stringify(jsonRpcRequest)}`);

        // Create a timeout promise
        const timeoutPromise = new Promise<Response>((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Request timed out after ${TIMEOUT_MS}ms`));
            }, TIMEOUT_MS);
        });

        try {
            // Call the MCP server endpoint with timeout
            const fetchPromise = fetch(`${MCP_SERVER_URL}/mcp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/event-stream',
                    ...(params.sessionId && { 'mcp-session-id': params.sessionId }),
                },
                body: JSON.stringify(jsonRpcRequest),
            });
            
            // Race between fetch and timeout
            const response = await Promise.race([fetchPromise, timeoutPromise]);

            // More detailed logging
            console.log(
                `Calling MCP tool: ${params.name} with args:`,
                JSON.stringify(params.arguments)
            );

            const responseText = await response.text();
            console.log(`Raw response: ${responseText}`);

            let responseData;

            try {
                responseData = JSON.parse(responseText);
                console.log(`Parsed response: ${JSON.stringify(responseData)}`);
            } catch (parseError) {
                // If response is not valid JSON, use the raw text
                console.error(`Failed to parse JSON response: ${parseError}`);
                if (!response.ok) {
                    throw new Error(
                        `MCP server responded with status ${response.status}: ${responseText}`
                    );
                }
                // For non-JSON successful responses (should be rare)
                responseData = { content: [{ text: responseText }] };
            }

            // Check for JSON-RPC error format
            if (responseData && responseData.error) {
                throw new Error(
                    `MCP server error: ${responseData.error.message || JSON.stringify(responseData.error)}`
                );
            }

            if (!response.ok) {
                throw new Error(
                    `MCP server responded with status ${response.status}: ${responseText}`
                );
            }

            // Extract content from a successful JSON-RPC response
            let content;
            if (responseData.result && responseData.result.content) {
                content = responseData.result.content;
            } else if (Array.isArray(responseData.content)) {
                content = responseData.content;
            } else if (responseData.content) {
                // Handle case where content is not an array but has content
                content = [{ text: responseData.content }];
            } else {
                throw new Error(
                    `Invalid response structure from MCP server: ${JSON.stringify(responseData)}`
                );
            }

            const result: ToolResult = {
                content,
                sessionId: params.sessionId,
            };

            return result;
        } catch (e) {
            // Rethrow timeout errors
            if (e instanceof Error && e.message.includes('timed out')) {
                throw new Error('Request timed out');
            }
            throw e;
        }
    } catch (error: unknown) {
        if (error instanceof Error && error.message.includes('timed out')) {
            console.error('Request was aborted due to timeout');
            return {
                content: null,
                error: 'Request timed out after 10 seconds. The MCP server might be experiencing issues.',
                sessionId: params.sessionId,
            };
        }
        
        console.error('Error calling MCP server tool:', error);
        return {
            content: null,
            error:
                error instanceof Error
                    ? error.message
                    : 'Unknown error calling MCP tool',
            sessionId: params.sessionId,
        };
    }
}

export async function callMcpTool(
    toolName: string,
    args: Record<string, any>,
    sessionId?: string
) {
    try {
        // Session should already be initialized by the caller
        if (!sessionId) {
            console.error('No session ID provided to callMcpTool');
            return {
                success: false,
                error: 'MCP session ID is required',
            };
        }

        // Handle specific tool name and argument remapping if needed
        let mappedToolName = toolName;
        let mappedArgs = { ...args }; // Clone to avoid modifying original
        
        // Tool-specific mappings
        if (toolName === 'get-gameweek') {
            mappedToolName = 'get-current-gameweek';
            // get-current-gameweek doesn't take arguments based on the server definition
            mappedArgs = {};
        } else if (toolName === 'get-gameweek-fixtures' && args.gameweekId) {
            // Ensure gameweekId is a number
            mappedArgs.gameweekId = Number(args.gameweekId);
        } else if (toolName === 'get-team' && args.teamId) {
            // Ensure teamId is a number
            mappedArgs.teamId = Number(args.teamId);
        } else if (toolName === 'get-player' && args.playerId) {
            // Ensure playerId is a number
            mappedArgs.playerId = Number(args.playerId);
        } else if (toolName === 'get-top-scorers' && args.limit) {
            // Ensure limit is a number
            mappedArgs.limit = Number(args.limit);
        }

        console.log(`Using mapped tool: ${mappedToolName} with args:`, mappedArgs);

        const result = await callMcpServerTool({
            name: mappedToolName,
            arguments: mappedArgs,
            sessionId,
        });


        if (result.error) {
            return {
                success: false,
                error: result.error,
                sessionId: result.sessionId,
            };
        }

        return {
            success: true,
            result: result.content,
            sessionId: result.sessionId,
        };
    } catch (error) {
        console.error('Error calling MCP tool:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            sessionId,
        };
    }
}

export async function getUserChats() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: 'Not authenticated' };

    const { data, error } = await supabase
        .from('chats')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    return { success: !error, chats: data };
}

export async function getChatMessages(chatId: string) {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

    return { success: !error, messages: data };
}
