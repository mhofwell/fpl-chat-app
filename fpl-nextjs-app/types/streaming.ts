// types/streaming.ts

export type StreamChunk = 
    | { type: 'text'; content: string }
    | { type: 'session'; sessionId: string }
    | { type: 'tool_call'; toolName: string }
    | { type: 'error'; content: string };

export interface StreamChatResponseOptions {
    message: string;
    sessionId?: string;
}