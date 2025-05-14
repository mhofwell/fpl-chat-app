import { NextResponse } from 'next/server';

export async function GET() {
    const EXPRESS_MCP_SERVER_PRIVATE = process.env.EXPRESS_MCP_SERVER_PRIVATE || 'http://localhost:3001';
    const isRailway = process.env.RAILWAY_ENVIRONMENT_NAME !== undefined;
    const defaultPort = isRailway ? '8080' : '3001';
    const EXPRESS_MCP_SERVER_PORT = process.env.EXPRESS_MCP_SERVER_PORT || defaultPort;
    
    let MCP_SERVER_URL = EXPRESS_MCP_SERVER_PRIVATE;
    
    // Parse the URL to check if it already has a path
    let baseURL = MCP_SERVER_URL;
    let urlPath = '';
    
    // Check if URL already contains a path (like /mcp)
    if (MCP_SERVER_URL.match(/^(https?:\/\/[^\/]+)(\/.*)?$/)) {
        const match = MCP_SERVER_URL.match(/^(https?:\/\/[^\/]+)(\/.*)?$/);
        if (match) {
            baseURL = match[1];
            urlPath = match[2] || '';
        }
    }
    
    // Ensure URL has protocol
    if (!baseURL.startsWith('http://') && !baseURL.startsWith('https://')) {
        baseURL = `http://${baseURL}`;
    }
    
    // Append port if not already included in URL
    if (!baseURL.includes(':3001') && !baseURL.includes(':8080') && !baseURL.includes(`:${EXPRESS_MCP_SERVER_PORT}`)) {
        baseURL = `${baseURL}:${EXPRESS_MCP_SERVER_PORT}`;
    }
    
    // Reconstruct URL without duplicate paths
    MCP_SERVER_URL = baseURL + urlPath;
    
    // Test URLs
    const mcpEndpoint = MCP_SERVER_URL.endsWith('/mcp') ? MCP_SERVER_URL : `${MCP_SERVER_URL}/mcp`;
    
    return NextResponse.json({
        EXPRESS_MCP_SERVER_PRIVATE,
        isRailway,
        defaultPort,
        EXPRESS_MCP_SERVER_PORT,
        baseURL,
        urlPath,
        MCP_SERVER_URL,
        mcpEndpoint,
        healthEndpoint: `${MCP_SERVER_URL}/health`
    });
}