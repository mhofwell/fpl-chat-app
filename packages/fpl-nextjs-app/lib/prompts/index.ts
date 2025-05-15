// lib/prompts/index.ts

import { FPL_STATS_PROMPT } from './fpl-stats-prompt';
import { FPL_FANTASY_PROMPT } from './fpl-fantasy-prompt';
import { GENERAL_CHAT_PROMPT } from './general-prompt';
import { UNIFIED_PROMPT } from './hybrid-prompts';
import { claudeNativeSystemPrompt } from './claude-native-prompt';

export const PROMPT_REGISTRY = {
  'fpl-stats': FPL_STATS_PROMPT,      // Real EPL statistics
  'fpl-fantasy': FPL_FANTASY_PROMPT,  // FPL fantasy game
  'general': GENERAL_CHAT_PROMPT,     // General conversation
  'unified': UNIFIED_PROMPT,          // New unified approach
  'claude-native': claudeNativeSystemPrompt,  // Claude-native approach
} as const;

export type PromptIntent = keyof typeof PROMPT_REGISTRY;

export function detectQueryIntent(message: string): PromptIntent {
  const lowerMessage = message.toLowerCase();
  
  // For MVP, use a simplified but more robust approach
  // Default to unified prompt that handles both cases
  
  // Only use specialized prompts for very clear cases
  if (lowerMessage.includes('top scorer') || 
      lowerMessage.includes('most goals') ||
      lowerMessage.includes('real goals') ||
      lowerMessage.includes('actually scored')) {
    return 'fpl-stats';
  }
  
  // For most queries, let the unified prompt handle it
  // This avoids the brittle pattern matching
  return 'unified';
}

export { FPL_STATS_PROMPT, FPL_FANTASY_PROMPT, GENERAL_CHAT_PROMPT, UNIFIED_PROMPT };