// app/actions/chat.ts
'use server';

import { Anthropic } from '@anthropic-ai/sdk';
import { TextBlock, ToolUseBlock } from '@anthropic-ai/sdk/resources';
import { createClient } from '@/utils/supabase/server';
import { v4 as uuidv4 } from 'uuid';

// Import our new utility modules
import { CLAUDE_CONFIG } from '../../config/ai-config';
import { callMcpTool } from './mcp-tools';
import { getOrCreateValidSession } from '../../utils/claude/session-manager';
import { handleError } from '../../utils/claude/error-handler';
import { validateAndFixToolParameters } from '../../utils/claude/parameter-validator';
import { getChatContext, updateChatContext, formatContextForClaude, ChatMessage } from '../../utils/claude/context-manager';
import { shouldUseTool } from '../../utils/claude/tool-strategy';
import { withAnthropicTimeout, withToolTimeout } from '../../utils/claude/timeout-manager';
import { applyRateLimit } from '../../utils/claude/rate-limiter';
import { streamWithTools, UIStreamHandler } from '../../utils/claude/streaming';
import { ToolDefinition } from '../types/tool-types';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || '',
});

// Define the tools available to Claude
const toolsForClaude: ToolDefinition[] = [
  {
    name: 'get-player',
    description: 'Retrieves detailed information about a specific FPL player using their name, FPL ID, or other criteria. Can also filter by team and position.',
    input_schema: {
      type: 'object' as const,
      properties: {
        playerQuery: {
          type: 'string',
          description: "Player's name (full or partial), FPL ID, or a descriptive query."
        },
        teamId: {
          type: 'number',
          description: 'Optional: FPL ID of the team to filter by.'
        },
        teamName: {
          type: 'string',
          description: 'Optional: Name of the team to filter by (supports fuzzy matching if teamId is not provided).'
        },
        position: {
          type: 'string',
          description: 'Optional: Player position to filter by (e.g., GKP, DEF, MID, FWD).'
        },
        includeRawData: {
          type: 'boolean',
          description: 'Optional: Whether to include raw JSON data in the response. Defaults to false.'
        }
      },
      required: ['playerQuery'] // playerQuery is non-optional in MCP tool
    }
  },
  {
    name: 'get-team',
    description: 'Retrieves detailed information about a specific FPL team using its name or FPL ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        teamQuery: {
          type: 'string',
          description: "Team's name (full or partial, supports fuzzy matching) or exact FPL team ID."
        },
        includeFixtures: {
          type: 'boolean',
          description: 'Optional: Include upcoming fixtures for the team. Defaults to true.'
        },
        includePlayers: {
          type: 'boolean',
          description: 'Optional: Include a list of key players for the team. Defaults to false.'
        },
        includeRawData: {
          type: 'boolean',
          description: 'Optional: Whether to include raw JSON data in the response. Defaults to false.'
        }
      },
      required: ['teamQuery']
    }
  },
  {
    name: 'get-gameweek',
    description: 'Retrieves information about an FPL gameweek, specified by ID or type (current, next, previous). Can include fixtures.',
    input_schema: {
      type: 'object' as const,
      properties: {
        gameweekId: {
          type: 'number',
          description: 'Optional: ID of the gameweek to retrieve.'
        },
        type: {
          type: 'string',
          enum: ['current', 'next', 'previous'],
          description: 'Optional: Specify gameweek by type (current, next, or previous).'
        },
        includeFixtures: {
          type: 'boolean',
          description: 'Optional: Whether to include fixtures for the gameweek. Defaults to true.'
        },
        includeRawData: {
          type: 'boolean',
          description: 'Optional: Whether to include raw JSON data in the response. Defaults to false.'
        }
      },
      required: [] // User must provide gameweekId OR type. Claude needs to understand this.
    }
  },
  {
    name: 'search-players',
    description: 'Searches for FPL players based on various criteria like name, team, position, price, points, and allows sorting.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: "Optional: Player's name (partial match supported)."
        },
        teamName: {
          type: 'string',
          description: 'Optional: Team name to filter by (partial match supported).'
        },
        position: {
          type: 'string',
          enum: ['GKP', 'DEF', 'MID', 'FWD'],
          description: 'Optional: Filter by player position.'
        },
        minPrice: {
          type: 'number',
          description: 'Optional: Minimum price (e.g., 5.5 for £5.5m).'
        },
        maxPrice: {
          type: 'number',
          description: 'Optional: Maximum price (e.g., 10.0 for £10.0m).'
        },
        minTotalPoints: {
          type: 'integer', // Assuming Zod's .int() maps to integer
          description: 'Optional: Minimum total points.'
        },
        sortBy: {
          type: 'string',
          enum: ['total_points_desc', 'now_cost_asc', 'now_cost_desc', 'form_desc', 'selected_by_percent_desc', 'price_rise_desc', 'price_rise_asc'],
          description: "Optional: Stat to sort players by and direction. Defaults to 'total_points_desc'."
        },
        limit: {
          type: 'integer', // Assuming Zod's .int().positive() maps to integer
          description: 'Optional: Number of results to return. Defaults to 10.'
        },
        includeRawData: {
          type: 'boolean',
          description: 'Optional: Whether to include raw JSON data in the response. Defaults to false.'
        }
      },
      required: [] // All parameters are optional for broad searches.
    }
  },
  {
    name: 'search-fixtures',
    description: 'Searches for FPL fixtures based on criteria like team(s), gameweek, difficulty, and allows sorting. Can provide details for past matches.',
    input_schema: {
      type: 'object' as const,
      properties: {
        teamQuery: {
          type: 'string',
          description: "Optional: One or two team names (e.g., 'Arsenal', or 'Liverpool vs Man City'). Supports partial/fuzzy matching."
        },
        gameweekId: {
          type: 'integer', // Assuming Zod's .int().positive()
          description: 'Optional: Filter by a specific gameweek ID.'
        },
        difficultyMin: {
          type: 'integer', // Assuming Zod's .int().min(1).max(5)
          description: 'Optional: Minimum FPL difficulty rating (1-5).'
        },
        difficultyMax: {
          type: 'integer', // Assuming Zod's .int().min(1).max(5)
          description: 'Optional: Maximum FPL difficulty rating (1-5).'
        },
        sortBy: {
          type: 'string',
          enum: ['kickoff_time_asc', 'kickoff_time_desc', 'difficulty_desc', 'difficulty_asc'],
          description: "Optional: Sort order for the fixtures. Defaults to 'kickoff_time_asc'."
        },
        includeDetails: {
          type: 'boolean',
          description: 'Optional: If a single specific past match is found, include detailed stats. Defaults to true.'
        },
        limit: {
          type: 'integer', // Assuming Zod's .int().positive()
          description: 'Optional: Maximum number of fixtures to return. Defaults to 10.'
        },
        includeRawData: {
          type: 'boolean',
          description: 'Optional: Whether to include raw JSON data in the response. Defaults to false.'
        }
      },
      required: [] // All parameters are optional.
    }
  },
  {
    name: 'compare-entities',
    description: 'Compares two FPL entities (players or teams) side-by-side on various metrics.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entity1Query: {
          type: 'string',
          description: 'Name or FPL ID of the first player or team.'
        },
        entity2Query: {
          type: 'string',
          description: 'Name or FPL ID of the second player or team.'
        },
        entityType: {
          type: 'string',
          enum: ['player', 'team'],
          description: "The type of entities to compare ('player' or 'team')."
        },
        includeRawData: {
          type: 'boolean',
          description: 'Optional: Whether to include raw JSON data in the response. Defaults to false.'
        }
      },
      required: ['entity1Query', 'entity2Query', 'entityType']
    }
  }
  // Note: The 'echo' tool from MCP server is not included here as it's likely for testing.
  // The 'get-gameweek-fixtures' tool from chat.ts is removed as its functionality
  // is covered by 'get-gameweek' with includeFixtures=true or 'search-fixtures'.
];

