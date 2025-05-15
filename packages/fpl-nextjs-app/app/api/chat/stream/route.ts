// app/api/chat/stream/route.ts
import { NextRequest } from 'next/server';
import { Anthropic } from '@anthropic-ai/sdk';
import { createClient } from '@/utils/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { callMcpTool } from '@/app/actions/mcp-tools';
import { getOrCreateValidSession } from '@/utils/claude/session-manager-redis';
import { getChatContext, updateChatContext, formatContextForClaude, ChatMessage, getConversationMetrics } from '@/utils/claude/context-manager-redis';
import { shouldUseTool } from '@/utils/claude/tool-strategy';
import { applyRateLimit } from '@/utils/claude/rate-limiter-redis';
import { CLAUDE_CONFIG } from '@/config/ai-config';
import { toolsForClaude } from './tools';
import { TextBlock, ToolUseBlock } from '@anthropic-ai/sdk/resources';
import { Metrics } from '@/utils/monitoring/metrics';
import { needsSummarization, compressConversation } from '@/utils/claude/conversation-summarizer';
import { claudeNativeSystemPrompt } from '@/lib/prompts/claude-native-prompt';
import { needsTokenCompression, calculateMessageTokens, compressMessages } from '@/utils/claude/token-manager';
import { ToolCoordinator } from '@/utils/claude/tool-coordinator';
import { ToolCall } from '@/utils/claude/tool-pipeline';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || '',
});

export const runtime = 'nodejs';

// Feature flag for new sequential tool execution
const USE_SEQUENTIAL_TOOL_COORDINATOR = process.env.USE_SEQUENTIAL_TOOLS === 'true';

// Helper function to get user-friendly tool display names
function getToolDisplayName(toolName: string): string {
  const displayNames: Record<string, string> = {
    'fpl_get_league_leaders': 'League Leaders',
    'fpl_get_player_stats': 'Player Statistics',
    'fpl_search_players': 'Player Search'
  };
  return displayNames[toolName] || toolName;
}

// Helper function to get user-friendly error messages
function getUserFriendlyError(error: string | any, toolName: string): string {
  // If error is an object with specific flags
  if (typeof error === 'object' && error !== null) {
    if (error.isTimeout) {
      return 'The request took too long to complete. Please try again with a simpler query.';
    }
    if (error.isRateLimit) {
      return 'I\'ve made too many requests recently. Please wait a moment and try again.';
    }
    error = error.error || error.toString();
  }
  
  // Common error patterns and their user-friendly messages
  const errorPatterns: Array<[RegExp, string]> = [
    [/player not found/i, 'I couldn\'t find that player. Please check the spelling or try a different name.'],
    [/required.*player/i, 'Please provide a player name to search for.'],
    [/required.*category/i, 'Please specify what statistic you\'d like to see (goals, assists, etc.).'],
    [/timeout|timed out/i, 'The request took too long. Please try again with a simpler query.'],
    [/rate.*limit|too many requests/i, 'Too many requests. Please wait a moment before trying again.'],
    [/network/i, 'I\'m having trouble connecting to the FPL data. Please try again in a moment.'],
    [/invalid.*parameter/i, 'The request format wasn\'t quite right. Let me help you rephrase that.'],
    [/no data/i, 'No data is available for that request right now.'],
    [/server.*error/i, 'The FPL service is temporarily unavailable. Please try again later.'],
    [/authentication/i, 'There was an issue accessing the FPL data. Please try again.'],
    [/parse|parsing/i, 'I had trouble understanding the data format. Please try again.']
  ];

  // Check each pattern
  for (const [pattern, friendlyMessage] of errorPatterns) {
    if (pattern.test(error)) {
      return friendlyMessage;
    }
  }

  // Tool-specific fallback messages
  const toolFallbacks: Record<string, string> = {
    'fpl_get_league_leaders': 'I couldn\'t retrieve the league leaders. Please try again or ask for specific players instead.',
    'fpl_get_player_stats': 'I couldn\'t get that player\'s statistics. Please check the player name and try again.',
    'fpl_search_players': 'The player search didn\'t work as expected. Try searching with just the last name.'
  };

  return toolFallbacks[toolName] || 'I encountered an issue with that request. Please try rephrasing or asking something else.';
}

