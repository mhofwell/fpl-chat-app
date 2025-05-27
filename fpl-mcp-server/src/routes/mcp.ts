import { Router, Request, Response } from 'express';
import { getMcpServer, createTransport, getTransport } from '../lib/mcp-server';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

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
            
            // Create new transport for new session
            transport = await createTransport();
            
            // Connect to the shared server instance
            const server = getMcpServer();
            await server.connect(transport);
            
            // The transport will set its session ID during handleRequest
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
        
        // Handle the request
        await transport.handleRequest(req, res, req.body);
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
