export function buildMcpUrl(baseUrl: string | undefined, endpoint: string = ''): string {
    // Use default URL if not provided
    let url = baseUrl || 'http://localhost:3001';
    
    // In Railway production, the MCP server typically runs on port 8080
    const isRailway = process.env.RAILWAY_ENVIRONMENT_NAME !== undefined;
    const defaultPort = isRailway ? '8080' : '3001';
    const mcpPort = process.env.EXPRESS_MCP_SERVER_PORT || defaultPort;
    
    // Parse URL components
    const urlPattern = /^(https?:\/\/)?([^:\/]+)(:\d+)?(\/.*)?$/;
    const match = url.match(urlPattern);
    
    if (!match) {
        throw new Error(`Invalid URL format: ${url}`);
    }
    
    const protocol = match[1] || 'http://';
    const host = match[2];
    const port = match[3] || `:${mcpPort}`;
    const existingPath = match[4] || '';
    
    // Normalize paths by removing leading/trailing slashes
    const normalizedExistingPath = existingPath.replace(/^\/+|\/+$/g, '');
    const normalizedEndpoint = endpoint.replace(/^\/+|\/+$/g, '');
    
    // Build the final URL carefully
    let finalUrl = `${protocol}${host}${port}`;
    
    // Add paths if they exist
    if (normalizedExistingPath) {
        finalUrl += `/${normalizedExistingPath}`;
    }
    
    if (normalizedEndpoint) {
        finalUrl += `/${normalizedEndpoint}`;
    }
    
    return finalUrl;
}

// Test function
export function testMcpUrls() {
    const testCases = [
        'http://fpl-mcp-server.railway.internal:8080',
        'http://fpl-mcp-server.railway.internal:8080/',
        'http://fpl-mcp-server.railway.internal:8080/mcp',
        'fpl-mcp-server.railway.internal:8080',
        'fpl-mcp-server.railway.internal',
        'localhost:3001',
        'http://localhost:3001'
    ];
    
    console.log('Testing MCP URL construction:');
    testCases.forEach(testCase => {
        try {
            const mcpUrl = buildMcpUrl(testCase, 'mcp');
            const healthUrl = buildMcpUrl(testCase, 'health');
            console.log(`  Input: ${testCase}`);
            console.log(`    MCP: ${mcpUrl}`);
            console.log(`    Health: ${healthUrl}`);
        } catch (error) {
            console.log(`  Input: ${testCase} - ERROR: ${error.message}`);
        }
    });
}