// app/utils/streaming.ts

import { Anthropic } from '@anthropic-ai/sdk';
import { CLAUDE_CONFIG } from '../../config/ai-config';
import { handleError } from './error-handler';

// Type for the message handler callback
export type StreamMessageHandler = (
  message: string,
  done: boolean,
  isToolCall?: boolean,
  toolName?: string
) => void;

// Type for the UI handler which expects a toolCall parameter
export type UIStreamHandler = (
  message: string,
  done: boolean,
  toolCall?: { name: string }
) => void;

/**
 * Create a streaming response from Claude API
 */
export async function createStreamingResponse(
  anthropic: Anthropic,
  requestOptions: Anthropic.Messages.MessageCreateParams,
  onMessage: StreamMessageHandler
): Promise<{ success: boolean; error?: string }> {
  try {
    // Create a clone of request options with stream: true
    const streamOptions: Anthropic.Messages.MessageCreateParams = {
      ...requestOptions,
      stream: true,
    };

    // Initialize the streaming response
    const stream = await anthropic.messages.create(streamOptions);
    
    // Track if we've started receiving a tool call
    let isInToolCall = false;
    let currentToolName = '';
    let accumulatedText = '';
    
    // Process each chunk from the stream
    for await (const chunk of stream) {
      // Check for content delta
      if (chunk.type === 'content_block_delta') {
        const delta = chunk.delta;
        
        // Check if this is a text block
        if (delta.type === 'text_delta') {
          // Check if we're in a tool call or text response
          if (!isInToolCall) {
            accumulatedText += delta.text;
            onMessage(delta.text, false);
          }
        }
      }
      
      // Check for tool use
      if (chunk.type === 'content_block_start' && chunk.content_block.type === 'tool_use') {
        isInToolCall = true;
        currentToolName = chunk.content_block.name;
        onMessage('', false, true, currentToolName);
      }
      
      // Check for end of tool use
      if (chunk.type === 'content_block_stop' && isInToolCall) {
        isInToolCall = false;
        currentToolName = '';
      }
      
      // Handle message delta stops (can be multiple in a response)
      if (chunk.type === 'message_delta' && chunk.delta.stop_reason) {
        // This indicates the message is complete
        onMessage('', true);
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error in streaming response:', error);
    
    // Handle the error
    const errorResult = await handleError(error, { context: 'streaming_response' });
    
    // Send a final message with the error
    onMessage(errorResult.friendlyMessage, true);
    
    return { 
      success: false, 
      error: errorResult.friendlyMessage
    };
  }
}

/**
 * Process a streaming response with tools
 * This is a more complex version that handles both tool use and text responses
 */
/**
 * Adapter function to convert between UI callback and internal callback formats
 */
export function adaptUIStreamHandler(uiHandler: UIStreamHandler): StreamMessageHandler {
  return (message: string, done: boolean, isToolCall?: boolean, toolName?: string) => {
    const toolCall = isToolCall && toolName ? { name: String(toolName) } : undefined;
    uiHandler(String(message), done, toolCall);
  };
}

export async function streamWithTools(
  anthropic: Anthropic,
  initialRequestOptions: Anthropic.Messages.MessageCreateParams,
  toolCallHandler: (name: string, input: Record<string, any>) => Promise<any>,
  onMessage: StreamMessageHandler | UIStreamHandler
): Promise<{ success: boolean; finalResponse?: string; error?: string }> {
  // Determine if we need to adapt the handler - safe check for function length
  let messageHandler: StreamMessageHandler;
  try {
    const handlerLength = (onMessage as Function).length;
    messageHandler = handlerLength <= 3 
      ? adaptUIStreamHandler(onMessage as UIStreamHandler) 
      : onMessage as StreamMessageHandler;
  } catch (e) {
    // If we can't access length, assume it's a UI handler
    messageHandler = adaptUIStreamHandler(onMessage as UIStreamHandler);
  }
  try {
    let finalText = '';
    let toolCalls: Array<{id: string; name: string; input: any}> = [];
    
    // First, we stream the initial response
    const initialResponse = await createStreamingResponse(
      anthropic,
      initialRequestOptions,
      (message, done, isToolCall, toolName) => {
        // Handle tool call notification differently
        if (isToolCall && toolName) {
          messageHandler(`Retrieving data using ${toolName}...`, false, true, toolName);
        } else {
          // If not a tool call, pass through the message
          messageHandler(message, false);
          finalText += message;
        }
      }
    );
    
    if (!initialResponse.success) {
      return { 
        success: false, 
        error: initialResponse.error 
      };
    }
    
    // Get the complete non-streamed response to extract tool calls
    const fullResponse = await anthropic.messages.create({
      ...initialRequestOptions,
      stream: false,
    });
    
    // Extract any tool calls from the full response
    toolCalls = fullResponse.content
      .filter(block => block.type === 'tool_use')
      .map(block => ({
        id: (block as any).id, 
        name: (block as any).name,
        input: (block as any).input
      }));
    
    // If no tool calls, we're done
    if (toolCalls.length === 0) {
      messageHandler('', true); // Signal completion
      return { 
        success: true, 
        finalResponse: finalText 
      };
    }
    
    // Process all tool calls
    const toolResults = await Promise.all(
      toolCalls.map(async (toolCall) => {
        try {
          const result = await toolCallHandler(toolCall.name, toolCall.input);
          return {
            type: 'tool_result' as const,
            tool_use_id: toolCall.id,
            content: typeof result === 'string' ? result : JSON.stringify(result)
          };
        } catch (error) {
          console.error(`Error executing tool ${toolCall.name}:`, error);
          return {
            type: 'tool_result' as const,
            tool_use_id: toolCall.id,
            content: JSON.stringify({ error: 'Tool execution failed' })
          };
        }
      })
    );
    
    // Prepare the follow-up message with tool results
    // The messages need to be in the correct format for Anthropic's API
    const followUpMessages: Anthropic.Messages.MessageParam[] = [
      ...initialRequestOptions.messages,
      { 
        role: 'assistant' as const, 
        content: fullResponse.content
      }
    ];
    
    // Add the tool results message (correctly typed for Anthropic's API)
    followUpMessages.push({ 
      role: 'user' as const, 
      content: toolResults
    });
    
    // Stream the final response that uses the tool results
    let finalResponseText = '';
    const finalStreamResponse = await createStreamingResponse(
      anthropic,
      {
        model: initialRequestOptions.model,
        system: initialRequestOptions.system,
        max_tokens: CLAUDE_CONFIG.MAX_TOKENS_EXTENDED,
        messages: followUpMessages,
      },
      (message, done) => {
        messageHandler(message, done);
        finalResponseText += message;
      }
    );
    
    return { 
      success: finalStreamResponse.success, 
      finalResponse: finalResponseText,
      error: finalStreamResponse.error
    };
  } catch (error) {
    console.error('Error in tool streaming process:', error);
    
    // Handle the error
    const errorResult = await handleError(error, { context: 'streaming_with_tools' });
    
    // Send a final message with the error
    messageHandler(errorResult.friendlyMessage, true);
    
    return { 
      success: false, 
      error: errorResult.friendlyMessage
    };
  }
}