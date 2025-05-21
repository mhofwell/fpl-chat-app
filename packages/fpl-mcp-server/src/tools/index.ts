// src/tools/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fplTools } from './fpl/index';

export function registerTools(server: McpServer) {
  // Register all FPL tools from the fplTools object
  Object.entries(fplTools).forEach(([name, tool]) => {
    try {
      // The MCP SDK expects the tool handler to be registered in this form
      server.tool(
        name,
        tool.description, 
        // Convert Zod object to simple parameter schema
        { ...getSimpleSchemaFromZod(tool.inputSchema) },
        // Provide a callback that matches the expected MCP format
        async (args: any, _context: any) => {
          try {
            // Call the original handler with the provided args
            const result = await tool.handler(args, _context);
            
            // Return the result with proper type format
            return {
              content: result.content.map(item => ({
                type: 'text' as const,
                text: item.text
              })),
              isError: result.isError
            };
          } catch (error) {
            console.error(`Error executing tool ${name}:`, error);
            return {
              content: [{ 
                type: 'text' as const, 
                text: `Error: ${(error as Error).message || 'Unknown error occurred'}`
              }],
              isError: true
            };
          }
        }
      );
      
      // Log success message
      console.log(`Successfully registered tool: ${name}`);
    } catch (error) {
      console.error(`Error registering tool ${name}:`, error);
    }
  });
}

// Helper function to extract a simple schema from Zod object
function getSimpleSchemaFromZod(schema: z.ZodType<any>): Record<string, z.ZodTypeAny> {
  // Simply return an empty object if not a ZodObject
  if (!(schema instanceof z.ZodObject)) {
    return {};
  }
  
  // Access shape from ZodObject
  const shape = schema._def.shape();
  const result: Record<string, z.ZodTypeAny> = {};
  
  // Process each property
  for (const [key, val] of Object.entries(shape)) {
    const zodVal = val as z.ZodTypeAny;
    
    if (zodVal instanceof z.ZodString) {
      result[key] = z.string();
    } else if (zodVal instanceof z.ZodNumber) {
      result[key] = z.number();
    } else if (zodVal instanceof z.ZodBoolean) {
      result[key] = z.boolean();
    } else if (zodVal instanceof z.ZodEnum) {
      result[key] = zodVal;
    } else if (zodVal instanceof z.ZodArray) {
      result[key] = z.array(z.any());
    } else if (zodVal instanceof z.ZodUnion) {
      result[key] = zodVal;
    } else {
      result[key] = z.any();
    }
    
    // Preserve optional status
    if (zodVal.isOptional?.()) {
      result[key] = result[key].optional();
    }
    
    // Preserve description if available
    const description = zodVal.description;
    if (description) {
      result[key] = result[key].describe(description);
    }
  }
  
  return result;
}