// Helper function to determine tool choice - minimal intervention, maximum Claude trust
function determineToolChoice(message: string, context?: any) {
  // Only intervene in very specific cases where we want to prevent tool use
  const lowerMessage = message.toLowerCase().trim();
  
  // Don't use tools for simple greetings
  if (lowerMessage.match(/^(hi|hello|hey|bye|goodbye|thanks|thank you)$/)) {
    return { type: 'none' as const };
  }
  
  // For everything else, trust Claude to make the right choice
  // Claude is sophisticated enough to understand context and choose appropriately
  return { type: 'auto' as const };
}

// Helper function to execute tool with retry logic and timeout
async function executeToolWithRetry(
  toolName: string,
  toolInput: any,
  sessionId: string,
  maxRetries: number = 3,
  retryDelay: number = 1000,
  timeout: number = 30000 // 30 second timeout
) {
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Tool execution timeout')), timeout);
      });
      
      // Race between tool execution and timeout
      const result = await Promise.race([
        callMcpTool(toolName, toolInput, sessionId),
        timeoutPromise
      ]) as any;
      
      if (result.success) {
        return result;
      }
      
      // Check for rate limit errors
      if (result.error?.toLowerCase().includes('rate limit') || 
          result.error?.toLowerCase().includes('too many requests')) {
        lastError = 'Rate limit exceeded';
        // Exponential backoff for rate limits
        if (attempt < maxRetries) {
          const backoffDelay = Math.min(retryDelay * Math.pow(2, attempt), 30000);
          console.log(`Rate limit hit for ${toolName}, waiting ${backoffDelay}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
        continue;
      }
      
      // If it's a client error (bad input), don't retry
      if (result.error?.includes('required') || result.error?.includes('invalid')) {
        return result;
      }
      
      lastError = result.error;
      console.log(`Tool ${toolName} failed (attempt ${attempt}/${maxRetries}):`, lastError);
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    } catch (error) {
      // Handle timeout errors
      if (error instanceof Error && error.message === 'Tool execution timeout') {
        lastError = 'Tool execution timed out';
        console.error(`Tool ${toolName} timeout (attempt ${attempt}/${maxRetries})`);
      } else {
        lastError = error;
        console.error(`Tool ${toolName} error (attempt ${attempt}/${maxRetries}):`, error);
      }
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }
  }
  
  return {
    success: false,
    error: lastError,
    isRetryFailure: true,
    isTimeout: lastError === 'Tool execution timed out',
    isRateLimit: lastError === 'Rate limit exceeded'
  };
}


// Sequential tool execution using ToolCoordinator
async function executeWithToolCoordinator(
  message: string,
  contextMessages: any[],
  validSessionId: string,
  chatId: string,
  sendEvent: (event: string, data: any) => void
) {
  const coordinator = new ToolCoordinator(
    validSessionId,
    chatId,
    contextMessages,
    {
      anthropic,
      model: CLAUDE_CONFIG.MODEL_VERSION,
      maxTokens: CLAUDE_CONFIG.MAX_TOKENS_EXTENDED,
      systemPrompt: claudeNativeSystemPrompt.prompt,
      tools: toolsForClaude,
      onToolUpdate: (tool: ToolCall) => {
        // Send real-time updates to frontend
        const displayName = getToolDisplayName(tool.name);
        
        if (tool.status === 'pending') {
          sendEvent('tool-start', {
            id: tool.id,
            name: tool.name,
            displayName,
            status: 'pending',
            message: `Preparing to use ${displayName}...`
          });
        } else if (tool.status === 'executing') {
          sendEvent('tool-start', {
            id: tool.id,
            name: tool.name,
            displayName,
            status: 'executing',
            message: `Executing ${displayName}...`
          });
        } else if (tool.status === 'completed') {
          sendEvent('tool-result', {
            id: tool.id,
            name: tool.name,
            displayName,
            status: 'complete',
            executionTime: tool.executionTime,
            message: `${displayName} completed successfully`
          });
        } else if (tool.status === 'error') {
          sendEvent('tool-error', {
            id: tool.id,
            name: tool.name,
            displayName,
            status: 'error',
            error: tool.error,
            userFriendlyError: getUserFriendlyError(tool.error || '', tool.name),
            message: `${displayName} encountered an error`
          });
        }
      },
      onStreamEvent: (event: any) => {
        if (event.type === 'text') {
          sendEvent('text', { content: event.content });
        }
      }
    }
  );

  // Tool executor function
  const toolExecutor = async (tool: ToolCall) => {
    const result = await executeToolWithRetry(tool.name, tool.input, validSessionId);
    
    if (!result.success) {
      throw new Error(result.error || 'Tool execution failed');
    }
    
    // Convert MCP content blocks to string
    let contentString = '';
    if (Array.isArray(result.result)) {
      contentString = result.result
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
        .join('\n');
    } else {
      contentString = JSON.stringify(result.result);
    }
    
    return contentString;
  };

  // Execute the sequence
  const result = await coordinator.executeSequence(message, toolExecutor);
  
  // Send final metrics
  sendEvent('metrics', {
    toolsExecuted: result.metrics.total,
    successful: result.metrics.completed,
    failed: result.metrics.failed,
    totalTime: result.metrics.totalExecutionTime
  });
  
  return {
    completeResponse: result.finalResponse,
    toolResults: result.toolResults,
    errors: result.errors,
    metrics: result.metrics
  };
}

export async function POST(req: NextRequest) {
  console.log('Stream route: Received POST request');
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { message, chatId: initialChatId, mcpSessionId: initialMcpSessionId } = await req.json();
        console.log('Stream route: Parsed request body', { message, chatId: initialChatId, mcpSessionId: initialMcpSessionId });
        
        // Helper function to send SSE events
        const sendEvent = (event: string, data: any) => {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        // Get user from Supabase
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        // Apply rate limiting
        const userType = user ? 'default' : 'anonymous';
        const rateLimitResult = await applyRateLimit(user?.id, undefined, userType);
        
        if (!rateLimitResult.allowed) {
          await Metrics.recordRateLimitCheck(false, userType);
          sendEvent('error', { error: rateLimitResult.message || 'Rate limit exceeded' });
          controller.close();
          return;
        }
        
        await Metrics.recordRateLimitCheck(true, userType);

        // Create or get chat ID
        let chatId = initialChatId;
        if (!chatId) {
          if (user) {
            const { data, error } = await supabase
              .from('chats')
              .insert({
                user_id: user.id,
                title: `Chat ${new Date().toLocaleDateString()}`,
              })
              .select()
              .single();

            if (!error && data) {
              chatId = data.id;
            }
          } else {
            chatId = `anon-${uuidv4()}`;
          }
        }

        // Send chat ID to client
        sendEvent('chat-id', { chatId });

        // Get a valid MCP session ID
        const validSessionId = await getOrCreateValidSession(initialMcpSessionId);
        if (!validSessionId) {
          sendEvent('error', { error: 'Failed to establish MCP session' });
          controller.close();
          return;
        }

        // Send session ID to client
        sendEvent('session-id', { mcpSessionId: validSessionId });

        // Store user message for authenticated users
        if (user && chatId) {
          await supabase.from('messages').insert({
            chat_id: chatId,
            content: message,
            role: 'user',
          });
        }

        // Retrieve conversation context
        let context = await getChatContext(chatId || '');
        
        // Create new user message object with accurate token count
        const userMessage: ChatMessage = {
          role: 'user',
          content: message,
          timestamp: new Date().toISOString(),
          tokenCount: calculateMessageTokens({
            role: 'user',
            content: message
          }, CLAUDE_CONFIG.MODEL_VERSION)
        };
        
        // Update context with the new message
        if (context) {
          await updateChatContext(chatId || '', [userMessage], validSessionId);
          
          // Check if we need to compress the conversation using sophisticated token analysis
          if (needsTokenCompression(context.messages, CLAUDE_CONFIG.MODEL_VERSION)) {
            console.log('Compressing conversation due to approaching token limit');
            
            // Use our priority-based message compression
            const compressedMessages = compressMessages(
              context.messages,
              CLAUDE_CONFIG.MAX_TOKENS_EXTENDED * 50, // Allow ~75k tokens for history
              CLAUDE_CONFIG.MODEL_VERSION
            );
            
            // Additionally, try to summarize the compressed messages
            const furtherCompressed = await compressConversation(compressedMessages);
            context.messages = furtherCompressed;
            
            // Update context with compressed messages
            await updateChatContext(chatId || '', [], validSessionId);
          }
        }
        
        // Get conversation metrics
        const metrics = await getConversationMetrics(chatId || '');
        console.log('Conversation metrics:', metrics);
        
        // Format the context messages for Claude
        const contextMessages = context ? formatContextForClaude(context) : [];
        
        // Record message metrics
        await Metrics.recordChatMessage('user', userMessage.tokenCount || 0);

        // Use our Claude-native prompt
        const CLAUDE_SYSTEM_PROMPT = claudeNativeSystemPrompt.prompt;
        console.log('Using Claude-native prompt');
        
        let completeResponse = '';
        let toolCalls: any[] = [];
        let followUpToolCalls: any[] = [];
        
        // Check if we should use the new sequential tool coordinator
        if (USE_SEQUENTIAL_TOOL_COORDINATOR) {
          console.log('Using sequential tool coordinator');
          try {
            const result = await executeWithToolCoordinator(
              message,
              [...contextMessages, { role: 'user', content: message }],
              validSessionId,
              chatId || '',
              sendEvent
            );
            
            completeResponse = result.completeResponse;
            
            // Send the final response
            sendEvent('done', { complete: true });
            
            // Store Claude's response for authenticated user
            if (user && chatId && completeResponse) {
              const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: completeResponse,
                timestamp: new Date().toISOString(),
                tokenCount: calculateMessageTokens({
                  role: 'assistant',
                  content: completeResponse
                }, CLAUDE_CONFIG.MODEL_VERSION),
                tool_calls: result.toolResults?.map((tr: any) => ({
                  id: tr.toolId,
                  name: tr.name,
                  input: tr.result
                })) || []
              };
              
              await updateChatContext(chatId, [assistantMessage], validSessionId);
              await supabase.from('messages').insert({
                chat_id: chatId,
                content: completeResponse,
                role: 'assistant',
                token_count: assistantMessage.tokenCount,
                tool_calls: assistantMessage.tool_calls
              });
            }
            
            controller.close();
            return;
          } catch (error) {
            console.error('Error with sequential tool coordinator:', error);
            sendEvent('error', { 
              error: 'An error occurred while processing your request',
              details: error instanceof Error ? error.message : 'Unknown error'
            });
            controller.close();
            return;
          }
        }
        
        // Original implementation for backward compatibility
        const stream = await anthropic.messages.create({
          model: CLAUDE_CONFIG.MODEL_VERSION,
          max_tokens: CLAUDE_CONFIG.MAX_TOKENS_DEFAULT,
          system: CLAUDE_SYSTEM_PROMPT,
          messages: [...contextMessages, { role: 'user', content: message }],
          tools: toolsForClaude, // Always provide tools - trust Claude to decide when to use them
          tool_choice: determineToolChoice(message, context), // Minimal override for greetings only
          stream: true,
        });

        let currentBlockIndex = 0;
        let currentBlockId: string | null = null;

        for await (const chunk of stream) {
          if (chunk.type === 'content_block_start') {
            currentBlockIndex = chunk.index;
            if (chunk.content_block.type === 'text') {
              sendEvent('start', { type: 'text' });
            } else if (chunk.content_block.type === 'tool_use') {
              currentBlockId = chunk.content_block.id;
              sendEvent('tool-start', { 
                name: chunk.content_block.name,
                id: chunk.content_block.id,
                displayName: getToolDisplayName(chunk.content_block.name),
                status: 'initializing'
              });
              toolCalls.push({
                id: chunk.content_block.id,
                name: chunk.content_block.name,
                index: currentBlockIndex,
                input: {} // Will be filled by deltas
              });
            }
          } else if (chunk.type === 'content_block_delta') {
            if (chunk.delta.type === 'text_delta') {
              completeResponse += chunk.delta.text;
              sendEvent('text', { content: chunk.delta.text });
            } else if (chunk.delta.type === 'input_json_delta') {
              // Find the tool call being updated by the current block id
              const toolCall = toolCalls.find(tc => tc.id === currentBlockId);
              if (toolCall) {
                // Accumulate the JSON delta
                toolCall.inputJson = (toolCall.inputJson || '') + chunk.delta.partial_json;
              }
            }
          } else if (chunk.type === 'content_block_stop') {
            // Handle tool use completion - use currentBlockId to find the right tool call
            const toolCall = toolCalls.find(tc => tc.id === currentBlockId);
            console.log('content_block_stop - Looking for tool call with id:', currentBlockId);
            console.log('Found tool call:', toolCall ? 'yes' : 'no');
            
            if (toolCall && toolCall.inputJson) {
              try {
                toolCall.input = JSON.parse(toolCall.inputJson);
                console.log('Parsed tool input:', toolCall.input);
                sendEvent('tool-processing', { 
                  name: toolCall.name,
                  displayName: getToolDisplayName(toolCall.name),
                  status: 'executing',
                  message: 'Fetching data from FPL API...'
                });
                
                // Execute the tool with retry logic
                const toolStartTime = Date.now();
                const result = await executeToolWithRetry(toolCall.name, toolCall.input, validSessionId);
                const toolExecutionTime = Date.now() - toolStartTime;
                
                // Record tool metrics
                await Metrics.recordToolCall(toolCall.name, result.success, toolExecutionTime);
                
                toolCall.result = result; // Store for later use
                toolCall.executionTime = toolExecutionTime;
                console.log('Tool execution result:', result.success ? 'success' : 'error');
                
                if (result.success) {
                  sendEvent('tool-result', { 
                    name: toolCall.name,
                    displayName: getToolDisplayName(toolCall.name),
                    status: 'completed',
                    result: result.result,
                    executionTime: toolExecutionTime
                  });
                } else {
                  sendEvent('tool-error', { 
                    name: toolCall.name,
                    displayName: getToolDisplayName(toolCall.name),
                    status: 'failed',
                    error: getUserFriendlyError(result, toolCall.name),
                    technicalError: result.error,
                    executionTime: toolExecutionTime
                  });
                  await Metrics.recordError('tool_execution', toolCall.name);
                }
              } catch (error) {
                console.error('Error parsing tool input:', error);
                sendEvent('tool-error', { 
                  name: toolCall.name,
                  displayName: getToolDisplayName(toolCall.name),
                  status: 'error',
                  error: 'I had trouble understanding that request. Please try rephrasing it.',
                  technicalError: 'Failed to parse tool input',
                  details: error instanceof Error ? error.message : 'Unknown error'
                });
              }
            } else {
              console.log('No tool call found or no inputJson for block id:', currentBlockId);
            }
            // Reset current block tracking
            currentBlockId = null;
          }
        }

        // If there were tool calls, send a follow-up message
        if (toolCalls.length > 0) {
          console.log('Processing tool calls for follow-up:', toolCalls.length);
          console.log('Tool calls array:', toolCalls.map(tc => ({ 
            id: tc.id, 
            name: tc.name, 
            hasResult: !!tc.result 
          })));
          
          const toolResults = toolCalls
            .filter(toolCall => toolCall.result) // Only include tool calls with results
            .map((toolCall) => {
              // Use already executed results
              const result = toolCall.result;
              console.log(`Tool result for ${toolCall.name}:`, result.success ? 'success' : 'error');
              // Tool results from MCP come as an array of content blocks
              // We need to convert this to a string for Claude
              let contentString = '';
              if (result.success && Array.isArray(result.result)) {
                // Extract text from content blocks
                contentString = result.result
                  .filter((item: any) => item.type === 'text')
                  .map((item: any) => item.text)
                  .join('\n');
              } else if (result.success) {
                contentString = JSON.stringify(result.result);
              } else {
                contentString = getUserFriendlyError(result, toolCall.name);
              }
              
              return {
                type: 'tool_result' as const,
                tool_use_id: toolCall.id,
                content: contentString,
                is_error: !result.success
              };
            });
          
          console.log('Tool results prepared:', toolResults.length);
          
          // Ensure we have tool results
          if (toolResults.length === 0) {
            console.error('No tool results to send in follow-up');
            // This should rarely happen - only if tool execution failed entirely
            sendEvent('text', { 
              content: "I encountered an error while retrieving the data. Please try again." 
            });
            sendEvent('done', { complete: true });
            controller.close();
            return;
          }

          // Send a follow-up message with the tool results
          const assistantContent: any[] = [
            // Include tool use blocks (not text from first stream)
            ...toolCalls.map(tc => ({
              type: 'tool_use' as const,
              id: tc.id,
              name: tc.name,
              input: tc.input
            }))
          ];
          
          // Ensure assistant content is not empty
          if (assistantContent.length === 0) {
            console.error('No tool use content to send in follow-up');
            return;
          }

          console.log('Creating follow-up stream with messages');
          console.log('Assistant content:', JSON.stringify(assistantContent, null, 2));
          console.log('Tool results content:', JSON.stringify(toolResults, null, 2));
          
          const followUpStream = await anthropic.messages.create({
            model: CLAUDE_CONFIG.MODEL_VERSION,
            max_tokens: CLAUDE_CONFIG.MAX_TOKENS_EXTENDED,
            system: CLAUDE_SYSTEM_PROMPT,
            messages: [
              ...contextMessages,
              { role: 'user', content: message },
              { 
                role: 'assistant',
                content: assistantContent
              },
              {
                role: 'user',
                content: toolResults
              }
            ],
            tools: toolsForClaude,
            tool_choice: determineToolChoice(message, context),
            stream: true,
          });
          
          console.log('Follow-up stream created, processing chunks...');

          // Reset tracking variables for follow-up stream
          currentBlockIndex = 0;
          currentBlockId = null;
          const followUpToolCalls: any[] = [];

          for await (const chunk of followUpStream) {
            if (chunk.type === 'content_block_start') {
              currentBlockIndex = chunk.index;
              if (chunk.content_block.type === 'text') {
                sendEvent('start', { type: 'text' });
              } else if (chunk.content_block.type === 'tool_use') {
                currentBlockId = chunk.content_block.id;
                sendEvent('tool-start', { 
                  name: chunk.content_block.name,
                  id: chunk.content_block.id
                });
                followUpToolCalls.push({
                  id: chunk.content_block.id,
                  name: chunk.content_block.name,
                  index: currentBlockIndex,
                  input: {} // Will be filled by deltas
                });
              }
            } else if (chunk.type === 'content_block_delta') {
              if (chunk.delta.type === 'text_delta') {
                completeResponse += chunk.delta.text;
                sendEvent('text', { content: chunk.delta.text });
              } else if (chunk.delta.type === 'input_json_delta') {
                // Find the tool call being updated by the current block id
                const toolCall = followUpToolCalls.find(tc => tc.id === currentBlockId);
                if (toolCall) {
                  // Accumulate the JSON delta
                  toolCall.inputJson = (toolCall.inputJson || '') + chunk.delta.partial_json;
                }
              }
            } else if (chunk.type === 'content_block_stop') {
              // Handle tool use completion - use currentBlockId to find the right tool call
              const toolCall = followUpToolCalls.find(tc => tc.id === currentBlockId);
              console.log('Follow-up stream content_block_stop - Looking for tool call with id:', currentBlockId);
              console.log('Found tool call:', toolCall ? 'yes' : 'no');
              
              if (toolCall && toolCall.inputJson) {
                try {
                  toolCall.input = JSON.parse(toolCall.inputJson);
                  console.log('Follow-up stream - Parsed tool input:', toolCall.input);
                  sendEvent('tool-processing', { 
                    name: toolCall.name,
                    displayName: getToolDisplayName(toolCall.name),
                    status: 'executing',
                    message: 'Processing follow-up request...'
                  });
                  
                  // Execute the tool and store result
                  const result = await executeToolWithRetry(toolCall.name, toolCall.input, validSessionId);
                  toolCall.result = result; // Store for later use
                  console.log('Follow-up stream - Tool execution result:', result.success ? 'success' : 'error');
                  
                  if (result.success) {
                    sendEvent('tool-result', { 
                      name: toolCall.name,
                      displayName: getToolDisplayName(toolCall.name),
                      status: 'completed',
                      result: result.result 
                    });
                  } else {
                    sendEvent('tool-error', { 
                      name: toolCall.name,
                      displayName: getToolDisplayName(toolCall.name),
                      status: 'failed',
                      error: getUserFriendlyError(result, toolCall.name),
                      technicalError: result.error 
                    });
                  }
                } catch (error) {
                  console.error('Follow-up stream - Error parsing tool input:', error);
                  sendEvent('tool-error', { 
                    name: toolCall.name,
                    displayName: getToolDisplayName(toolCall.name),
                    status: 'error',
                    error: 'Failed to parse tool input',
                    details: error instanceof Error ? error.message : 'Unknown error'
                  });
                }
              }
              // Reset current block tracking
              currentBlockId = null;
            }
          }
          
          console.log('Follow-up stream completed');
          
          // If we completed the follow-up stream but no tool calls were made
          if (followUpToolCalls.length === 0 || !followUpToolCalls.some(tc => tc.result)) {
            console.log('No tool results from follow-up stream, stream should have provided text response');
            // Don't send a default response - let Claude's response stand
          }
          
          // Handle multiple tool calls with recursive processing
          const processFollowUpToolCalls = async function(
            toolCalls: any[], 
            previousMessages: any[],
            depth: number = 0
          ): Promise<void> {
            if (depth > 5) { // Safety limit to prevent infinite recursion
              console.error('Max tool call depth reached');
              sendEvent('error', { error: 'Maximum tool call depth exceeded' });
              return;
            }
            
            const toolsWithResults = toolCalls.filter(tc => tc.result);
            if (toolsWithResults.length === 0) return;
            
            console.log(`Processing ${toolsWithResults.length} tool calls at depth ${depth}`);
            
            const toolResults = toolsWithResults.map((toolCall) => {
              const result = toolCall.result;
              // Tool results from MCP come as an array of content blocks
              // We need to convert this to a string for Claude
              let contentString = '';
              if (result.success && Array.isArray(result.result)) {
                // Extract text from content blocks
                contentString = result.result
                  .filter((item: any) => item.type === 'text')
                  .map((item: any) => item.text)
                  .join('\n');
              } else if (result.success) {
                contentString = JSON.stringify(result.result);
              } else {
                contentString = getUserFriendlyError(result, toolCall.name);
              }
              
              return {
                type: 'tool_result' as const,
                tool_use_id: toolCall.id,
                content: contentString,
                is_error: !result.success
              };
            });
            
            // Build the tool use content
            const toolUseContent = toolCalls.map(tc => ({
              type: 'tool_use' as const,
              id: tc.id,
              name: tc.name,
              input: tc.input
            }));
            
            // Create the follow-up stream with all previous context
            const nextStream = await anthropic.messages.create({
              model: CLAUDE_CONFIG.MODEL_VERSION,
              max_tokens: CLAUDE_CONFIG.MAX_TOKENS_EXTENDED,
              system: CLAUDE_SYSTEM_PROMPT,
              messages: [
                ...previousMessages,
                {
                  role: 'assistant',
                  content: toolUseContent
                },
                {
                  role: 'user',
                  content: toolResults
                }
              ],
              tools: toolsForClaude,
              tool_choice: determineToolChoice(message, context),
              stream: true,
            });
            
            console.log(`Follow-up stream created at depth ${depth}`);
            
            // Track new tool calls
            const newToolCalls: any[] = [];
            let currentBlockId: string | null = null;
            let currentBlockIndex = 0;
            
            for await (const chunk of nextStream) {
              if (chunk.type === 'content_block_start') {
                currentBlockIndex = chunk.index;
                if (chunk.content_block.type === 'text') {
                  sendEvent('start', { type: 'text' });
                } else if (chunk.content_block.type === 'tool_use') {
                  currentBlockId = chunk.content_block.id;
                  sendEvent('tool-start', { 
                    name: chunk.content_block.name,
                    id: chunk.content_block.id,
                    displayName: getToolDisplayName(chunk.content_block.name),
                    status: 'initializing'
                  });
                  newToolCalls.push({
                    id: chunk.content_block.id,
                    name: chunk.content_block.name,
                    index: currentBlockIndex,
                    input: {}
                  });
                }
              } else if (chunk.type === 'content_block_delta') {
                if (chunk.delta.type === 'text_delta') {
                  completeResponse += chunk.delta.text;
                  sendEvent('text', { content: chunk.delta.text });
                } else if (chunk.delta.type === 'input_json_delta') {
                  const toolCall = newToolCalls.find(tc => tc.id === currentBlockId);
                  if (toolCall) {
                    toolCall.inputJson = (toolCall.inputJson || '') + chunk.delta.partial_json;
                  }
                }
              } else if (chunk.type === 'content_block_stop') {
                const toolCall = newToolCalls.find(tc => tc.id === currentBlockId);
                if (toolCall && toolCall.inputJson) {
                  try {
                    toolCall.input = JSON.parse(toolCall.inputJson);
                    sendEvent('tool-processing', { 
                    name: toolCall.name,
                    displayName: getToolDisplayName(toolCall.name),
                    status: 'executing',
                    message: 'Processing follow-up request...'
                  });
                    
                    const result = await executeToolWithRetry(toolCall.name, toolCall.input, validSessionId);
                    toolCall.result = result;
                    
                    if (result.success) {
                      sendEvent('tool-result', { 
                        name: toolCall.name,
                        result: result.result 
                      });
                    } else {
                      sendEvent('tool-error', { 
                        name: toolCall.name,
                        error: result.error 
                      });
                    }
                  } catch (error) {
                    console.error('Error parsing tool input:', error);
                    sendEvent('tool-error', { 
                      name: toolCall.name,
                      displayName: getToolDisplayName(toolCall.name),
                      status: 'error',
                      error: 'I had trouble understanding that request. Please try rephrasing it.',
                      technicalError: 'Failed to parse tool input'
                    });
                  }
                }
                currentBlockId = null;
              }
            }
            
            // If there are new tool calls, process them recursively
            if (newToolCalls.length > 0 && newToolCalls.some(tc => tc.result)) {
              const updatedMessages = [
                ...previousMessages,
                {
                  role: 'assistant',
                  content: toolUseContent
                },
                {
                  role: 'user',
                  content: toolResults
                }
              ];
              
              await processFollowUpToolCalls(newToolCalls, updatedMessages, depth + 1);
            }
          }
          
          // Start processing follow-up tool calls
          if (followUpToolCalls.length > 0 && followUpToolCalls.some(tc => tc.result)) {
            const initialMessages = [
              ...contextMessages,
              { role: 'user', content: message },
              { 
                role: 'assistant',
                content: assistantContent
              },
              {
                role: 'user',
                content: toolResults.map(tr => ({
                  type: 'tool_result' as const,
                  tool_use_id: tr.tool_use_id,
                  content: tr.content
                }))
              }
            ];
            
            await processFollowUpToolCalls(followUpToolCalls, initialMessages);
          }
        }

        // Store Claude's response for authenticated user
        if (user && chatId && completeResponse) {
          // Collect all tool calls and results
          const allToolCalls = [...toolCalls, ...(followUpToolCalls || [])];
          
          const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: completeResponse,
            timestamp: new Date().toISOString(),
            tokenCount: calculateMessageTokens({
              role: 'assistant',
              content: completeResponse
            }, CLAUDE_CONFIG.MODEL_VERSION),
            tool_calls: allToolCalls.filter(tc => tc.input).map(tc => ({
              id: tc.id,
              name: tc.name,
              input: tc.input
            })),
            tool_results: allToolCalls.filter(tc => tc.result).map(tc => ({
              tool_call_id: tc.id,
              content: JSON.stringify(tc.result.result || tc.result.error),
              error: tc.result.error,
              execution_time_ms: tc.executionTime
            }))
          };
          
          // Store in database with tool information
          await supabase.from('messages').insert({
            chat_id: chatId,
            content: completeResponse,
            role: 'assistant',
            token_count: assistantMessage.tokenCount,
            tool_calls: assistantMessage.tool_calls,
            tool_results: assistantMessage.tool_results
          });
          
          await updateChatContext(chatId, [assistantMessage], validSessionId);
          
          // Record assistant message metrics
          await Metrics.recordChatMessage('assistant', assistantMessage.tokenCount || 0);
        }

        sendEvent('done', { complete: true });
        controller.close();
      } catch (error) {
        console.error('Error in stream:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: errorMessage })}\n\n`));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}