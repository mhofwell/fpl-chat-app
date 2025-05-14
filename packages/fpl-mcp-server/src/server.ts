// src/server.ts
import express from 'express';
import cors from 'cors';
import { config } from './config';
import mcpRouter from './routes/mcp';
import { createMcpServerWithTools } from './lib/mcp-server';
import bodyParser from 'body-parser';

const app = express();
const port = config.nodePort || 3001;

// CORS middleware
app.use(
    cors({
        origin: [
            `http://${process.env.NEXT_CLIENT_PRIVATE_URL}:${process.env.NEXT_CLIENT_PORT}`,
            'http://localhost:3000',
            'http://localhost:8080',
        ],
        methods: ['GET', 'POST', 'DELETE'],
        allowedHeaders: ['Content-Type', 'mcp-session-id'],
        exposedHeaders: ['mcp-session-id'],
    })
);

// Middleware
app.use(express.json());
app.use(bodyParser.json());

// Routes
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

app.use('/mcp', mcpRouter);

// Start server
const serverInstance = app.listen(port, () => {
    console.log(`FPL MCP Server running on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    serverInstance.close(() => {
        console.log('HTTP server closed');
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    serverInstance.close(() => {
        console.log('HTTP server closed');
    });
});

// Export the server creation function for backward compatibility
export const createMcpServer = createMcpServerWithTools;