// The detailed system prompt for Claude
const CLAUDE_SYSTEM_PROMPT = `You are a Fantasy Premier League (FPL) expert assistant. Help users with FPL-related queries using your extensive knowledge and the available tools.
When asked about players, teams, fixtures, or gameweeks, use the appropriate tools to get accurate data.
Keep responses concise but informative.

AVAILABLE TOOLS:
- getPlayer: Retrieves detailed information about a specific FPL player. Key parameters: playerQuery (required), teamId, teamName, position.
- searchPlayers: Searches for FPL players based on criteria like name, team, position, price, points. Key parameters: query, teamName, position, minPrice, maxPrice, minTotalPoints, sortBy, limit.
- getTeam: Retrieves detailed information about an FPL team. Key parameters: teamQuery (required), includeFixtures, includePlayers.
- getGameweek: Retrieves information about an FPL gameweek. Key parameters: gameweekId or type (current, next, previous).
- searchFixtures: Searches for FPL fixtures. Key parameters: teamQuery, gameweekId, difficultyMin/Max, sortBy, limit.
- compareEntities: Compares two FPL entities (players or teams). Key parameters: entity1Query (required), entity2Query (required), entityType (required).

TOOL SELECTION STRATEGY:
1. Specific player info: getPlayer.
2. Ranking/list queries ("who has most...", "best players for...", "players by price/form"): searchPlayers.
3. Team performance/info: getTeam.
4. Gameweek specific info (current, next, past ID): getGameweek.
5. Fixture searches (by team, date range, difficulty, H2H): searchFixtures.
6. Direct comparisons (player vs. player, team vs. team): compareEntities.
7. Complex questions: Consider sequential tool use. If unsure, ask for clarification.

RESPONSE GUIDELINES:
- Always provide context for statistics (e.g., "8 goals (3rd highest among midfielders)").
- Include strategic FPL insights when relevant.
- For player recommendations, consider form, fixtures, and value.
- Explain your reasoning for recommendations.
- When appropriate, suggest alternatives or considerations.

Remember that you're advising on Fantasy Premier League (FPL), which is a fantasy sports game based on the English Premier League.`;

