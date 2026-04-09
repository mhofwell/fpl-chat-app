// ===========================
// Local type definitions
// ===========================
//
// These types were previously imported from a shared @fpl/types workspace
// package (and before that, a top-level ../../types directory) that has been
// removed as part of the Phase 1 rebuild. They are inlined here to keep
// apps/web self-contained. Most of them will be replaced or deleted during
// M5/M6 when the custom streaming path is swapped out for the AG-UI consumer
// from @ag-ui/client.

// ---- Chat & Message ----

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  timestamp?: Date;
}

export interface ConversationViewProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  userName?: string;
  userInitials?: string;
}

export interface MessageInputBarProps {
  onSubmit: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export interface ChatTransitionContainerProps {
  onSendMessage?: (
    message: string,
    onStreamUpdate?: (text: string) => void,
  ) => Promise<string | void>;
  sampleQuestions?: string[];
  title?: string;
  subtitle?: string;
  userName?: string;
  userInitials?: string;
}

export type ChatViewState = 'composing' | 'conversation';

// ---- Error handling ----

export type ErrorType =
  | 'rate_limit'
  | 'network'
  | 'invalid_request'
  | 'server_error'
  | 'unauthorized'
  | 'unknown';

export interface ErrorResponse {
  error: string;
  type: ErrorType;
  retryable: boolean;
  userMessage: string;
}

// ---- API response wrappers (legacy, to be removed in M5/M6) ----

/**
 * Claude API response used by the legacy custom streaming endpoint.
 * Goes away with the AG-UI migration.
 */
export interface ClaudeResponse {
  success: boolean;
  content?: string;
  error?: string;
}

/**
 * MCP tool call result used by the legacy actions/mcp.ts server action.
 * Goes away with the AG-UI migration.
 */
export interface McpToolResult {
  success: boolean;
  result?: any;
  error?: string;
}

// ---- Stream & tool events (legacy) ----

/**
 * Tool execution context emitted by the legacy custom streaming endpoint.
 * Replaced by ToolCallStart / ToolCallArgs / ToolCallEnd events from
 * @ag-ui/client in M5/M6.
 */
export interface ToolCall {
  id: string;
  name: string;
  inputJson: string;
}
