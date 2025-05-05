import { Router, Request, Response } from 'express';
import {
    createMcpServer,
    createTransport,
    getTransport,
} from '../lib/mcp-server';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';

const router = Router();

// Handle POST requests for MCP communication
router.post('/', async (req: Request, res: Response) => {
    try {
        // Get session ID from header
        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        console.log('Received headers:', req.headers);
        console.log('Received body:', JSON.stringify(req.body));
        console.log(
            'isInitializeRequest check:',
            isInitializeRequest(req.body)
        );

        console.log(`Received request with session ID: ${sessionId || 'none'}`);

        // Check for initialization request
        if (!sessionId && isInitializeRequest(req.body)) {
            // Create a new session ID
            const newSessionId = randomUUID();
            console.log(`Creating new session: ${newSessionId}`);

            // Create transport and connect to server
            const transport = await createTransport(newSessionId);
            const server = createMcpServer();
            await server.connect(transport);

            // Set session ID in response header
            res.setHeader('mcp-session-id', newSessionId);

            // Handle the request with transport
            await transport.handleRequest(req, res, req.body);

            console.log(`New session ${newSessionId} initialized`);
            return; // Important: return here to end the function
        }

        // For existing sessions
        if (sessionId) {
            const transport = await getTransport(sessionId);

            if (transport) {
                console.log(`Using existing session: ${sessionId}`);
                await transport.handleRequest(req, res, req.body);
                return; // Important: return here to end the function
            } else {
                console.log(`No transport found for session: ${sessionId}`);
            }
        }

        // No valid session found - ONLY reach this point if none of the above conditions are met
        console.log('No valid session found, sending error response');
        res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Invalid or missing session ID',
            },
            id: null,
        });
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

// Handle GET requests for server-to-client events
router.get('/', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId) {
        return res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Missing session ID',
            },
            id: null,
        });
    }

    const transport = await getTransport(sessionId);

    if (!transport) {
        return res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32001,
                message: 'Invalid session ID',
            },
            id: null,
        });
    }

    try {
        await transport.handleRequest(req, res);
    } catch (error) {
        console.error('Error handling SSE request:', error);
        // Only send error if headers haven't been sent
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

// Handle DELETE requests for terminating sessions
router.delete('/', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId) {
        return res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Missing session ID',
            },
            id: null,
        });
    }

    const transport = await getTransport(sessionId);

    if (!transport) {
        return res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32001,
                message: 'Invalid session ID',
            },
            id: null,
        });
    }

    try {
        await transport.handleRequest(req, res, req.body);
        // Close the transport instead of trying to remove it directly
        await transport.close();
        console.log(`Session ${sessionId} terminated`);
    } catch (error) {
        console.error('Error handling DELETE request:', error);
        // Only send error if headers haven't been sent
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
