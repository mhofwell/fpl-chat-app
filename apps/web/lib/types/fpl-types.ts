// ===========================
// Local type definitions
// ===========================
//
// These types were previously imported from a shared @fpl/types workspace
// package that has been removed as part of the Phase 1 rebuild. The chat
// UI's message shape is still our own (not AG-UI's Message) — we render
// our local view of the conversation, fed by the AG-UI subscriber
// callbacks in `lib/agent-subscriber.ts`.

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
