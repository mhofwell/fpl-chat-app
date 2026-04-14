import type { AgentSubscriber } from "@ag-ui/client";

/**
 * Callbacks the chat UI plugs into the AG-UI event stream.
 */
export interface AgentCallbacks {
    /** Assistant started a new text message — create the bubble. */
    onMessageStart: (messageId: string) => void;
    /** Append a text delta to an in-flight assistant message. */
    onTextDelta: (messageId: string, delta: string) => void;
    /** Assistant finished a text message — remove the streaming indicator. */
    onMessageEnd: (messageId: string) => void;
    /** Tool call started — show indicator with the tool name. */
    onToolStart: (toolCallId: string, toolName: string) => void;
    /** Tool call finished executing. */
    onToolEnd: (toolCallId: string) => void;
    /** The whole run completed successfully. */
    onFinish: () => void;
    /** The run errored out with a message. */
    onError: (message: string) => void;
}

/**
 * Build an AgentSubscriber that translates AG-UI events into React state
 * updates via the supplied callbacks.
 *
 * We explicitly ignore:
 *   - onToolCallArgsEvent — we show a tool indicator, not the args stream
 *   - onToolCallResultEvent — the result surfaces in the next text turn
 *   - onStateDeltaEvent — Phase 2b (resource subscriptions)
 *   - reasoning events — Sonnet 4.5 may not emit them; if they arrive we
 *     just let them through without UI treatment
 */
export function createFplAgentSubscriber(cb: AgentCallbacks): AgentSubscriber {
    return {
        onTextMessageStartEvent({ event }) {
            cb.onMessageStart(event.messageId);
        },
        onTextMessageContentEvent({ event }) {
            cb.onTextDelta(event.messageId, event.delta);
        },
        onTextMessageEndEvent({ event }) {
            cb.onMessageEnd(event.messageId);
        },
        onToolCallStartEvent({ event }) {
            cb.onToolStart(event.toolCallId, event.toolCallName);
        },
        onToolCallEndEvent({ event }) {
            cb.onToolEnd(event.toolCallId);
        },
        onRunFinishedEvent() {
            cb.onFinish();
        },
        onRunErrorEvent({ event }) {
            cb.onError(event.message || "Agent run failed");
        },
        onRunFailed({ error }) {
            cb.onError(error.message || "Agent run failed");
        },
    };
}
