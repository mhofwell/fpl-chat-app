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

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || '',
});

export const runtime = 'nodejs';

// Helper function to get user-friendly tool display names
function getToolDisplayName(toolName: string): string {
  const displayNames: Record<string, string> = {
    'fpl_get_league_leaders': 'League Leaders',
    'fpl_get_player_stats': 'Player Statistics',
    'fpl_search_players': 'Player Search'
  };
  return displayNames[toolName] || toolName;
}

// Helper function to determine tool choice based on message context
function determineToolChoice(message: string, context?: any) {
  const lowerMessage = message.toLowerCase();
  
  // Force tool use for specific patterns
  if (lowerMessage.includes('who is') || 
      lowerMessage.includes('top scorer') ||
      lowerMessage.includes('how many') ||
      lowerMessage.includes('player stats') ||
      lowerMessage.includes('fpl points')) {
    return { type: 'any' as const }; // Force tool use
  }
  
  // Never use tools for general chat
  if (lowerMessage.includes('hello') || 
      lowerMessage.includes('thanks') ||
      lowerMessage.includes('goodbye')) {
    return { type: 'none' as const }; // No tools
  }
  
  // Auto for everything else
  return { type: 'auto' as const };
}

// Helper function to execute tool with retry logic
async function executeToolWithRetry(
  toolName: string,
  toolInput: any,
  sessionId: string,
  maxRetries: number = 3,
  retryDelay: number = 1000
) {
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await callMcpTool(toolName, toolInput, sessionId);
      if (result.success) {
        return result;
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
      lastError = error;
      console.error(`Tool ${toolName} error (attempt ${attempt}/${maxRetries}):`, error);
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }
  }
  
  return {
    success: false,
    error: `Failed after ${maxRetries} attempts: ${lastError}`
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
        
        // Create new user message object
        const userMessage: ChatMessage = {
          role: 'user',
          content: message,
          timestamp: new Date().toISOString(),
          tokenCount: Math.ceil(message.length / 4) // Rough estimate
        };
        
        // Update context with the new message
        if (context) {
          await updateChatContext(chatId || '', [userMessage], validSessionId);
          
          // Check if we need to compress the conversation
          if (context.totalTokens && needsSummarization(context.messages, context.totalTokens)) {
            console.log('Compressing conversation due to token limit');
            const compressedMessages = await compressConversation(context.messages);
            context.messages = compressedMessages;
            await updateChatContext(chatId || '', [], validSessionId); // Update with compressed context
          }
        }
        
        // Get conversation metrics
        const metrics = await getConversationMetrics(chatId || '');
        console.log('Conversation metrics:', metrics);
        
        // Determine if we should use tools for this query
        const shouldUseToolsForQuery = shouldUseTool(message);
        
        // Format the context messages for Claude
        const contextMessages = context ? formatContextForClaude(context) : [];
        
        // Record message metrics
        await Metrics.recordChatMessage('user', userMessage.tokenCount || 0);

        // Use our Claude-native prompt
        const CLAUDE_SYSTEM_PROMPT = claudeNativeSystemPrompt.prompt;
        console.log('Using Claude-native prompt');
        
        const stream = await anthropic.messages.create({
          model: CLAUDE_CONFIG.MODEL_VERSION,
          max_tokens: CLAUDE_CONFIG.MAX_TOKENS_DEFAULT,
          system: CLAUDE_SYSTEM_PROMPT,
          messages: [...contextMessages, { role: 'user', content: message }],
          tools: shouldUseToolsForQuery ? toolsForClaude : [],
          tool_choice: shouldUseToolsForQuery ? determineToolChoice(message, context) : { type: 'none' },
          stream: true,
        });

        let completeResponse = '';
        let toolCalls: any[] = [];
        let currentBlockIndex = 0;
        let currentBlockId: string | null = null;
        let followUpToolCalls: any[] = [];

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
                    error: result.error,
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
                  error: 'Failed to parse tool input',
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
                contentString = result.error || 'Unknown error occurred';
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
                      error: result.error 
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
                contentString = result.error || 'Unknown error occurred';
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
                      error: 'Failed to parse tool input' 
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
            tokenCount: Math.ceil(completeResponse.length / 4),
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