/**
 * Handle calling tools with error handling and validation
 */
async function handleToolCalls(
  toolCalls: Array<{id: string; name: string; input: Record<string, any>}>,
  mcpSessionId?: string
): Promise<{
  results: Array<{toolCall: {id: string; name: string; input: Record<string, any>}; result: any}>;
  newSessionId?: string;
  errors: Array<{toolCall: {id: string; name: string; input: Record<string, any>}; error: string}>;
}> {
  let updatedSessionId = mcpSessionId;
  const results: Array<{toolCall: {id: string; name: string; input: Record<string, any>}; result: any}> = [];
  const errors: Array<{toolCall: {id: string; name: string; input: Record<string, any>}; error: string}> = [];
  
  // Process each tool call
  await Promise.all(
    toolCalls.map(async (toolCall) => {
      // Validate and fix parameters
      const { valid, fixedParams, errors: validationErrors } = validateAndFixToolParameters(
        toolCall.name,
        toolCall.input
      );
      
      // If parameters are invalid and couldn't be fixed, add an error
      if (!valid) {
        errors.push({
          toolCall,
          error: `Parameter validation failed: ${validationErrors?.join(', ')}`
        });
        return;
      }
      
      try {
        // Use the fixed parameters
        const updatedToolCall = {
          ...toolCall,
          input: fixedParams
        };
        
        // Call the tool with a timeout
        const result = await withToolTimeout(async () => {
          return await callMcpTool(
            updatedToolCall.name,
            updatedToolCall.input,
            updatedSessionId
          );
        });
        
        // Update the session ID if we received a new one
        if (result.sessionId) {
          updatedSessionId = result.sessionId;
        }
        
        if (result.success) {
          results.push({
            toolCall: updatedToolCall,
            result: result.result
          });
        } else {
          errors.push({
            toolCall: updatedToolCall,
            error: result.error || 'Unknown error'
          });
        }
      } catch (error) {
        // Handle unexpected errors
        const errorResult = await handleError(error, {
          context: 'tool_call',
          toolName: toolCall.name,
          params: toolCall.input
        });
        
        errors.push({
          toolCall,
          error: errorResult.friendlyMessage
        });
      }
    })
  );
  
  return { results, newSessionId: updatedSessionId, errors };
}

/**
 * Process a user message and get a response from Claude
 */
