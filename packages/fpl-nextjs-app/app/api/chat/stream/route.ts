// app/api/chat/stream/route.ts
import { NextRequest } from 'next/server';
import { Anthropic } from '@anthropic-ai/sdk';
import { createClient } from '@/utils/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { callMcpTool } from '@/app/actions/mcp-tools';
import { getOrCreateValidSession } from '@/utils/claude/session-manager';
import { getChatContext, updateChatContext, formatContextForClaude, ChatMessage } from '@/utils/claude/context-manager';
import { shouldUseTool } from '@/utils/claude/tool-strategy';
import { applyRateLimit } from '@/utils/claude/rate-limiter';
import { CLAUDE_CONFIG } from '@/config/ai-config';
import { toolsForClaude } from './tools';
import { TextBlock, ToolUseBlock } from '@anthropic-ai/sdk/resources';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || '',
});

export const runtime = 'nodejs';

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
        const rateLimitResult = applyRateLimit(user?.id, undefined, userType);
        
        if (!rateLimitResult.allowed) {
          sendEvent('error', { error: rateLimitResult.message || 'Rate limit exceeded' });
          controller.close();
          return;
        }

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
        const context = await getChatContext(chatId || '');
        
        // Create new user message object
        const userMessage: ChatMessage = {
          role: 'user',
          content: message,
          timestamp: new Date().toISOString()
        };
        
        // Update context with the new message
        if (context) {
          await updateChatContext(chatId || '', [userMessage], validSessionId);
        }
        
        // Determine if we should use tools for this query
        const shouldUseToolsForQuery = shouldUseTool(message);
        
        // Format the context messages for Claude
        const contextMessages = context ? formatContextForClaude(context) : [];

        // Create streaming response from Claude
        const CLAUDE_SYSTEM_PROMPT = `You are a Fantasy Premier League (FPL) expert assistant. Help users with FPL-related queries using your extensive knowledge and the available tools.
When asked about players, teams, fixtures, or gameweeks, use the appropriate tools to get accurate data.
Keep responses concise but informative.

AVAILABLE TOOLS:
- getPlayer: Retrieves detailed information about a specific FPL player.
- searchPlayers: Searches for FPL players based on various criteria.
- getTeam: Retrieves detailed information about an FPL team.
- getGameweek: Retrieves information about an FPL gameweek.
- searchFixtures: Searches for FPL fixtures.
- compareEntities: Compares two FPL entities (players or teams).

RESPONSE GUIDELINES:
- Always provide context for statistics.
- Include strategic FPL insights when relevant.
- For player recommendations, consider form, fixtures, and value.
- Explain your reasoning for recommendations.`;

        const stream = await anthropic.messages.create({
          model: CLAUDE_CONFIG.MODEL_VERSION,
          max_tokens: CLAUDE_CONFIG.MAX_TOKENS_DEFAULT,
          system: CLAUDE_SYSTEM_PROMPT,
          messages: [...contextMessages, { role: 'user', content: message }],
          tools: shouldUseToolsForQuery ? toolsForClaude : [],
          tool_choice: { type: 'auto' },
          stream: true,
        });

        let completeResponse = '';
        let toolCalls: any[] = [];

        for await (const chunk of stream) {
          if (chunk.type === 'content_block_start') {
            if (chunk.content_block.type === 'text') {
              sendEvent('start', { type: 'text' });
            } else if (chunk.content_block.type === 'tool_use') {
              sendEvent('tool-start', { 
                name: chunk.content_block.name,
                id: chunk.content_block.id
              });
              toolCalls.push({
                id: chunk.content_block.id,
                name: chunk.content_block.name,
                input: {} // Will be filled by deltas
              });
            }
          } else if (chunk.type === 'content_block_delta') {
            if (chunk.delta.type === 'text_delta') {
              completeResponse += chunk.delta.text;
              sendEvent('text', { content: chunk.delta.text });
            } else if (chunk.delta.type === 'input_json_delta') {
              // Find the tool call being updated
              const toolCall = toolCalls.find(tc => tc.id === chunk.index);
              if (toolCall) {
                // Accumulate the JSON delta
                toolCall.inputJson = (toolCall.inputJson || '') + chunk.delta.partial_json;
              }
            }
          } else if (chunk.type === 'content_block_stop') {
            // Handle tool use completion
            const toolCall = toolCalls.find(tc => tc.id === chunk.index);
            if (toolCall && toolCall.inputJson) {
              try {
                toolCall.input = JSON.parse(toolCall.inputJson);
                sendEvent('tool-processing', { name: toolCall.name });
                
                // Execute the tool and store result
                const result = await callMcpTool(toolCall.name, toolCall.input, validSessionId);
                toolCall.result = result; // Store for later use
                
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
          }
        }

        // If there were tool calls, send a follow-up message
        if (toolCalls.length > 0) {
          console.log('Processing tool calls for follow-up:', toolCalls.length);
          
          const toolResults = toolCalls
            .filter(toolCall => toolCall.result) // Only include tool calls with results
            .map((toolCall) => {
              // Use already executed results
              const result = toolCall.result;
              console.log(`Tool result for ${toolCall.name}:`, result.success ? 'success' : 'error');
              return {
                type: 'tool_result' as const,
                tool_use_id: toolCall.id,
                content: result.success ? JSON.stringify(result.result) : JSON.stringify({ error: result.error })
              };
            });
          
          console.log('Tool results prepared:', toolResults.length);
          
          // Ensure we have tool results
          if (toolResults.length === 0) {
            console.error('No tool results to send in follow-up');
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
                content: toolResults.map(tr => ({
                  type: 'tool_result' as const,
                  tool_use_id: tr.tool_use_id,
                  content: tr.content
                }))
              }
            ],
            stream: true,
          });
          
          console.log('Follow-up stream created, processing chunks...');

          for await (const chunk of followUpStream) {
            if (chunk.type === 'content_block_start' && chunk.content_block.type === 'text') {
              sendEvent('start', { type: 'text' });
            } else if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              completeResponse += chunk.delta.text;
              sendEvent('text', { content: chunk.delta.text });
            } else if (chunk.type === 'content_block_stop') {
              // Content block finished
            }
          }
          
          console.log('Follow-up stream completed');
        }

        // Store Claude's response for authenticated user
        if (user && chatId && completeResponse) {
          const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: completeResponse,
            timestamp: new Date().toISOString()
          };
          
          await supabase.from('messages').insert({
            chat_id: chatId,
            content: completeResponse,
            role: 'assistant',
          });
          
          await updateChatContext(chatId, [assistantMessage], validSessionId);
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