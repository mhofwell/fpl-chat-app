// app/utils/test-helpers.ts

import { Anthropic } from '@anthropic-ai/sdk';
import { CLAUDE_CONFIG } from '../../config/ai-config';
import { validateAndFixToolParameters } from './parameter-validator';
import { ToolDefinition } from '../../app/types/tool-types';

/**
 * Mock Anthropic client for testing
 * Allows testing Claude responses without making real API calls
 */
export class MockAnthropic {
  private mockResponses: Record<string, any>;
  private defaultResponse: any;
  
  constructor(options: { mockResponses?: Record<string, any>, defaultResponse?: any } = {}) {
    this.mockResponses = options.mockResponses || {};
    this.defaultResponse = options.defaultResponse || {
      id: 'mock-msg-id',
      content: [{ type: 'text', text: 'This is a mock response from Claude.' }],
      role: 'assistant',
      model: CLAUDE_CONFIG.MODEL_VERSION,
      type: 'message',
    };
  }
  
  // Mock messages property with create method
  messages = {
    create: (params: Anthropic.Messages.MessageCreateParams) => {
      // Calculate a key based on the input
      const key = this.getResponseKey(params);
      
      // Return a matching mock response if available
      if (this.mockResponses[key]) {
        return Promise.resolve(this.mockResponses[key]);
      }
      
      // Return the default mock response
      return Promise.resolve(this.defaultResponse);
    }
  };
  
  // Helper to get a response key from params
  private getResponseKey(params: Anthropic.Messages.MessageCreateParams): string {
    // Extract the user's message if available
    const userMessage = params.messages.find(m => m.role === 'user')?.content;
    
    // Create a simple hash of the message content
    if (typeof userMessage === 'string') {
      return userMessage.substring(0, 50).replace(/\s+/g, '_').toLowerCase();
    }
    
    // Default key if no user message found
    return 'default';
  }
  
  // Add a mock response
  addMockResponse(key: string, response: any): void {
    this.mockResponses[key] = response;
  }
  
  // Set the default response
  setDefaultResponse(response: any): void {
    this.defaultResponse = response;
  }
}

/**
 * Mock MCP tool call handler for testing
 * Allows testing tool calls without making real API calls
 */
export class MockToolHandler {
  private mockResults: Record<string, any>;
  private defaultResult: any;
  private validateParams: boolean;
  
  constructor(options: { 
    mockResults?: Record<string, any>, 
    defaultResult?: any,
    validateParams?: boolean
  } = {}) {
    this.mockResults = options.mockResults || {};
    this.defaultResult = options.defaultResult || { success: true, result: 'Mock tool result' };
    this.validateParams = options.validateParams !== false; // Default to true
  }
  
