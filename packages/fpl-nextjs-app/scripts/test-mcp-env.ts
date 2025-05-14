const url1 = 'http://fpl-mcp-server.railway.internal:8080';
const url2 = 'http://fpl-mcp-server.railway.internal:8080/mcp';
const url3 = 'http://fpl-mcp-server.railway.internal:8080/';

// Test URL parsing
const testUrls = [url1, url2, url3];

testUrls.forEach(url => {
    console.log('\nTesting URL:', url);
    
    // Check if URL already contains /mcp
    const mcpEndpoint = url.endsWith('/mcp') ? url : `${url}/mcp`;
    console.log('MCP Endpoint:', mcpEndpoint);
    
    // Try another approach
    const normalizedUrl = url.replace(/\/$/, ''); // Remove trailing slash
    const mcpEndpoint2 = normalizedUrl.endsWith('/mcp') ? normalizedUrl : `${normalizedUrl}/mcp`;
    console.log('MCP Endpoint (normalized):', mcpEndpoint2);
});

// Test actual env var
console.log('\nActual environment variable:');
console.log('EXPRESS_MCP_SERVER_PRIVATE:', process.env.EXPRESS_MCP_SERVER_PRIVATE);