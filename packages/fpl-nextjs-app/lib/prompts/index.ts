// lib/prompts/index.ts

import { FPL_STATS_PROMPT } from './fpl-stats-prompt';
import { FPL_FANTASY_PROMPT } from './fpl-fantasy-prompt';
import { GENERAL_CHAT_PROMPT } from './general-prompt';

export const PROMPT_REGISTRY = {
  'fpl-stats': FPL_STATS_PROMPT,      // Real EPL statistics
  'fpl-fantasy': FPL_FANTASY_PROMPT,  // FPL fantasy game
  'general': GENERAL_CHAT_PROMPT,     // General conversation
} as const;

export type PromptIntent = keyof typeof PROMPT_REGISTRY;

export function detectQueryIntent(message: string): PromptIntent {
  const lowerMessage = message.toLowerCase();
  
  // Fantasy-specific keywords
  const fantasyKeywords = [
    'fantasy', 'fpl', 'points', 'value', 'price', 'ownership',
    'selected by', 'fantasy points', 'fpl points', 'best fpl',
    'fantasy value', 'differential', 'captain', 'triple captain'
  ];
  
  // Stats-specific keywords (real Premier League)
  const statsKeywords = [
    'top scorer', 'most goals', 'most assists', 'clean sheets',
    'real goals', 'actual goals', 'premier league goals',
    'real stats', 'actual stats', 'match stats'
  ];
  
  // Check for explicit fantasy mentions
  if (fantasyKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return 'fpl-fantasy';
  }
  
  // Check for explicit stats mentions
  if (statsKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return 'fpl-stats';
  }
  
  // Context-based detection for specific player queries
  if (lowerMessage.includes('points') && 
      (lowerMessage.includes("'s") || lowerMessage.includes('his') || lowerMessage.includes('her')) &&
      !lowerMessage.includes('goal')) {
    return 'fpl-fantasy'; // "[Player]'s points" likely means fantasy
  }
  
  // Additional patterns
  if (lowerMessage.match(/\b(salah|haaland|palmer|saka|son|kane)'?s?\s+(fantasy\s+)?points?\b/)) {
    return 'fpl-fantasy'; // Specific player fantasy points
  }
  
  if (lowerMessage.includes('scorer') || lowerMessage.includes('goals scored')) {
    return 'fpl-stats'; // Default to real stats for goal queries
  }
  
  // Default to general for ambiguous queries
  return 'general';
}

export { FPL_STATS_PROMPT, FPL_FANTASY_PROMPT, GENERAL_CHAT_PROMPT };