  // Handle a tool call
  async handleToolCall(toolName: string, params: Record<string, any>): Promise<any> {
    // Validate parameters if enabled
    if (this.validateParams) {
      const validation = validateAndFixToolParameters(toolName, params);
      
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid parameters: ${validation.errors?.join(', ')}`,
        };
      }
      
      // Use fixed parameters if they were changed
      if (validation.paramsChanged) {
        params = validation.fixedParams;
      }
    }
    
    // Generate a key for this tool call
    const key = `${toolName}:${JSON.stringify(params)}`;
    
    // Return a matching mock result if available
    if (this.mockResults[key]) {
      return this.mockResults[key];
    }
    
    // Try with just the tool name
    if (this.mockResults[toolName]) {
      return this.mockResults[toolName];
    }
    
    // Return the default result
    return this.defaultResult;
  }
  
  // Add a mock result for a specific tool call
  addMockResult(toolName: string, params: Record<string, any> | null, result: any): void {
    if (params === null) {
      // Add result for any parameters
      this.mockResults[toolName] = result;
    } else {
      // Add result for specific parameters
      const key = `${toolName}:${JSON.stringify(params)}`;
      this.mockResults[key] = result;
    }
  }
  
  // Set the default result
  setDefaultResult(result: any): void {
    this.defaultResult = result;
  }
}

/**
 * Test runner for end-to-end testing of user queries
 * Simulates a user sending a message and receiving a response
 */
export class QueryTestRunner {
  private mockAnthropic: MockAnthropic;
  private mockToolHandler: MockToolHandler;
  private tools: ToolDefinition[];
  
  constructor(options: {
    mockAnthropic?: MockAnthropic,
    mockToolHandler?: MockToolHandler,
    tools?: ToolDefinition[]
  } = {}) {
    this.mockAnthropic = options.mockAnthropic || new MockAnthropic();
    this.mockToolHandler = options.mockToolHandler || new MockToolHandler();
    this.tools = options.tools || [];
  }
  
  // Run a test query
  async runQuery(
    userMessage: string,
    options: {
      chatId?: string,
      mcpSessionId?: string,
      systemPrompt?: string
    } = {}
  ): Promise<{
    success: boolean,
    chatId: string,
    answer: string,
    mcpSessionId?: string,
    toolCalls?: Array<{name: string, params: Record<string, any>}>,
    toolResults?: Array<any>
  }> {
    // Generate a chat ID if not provided
    const chatId = options.chatId || `test-${Date.now()}`;
    
    // Track tool calls and results
    const toolCalls: Array<{name: string, params: Record<string, any>}> = [];
    const toolResults: Array<any> = [];
    
    // TODO: Replace this with actual implementation based on your real processUserMessage function
    // For now, this is a simplified test implementation
    
    // 1. Create initial Claude request
    // In a real implementation, this would use the actual system prompt and context
    const systemPrompt = options.systemPrompt || 'You are a Fantasy Premier League (FPL) expert assistant.';
    
    // 2. Call mock Anthropic API
    const initialResponse = await this.mockAnthropic.messages.create({
      model: CLAUDE_CONFIG.MODEL_VERSION,
      max_tokens: CLAUDE_CONFIG.MAX_TOKENS_DEFAULT,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      tools: this.tools,
      tool_choice: { type: 'auto' },
    });
    
    // 3. Extract tool calls from the response
    const extractedToolCalls = initialResponse.content
      .filter((block: any) => block.type === 'tool_use')
      .map((block: any) => ({
        id: block.id,
        name: block.name,
        params: block.input,
      }));
    
    // Add to our list of tool calls
    toolCalls.push(...extractedToolCalls.map((tc: { name: string; params: Record<string, any> }) => ({ name: tc.name, params: tc.params })));
    
    // 4. If there are tool calls, execute them
    let answer = '';
    
    if (extractedToolCalls.length > 0) {
      // Execute each tool call
      const toolCallResults = await Promise.all(
        extractedToolCalls.map(async (toolCall: { id: string; name: string; params: Record<string, any> }) => {
          const result = await this.mockToolHandler.handleToolCall(toolCall.name, toolCall.params);
          toolResults.push(result);
          return {
            type: 'tool_result' as const,
            tool_use_id: toolCall.id,
            content: typeof result === 'string' ? result : JSON.stringify(result)
          };
        })
      );
      
      // Generate the final response with tool results
      const finalResponse = await this.mockAnthropic.messages.create({
        model: CLAUDE_CONFIG.MODEL_VERSION,
        max_tokens: CLAUDE_CONFIG.MAX_TOKENS_EXTENDED,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userMessage },
          { role: 'assistant', content: initialResponse.content },
          { role: 'user', content: toolCallResults }
        ],
      });
      
      // Extract the answer
      const textBlock = finalResponse.content.find(
        (block: any) => block.type === 'text'
      );
      answer = textBlock?.text || 'Could not extract a text response after tool use.';
    } else {
      // If no tool calls, extract the answer from the original response
      const textBlock = initialResponse.content.find(
        (block: any) => block.type === 'text'
      );
      answer = textBlock?.text || 'No tool calls were made, and no direct text response was found.';
    }
    
    return {
      success: true,
      chatId,
      answer,
      mcpSessionId: options.mcpSessionId,
      toolCalls,
      toolResults,
    };
  }
}

/**
 * Integration test helper for testing individual components
 */
export function createTestMessage(
  content: string, 
  role: 'user' | 'assistant' | 'system' = 'user'
): { role: string; content: string } {
  return { role, content };
}

/**
 * Create a mock tool call for testing
 */
export function createMockToolCall(
  name: string, 
  input: Record<string, any>,
  id: string = `tool-${Date.now()}`
): { id: string; name: string; input: Record<string, any> } {
  return { id, name, input };
}

/**
 * Create a mock tool result for testing
 */
export function createMockToolResult(
  toolCallId: string,
  content: string | Record<string, any>
): { type: 'tool_result'; tool_use_id: string; content: string } {
  return {
    type: 'tool_result' as const,
    tool_use_id: toolCallId,
    content: typeof content === 'string' ? content : JSON.stringify(content)
  };
}