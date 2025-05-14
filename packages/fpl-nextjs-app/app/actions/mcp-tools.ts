// app/actions/mcp-tools.ts
'use server';

import fetch from 'node-fetch';
import { createClient } from '@/utils/supabase/server';
import { buildMcpUrl } from './mcp-url-helper';

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
export async function initializeMcpSession(retryCount = 3): Promise<string | undefined> {
    // Get MCP server URL with fallback
    const MCP_SERVER_URL = process.env.EXPRESS_MCP_SERVER_PRIVATE || 
        (process.env.RAILWAY_ENVIRONMENT_NAME ? 'http://fpl-mcp-server.railway.internal:8080' : 'http://localhost:3001');

    console.log(`EXPRESS_MCP_SERVER_PRIVATE env var: "${process.env.EXPRESS_MCP_SERVER_PRIVATE}"`);
    console.log(`Using MCP Server URL: "${MCP_SERVER_URL}"`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Railway Environment: ${process.env.RAILWAY_ENVIRONMENT_NAME}`);

    for (let attempt = 1; attempt <= retryCount; attempt++) {
        try {
            console.log(`Initializing MCP session (attempt ${attempt}/${retryCount})`);
            
            // Test if we can reach the MCP server
            try {
                const healthUrl = buildMcpUrl(MCP_SERVER_URL, 'health');
                console.log(`Health check URL: ${healthUrl}`);
                
                const healthCheck = await fetch(healthUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                
                console.log(`Health check response: ${healthCheck.status}`);
                
                if (!healthCheck.ok) {
                    console.error(`MCP server health check failed: ${healthCheck.status}`);
                    throw new Error(`MCP server not healthy: ${healthCheck.status}`);
                }
            } catch (healthError) {
                console.error('Failed to reach MCP server health check:', healthError);
                throw new Error(`MCP server unreachable at ${MCP_SERVER_URL}: ${healthError instanceof Error ? healthError.message : String(healthError)}`);
            }
            
            // Send a compliant MCP initialize request
            const mcpEndpoint = buildMcpUrl(MCP_SERVER_URL, 'mcp');
            console.log(`Building MCP endpoint from URL: "${MCP_SERVER_URL}" with path "mcp"`);
            console.log(`Result MCP endpoint: "${mcpEndpoint}"`);
            console.log(`Attempting to connect to MCP endpoint: ${mcpEndpoint}`);
            
            const response = await fetch(mcpEndpoint, {
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
                }),
            });

            console.log(`Initialize response status: ${response.status}`);
            console.log(`Initialize response headers:`, Object.fromEntries(response.headers.entries()));

            // Get the session ID from response headers
            const sessionId = response.headers.get('mcp-session-id');

            if (!sessionId) {
                console.error(
                    `Failed to initialize MCP session (attempt ${attempt}/${retryCount}): No session ID returned`
                );
                
                // Check if the response has a JSON error
                try {
                    const errorResponse = await response.text();
                    console.error('Error response:', errorResponse);
                } catch (parseError) {
                    // Ignore parse errors
                }
                
                // Only retry if we haven't reached max attempts
                if (attempt < retryCount) {
                    // Wait a bit before retrying (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt - 1)));
                    continue;
                }
                
                return undefined;
            }

            console.log(`MCP session initialized: ${sessionId}`);
            return sessionId;
        } catch (error) {
            console.error(`Error initializing MCP session (attempt ${attempt}/${retryCount}):`, error);
            console.error(`Error details:`, {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                cause: error instanceof Error ? error.cause : undefined
            });
            
            // Only retry if we haven't reached max attempts
            if (attempt < retryCount) {
                // Wait a bit before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt - 1)));
                continue;
            }
        }
    }
    
    console.error(`Failed to initialize MCP session after ${retryCount} attempts`);
    return undefined;
}

/**
 * Server-side MCP client that communicates with the MCP Express server
 */
async function callMcpServerTool(params: ToolCallParams): Promise<ToolResult> {
    // Get MCP server URL with fallback
    const MCP_SERVER_URL = process.env.EXPRESS_MCP_SERVER_PRIVATE || 
        (process.env.RAILWAY_ENVIRONMENT_NAME ? 'http://fpl-mcp-server.railway.internal:8080' : 'http://localhost:3001');
    
    const TIMEOUT_MS = 10000; // 10 second timeout

    try {
        // Ensure we have a session ID
        if (!params.sessionId) {
            throw new Error('Missing MCP session ID');
        }

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
            console.log(`[callMcpServerTool] MCP_SERVER_URL before building: "${MCP_SERVER_URL}"`);
            const mcpEndpoint = buildMcpUrl(MCP_SERVER_URL, 'mcp');
            console.log(`[callMcpServerTool] Built MCP endpoint: "${mcpEndpoint}"`);
            console.log(`[callMcpServerTool] Calling MCP server at: ${mcpEndpoint}`);
            
            const fetchPromise = fetch(mcpEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/event-stream',
                    'mcp-session-id': params.sessionId,
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
        console.log(`[callMcpTool] Called with tool: ${toolName}, sessionId: ${sessionId}`);
        console.log(`[callMcpTool] EXPRESS_MCP_SERVER_PRIVATE: "${process.env.EXPRESS_MCP_SERVER_PRIVATE}"`);
        
        // If no session ID provided or session validation fails, initialize a new one
        if (!sessionId) {
            console.log('No session ID provided, initializing a new MCP session');
            sessionId = await initializeMcpSession();
            
            if (!sessionId) {
                return {
                    success: false,
                    error: 'Failed to initialize MCP session',
                };
            }
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
        }

        console.log(`Using mapped tool: ${mappedToolName} with args:`, mappedArgs);

        const result = await callMcpServerTool({
            name: mappedToolName,
            arguments: mappedArgs,
            sessionId,
        });

        // If we get an invalid/missing session ID error, try to initialize a new session and retry
        if (result.error && (
            result.error.includes('Invalid or missing session ID') || 
            result.error.includes('Parse error')
        )) {
            console.log('Session ID error or Parse error detected, reinitializing session and retrying');
            const newSessionId = await initializeMcpSession();
            
            if (!newSessionId) {
                return {
                    success: false,
                    error: 'Failed to reinitialize MCP session after invalid session error',
                };
            }
            
            // Retry with new session ID
            const retryResult = await callMcpServerTool({
                name: mappedToolName,
                arguments: mappedArgs,
                sessionId: newSessionId,
            });
            
            if (retryResult.error) {
                return {
                    success: false,
                    error: retryResult.error,
                    sessionId: retryResult.sessionId,
                };
            }
            
            return {
                success: true,
                result: retryResult.content,
                sessionId: retryResult.sessionId,
            };
        }

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
