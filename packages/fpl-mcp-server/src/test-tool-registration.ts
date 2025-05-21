// test-tool-registration.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools/index';

// Create a simple test to validate tool registration
async function testToolRegistration() {
  console.log('Testing MCP tool registration...');
  
  try {
    // Create a new MCP server instance
    const server = new McpServer({
      name: 'FPL MCP Server',
      version: '1.0.0'
    });
    
    // Register the tools
    registerTools(server);
    
    // Indirectly verify that registration was successful (since we can't directly access private tools property)
    console.log('\nRegistration completed without errors.');
    console.log('If no errors were logged above, then tool registration was successful.');
    
  } catch (error) {
    console.error('Error during tool registration test:', error);
  }
}

// Run the test
testToolRegistration().catch(console.error);