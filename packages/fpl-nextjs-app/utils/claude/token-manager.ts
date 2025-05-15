// utils/claude/token-manager.ts

/**
 * Token management utilities for Claude context window
 */

import { CLAUDE_CONFIG } from '@/config/ai-config';

// Approximate tokens per character for different content types
const TOKENS_PER_CHAR_ESTIMATES = {
  text: 0.25,         // ~4 chars per token
  english: 0.25,      // ~4 chars per token
  code: 0.3,          // Code tends to have more tokens
  json: 0.35,         // JSON has more punctuation
  toolResult: 0.3,    // Tool results are structured data
};

// Context window limits for different Claude models
export const MODEL_LIMITS: { [key: string]: number } = {
  'claude-3-opus-20240229': 200000,
  'claude-3-sonnet-20240229': 200000,
  'claude-3-haiku-20240307': 200000,
  'claude-3-7-sonnet-20250219': 200000,
  default: 200000
};

// Reserve tokens for system prompt and response
const RESERVED_TOKENS = {
  systemPrompt: 1000,
  response: 4000,
  buffer: 1000, // Safety buffer
};

export interface TokenCount {
  text: number;
  toolUse: number;
  toolResult: number;
  total: number;
}

/**
 * Estimate token count for a message based on content type
 */
export function estimateTokens(content: string, type: 'text' | 'code' | 'json' | 'toolResult' = 'text'): number {
  const tokensPerChar = TOKENS_PER_CHAR_ESTIMATES[type] || TOKENS_PER_CHAR_ESTIMATES.english;
  return Math.ceil(content.length * tokensPerChar);
}

/**
 * Calculate detailed token count for a message
 */
export function calculateMessageTokens(message: any, modelName?: string): number {
  let textTokens = 0;
  let toolUseTokens = 0;
  let toolResultTokens = 0;

  // Handle text content
  if (typeof message.content === 'string') {
    textTokens = estimateTokens(message.content);
  }

  // Handle tool calls
  if (message.tool_calls) {
    for (const toolCall of message.tool_calls) {
      toolUseTokens += estimateTokens(JSON.stringify(toolCall), 'json');
    }
  }

  // Handle tool results
  if (message.tool_results) {
    for (const result of message.tool_results) {
      toolResultTokens += estimateTokens(
        typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
        'toolResult'
      );
    }
  }

  return textTokens + toolUseTokens + toolResultTokens;
}

/**
 * Calculate detailed token count breakdown for a message
 */
export function calculateMessageTokenDetails(message: any): TokenCount {
  let textTokens = 0;
  let toolUseTokens = 0;
  let toolResultTokens = 0;

  // Handle text content
  if (typeof message.content === 'string') {
    textTokens = estimateTokens(message.content);
  }

  // Handle tool calls
  if (message.tool_calls) {
    for (const toolCall of message.tool_calls) {
      toolUseTokens += estimateTokens(JSON.stringify(toolCall), 'json');
    }
  }

  // Handle tool results
  if (message.tool_results) {
    for (const result of message.tool_results) {
      toolResultTokens += estimateTokens(
        typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
        'toolResult'
      );
    }
  }

  return {
    text: textTokens,
    toolUse: toolUseTokens,
    toolResult: toolResultTokens,
    total: textTokens + toolUseTokens + toolResultTokens
  };
}

/**
 * Calculate total tokens for a conversation
 */
export function calculateConversationTokens(messages: any[], modelName?: string): number {
  return messages.reduce((total, message) => {
    const tokens = calculateMessageTokens(message, modelName);
    return total + tokens;
  }, 0);
}

/**
 * Get available tokens for the current model
 */
export function getAvailableTokens(modelName: string = CLAUDE_CONFIG.MODEL_VERSION): number {
  const modelLimit = MODEL_LIMITS[modelName] || MODEL_LIMITS.default;
  const reserved = Object.values(RESERVED_TOKENS).reduce((sum, val) => sum + val, 0);
  return modelLimit - reserved;
}

/**
 * Check if a conversation needs compression
 */
export function needsTokenCompression(messages: any[], modelName: string = CLAUDE_CONFIG.MODEL_VERSION): boolean {
  const totalTokens = calculateConversationTokens(messages, modelName);
  const available = getAvailableTokens(modelName);
  // Compress when we're at 80% capacity
  return totalTokens > available * 0.8;
}

/**
 * Priority levels for message retention during compression
 */
export enum MessagePriority {
  SYSTEM = 100,
  TOOL_RESULT = 90,
  USER_RECENT = 80,
  ASSISTANT_RECENT = 70,
  USER_OLD = 50,
  ASSISTANT_OLD = 40,
}

/**
 * Calculate priority score for a message
 */
export function calculateMessagePriority(message: any, index: number, totalMessages: number): number {
  let priority = MessagePriority.ASSISTANT_OLD;
  
  // System messages have highest priority
  if (message.role === 'system') {
    return MessagePriority.SYSTEM;
  }
  
  // Tool results are important
  if (message.tool_results && message.tool_results.length > 0) {
    return MessagePriority.TOOL_RESULT;
  }
  
  // Recent messages are more important
  const recencyScore = (index / totalMessages) * 30; // 0-30 points based on position
  
  if (message.role === 'user') {
    priority = index > totalMessages * 0.7 ? MessagePriority.USER_RECENT : MessagePriority.USER_OLD;
  } else {
    priority = index > totalMessages * 0.7 ? MessagePriority.ASSISTANT_RECENT : MessagePriority.ASSISTANT_OLD;
  }
  
  return priority + recencyScore;
}

/**
 * Compress messages based on token limits
 */
export function compressMessages(messages: any[], targetTokens: number, modelName: string = CLAUDE_CONFIG.MODEL_VERSION): any[] {
  // Calculate priorities
  const messagesWithPriority = messages.map((msg, idx) => ({
    message: msg,
    priority: calculateMessagePriority(msg, idx, messages.length),
    tokens: calculateMessageTokens(msg, modelName)
  }));
  
  // Sort by priority (highest first)
  messagesWithPriority.sort((a, b) => b.priority - a.priority);
  
  // Select messages within token budget
  const selected: any[] = [];
  let currentTokens = 0;
  
  for (const item of messagesWithPriority) {
    if (currentTokens + item.tokens <= targetTokens) {
      selected.push(item.message);
      currentTokens += item.tokens;
    }
  }
  
  // Return in original order
  return messages.filter(msg => selected.includes(msg));
}

/**
 * Create a summary message for compressed content
 */
export function createCompressionSummary(removedMessages: any[]): string {
  const userCount = removedMessages.filter(m => m.role === 'user').length;
  const assistantCount = removedMessages.filter(m => m.role === 'assistant').length;
  
  return `[Previous conversation compressed: ${userCount} user messages and ${assistantCount} assistant responses summarized]`;
}