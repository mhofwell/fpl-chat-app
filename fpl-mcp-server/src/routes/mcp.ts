import { Router, Request, Response } from 'express';
import { getMcpServer, createTransport, getTransport, transports } from '../lib/mcp-server';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';

const router = Router();

// Handle POST requests for MCP messages (main endpoint)
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
            
            // Let the transport handle the request
            // The StreamableHTTPServerTransport will handle both regular JSON-RPC
            // and SSE upgrade requests appropriately
            await transport.handleRequest(req, res, req.body);
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

// Handle GET requests for SSE (Server-Sent Events) streams
router.get('/', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    
    if (!sessionId) {
        res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Missing session ID for SSE stream',
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
                message: 'Invalid session ID - session may have expired',
            },
            id: null,
        });
        return;
    }
    
    try {
        // The transport will handle setting up the SSE stream
        await transport.handleRequest(req, res);
    } catch (error) {
        console.error('Error handling SSE stream request:', error);
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
