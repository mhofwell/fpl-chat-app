// utils/claude/context-manager-redis.ts

import { createClient } from '@/utils/supabase/server'
import { CONTEXT_CONFIG, CLAUDE_CONFIG } from '../../config/ai-config'
import redis from '../../lib/redis/redis-client'
import { fetchWithCache } from '../../lib/redis/cache-helper'
import { calculateMessageTokens } from './token-manager'

export type ChatMessage = {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: string
  tokenCount?: number
  tool_calls?: Array<{
    id: string
    name: string
    input: Record<string, any>
  }>
  tool_results?: Array<{
    tool_call_id: string
    content: string
    error?: string
    execution_time_ms?: number
  }>
}

export type AnthropicMessageParam = {
  role: 'user' | 'assistant'
  content: string | Array<any>
}

export type ChatContext = {
  messages: ChatMessage[]
  mcpSessionId?: string
  lastUpdated: Date
  totalTokens?: number
  conversationMetrics?: {
    messageCount: number
    toolCallCount: number
    avgResponseTime: number
  }
}

const CONTEXT_PREFIX = 'chat:context:'
const TOKEN_PREFIX = 'chat:tokens:'
const METRICS_PREFIX = 'chat:metrics:'

/**
 * Retrieves conversation context for a chat
 */
export async function getChatContext(chatId: string): Promise<ChatContext | null> {
  const key = `${CONTEXT_PREFIX}${chatId}`
  
  // Try Redis first
  try {
    const cachedContext = await redis.get(key)
    if (cachedContext) {
      return JSON.parse(cachedContext)
    }
  } catch (error) {
    console.error('Error fetching from Redis cache:', error)
  }
  
  // If not in cache, retrieve from database
  if (!CONTEXT_CONFIG.ENABLE_CONTEXT) {
    return null
  }
  
  // Skip database lookup for anonymous chat IDs
  if (chatId.startsWith('anon-')) {
    return {
      messages: [],
      lastUpdated: new Date()
    }
  }

  try {
    const supabase = await createClient()
    
    // Get chat messages with tool data
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })
      .limit(CONTEXT_CONFIG.MAX_HISTORY_MESSAGES)
      
    if (error || !data) {
      console.error('Error fetching chat context:', error)
      return null
    }
    
    // Transform to ChatMessage format
    const messages: ChatMessage[] = data.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: truncateMessage(msg.content, CONTEXT_CONFIG.MAX_MESSAGE_LENGTH),
      timestamp: msg.created_at,
      tokenCount: msg.token_count,
      tool_calls: msg.tool_calls,
      tool_results: msg.tool_results,
    }))
    
    const context: ChatContext = {
      messages,
      lastUpdated: new Date()
    }
    
    // Store in Redis cache
    await redis.set(key, JSON.stringify(context), 'EX', 3600) // 1 hour
    
    return context
  } catch (error) {
    console.error('Error retrieving chat context:', error)
    return null
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
    return
  }

  try {
    // Get existing context or create new one
    let context = await getChatContext(chatId) || {
      messages: [],
      lastUpdated: new Date()
    }
    
    // Add new messages
    context.messages = [
      ...context.messages, 
      ...newMessages.map(msg => ({
        ...msg,
        content: truncateMessage(msg.content, CONTEXT_CONFIG.MAX_MESSAGE_LENGTH),
        tokenCount: estimateTokenCount(msg.content)
      }))
    ]
    
    // Update total token count
    context.totalTokens = context.messages.reduce((sum, msg) => 
      sum + (msg.tokenCount || 0), 0
    )
    
    // Trim to max history size using sophisticated token compression
    if (context.messages.length > CONTEXT_CONFIG.MAX_HISTORY_MESSAGES) {
      // If we have token counts, use priority-based compression
      if (context.totalTokens && context.totalTokens > 100000) { // ~100k token limit
        const { compressMessages, needsTokenCompression } = await import('./token-manager')
        
        // Check if compression is needed
        if (needsTokenCompression(context.messages, CLAUDE_CONFIG.MODEL_VERSION)) {
          // Use our priority-based compression with 80k token budget to leave room for new messages
          context.messages = compressMessages(
            context.messages,
            80000, // Leave 20k for new messages
            CLAUDE_CONFIG.MODEL_VERSION
          )
        }
      } else {
        // Fall back to message count limit
        context.messages = context.messages.slice(-CONTEXT_CONFIG.MAX_HISTORY_MESSAGES)
      }
    }
    
    // Update session ID if provided
    if (mcpSessionId) {
      context.mcpSessionId = mcpSessionId
    }
    
    context.lastUpdated = new Date()
    
    // Update Redis cache
    const key = `${CONTEXT_PREFIX}${chatId}`
    await redis.set(key, JSON.stringify(context), 'EX', 3600) // 1 hour
    
    // Update metrics
    await updateConversationMetrics(chatId, newMessages)
  } catch (error) {
    console.error('Error updating chat context:', error)
  }
}

