'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { processUserMessage } from '@/app/actions/chat';
import { streamChatResponse } from '@/app/actions/chat-stream';
import { initializeMcpSession } from '@/app/actions/mcp-tools';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export default function ChatUI() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [chatId, setChatId] = useState<string | null>(() =>
        typeof window !== 'undefined'
            ? localStorage.getItem('fpl_chat_id')
            : null
    );
    const [mcpSessionId, setMcpSessionId] = useState<string | undefined>();

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isProcessing) return;

        // Add user message to UI immediately
        const userMessage: Message = { role: 'user', content: input };
        setMessages((prev) => [...prev, userMessage]);
        setInput('');
        setIsProcessing(true);

        try {
            // Add empty assistant message for streaming
            const assistantMessageIndex = messages.length + 1;
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: '',
                },
            ]);

            // Stream the response
            const generator = streamChatResponse(userMessage.content, mcpSessionId);
            let fullContent = '';
            
            for await (const chunk of generator) {
                if (chunk.type === 'text') {
                    fullContent += chunk.content;
                    setMessages((prev) => {
                        const newMessages = [...prev];
                        newMessages[assistantMessageIndex] = {
                            role: 'assistant',
                            content: fullContent,
                        };
                        return newMessages;
                    });
                } else if (chunk.type === 'tool_call') {
                    // Show user that a tool is being called
                    fullContent += `\n\n_Checking ${chunk.toolName}..._\n\n`;
                    setMessages((prev) => {
                        const newMessages = [...prev];
                        newMessages[assistantMessageIndex] = {
                            role: 'assistant',
                            content: fullContent,
                        };
                        return newMessages;
                    });
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
            setMessages((prev) => [
                ...prev.slice(0, -1), // Remove the empty assistant message
                {
                    role: 'assistant',
                    content: 'Sorry, there was an error processing your request.',
                },
            ]);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex flex-col h-[600px] w-full max-w-3xl mx-auto rounded-lg border bg-background shadow-sm">
            {/* Messages area */}
            <div className="flex-1 p-4 overflow-y-auto">
                {messages.map((msg, index) => (
                    <div
                        key={index}
                        className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
                    >
                        <div
                            className={`inline-block p-3 rounded-lg max-w-[80%] ${
                                msg.role === 'user'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-foreground'
                            }`}
                        >
                            {msg.content}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="p-3 border-t">
                <form className="flex gap-2" onSubmit={handleSubmit}>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about FPL..."
                        className="flex-1 p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        disabled={isProcessing}
                    />
                    <Button
                        type="submit"
                        disabled={!input.trim() || isProcessing}
                    >
                        {isProcessing ? 'Thinking...' : 'Send'}
                    </Button>
                </form>
            </div>
        </div>
    );
}
