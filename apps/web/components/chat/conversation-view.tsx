'use client';

import { useEffect, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';
import { transitions } from './animations/transitions';
import { MessageInputBar } from './message-input-bar';
import { cn } from '@/lib/utils';
import { TypingIndicator } from './typing-indicator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message, ConversationViewProps } from '@/lib/types/fpl-types';
import { NewMessagesPill } from './new-messages-pill';

// Distance from bottom (px) under which we consider the user "at bottom"
// and auto-scroll as new messages arrive.
const NEAR_BOTTOM_PX = 100;

function MessageBubble({
    message,
    userName,
    userInitials,
}: {
    message: Message;
    userName?: string;
    userInitials?: string;
}) {
    const initials =
        userInitials ||
        (userName
            ? userName
                  .split(' ')
                  .map((word) => word[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)
            : 'U');

    return (
        <motion.div
            variants={transitions.message}
            initial="initial"
            animate="animate"
            className={cn(
                'flex items-start gap-3',
                message.role === 'user' ? 'justify-end' : 'justify-start'
            )}
        >
            {/* This is the user message */}
            {message.role === 'user' && (
                <div
                    className={cn(
                        'max-w-[80%] rounded-2xl px-4 py-3',
                        'bg-primary text-primary-foreground'
                    )}
                >
                    {message.content ? (
                        <p className="text-sm whitespace-pre-wrap break-words">
                            {message.content}
                        </p>
                    ) : message.isStreaming ? (
                        <TypingIndicator />
                    ) : null}
                    {message.isStreaming && message.content && (
                        <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1" />
                    )}
                </div>
            )}

            {/* This is the user avatar */}
            {message.role === 'user' && (
                <Avatar className="h-10 w-10 ring-2 ring-secondary">
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                        {initials}
                    </AvatarFallback>
                </Avatar>
            )}

            {/* This is the assistant avatar */}
            {message.role === 'assistant' && (
                <Avatar className="h-10 w-10 ring-2 ring-primary/20 bg-white">
                    <div className="h-full w-full flex items-center justify-center p-1.5">
                        <img
                            src="/fpl-assistant.png"
                            alt="FPL Assistant"
                            className="h-full w-full object-contain"
                        />
                    </div>
                </Avatar>
            )}

            {/* This is the assistant message */}
            {message.role === 'assistant' && (
                <div className={cn('max-w-[80%] rounded-2xl px-4 py-3 bg-surface border border-border')}>
                    {message.content ? (
                        <div className="text-sm prose prose-sm max-w-none dark:prose-invert">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                    ul: ({ children }) => <ul className="mb-2 ml-4 list-disc">{children}</ul>,
                                    ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal">{children}</ol>,
                                    li: ({ children }) => <li className="mb-1">{children}</li>,
                                    code: ({ className, children, ...props }: any) => {
                                        // react-markdown v10 removed the `inline` prop; detect
                                        // block code by the presence of a language-* class.
                                        const isBlock = /language-/.test(className || '');
                                        return isBlock ? (
                                            <pre className="p-2 rounded bg-muted overflow-x-auto">
                                                <code className={className} {...props}>
                                                    {children}
                                                </code>
                                            </pre>
                                        ) : (
                                            <code className="px-1 py-0.5 rounded bg-muted text-sm" {...props}>
                                                {children}
                                            </code>
                                        );
                                    },
                                    blockquote: ({ children }) => (
                                        <blockquote className="border-l-4 border-muted-foreground/30 pl-4 italic">
                                            {children}
                                        </blockquote>
                                    ),
                                }}
                            >
                                {message.content}
                            </ReactMarkdown>
                            {message.isStreaming && (
                                <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1" />
                            )}
                        </div>
                    ) : message.isStreaming ? (
                        <TypingIndicator />
                    ) : null}
                </div>
            )}
        </motion.div>
    );
}

interface ExtendedConversationViewProps extends ConversationViewProps {
    activeTool?: { id: string; name: string } | null;
}

export function ConversationView({
    messages,
    onSendMessage,
    isLoading = false,
    userName,
    userInitials,
    activeTool,
}: ExtendedConversationViewProps) {
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLElement | null>(null);
    const [isNearBottom, setIsNearBottom] = useState(true);
    const [hasUnread, setHasUnread] = useState(false);

    // Attach scroll listener to Radix ScrollArea's viewport element.
    useEffect(() => {
        const root = scrollAreaRef.current;
        if (!root) return;
        const viewport = root.querySelector<HTMLElement>(
            '[data-radix-scroll-area-viewport]'
        );
        if (!viewport) return;
        viewportRef.current = viewport;

        const handleScroll = () => {
            const distance =
                viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight);
            const near = distance < NEAR_BOTTOM_PX;
            setIsNearBottom(near);
            if (near) setHasUnread(false);
        };
        viewport.addEventListener('scroll', handleScroll, { passive: true });
        return () => viewport.removeEventListener('scroll', handleScroll);
    }, []);

    // On new messages: scroll to bottom if user is near bottom, otherwise
    // mark unread so the pill appears.
    useEffect(() => {
        if (isNearBottom) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        } else {
            setHasUnread(true);
        }
    }, [messages, isNearBottom]);

    const jumpToBottom = () => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        setHasUnread(false);
    };

    return (
        <motion.div
            variants={transitions.conversationView}
            initial="initial"
            animate="animate"
            className="flex flex-col h-full relative"
        >
            <ScrollArea className="flex-1 px-4" ref={scrollAreaRef}>
                <div className="max-w-3xl mx-auto pt-8 pb-32 space-y-4">
                    <AnimatePresence mode="popLayout">
                        {messages.map((message) => (
                            <MessageBubble
                                key={message.id}
                                message={message}
                                userName={userName}
                                userInitials={userInitials}
                            />
                        ))}
                    </AnimatePresence>
                    {activeTool && (
                        <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 6 }}
                            className="flex items-center gap-2 text-xs text-muted-foreground pl-14"
                        >
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-secondary animate-pulse" />
                            Looking up {activeTool.name.replace(/_/g, ' ')}...
                        </motion.div>
                    )}
                    <div ref={bottomRef} />
                </div>
            </ScrollArea>

            <AnimatePresence>
                {!isNearBottom && hasUnread && (
                    <NewMessagesPill onClick={jumpToBottom} />
                )}
            </AnimatePresence>

            <MessageInputBar onSubmit={onSendMessage} isLoading={isLoading} />
        </motion.div>
    );
}
