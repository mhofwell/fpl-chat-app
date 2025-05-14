// app/utils/context-manager.ts

import { createClient } from '@/utils/supabase/server';
import { CONTEXT_CONFIG } from '../../config/ai-config';

export type ChatMessage = {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    input: Record<string, any>;
  }>;
  tool_results?: Array<{
    tool_call_id: string;
    content: string;
  }>;
};

// Anthropic message format - only accepts 'user' or 'assistant' roles
export type AnthropicMessageParam = {
  role: 'user' | 'assistant';
  content: string | Array<any>;
};

export type ChatContext = {
  messages: ChatMessage[];
  mcpSessionId?: string;
  lastUpdated: Date;
};

// In-memory cache for conversation contexts
// This would be replaced with Redis or another distributed cache in production
const contextCache = new Map<string, ChatContext>();

/**
 * Retrieves conversation context for a chat
 */
export async function getChatContext(chatId: string): Promise<ChatContext | null> {
  // Check if context is in cache first
  if (contextCache.has(chatId)) {
    return contextCache.get(chatId) || null;
  }

  // If not in cache, retrieve from database
  if (!CONTEXT_CONFIG.ENABLE_CONTEXT) {
    return null;
  }
  
  // Skip database lookup for anonymous chat IDs (they don't exist in the database)
  if (chatId.startsWith('anon-')) {
    return {
      messages: [],
      lastUpdated: new Date()
    };
  }

  try {
    const supabase = await createClient();
    
    // Get chat messages ordered by creation time
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })
      .limit(CONTEXT_CONFIG.MAX_HISTORY_MESSAGES);
      
    if (error || !data) {
      console.error('Error fetching chat context:', error);
      return null;
    }
    
    // Transform to ChatMessage format
    const messages: ChatMessage[] = data.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: truncateMessage(msg.content, CONTEXT_CONFIG.MAX_MESSAGE_LENGTH),
      timestamp: msg.created_at,
      // We don't store tool calls in the database directly yet
      // This could be enhanced later
    }));
    
    const context: ChatContext = {
      messages,
      lastUpdated: new Date()
    };
    
    // Store in cache
    contextCache.set(chatId, context);
    
    return context;
  } catch (error) {
    console.error('Error retrieving chat context:', error);
    return null;
  }
}

/**
 * Updates the conversation context with new messages
 */
export async function updateChatContext(
  chatId: string,
  newMessages: ChatMessage[],
  mcpSessionId?: string
): Promise<void> {
  if (!CONTEXT_CONFIG.ENABLE_CONTEXT) {
    return;
  }

  try {
    // Get existing context or create new one
    let context = await getChatContext(chatId) || {
      messages: [],
      lastUpdated: new Date()
    };
    
    // Add new messages
    context.messages = [
      ...context.messages, 
      ...newMessages.map(msg => ({
        ...msg,
        content: truncateMessage(msg.content, CONTEXT_CONFIG.MAX_MESSAGE_LENGTH)
      }))
    ];
    
    // Trim to max history size
    if (context.messages.length > CONTEXT_CONFIG.MAX_HISTORY_MESSAGES) {
      context.messages = context.messages.slice(-CONTEXT_CONFIG.MAX_HISTORY_MESSAGES);
    }
    
    // Update session ID if provided
    if (mcpSessionId) {
      context.mcpSessionId = mcpSessionId;
    }
    
    context.lastUpdated = new Date();
    
    // Update cache
    contextCache.set(chatId, context);
  } catch (error) {
    console.error('Error updating chat context:', error);
  }
}

/**
 * Formats the context messages for Claude API
 */
export function formatContextForClaude(context: ChatContext): AnthropicMessageParam[] {
  if (!context || !context.messages) {
    return [];
  }
  
  // Safely check messages length
  try {
    if (Array.isArray(context.messages) && context.messages.length === 0) {
      return [];
    }
  } catch (e) {
    console.error('Error accessing messages length:', e);
    return [];
  }
  
  // Format messages in Claude's expected format
  return context.messages.map(msg => {
    // Ensure the role is either 'user' or 'assistant' 
    // Convert any 'system' roles to 'assistant' for Claude compatibility
    const role = msg.role === 'system' ? 'assistant' as const : msg.role;
    
    return {
      role,
      content: String(msg.content) // Convert to string to avoid proxy issues
      // Note: tool_calls and tool_results would need special handling
    };
  });
}

/**
 * Truncates a message if it exceeds max length
 */
function truncateMessage(content: string, maxLength: number): string {
  if (!content || content.length <= maxLength) {
    return content;
  }
  
  return content.substring(0, maxLength) + '...';
}

/**
 * Clears a chat context from cache
 */
export function clearChatContext(chatId: string): void {
  contextCache.delete(chatId);
}