'use server'

import Anthropic from '@anthropic-ai/sdk'
import type { ClaudeResponse } from '@/lib/types/fpl-types'

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
})

export async function sendMessageToClaude(message: string): Promise<ClaudeResponse> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: message,
        },
      ],
      system: 'You are an expert Fantasy Premier League (FPL) assistant. Help users with team selection, player analysis, and FPL strategy.',
    })

    return {
      success: true,
      content: response.content[0].type === 'text' ? response.content[0].text : '',
    }
  } catch (error) {
    console.error('Error calling Claude:', error)
    return {
      success: false,
      error: 'Failed to get response from Claude',
    }
  }
}