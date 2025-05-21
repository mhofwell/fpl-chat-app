import { MessageParam } from '@anthropic-ai/sdk/resources';
import { calculateMessageTokens } from './token-manager';
import { CLAUDE_CONFIG } from '@/config/ai-config';

interface PreprocessOptions {
  maxTokens?: number;  // Maximum tokens for context (default: 20% of model limit)
  preserveLastN?: number;  // Always keep last N messages (default: 3)
  modelVersion?: string;
}

interface PreprocessedMessages {
  contextMessages: MessageParam[];
  currentMessage: MessageParam;
  totalTokens: number;
  wasCompressed: boolean;
}

/**
 * Preprocesses messages for Claude, separating context from current query
 * and managing token limits intelligently
 */
export function preprocessMessages(
  allMessages: MessageParam[],
  currentUserMessage: string,
  options: PreprocessOptions = {}
): PreprocessedMessages {
  const {
    maxTokens = Math.floor(CLAUDE_CONFIG.MAX_TOKENS_EXTENDED * 0.2), // 20% of context window
    preserveLastN = 3,
    modelVersion = CLAUDE_CONFIG.MODEL_VERSION
  } = options;

  // Start with just the current message
  const currentMessage: MessageParam = {
    role: 'user',
    content: currentUserMessage
  };
  
  let currentTokens = calculateMessageTokens(currentMessage, modelVersion);
  const processedContextMessages: MessageParam[] = [];
  let wasCompressed = false;

  // Work backwards through messages, adding until we hit token limit
  for (let i = allMessages.length - 1; i >= 0; i--) {
    const message = allMessages[i];
    const messageTokens = calculateMessageTokens(message, modelVersion);
    
    // Always preserve the last N messages for immediate context
    const isRecent = (allMessages.length - i) <= preserveLastN;
    
    // Check if adding this message would exceed our limit
    if (!isRecent && (currentTokens + messageTokens > maxTokens)) {
      // We've hit our limit, mark that compression occurred
      wasCompressed = true;
      break;
    }
    
    // Add message to context (will be reversed later)
    processedContextMessages.unshift(message);
    currentTokens += messageTokens;
  }

  // If we compressed, add a summary message at the start
  if (wasCompressed && processedContextMessages.length > 0) {
    const omittedCount = allMessages.length - processedContextMessages.length;
    const summaryMessage: MessageParam = {
      role: 'assistant',
      content: `[Context Note: ${omittedCount} earlier messages omitted to manage conversation length. The following messages provide recent context.]`
    };
    processedContextMessages.unshift(summaryMessage);
  }

  // Keep context messages as-is, we'll use structure to indicate context vs current
  const markedContextMessages = processedContextMessages;

  return {
    contextMessages: markedContextMessages,
    currentMessage,
    totalTokens: currentTokens,
    wasCompressed
  };
}

/**
 * Creates the final message array for Claude API, with clear separation
 * between context and current query
 */
export function formatMessagesForClaude(
  preprocessed: PreprocessedMessages
): MessageParam[] {
  // Simply concatenate context and current message
  // No separator needed since we're no longer duplicating the current message
  return [...preprocessed.contextMessages, preprocessed.currentMessage];
}