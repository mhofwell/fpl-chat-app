// app/utils/tool-strategy.ts

import { ToolDefinition } from '../../app/types/tool-types';
import { TOOL_USAGE_CONFIG } from '../../config/ai-config';

// Simple type for the tool selection context
export type ToolSelectionContext = {
  userMessage: string;
  chatHistory?: string[];
  previousTools?: string[];
};

/**
 * Validates whether a tool's parameters meet the requirements
 */
export function validateToolParameters(
  toolName: string,
  toolParams: Record<string, any>
): { valid: boolean; missingFields?: string[] } {
  const validationRules = TOOL_USAGE_CONFIG.VALIDATION_RULES[toolName as keyof typeof TOOL_USAGE_CONFIG.VALIDATION_RULES];
  
  if (!validationRules) {
    // If no specific validation rules exist, consider it valid
    return { valid: true };
  }
  
  // Check required fields
  const missingFields = validationRules.requiredFields?.filter(
    (field) => toolParams[field] === undefined
  );
  
  if (missingFields && missingFields.length > 0) {
    return { valid: false, missingFields };
  }
  
  // Check field-specific validation rules
  if (validationRules.fieldValidation) {
    for (const [field, validator] of Object.entries(validationRules.fieldValidation)) {
      if (toolParams[field] !== undefined && !validator(toolParams[field])) {
        return { valid: false, missingFields: [`Invalid value for ${field}`] };
      }
    }
  }
  
  return { valid: true };
}

/**
 * Determines if a specific tool might be useful for a given query
 * This is a simple keyword-based approach that could be enhanced later
 */
export function isToolRelevant(
  toolName: string,
  userMessage: string
): boolean {
  const message = userMessage.toLowerCase();
  
  // Tool-specific relevance checks
  switch (toolName) {
    case 'get-player':
      return (
        message.includes('player') ||
        message.includes('who is') ||
        message.includes('about ') ||
        message.includes('stats for') ||
        message.includes('tell me about') ||
        message.includes('information on')
      );
      
    case 'search-players':
      return (
        message.includes('list') ||
        message.includes('top') ||
        message.includes('best') ||
        message.includes('players who') ||
        message.includes('players with') ||
        message.includes('search for players') ||
        message.includes('find players')
      );
      
    case 'get-team':
      return (
        message.includes('team') ||
        message.includes('club') ||
        message.includes('about ') && (
          message.includes('arsenal') ||
          message.includes('chelsea') ||
          message.includes('liverpool') ||
          message.includes('manchester')
          // More team names could be added
        )
      );
      
    case 'get-gameweek':
      return (
        message.includes('gameweek') ||
        message.includes('gw') ||
        message.includes('week') ||
        message.includes('current round') ||
        message.includes('next round') ||
        message.includes('this week') ||
        message.includes('upcoming')
      );
      
    case 'search-fixtures':
      return (
        message.includes('fixtures') ||
        message.includes('matches') ||
        message.includes('games') ||
        message.includes('playing') ||
        message.includes('vs') ||
        message.includes('against') ||
        message.includes('when') ||
        message.includes('schedule')
      );
      
    case 'compare-entities':
      return (
        message.includes('compare') ||
        message.includes('versus') ||
        message.includes(' vs ') ||
        message.includes('better') ||
        message.includes('difference between') ||
        message.includes('which is better')
      );
      
    default:
      return false;
  }
}

/**
 * Suggests tools to use for a given user message
 * Returns an array of recommended tools sorted by relevance
 */
export function suggestTools(
  tools: ToolDefinition[],
  context: ToolSelectionContext
): ToolDefinition[] {
  // Simple scoring system for tools based on relevance to the message
  const scoredTools = tools.map(tool => {
    const isRelevant = isToolRelevant(tool.name, context.userMessage);
    return {
      tool,
      score: isRelevant ? 1 : 0
    };
  });
  
  // Sort by score (descending)
  const sortedTools = scoredTools
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.tool);
  
  // Limit to maximum allowed tool calls
  return sortedTools.slice(0, TOOL_USAGE_CONFIG.MAX_TOOL_CALLS_PER_QUERY);
}

/**
 * Determines if the query should use tools at all
 * Some queries might be better answered directly without tools
 */
export function shouldUseTool(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  
  // Simple cases where tools probably aren't needed
  const noToolPatterns = [
    /^hi\b/i,
    /^hello\b/i,
    /^thanks/i,
    /^thank you/i,
    /how are you/i,
    /what is fpl/i,
    /how does fpl work/i,
    /what are the rules/i,
    /^help$/i,
    /explain/i
  ];
  
  // Check for patterns that suggest no tools are needed
  for (const pattern of noToolPatterns) {
    if (pattern.test(lowerMessage)) {
      return false;
    }
  }
  
  // Default to using tools for FPL-related queries
  return true;
}