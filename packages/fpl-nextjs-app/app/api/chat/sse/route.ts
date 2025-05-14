// app/api/chat/sse/route.ts
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
  console.log('SSE route: Received POST request');
  // Create a TransformStream to handle SSE
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Helper function to send SSE events
  const sendEvent = async (event: string, data: any) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    await writer.write(encoder.encode(message));
  };

  // Helper function to send error
  const sendError = async (error: string) => {
    await sendEvent('error', { error });
    await writer.close();
  };

  try {
    const { message, chatId: initialChatId, mcpSessionId: initialMcpSessionId } = await req.json();
    
    // Get user from Supabase
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Apply rate limiting
    const userType = user ? 'default' : 'anonymous';
    const rateLimitResult = applyRateLimit(user?.id, undefined, userType);
    
    if (!rateLimitResult.allowed) {
      await sendError(rateLimitResult.message || 'Rate limit exceeded');
      return new Response(stream.readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
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
    await sendEvent('chat-id', { chatId });

    // Get a valid MCP session ID
    const validSessionId = await getOrCreateValidSession(initialMcpSessionId);
    if (!validSessionId) {
      await sendError('Failed to establish MCP session');
      return new Response(stream.readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Send session ID to client
    await sendEvent('session-id', { mcpSessionId: validSessionId });

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

    // Process the message in the background
    (async () => {
      try {
        // Create streaming response from Claude with the right system prompt
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
              await sendEvent('start', { type: 'text' });
            } else if (chunk.content_block.type === 'tool_use') {
              await sendEvent('tool-start', { 
                name: chunk.content_block.name,
                id: chunk.content_block.id
              });
              toolCalls.push({
                id: chunk.content_block.id,
                name: chunk.content_block.name,
                input: {}
              });
            }
          } else if (chunk.type === 'content_block_delta') {
            if (chunk.delta.type === 'text_delta') {
              completeResponse += chunk.delta.text;
              await sendEvent('text', { content: chunk.delta.text });
            } else if (chunk.delta.type === 'input_json_delta') {
              const toolCallIndex = toolCalls.findIndex(tc => tc.id === chunk.index);
              if (toolCallIndex >= 0) {
                toolCalls[toolCallIndex].input = JSON.parse(chunk.delta.partial_json);
              }
            }
          } else if (chunk.type === 'content_block_stop') {
            if (chunk.index !== undefined && toolCalls[chunk.index]) {
              const toolCall = toolCalls[chunk.index];
              await sendEvent('tool-processing', { name: toolCall.name });
              
              // Execute the tool
              const result = await callMcpTool(toolCall.name, toolCall.input, validSessionId);
              
              if (result.success) {
                await sendEvent('tool-result', { 
                  name: toolCall.name,
                  result: result.result 
                });
              } else {
                await sendEvent('tool-error', { 
                  name: toolCall.name,
                  error: result.error 
                });
              }
            }
          }
        }

        // If there were tool calls, we need to send a follow-up message
        if (toolCalls.length > 0) {
          const toolResults = await Promise.all(
            toolCalls.map(async (toolCall) => {
              const result = await callMcpTool(toolCall.name, toolCall.input, validSessionId);
              return {
                type: 'tool_result' as const,
                tool_use_id: toolCall.id,
                content: result.success ? JSON.stringify(result.result) : JSON.stringify({ error: result.error })
              };
            })
          );

          // Send a follow-up message with the tool results
          const followUpStream = await anthropic.messages.create({
            model: CLAUDE_CONFIG.MODEL_VERSION,
            max_tokens: CLAUDE_CONFIG.MAX_TOKENS_EXTENDED,
            system: CLAUDE_SYSTEM_PROMPT,
            messages: [
              { role: 'user', content: message },
              { 
                role: 'assistant',
                content: toolCalls.map(tc => ({
                  type: 'tool_use' as const,
                  id: tc.id,
                  name: tc.name,
                  input: tc.input
                }))
              },
              {
                role: 'user',
                content: toolResults
              }
            ],
            stream: true,
          });

          for await (const chunk of followUpStream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              completeResponse += chunk.delta.text;
              await sendEvent('text', { content: chunk.delta.text });
            }
          }
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

        await sendEvent('done', { complete: true });
        await writer.close();
      } catch (error) {
        console.error('Error in SSE stream:', error);
        await sendError(error instanceof Error ? error.message : 'Unknown error');
      }
    })();

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Error in SSE route:', error);
    await sendError(error instanceof Error ? error.message : 'Unknown error');
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }
}