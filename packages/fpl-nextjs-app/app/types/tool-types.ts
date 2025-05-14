// app/types/tool-types.ts

// Tool definition for Claude API
export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
};

// Tool call parameters
export type ToolCallParams = {
  name: string;
  arguments: Record<string, any>;
  sessionId?: string;
};

// Tool result type
export type ToolResult = {
  content: Array<{ text: string }> | null;
  error?: string;
  sessionId?: string;
};

// Tool response type
export type ToolResponse = {
  success: boolean;
  result?: any;
  error?: string;
  sessionId?: string;
};