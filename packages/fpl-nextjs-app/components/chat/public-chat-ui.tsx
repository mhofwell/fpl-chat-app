'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { initializeMcpSession } from '@/app/actions/mcp-tools';
import { Loader2, Send, PlusCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
    usingTool?: {
        name: string;
        status: 'pending' | 'complete' | 'error';
    };
}

// Sample questions to help users get started
const SAMPLE_QUESTIONS = [
    "Who is the top scorer in the Premier League this season?",
    "Tell me about Manchester City's upcoming fixtures",
    "How is Erling Haaland performing in the last few gameweeks?",
    "Compare Mohamed Salah and Kevin De Bruyne",
    "Which defenders have the most clean sheets?",
    "What is the current gameweek?",
];

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
    const [error, setError] = useState<string | null>(null);
    const [enableStreaming, setEnableStreaming] = useState<boolean>(() => 
        typeof window !== 'undefined' 
            ? localStorage.getItem('enable_streaming') !== 'false'
            : true
    );

    useEffect(() => {
        const initializeMcp = async () => {
            // Check for existing session in localStorage
            const storedSessionId = localStorage.getItem('mcp-session-id');
            if (storedSessionId) {
                setMcpSessionId(storedSessionId);
                setIsInitializing(false);
                return;
            }

            try {
                const sessionId = await initializeMcpSession();
                if (sessionId) {
                    setMcpSessionId(sessionId);
                    localStorage.setItem('mcp-session-id', sessionId);
                } else {
                    console.warn('Failed to establish MCP session');
                }
            } catch (error) {
                console.error('Error initializing MCP session:', error);
                setError('Failed to initialize FPL data connection. Some features may be limited.');
            } finally {
                setIsInitializing(false);
            }
        };

        initializeMcp();
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleNewChat = () => {
        // Clear the current chat
        setMessages([]);
        setChatId(null);
        localStorage.removeItem('fpl_chat_id');
        setError(null);
    };

    const handleToggleStreaming = () => {
        const newValue = !enableStreaming;
        setEnableStreaming(newValue);
        localStorage.setItem('enable_streaming', String(newValue));
    };

    const handleSubmit = async (e: React.FormEvent, customMessage?: string) => {
        e.preventDefault();
        const messageToSend = customMessage || input;
        if (!messageToSend.trim() || isProcessing || isInitializing) return;

        // Clear any previous errors
        setError(null);

        // Add user message to UI immediately
        const userMessage: Message = { role: 'user', content: messageToSend };
        setMessages((prev) => [...prev, userMessage]);
        setInput('');
        setIsProcessing(true);

        try {
            // Use EventSource with POST body for streaming
            const response = await fetch('/api/chat/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: messageToSend,
                    chatId,
                    mcpSessionId,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to connect to chat service');
            }
            
            if (!response.body) {
                throw new Error('No response body');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            // Add a new message for the assistant
            const assistantMessageIndex = messages.length + 1;
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: '',
                    isStreaming: true,
                },
            ]);

            let currentContent = '';
            let buffer = '';

            // Read the stream
            const processStream = async () => {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        // Decode the chunk and add to buffer
                        buffer += decoder.decode(value, { stream: true });
                        
                        // Process complete SSE messages
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || ''; // Keep incomplete line in buffer

                        for (const line of lines) {
                            if (line.startsWith('event:')) {
                                const event = line.slice(6).trim();
                                continue; // Event name
                            }
                            
                            if (line.startsWith('data:')) {
                                const data = line.slice(5).trim();
                                if (!data) continue;

                                try {
                                    const parsed = JSON.parse(data);
                                    const eventType = lines[lines.indexOf(line) - 1]?.slice(6).trim();

                                    switch (eventType) {
                                        case 'chat-id':
                                            if (parsed.chatId && parsed.chatId !== chatId) {
                                                setChatId(parsed.chatId);
                                                localStorage.setItem('fpl_chat_id', parsed.chatId);
                                            }
                                            break;

                                        case 'session-id':
                                            if (parsed.mcpSessionId && parsed.mcpSessionId !== mcpSessionId) {
                                                setMcpSessionId(parsed.mcpSessionId);
                                                localStorage.setItem('mcp-session-id', parsed.mcpSessionId);
                                            }
                                            break;

                                        case 'text':
                                            currentContent += parsed.content;
                                            setMessages((prev) => {
                                                const newMessages = [...prev];
                                                if (newMessages[assistantMessageIndex]) {
                                                    newMessages[assistantMessageIndex] = {
                                                        ...newMessages[assistantMessageIndex],
                                                        content: currentContent,
                                                        isStreaming: true,
                                                    };
                                                }
                                                return newMessages;
                                            });
                                            break;

                                        case 'tool-start':
                                            setMessages((prev) => {
                                                const newMessages = [...prev];
                                                if (newMessages[assistantMessageIndex]) {
                                                    newMessages[assistantMessageIndex] = {
                                                        ...newMessages[assistantMessageIndex],
                                                        usingTool: { name: parsed.name, status: 'pending' },
                                                    };
                                                }
                                                return newMessages;
                                            });
                                            break;

                                        case 'tool-result':
                                            setMessages((prev) => {
                                                const newMessages = [...prev];
                                                if (newMessages[assistantMessageIndex]) {
                                                    newMessages[assistantMessageIndex] = {
                                                        ...newMessages[assistantMessageIndex],
                                                        usingTool: { name: parsed.name, status: 'complete' },
                                                    };
                                                }
                                                return newMessages;
                                            });
                                            break;

                                        case 'error':
                                            setError(parsed.error || 'An error occurred');
                                            setIsProcessing(false);
                                            return;

                                        case 'done':
                                            setMessages((prev) => {
                                                const newMessages = [...prev];
                                                if (newMessages[assistantMessageIndex]) {
                                                    newMessages[assistantMessageIndex] = {
                                                        ...newMessages[assistantMessageIndex],
                                                        isStreaming: false,
                                                    };
                                                }
                                                return newMessages;
                                            });
                                            setIsProcessing(false);
                                            return;
                                    }
                                } catch (error) {
                                    console.error('Error parsing SSE data:', error);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error('Stream reading error:', error);
                    setError('Connection lost. Please try again.');
                    setIsProcessing(false);
                }
            };

            await processStream();

        } catch (error) {
            console.error('Error handling message:', error);
            setError('Failed to process your message. Please try again.');
            setIsProcessing(false);
            
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: 'Sorry, there was an error processing your request. Please try again.',
                },
            ]);
        }
    };

    return (
        <div className="flex flex-col h-[600px] w-full max-w-3xl mx-auto rounded-lg border bg-background shadow-sm">
            {/* Header */}
            <div className="p-4 border-b flex justify-between items-center">
                <div>
                    <h2 className="font-semibold text-lg">FPL Chat Assistant</h2>
                    <p className="text-sm text-muted-foreground">
                        Ask me anything about Fantasy Premier League!
                    </p>
                </div>
                <div className="flex gap-2">
                    {/* Streaming toggle */}
                    <Button
                        onClick={handleToggleStreaming}
                        variant="outline"
                        size="sm"
                        disabled={isProcessing}
                        className="text-xs"
                    >
                        {enableStreaming ? 'Streaming On' : 'Streaming Off'}
                    </Button>
                    {chatId && messages.length > 0 && (
                        <Button
                            onClick={handleNewChat}
                            variant="outline"
                            size="sm"
                            disabled={isProcessing}
                            className="text-xs"
                        >
                            <PlusCircle className="h-3 w-3 mr-1" />
                            New Chat
                        </Button>
                    )}
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="mx-4 mt-4 p-3 bg-destructive/15 text-destructive text-sm rounded-md flex items-center justify-between">
                    <span>{error}</span>
                    <button
                        onClick={() => setError(null)}
                        className="text-destructive hover:text-destructive/80"
                    >
                        ×
                    </button>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && !isInitializing && (
                    <div className="text-center space-y-6 mt-8">
                        <p className="text-muted-foreground">
                            Welcome! I can help you with Fantasy Premier League questions.
                        </p>
                        <div className="grid gap-2 max-w-md mx-auto">
                            <p className="text-sm text-muted-foreground mb-2">
                                Try asking something like:
                            </p>
                            {SAMPLE_QUESTIONS.slice(0, 3).map((question, index) => (
                                <Card
                                    key={index}
                                    className="p-3 cursor-pointer hover:bg-accent transition-colors"
                                    onClick={() => handleSubmit(new Event('submit') as any, question)}
                                >
                                    <p className="text-sm">{question}</p>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((message, index) => (
                    <div
                        key={index}
                        className={`flex ${
                            message.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                    >
                        <div
                            className={`relative max-w-[85%] px-4 py-2 rounded-lg ${
                                message.role === 'user'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted'
                            }`}
                        >
                            {/* Tool usage indicator */}
                            {message.usingTool && (
                                <div className="mb-2">
                                    <Badge
                                        variant={
                                            message.usingTool.status === 'complete'
                                                ? 'default'
                                                : message.usingTool.status === 'error'
                                                ? 'destructive'
                                                : 'secondary'
                                        }
                                        className="text-xs"
                                    >
                                        {message.usingTool.status === 'pending' && (
                                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                        )}
                                        Using: {message.usingTool.name}
                                    </Badge>
                                </div>
                            )}
                            
                            <div className="whitespace-pre-wrap break-words">
                                {message.content}
                                {message.isStreaming && (
                                    <span className="inline-block w-1 h-4 ml-1 bg-current animate-pulse" />
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {isInitializing && (
                    <div className="flex justify-center">
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Initializing FPL data connection...</span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-4 border-t">
                <div className="flex gap-2 relative">
                    {/* Sample questions dropdown */}
                    <select
                        className="absolute -top-8 right-0 text-xs text-muted-foreground bg-background border rounded px-2 py-1"
                        onChange={(e) => {
                            if (e.target.value) {
                                handleSubmit(new Event('submit') as any, e.target.value);
                                e.target.value = '';
                            }
                        }}
                        disabled={isProcessing || isInitializing}
                    >
                        <option value="">Quick questions...</option>
                        {SAMPLE_QUESTIONS.map((q, i) => (
                            <option key={i} value={q}>
                                {q.length > 30 ? q.substring(0, 30) + '...' : q}
                            </option>
                        ))}
                    </select>

                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about FPL players, teams, fixtures..."
                        className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        disabled={isProcessing || isInitializing}
                    />
                    <Button
                        type="submit"
                        disabled={isProcessing || !input.trim() || isInitializing}
                    >
                        {isProcessing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                    </Button>
                </div>
            </form>
        </div>
    );
}