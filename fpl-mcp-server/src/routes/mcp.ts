import { Router, Request, Response } from 'express';
import { handleMcpRequest } from '../lib/mcp-server';

const router = Router();

// Handle POST requests for MCP communication (stateless)
router.post('/', async (req: Request, res: Response) => {
    try {
        console.log('Received body:', JSON.stringify(req.body));
        
        // Handle each request statelessly
        await handleMcpRequest(req, res, req.body);
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

// Handle GET requests for server-to-client events (stateless)
router.get('/', async (req: Request, res: Response) => {
    // For stateless approach, we don't support SSE
    res.status(404).json({
        jsonrpc: '2.0',
        error: {
            code: -32601,
            message: 'SSE not supported in stateless mode',
        },
        id: null,
    });
});

// Handle DELETE requests (not needed in stateless mode)
router.delete('/', async (req: Request, res: Response) => {
    res.status(200).json({
        jsonrpc: '2.0',
        result: { message: 'No session to delete in stateless mode' },
        id: null,
    });
});

export default router;
