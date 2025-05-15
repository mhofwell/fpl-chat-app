// utils/claude/conversation-summarizer.ts

import { Anthropic } from '@anthropic-ai/sdk'
import { CLAUDE_CONFIG } from '../../config/ai-config'
import type { ChatMessage } from './context-manager-redis'

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || ''
})

interface SummarizationOptions {
  maxTokens?: number
  preserveToolResults?: boolean
  focusTopics?: string[]
}

/**
 * Summarize a portion of conversation history
 */
export async function summarizeConversation(
  messages: ChatMessage[],
  options: SummarizationOptions = {}
): Promise<ChatMessage | null> {
  const {
    maxTokens = 500,
    preserveToolResults = true,
    focusTopics = []
  } = options
  
  if (messages.length < 5) {
    // Don't summarize if there are few messages
    return null
  }
  
  try {
    // Prepare messages for summarization
    const conversationText = messages.map(msg => {
      let content = `${msg.role}: ${msg.content}`
      
      // Include tool information if requested
      if (preserveToolResults && msg.tool_calls) {
        content += `\n[Used tools: ${msg.tool_calls.map(tc => tc.name).join(', ')}]`
      }
      
      if (preserveToolResults && msg.tool_results) {
        content += `\n[Tool results: ${msg.tool_results.length} results]`
      }
      
      return content
    }).join('\n\n')
    
    // Build the prompt
    let prompt = `Summarize the following conversation concisely, preserving key information, decisions, and outcomes.`
    
    if (focusTopics.length > 0) {
      prompt += ` Focus especially on: ${focusTopics.join(', ')}.`
    }
    
    if (preserveToolResults) {
      prompt += ` Include mentions of what tools were used and their key results.`
    }
    
    prompt += `\n\nConversation:\n${conversationText}\n\nSummary:`
    
    // Call Claude for summarization
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307', // Use Haiku for cost-effective summarization
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
    
    const summary = response.content[0].text
    
    // Return summary as a system message
    return {
      role: 'system',
      content: `[Previous conversation summary]: ${summary}`,
      timestamp: new Date().toISOString(),
      tokenCount: estimateTokenCount(summary)
    }
  } catch (error) {
    console.error('Error summarizing conversation:', error)
    return null
  }
}

/**
 * Determine if conversation needs summarization
 */
export function needsSummarization(
  messages: ChatMessage[],
  currentTokenCount: number,
  maxTokens: number = 100000
): boolean {
  // Summarize if:
  // 1. Token count is approaching limit
  // 2. Message count is very high
  // 3. Oldest messages are very old
  
  if (currentTokenCount > maxTokens * 0.7) {
    return true
  }
  
  if (messages.length > 50) {
    return true
  }
  
  if (messages.length > 20) {
    const oldestMessage = messages[0]
    const oldestTime = new Date(oldestMessage.timestamp || Date.now()).getTime()
    const hoursSinceOldest = (Date.now() - oldestTime) / (1000 * 60 * 60)
    
    if (hoursSinceOldest > 2) {
      return true
    }
  }
  
  return false
}

/**
 * Smart conversation compression
 */
export async function compressConversation(
  messages: ChatMessage[],
  targetTokenCount: number = 50000
): Promise<ChatMessage[]> {
  const currentTokenCount = messages.reduce((sum, msg) => 
    sum + (msg.tokenCount || estimateTokenCount(msg.content)), 0
  )
  
  if (currentTokenCount <= targetTokenCount) {
    return messages
  }
  
  // Strategy:
  // 1. Keep the most recent messages
  // 2. Summarize older messages in chunks
  // 3. Keep important messages (with tool results, etc.)
  
  const importantMessages = new Set<number>()
  const recentMessages: ChatMessage[] = []
  
  // Identify important messages (those with tool results)
  messages.forEach((msg, index) => {
    if (msg.tool_results && msg.tool_results.length > 0) {
      importantMessages.add(index)
      // Also keep the message that triggered these tools
      if (index > 0) {
        importantMessages.add(index - 1)
      }
    }
  })
  
  // Work backwards from most recent
  let tokenSum = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    const msgTokens = msg.tokenCount || estimateTokenCount(msg.content)
    
    if (tokenSum + msgTokens <= targetTokenCount * 0.5) {
      // Keep recent messages up to 50% of target
      recentMessages.unshift(msg)
      tokenSum += msgTokens
    } else {
      break
    }
  }
  
  // Summarize older messages
  const oldMessages = messages.slice(0, messages.length - recentMessages.length)
  const summaryChunks: ChatMessage[] = []
  
  if (oldMessages.length > 0) {
    // Chunk old messages for summarization
    const chunkSize = 20
    for (let i = 0; i < oldMessages.length; i += chunkSize) {
      const chunk = oldMessages.slice(i, i + chunkSize)
      
      // Check if chunk contains important messages
      const hasImportant = chunk.some((_, idx) => 
        importantMessages.has(i + idx)
      )
      
      const summary = await summarizeConversation(chunk, {
        maxTokens: hasImportant ? 300 : 200,
        preserveToolResults: hasImportant,
        focusTopics: ['key decisions', 'tool results', 'user goals']
      })
      
      if (summary) {
        summaryChunks.push(summary)
      }
    }
  }
  
  // Combine summaries and recent messages
  return [...summaryChunks, ...recentMessages]
}

/**
 * Estimate token count for a string
 */
function estimateTokenCount(text: string): number {
  // Rough approximation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4)
}

/**
 * Extract key topics from conversation
 */
export async function extractKeyTopics(
  messages: ChatMessage[]
): Promise<string[]> {
  if (messages.length < 5) {
    return []
  }
  
  try {
    const conversationText = messages
      .slice(-10) // Use last 10 messages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n\n')
    
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: `Extract 3-5 key topics from this conversation. Return only a comma-separated list of topics, nothing else.\n\n${conversationText}`
        }
      ]
    })
    
    const topics = response.content[0].text
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0)
    
    return topics
  } catch (error) {
    console.error('Error extracting topics:', error)
    return []
  }
}