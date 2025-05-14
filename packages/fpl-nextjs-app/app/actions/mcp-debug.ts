'use server';

export async function debugMcpUrl() {
    const env = process.env.EXPRESS_MCP_SERVER_PRIVATE;
    const railway = process.env.RAILWAY_ENVIRONMENT_NAME;
    
    // Use a type for better TypeScript support
    const results: {
        EXPRESS_MCP_SERVER_PRIVATE: string | undefined;
        RAILWAY_ENVIRONMENT_NAME: string | undefined;
        NODE_ENV: string | undefined;
        defaultUrl: string;
        finalUrl: string;
        constructedMcpUrl: string;
        hasDoubleSlash: boolean;
    } = {
        EXPRESS_MCP_SERVER_PRIVATE: env,
        RAILWAY_ENVIRONMENT_NAME: railway,
        NODE_ENV: process.env.NODE_ENV,
        defaultUrl: railway ? 'http://fpl-mcp-server.railway.internal:8080' : 'http://localhost:3001',
        finalUrl: env || (railway ? 'http://fpl-mcp-server.railway.internal:8080' : 'http://localhost:3001'),
        constructedMcpUrl: '',
        hasDoubleSlash: false
    };
    
    // Test URL construction
    const testUrl = results.finalUrl;
    const mcpUrl = testUrl.endsWith('/') ? `${testUrl}mcp` : `${testUrl}/mcp`;
    
    results.constructedMcpUrl = mcpUrl;
    results.hasDoubleSlash = mcpUrl.includes('//mcp');
    
    return results;
}