'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import type { HttpAgent } from '@ag-ui/client';
import { ComposingView } from './composing-view';
import { ConversationView } from './conversation-view';
import { createAgentClient, setAgentAuth } from '@/lib/agent-client';
import { createFplAgentSubscriber } from '@/lib/agent-subscriber';
import { createClient } from '@/utils/supabase/client';
import type { Message, ChatViewState } from '@/lib/types/fpl-types';

interface ChatTransitionContainerProps {
    sampleQuestions?: string[];
    title?: string;
    subtitle?: string;
    userName?: string;
    userInitials?: string;
}

export function ChatTransitionContainer({
    sampleQuestions = [],
    title,
    subtitle,
    userName,
    userInitials,
}: ChatTransitionContainerProps) {
    const [viewState, setViewState] = useState<ChatViewState>('composing');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeTool, setActiveTool] = useState<{ id: string; name: string } | null>(null);
    const messageIdPrefix = useId();

    // One thread_id + one HttpAgent per mount. Agent stores the conversation
    // history internally across turns.
    const threadId = useMemo(() => uuidv4(), []);
    const agentRef = useRef<HttpAgent | null>(null);
    if (agentRef.current === null) {
        agentRef.current = createAgentClient({ threadId });
    }

    // Supabase browser client — reads the current session (auto-refreshes tokens).
    const supabase = useMemo(() => createClient(), []);

    // Abort any in-flight agent run when the component unmounts.
    useEffect(() => {
        return () => {
            try {
                agentRef.current?.abortRun();
            } catch {
                // abortRun throws if no run is active; safe to ignore.
            }
        };
    }, []);

    const handleSendMessage = useCallback(
        async (content: string) => {
            const agent = agentRef.current;
            if (!agent) return;

            // Read the session token fresh each turn so refreshes are transparent.
            const {
                data: { session },
            } = await supabase.auth.getSession();
            if (!session) {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: `${messageIdPrefix}-err-${Date.now()}`,
                        role: 'assistant',
                        content:
                            'Your session has expired. Please sign in again to continue.',
                        timestamp: new Date(),
                    },
                ]);
                return;
            }
            setAgentAuth(agent, session.access_token);

            const userId = `${messageIdPrefix}-user-${Date.now()}`;
            const userMessage: Message = {
                id: userId,
                role: 'user',
                content,
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, userMessage]);
            setViewState('conversation');
            setIsLoading(true);

            agent.addMessage({
                id: userId,
                role: 'user',
                content,
            });

            const runId = uuidv4();

            const subscriber = createFplAgentSubscriber({
                onMessageStart: (msgId) => {
                    setMessages((prev) => [
                        ...prev,
                        {
                            id: msgId,
                            role: 'assistant',
                            content: '',
                            isStreaming: true,
                            timestamp: new Date(),
                        },
                    ]);
                },
                onTextDelta: (msgId, delta) => {
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === msgId ? { ...m, content: m.content + delta } : m
                        )
                    );
                },
                onMessageEnd: (msgId) => {
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === msgId ? { ...m, isStreaming: false } : m
                        )
                    );
                },
                onToolStart: (id, name) => setActiveTool({ id, name }),
                onToolEnd: () => setActiveTool(null),
                onFinish: () => {
                    setActiveTool(null);
                    setIsLoading(false);
                    setMessages((prev) =>
                        prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
                    );
                },
                onError: (msg) => {
                    setMessages((prev) => [
                        ...prev,
                        {
                            id: `${messageIdPrefix}-err-${Date.now()}`,
                            role: 'assistant',
                            content: `Sorry — ${msg}`,
                            timestamp: new Date(),
                        },
                    ]);
                    setActiveTool(null);
                    setIsLoading(false);
                },
            });

            try {
                await agent.runAgent({ runId, tools: [] }, subscriber);
            } catch (err) {
                console.error('Agent run failed:', err);
                setIsLoading(false);
            }
        },
        [messageIdPrefix, supabase]
    );

    return (
        <div className="relative w-full h-full overflow-hidden">
            <AnimatePresence mode="wait">
                {viewState === 'composing' ? (
                    <ComposingView
                        key="composing"
                        onSubmit={handleSendMessage}
                        isLoading={isLoading}
                        title={title}
                        subtitle={subtitle}
                        sampleQuestions={sampleQuestions}
                    />
                ) : (
                    <ConversationView
                        key="conversation"
                        messages={messages}
                        onSendMessage={handleSendMessage}
                        isLoading={isLoading}
                        userName={userName}
                        userInitials={userInitials}
                        activeTool={activeTool}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
