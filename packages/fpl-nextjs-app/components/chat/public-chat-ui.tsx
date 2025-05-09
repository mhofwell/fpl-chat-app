'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { processUserMessage } from '@/app/actions/chat';
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
    const [mcpSessionId, setMcpSessionId] = useState<string | null>(null);
    const [isInitializing, setIsInitializing] = useState(true);

    useEffect(() => {
        async function initSession() {
            // First check localStorage
            const storedSessionId = localStorage.getItem('mcp-session-id');
            
            if (storedSessionId) {
                console.log('Found existing session ID:', storedSessionId);
                setMcpSessionId(storedSessionId);
                setIsInitializing(false);
            } else {
                setIsInitializing(true);
                try {
                    console.log('Initializing new MCP session...');
                    const newSessionId = await initializeMcpSession();
                    if (newSessionId) {
                        setMcpSessionId(newSessionId);
                        localStorage.setItem('mcp-session-id', newSessionId);
                        console.log('MCP session initialized:', newSessionId);
                    } else {
                        console.error('Failed to initialize MCP session');
                    }
                } catch (error) {
                    console.error('Error initializing MCP session:', error);
                } finally {
                    setIsInitializing(false);
                }
            }
        }
        
        initSession();
    }, []); // Remove mcpSessionId dependency to ensure it only runs once

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isProcessing || isInitializing) return;

        // Add user message to UI immediately
        const userMessage: Message = { role: 'user', content: input };
        setMessages((prev) => [...prev, userMessage]);
        setInput('');
        setIsProcessing(true);

        try {
            // Process message via server action
            const response = await processUserMessage(
                chatId,
                userMessage.content,
                mcpSessionId || undefined
            );

            if (response.chatId && response.chatId !== chatId) {
                setChatId(response.chatId);
                localStorage.setItem('fpl_chat_id', response.chatId);
            }
            
            // Store the MCP session ID if we got a new one
            if (response.mcpSessionId && response.mcpSessionId !== mcpSessionId) {
                setMcpSessionId(response.mcpSessionId);
                localStorage.setItem('mcp-session-id', response.mcpSessionId);
            }

            // Add assistant response
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: response.answer,
                },
            ]);
        } catch (error) {
            console.error('Error processing message:', error);
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content:
                        'Sorry, there was an error processing your request.',
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
                        placeholder={isInitializing ? "Initializing session..." : "Ask about FPL..."}
                        className="flex-1 p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        disabled={isProcessing || isInitializing}
                    />
                    <Button
                        type="submit"
                        disabled={!input.trim() || isProcessing || isInitializing}
                    >
                        {isInitializing ? 'Initializing...' : isProcessing ? 'Thinking...' : 'Send'}
                    </Button>
                </form>
            </div>
        </div>
    );
}
