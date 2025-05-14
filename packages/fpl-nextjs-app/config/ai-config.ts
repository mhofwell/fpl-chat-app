// app/config/ai-config.ts

// Claude model configuration
export const CLAUDE_CONFIG = {
  // Model version
  MODEL_VERSION: process.env.CLAUDE_MODEL_VERSION || 'claude-3-5-sonnet-20241022',
  
  // Response generation parameters
  MAX_TOKENS_DEFAULT: 1000,
  MAX_TOKENS_EXTENDED: 1500,
  
  // Timeouts (in milliseconds)
  API_TIMEOUT: 30000, // 30 seconds for Claude API calls
  
  // Rate limiting
  MAX_REQUESTS_PER_MINUTE: 20, // Adjust as needed based on your API plan
};

// MCP server configuration
export const MCP_CONFIG = {
  SERVER_URL: process.env.EXPRESS_MCP_SERVER_PRIVATE || 'http://localhost:3001',
  SESSION_TOKEN_EXPIRATION_MS: 30 * 60 * 1000, // 30 minutes
  SESSION_RETRY_COUNT: 3,
  SESSION_RETRY_BACKOFF_MS: 500, // Base retry delay
  TOOL_TIMEOUT: 10000, // 10 seconds for MCP tool calls
};

// Tool usage guidelines
export const TOOL_USAGE_CONFIG = {
  // Tool selection thresholds
  CONFIDENCE_THRESHOLD: 0.7, // Minimum confidence for tool selection
  
  // Maximum number of tools to call for a single query
  MAX_TOOL_CALLS_PER_QUERY: 3,
  
  // Map of tool names to their validation rules
  VALIDATION_RULES: {
    'get-player': {
      requiredFields: ['playerQuery'],
      fieldValidation: {
        includeRawData: (val: any) => typeof val === 'boolean',
      },
    },
    'get-team': {
      requiredFields: ['teamQuery'],
      fieldValidation: {
        includeFixtures: (val: any) => typeof val === 'boolean',
        includePlayers: (val: any) => typeof val === 'boolean',
        includeRawData: (val: any) => typeof val === 'boolean',
      },
    },
    // Add validation rules for other tools as needed
  },
  
  // Maximum context length to store per chat
  MAX_CONTEXT_LENGTH: 10, // Number of message pairs to keep
};

// Context management configuration
export const CONTEXT_CONFIG = {
  ENABLE_CONTEXT: true,
  MAX_HISTORY_MESSAGES: 10, // Maximum number of previous messages to include
  MAX_MESSAGE_LENGTH: 500, // Truncate messages beyond this length
};