/**
 * Formats the context messages for Claude API
 */
export function formatContextForClaude(context: ChatContext): AnthropicMessageParam[] {
  if (!context || !context.messages) {
    return []
  }
  
  // Format messages in Claude's expected format
  return context.messages.map(msg => {
    const role = msg.role === 'system' ? 'assistant' as const : msg.role
    
    // If message has tool calls or results, format appropriately
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      return {
        role,
        content: [
          { type: 'text', text: msg.content },
          ...msg.tool_calls.map(tc => ({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.input
          }))
        ]
      }
    }
    
    if (msg.tool_results && msg.tool_results.length > 0) {
      return {
        role,
        content: msg.tool_results.map(tr => ({
          type: 'tool_result',
          tool_use_id: tr.tool_call_id,
          content: tr.content
        }))
      }
    }
    
    return {
      role,
      content: String(msg.content)
    }
  })
}

/**
 * Truncates a message if it exceeds max length
 */
function truncateMessage(content: string, maxLength: number): string {
  if (!content || content.length <= maxLength) {
    return content
  }
  
  return content.substring(0, maxLength) + '...'
}

/**
 * Estimates token count for a message (rough approximation)
 */
function estimateTokenCount(content: string): number {
  if (!content) return 0
  // Use accurate token counting from our token manager
  return calculateMessageTokens({ content }, CLAUDE_CONFIG.MODEL_VERSION)
}

/**
 * Update conversation metrics
 */
async function updateConversationMetrics(
  chatId: string,
  newMessages: ChatMessage[]
): Promise<void> {
  const key = `${METRICS_PREFIX}${chatId}`
  
  try {
    // Get existing metrics
    const existingMetrics = await redis.hgetall(key)
    
    const currentMessageCount = parseInt(existingMetrics?.messageCount || '0')
    const currentToolCallCount = parseInt(existingMetrics?.toolCallCount || '0')
    const currentTotalResponseTime = parseInt(existingMetrics?.totalResponseTime || '0')
    const currentResponseCount = parseInt(existingMetrics?.responseCount || '0')
    
    // Calculate new metrics
    const newToolCalls = newMessages.reduce((sum, msg) => 
      sum + (msg.tool_calls?.length || 0), 0
    )
    
    const newMessageCount = currentMessageCount + newMessages.length
    const newToolCallCount = currentToolCallCount + newToolCalls
    
    // Update metrics
    const multi = redis.multi()
    multi.hset(key, 'messageCount', newMessageCount.toString())
    multi.hset(key, 'toolCallCount', newToolCallCount.toString())
    multi.hset(key, 'lastActivity', Date.now().toString())
    
    // Calculate response time if we have timestamps
    const assistantMessages = newMessages.filter(msg => msg.role === 'assistant')
    if (assistantMessages.length > 0) {
      const responseTime = Date.now() - new Date(assistantMessages[0].timestamp || Date.now()).getTime()
      const newTotalResponseTime = currentTotalResponseTime + responseTime
      const newResponseCount = currentResponseCount + 1
      const avgResponseTime = Math.floor(newTotalResponseTime / newResponseCount)
      
      multi.hset(key, 'totalResponseTime', newTotalResponseTime.toString())
      multi.hset(key, 'responseCount', newResponseCount.toString())
      multi.hset(key, 'avgResponseTime', avgResponseTime.toString())
    }
    
    multi.expire(key, 86400) // 24 hours
    await multi.exec()
  } catch (error) {
    console.error('Error updating conversation metrics:', error)
  }
}

/**
 * Get conversation metrics
 */
export async function getConversationMetrics(chatId: string): Promise<{
  messageCount: number
  toolCallCount: number
  avgResponseTime: number
  lastActivity: number
}> {
  const key = `${METRICS_PREFIX}${chatId}`
  
  try {
    const metrics = await redis.hgetall(key)
    
    return {
      messageCount: parseInt(metrics?.messageCount || '0'),
      toolCallCount: parseInt(metrics?.toolCallCount || '0'),
      avgResponseTime: parseInt(metrics?.avgResponseTime || '0'),
      lastActivity: parseInt(metrics?.lastActivity || '0'),
    }
  } catch (error) {
    console.error('Error getting conversation metrics:', error)
    return {
      messageCount: 0,
      toolCallCount: 0,
      avgResponseTime: 0,
      lastActivity: 0,
    }
  }
}

/**
 * Clears a chat context from Redis
 */
export async function clearChatContext(chatId: string): Promise<void> {
  const contextKey = `${CONTEXT_PREFIX}${chatId}`
  const metricsKey = `${METRICS_PREFIX}${chatId}`
  
  try {
    await redis.del(contextKey, metricsKey)
  } catch (error) {
    console.error('Error clearing chat context:', error)
  }
}