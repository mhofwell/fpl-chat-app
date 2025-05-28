import { Router, Request, Response } from 'express';
import { getMcpServer, createTransport, getTransport, transports } from '../lib/mcp-server';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';

const router = Router();

// Handle POST requests for MCP communication with session management
router.post('/', async (req: Request, res: Response) => {
    try {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        console.log(`Received request with session ID: ${sessionId || 'none'}`);
        console.log('Request body:', JSON.stringify(req.body));
        
        let transport: StreamableHTTPServerTransport | undefined;
        
        // Check if this is an initialization request
        if (!sessionId && isInitializeRequest(req.body)) {
            console.log('Processing initialization request');
            
            // Create new transport for new session (following SDK pattern)
            const generatedSessionId = randomUUID();
            console.log(`Generated session ID: ${generatedSessionId}`);
            
            // Set the session ID header immediately
            res.setHeader('mcp-session-id', generatedSessionId);
            
            transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => generatedSessionId,
                onsessioninitialized: (sessionId) => {
                    // Store the transport by session ID
                    transports[sessionId] = transport!;
                    console.log(`Session initialized with ID: ${sessionId}`);
                }
            });

            // Clean up transport when closed
            transport.onclose = () => {
                if (transport!.sessionId) {
                    delete transports[transport!.sessionId];
                    console.log(`Session ${transport!.sessionId} closed and cleaned up`);
                }
            };
            
            // Create a new server instance for this session
            const server = getMcpServer();
            await server.connect(transport);
            console.log(`Transport connected, sessionId: ${transport.sessionId}`);
            
            // Handle the initialization request
            await transport.handleRequest(req, res, req.body);
            
        } else if (sessionId) {
            // Try to get existing transport
            transport = getTransport(sessionId);
            
            if (!transport) {
                console.log(`No transport found for session: ${sessionId}`);
                res.status(400).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32000,
                        message: 'Invalid or expired session ID',
                    },
                    id: null,
                });
                return;
            }
            
            // For tool invocation, we need to handle the response differently
            console.log(`About to handle request, transport.sessionId: ${transport.sessionId}`);
            
            // Check if this is a tool invocation that needs JSON response
            const requestBody = req.body as any;
            if (requestBody.method === 'invokeTool') {
                console.log(`Handling tool invocation: ${requestBody.params?.name}`);
                
                try {
                    // Call the tool handler directly based on tool name
                    const toolName = requestBody.params.name;
                    const toolArgs = requestBody.params.arguments || {};
                    
                    let toolResult;
                    
                    // Import and call the appropriate tool
                    switch (toolName) {
                        case 'get-top-scorers':
                            const { getTopScorers } = await import('../tools/fpl/top-scorers');
                            toolResult = await getTopScorers(toolArgs, {});
                            break;
                        case 'get-player':
                            const { getPlayer } = await import('../tools/fpl/player');
                            toolResult = await getPlayer(toolArgs, {});
                            break;
                        case 'get-team':
                            const { getTeam } = await import('../tools/fpl/team');
                            toolResult = await getTeam(toolArgs, {});
                            break;
                        case 'get-current-gameweek':
                            const { getCurrentGameweek } = await import('../tools/fpl/gameweek');
                            toolResult = await getCurrentGameweek(toolArgs, {});
                            break;
                        case 'get-gameweek-fixtures':
                            const { getGameweekFixtures } = await import('../tools/fpl/fixtures');
                            toolResult = await getGameweekFixtures(toolArgs, {});
                            break;
                        case 'echo':
                            const { echoMessage } = await import('../tools/echo');
                            toolResult = await echoMessage(toolArgs, {});
                            break;
                        default:
                            throw new Error(`Unknown tool: ${toolName}`);
                    }
                    
                    console.log(`Tool result:`, JSON.stringify(toolResult));
                    
                    // Return proper JSON-RPC response
                    res.setHeader('Content-Type', 'application/json');
                    res.json({
                        jsonrpc: '2.0',
                        result: toolResult,
                        id: requestBody.id
                    });
                    
                    console.log(`Tool invocation handled successfully`);
                } catch (error) {
                    console.error('Error calling tool:', error);
                    res.setHeader('Content-Type', 'application/json');
                    res.status(500).json({
                        jsonrpc: '2.0',
                        error: {
                            code: -32603,
                            message: 'Internal error',
                            data: error instanceof Error ? error.message : String(error)
                        },
                        id: requestBody.id
                    });
                }
            } else {
                // Handle other requests normally (SSE)
                await transport.handleRequest(req, res, req.body);
            }
            
            console.log(`After handling request, transport.sessionId: ${transport.sessionId}`);
        } else {
            // Not an initialization request and no session ID
            res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: 'Missing session ID',
                },
                id: null,
            });
            return;
        }
    } catch (error) {
        console.error('Error handling MCP request:', error);

        // Only send error response if headers haven't been sent yet
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error',
                },
                id: null,
            });
        }
    }
});

// Handle GET requests for server-to-client events (SSE)
router.get('/', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    
    if (!sessionId) {
        res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Missing session ID',
            },
            id: null,
        });
        return;
    }
    
    const transport = getTransport(sessionId);
    if (!transport) {
        res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32001,
                message: 'Invalid session ID',
            },
            id: null,
        });
        return;
    }
    
    try {
        await transport.handleRequest(req, res);
    } catch (error) {
        console.error('Error handling SSE request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error',
                },
                id: null,
            });
        }
    }
});

// Handle DELETE requests for session termination
router.delete('/', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    
    if (!sessionId) {
        res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Missing session ID',
            },
            id: null,
        });
        return;
    }
    
    const transport = getTransport(sessionId);
    if (!transport) {
        res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32001,
                message: 'Invalid session ID',
            },
            id: null,
        });
        return;
    }
    
    try {
        await transport.handleRequest(req, res, req.body);
        // Transport will be cleaned up by its onclose handler
    } catch (error) {
        console.error('Error handling DELETE request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error',
                },
                id: null,
            });
        }
    }
});

export default router;