export async function processUserMessage(
  chatId: string | null,
  message: string,
  mcpSessionId?: string,
  options: {
    enableStreaming?: boolean;
    streamHandler?: (chunk: string, done: boolean, toolCall?: {name: string}) => void;
    userIp?: string;
  } = {}
): Promise<{
  success: boolean;
  chatId: string;
  answer: string;
  mcpSessionId?: string;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  
  try {
    // Apply rate limiting
    const userType = user ? 'default' : 'anonymous';
    const userIp = options?.userIp;
    const rateLimitResult = applyRateLimit(user?.id, userIp, userType);
    
    if (!rateLimitResult.allowed) {
      return {
        success: false,
        chatId: chatId || '',
        answer: rateLimitResult.message || 'Rate limit exceeded. Please try again later.',
        error: 'rate_limit_exceeded'
      };
    }
    
    // Create or get chat ID
    let assignedChatId = chatId;
    if (!assignedChatId) {
      if (user) {
        // Authenticated user: Create chat in database
        const { data, error } = await supabase
          .from('chats')
          .insert({
            user_id: user.id,
            title: `Chat ${new Date().toLocaleDateString()}`,
          })
          .select()
          .single();

        if (error) throw error;
        assignedChatId = data.id;
      } else {
        // Anonymous user: Generate client-side ID
        assignedChatId = `anon-${uuidv4()}`;
      }
    }
    
    // Get a valid MCP session ID
    const validSessionId = await getOrCreateValidSession(mcpSessionId);
    if (!validSessionId) {
      return {
        success: false,
        chatId: assignedChatId || '',
        answer: 'Failed to establish a connection with the FPL data service. Please try again later.',
        error: 'mcp_session_error'
      };
    }
    
    // Store user message for authenticated users
    if (user && assignedChatId) {
      await supabase.from('messages').insert({
        chat_id: assignedChatId,
        content: message,
        role: 'user',
      });
    }
    
    // Retrieve conversation context
    const context = await getChatContext(assignedChatId || '');
    
    // Create new user message object
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    };
    
    // Update context with the new message
    if (context) {
      await updateChatContext(assignedChatId || '', [userMessage], validSessionId);
    }
    
    // Determine if we should use tools for this query
    const shouldUseToolsForQuery = shouldUseTool(message);
    
    // Format the context messages for Claude
    console.log('Formatting context for Claude...');
    const contextMessages = context ? formatContextForClaude(context) : [];
    console.log('Context messages formatted successfully');
    
    let answer = '';
    
    // Handle streaming if enabled
    const streamingEnabled = options?.enableStreaming === true;
    const streamHandler = options?.streamHandler;
    
    if (streamingEnabled && streamHandler) {
      console.log('Using streaming handler...');
      // For streaming responses with tool calls
      const streamResult = await streamWithTools(
        anthropic,
        {
          model: CLAUDE_CONFIG.MODEL_VERSION,
          max_tokens: CLAUDE_CONFIG.MAX_TOKENS_DEFAULT,
          system: CLAUDE_SYSTEM_PROMPT,
          messages: [...contextMessages, { role: 'user', content: message }],
          tools: shouldUseToolsForQuery ? toolsForClaude : [],
          tool_choice: { type: 'auto' },
        },
        // Tool call handler
        async (name, input) => {
          try {
            const result = await callMcpTool(name, input, validSessionId);
            return result.success ? result.result : { error: result.error };
          } catch (error) {
            const errorResult = await handleError(error, { toolName: name, params: input });
            return { error: errorResult.friendlyMessage };
          }
        },
        // Stream handler
        streamHandler
      );
      
      if (!streamResult.success) {
        return {
          success: false,
          chatId: assignedChatId || '',
          answer: streamResult.error || 'Error processing your request',
          mcpSessionId: validSessionId,
          error: 'streaming_error'
        };
      }
      
      answer = streamResult.finalResponse || '';
    } else {
      // Non-streaming flow
      // Call Claude with tools enabled
      const response = await withAnthropicTimeout(async () => {
        return await anthropic.messages.create({
          model: CLAUDE_CONFIG.MODEL_VERSION,
          max_tokens: CLAUDE_CONFIG.MAX_TOKENS_DEFAULT,
          system: CLAUDE_SYSTEM_PROMPT,
          messages: [...contextMessages, { role: 'user', content: message }],
          tools: shouldUseToolsForQuery ? toolsForClaude : [],
          tool_choice: { type: 'auto' },
        });
      });

      // Check if the response includes any tool calls
      const toolCalls = response.content.filter(
        (block): block is ToolUseBlock => block.type === 'tool_use'
      );

      if (toolCalls.length > 0) {
        // Process tool calls
        const { results, newSessionId, errors } = await handleToolCalls(
          toolCalls.map(tool => ({
            id: tool.id,
            name: tool.name,
            input: tool.input as Record<string, any>
          })),
          validSessionId
        );
        
        // Update the session ID if needed
        const updatedSessionId = newSessionId || validSessionId;
        
        // Format the tool results for the follow-up message
        const toolResults = [
          ...results.map(({ toolCall, result }) => ({
            type: 'tool_result' as const,
            tool_use_id: toolCall.id,
            content: typeof result === 'string' ? result : JSON.stringify(result)
          })),
          ...errors.map(({ toolCall, error }) => ({
            type: 'tool_result' as const,
            tool_use_id: toolCall.id,
            content: JSON.stringify({ error })
          }))
        ];
        
        // Construct the assistant's tool use turn content array
        // Making sure the types align with Anthropic's API expectations
        const assistantToolUseContent = response.content
          .filter(block => block.type === 'tool_use')
          .map(block => ({
            type: 'tool_use' as const,
            id: block.id,
            name: block.name,
            input: block.input
          }));

        // Send a follow-up message with the tool results
        const finalResponse = await withAnthropicTimeout(async () => {
          return await anthropic.messages.create({
            model: CLAUDE_CONFIG.MODEL_VERSION,
            max_tokens: CLAUDE_CONFIG.MAX_TOKENS_EXTENDED,
            system: `You are a Fantasy Premier League (FPL) assistant. You have received results from tools you requested. Use these results to answer the user's original question comprehensively.`,
            messages: [
              { role: 'user', content: message },
              { 
                role: 'assistant',
                content: assistantToolUseContent 
              },
              {
                role: 'user',
                content: toolResults
              }
            ],
          });
        });

        // Extract final answer
        const textBlock = finalResponse.content.find(
          (block): block is TextBlock => block.type === 'text'
        );
        answer = textBlock?.text || 'Could not extract a text response after tool use.';
        
        // Update the MCP session ID
        mcpSessionId = updatedSessionId;
      } else {
        // If no tool calls were made, extract the answer from the original response
        const textBlock = response.content.find(
          (block): block is TextBlock => block.type === 'text'
        );
        answer = textBlock?.text || 'No tool calls were made, and no direct text response was found.';
      }
    }

    // Store Claude's response for authenticated user
    if (user && assignedChatId && answer) {
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: answer,
        timestamp: new Date().toISOString()
      };
      
      // Store in database
      await supabase.from('messages').insert({
        chat_id: assignedChatId,
        content: answer,
        role: 'assistant',
      });
      
      // Update context
      await updateChatContext(assignedChatId, [assistantMessage], mcpSessionId);
    }

    return {
      success: true,
      chatId: assignedChatId || '',
      answer,
      mcpSessionId,
    };
  } catch (error) {
    console.error('Error processing message with Claude:', error);
    console.error('Error type:', typeof error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    
    // Handle the error properly - convert message to string to avoid server component issues
    const errorResult = await handleError(error, { 
      context: 'processUserMessage', 
      message: String(message) 
    });
    
    return {
      success: false,
      chatId: chatId || '',
      answer: errorResult.friendlyMessage,
      mcpSessionId,
      error: errorResult.errorDetails.type
    };
  }
}

/**
 * Process a user message with streaming response
 * Note: Streaming is temporarily disabled due to Next.js server component limitations
 */
export async function processUserMessageStreaming(
  chatId: string | null,
  message: string,
  streamHandler: any, // Accepting but not using to maintain API compatibility
  mcpSessionId?: string,
  userIp?: string
): Promise<{
  success: boolean;
  chatId: string;
  mcpSessionId?: string;
  error?: string;
  answer?: string;
}> {
  // For now, we'll use the non-streaming approach
  // TODO: Implement proper streaming using Server-Sent Events or WebSockets
  console.log('Streaming temporarily disabled - using standard processing');
  return processUserMessage(chatId, message, mcpSessionId, {
    enableStreaming: false,
    userIp
  });
}

/**
 * Get user's chat history
 */
export async function getUserChats() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return { success: !error, chats: data };
}

/**
 * Get messages for a specific chat
 */
export async function getChatMessages(chatId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  return { success: !error, messages: data };
}