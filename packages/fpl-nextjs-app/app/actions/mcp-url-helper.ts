export function buildMcpUrl(baseUrl: string | undefined, endpoint: string = ''): string {
    // In Railway production, the MCP server typically runs on port 8080
    const isRailway = process.env.RAILWAY_ENVIRONMENT_NAME !== undefined;
    const defaultPort = isRailway ? '8080' : '3001';
    const defaultUrl = isRailway ? 'http://fpl-mcp-server.railway.internal:8080' : 'http://localhost:3001';
    
    console.log(`[buildMcpUrl] Input baseUrl: "${baseUrl}"`);
    console.log(`[buildMcpUrl] Input endpoint: "${endpoint}"`);
    
    // Use default URL if not provided
    let url = baseUrl || defaultUrl;
    
    // Handle empty or null baseUrl
    if (!baseUrl || baseUrl.trim() === '') {
        url = defaultUrl;
        console.log(`[buildMcpUrl] Using default URL: "${url}"`);
    }
    
    // Clean up URL - remove any leading/trailing whitespace
    url = url.trim();
    
    // Simple URL building - just append endpoint with single slash
    let finalUrl = url;
    
    // Remove trailing slash from base URL
    if (finalUrl.endsWith('/')) {
        finalUrl = finalUrl.slice(0, -1);
    }
    
    // Add endpoint if provided
    if (endpoint) {
        // Remove leading slashes from endpoint
        endpoint = endpoint.replace(/^\/+/, '');
        
        // Don't add duplicate endpoints
        if (!finalUrl.endsWith(`/${endpoint}`)) {
            finalUrl = `${finalUrl}/${endpoint}`;
        }
    }
    
    console.log(`[buildMcpUrl] Final URL: "${finalUrl}"`);
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
            console.log(`  Input: ${testCase} - ERROR: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
}