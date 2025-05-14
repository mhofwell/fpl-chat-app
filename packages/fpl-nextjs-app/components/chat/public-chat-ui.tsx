'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { processUserMessage, processUserMessageStreaming } from '@/app/actions/chat';
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
    const [streamingMsgIndex, setStreamingMsgIndex] = useState<number | null>(null);
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
                        setError('Failed to connect to FPL data service. Please try again later.');
                    }
                } catch (error) {
                    console.error('Error initializing MCP session:', error);
                    setError('Failed to initialize session. Please refresh the page to try again.');
                } finally {
                    setIsInitializing(false);
                }
            }
        }
        
        initSession();
    }, []);

    // Toggle streaming option
    const toggleStreaming = () => {
        const newValue = !enableStreaming;
        setEnableStreaming(newValue);
        localStorage.setItem('enable_streaming', newValue.toString());
    };

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Format message content to highlight FPL data sections
    const formatMessage = (content: string) => {
        // Don't try to format empty content
        if (!content) return content;
        
        // Check if we have section headers (like PLAYER_INFO:, KEY_STATS:, etc.)
        const sections = content.split(/\n([\w_]+:)\n/g);
        
        if (sections.length > 1) {
            return sections.map((section, i) => {
                // Section headers
                if (section.match(/^[\w_]+:$/)) {
                    return <div key={i} className="font-bold mt-2 mb-1">{section}</div>;
                }
                
                // Bullet points and lists
                return <div key={i} className="whitespace-pre-wrap">{section}</div>;
            });
        }
        
        return <span className="whitespace-pre-wrap">{content}</span>;
    };

    // Handle streaming updates
    const handleStreamUpdate = (chunk: string, done: boolean, toolCall?: {name: string}) => {
        if (streamingMsgIndex === null) {
            // First chunk, create the assistant message with streaming flag
            const newIndex = messages.length;
            setStreamingMsgIndex(newIndex);
            
            setMessages(prev => [
                ...prev, 
                { 
                    role: 'assistant', 
                    content: chunk,
                    isStreaming: !done,
                    usingTool: toolCall ? { name: toolCall.name, status: 'pending' } : undefined
                }
            ]);
        } else {
            // Update the existing streaming message
            setMessages(prev => {
                const newMessages = [...prev];
                
                if (newMessages[streamingMsgIndex]) {
                    newMessages[streamingMsgIndex] = {
                        ...newMessages[streamingMsgIndex],
                        content: newMessages[streamingMsgIndex].content + chunk,
                        isStreaming: !done,
                        usingTool: toolCall 
                            ? { 
                                name: toolCall.name, 
                                status: toolCall.name ? 'complete' : newMessages[streamingMsgIndex].usingTool?.status || 'pending'
                              } 
                            : newMessages[streamingMsgIndex].usingTool
                    };
                }
                
                return newMessages;
            });
        }
        
        if (done) {
            setStreamingMsgIndex(null);
        }
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
            if (enableStreaming) {
                // Process message with streaming
                const response = await processUserMessageStreaming(
                    chatId,
                    messageToSend,
                    handleStreamUpdate,
                    mcpSessionId || undefined
                );

                if (response.chatId && response.chatId !== chatId) {
                    setChatId(response.chatId);
                    localStorage.setItem('fpl_chat_id', response.chatId);
                }
                
                if (response.mcpSessionId && response.mcpSessionId !== mcpSessionId) {
                    setMcpSessionId(response.mcpSessionId);
                    localStorage.setItem('mcp-session-id', response.mcpSessionId);
                }

                if (!response.success) {
                    setError(response.error || 'An error occurred while processing your request.');
                }
            } else {
                // Process message without streaming
                const response = await processUserMessage(
                    chatId,
                    messageToSend,
                    mcpSessionId || undefined
                );

                if (response.chatId && response.chatId !== chatId) {
                    setChatId(response.chatId);
                    localStorage.setItem('fpl_chat_id', response.chatId);
                }
                
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

                if (!response.success) {
                    setError(response.error || 'An error occurred while processing your request.');
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
            setError('An unexpected error occurred. Please try again.');
            
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: 'Sorry, there was an error processing your request. Please try again.',
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
                {/* Welcome message when no messages */}
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full space-y-4">
                        <div className="text-center max-w-md">
                            <h3 className="text-lg font-semibold mb-2">Welcome to FPL Chat Assistant</h3>
                            <p className="text-muted-foreground mb-4">
                                Get answers about players, teams, fixtures, gameweeks, and FPL strategy
                            </p>
                            
                            <div className="grid grid-cols-1 gap-2 text-left">
                                {SAMPLE_QUESTIONS.map((question, idx) => (
                                    <button
                                        key={idx}
                                        className="p-2 text-left border rounded-md hover:bg-muted/50 text-sm transition"
                                        onClick={(e) => handleSubmit(e, question)}
                                    >
                                        {question}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Chat messages */}
                {messages.map((msg, index) => (
                    <div
                        key={index}
                        className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
                    >
                        <div
                            className={`inline-block p-3 rounded-lg max-w-[85%] ${
                                msg.role === 'user'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-foreground'
                            }`}
                        >
                            {msg.role === 'assistant' && msg.usingTool && (
                                <div className="mb-2">
                                    <Badge variant="outline" className="flex items-center gap-1 mb-2">
                                        {msg.usingTool.status === 'pending' ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            <></>
                                        )}
                                        Using tool: {msg.usingTool.name}
                                    </Badge>
                                </div>
                            )}
                            
                            {/* Format the message content */}
                            {formatMessage(msg.content)}
                            
                            {/* Show loading indicator for streaming */}
                            {msg.isStreaming && (
                                <div className="mt-2">
                                    <Loader2 className="h-4 w-4 animate-spin inline ml-1" />
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Error message display */}
            {error && (
                <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-red-800 text-sm">
                    <strong>Error:</strong> {error}
                </div>
            )}

            {/* Input area */}
            <div className="p-3 border-t">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center text-xs">
                        <label htmlFor="streaming-toggle" className="flex items-center cursor-pointer">
                            <input
                                id="streaming-toggle"
                                type="checkbox"
                                checked={enableStreaming}
                                onChange={toggleStreaming}
                                className="mr-1.5"
                            />
                            Streaming mode 
                            <span className="ml-1 text-muted-foreground">(see responses in real-time)</span>
                        </label>
                    </div>
                    
                    {mcpSessionId && (
                        <div className="text-xs text-muted-foreground">
                            Session: {mcpSessionId.slice(0, 8)}...
                        </div>
                    )}
                </div>
                
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
                        size="icon"
                        aria-label="Send message"
                    >
                        {isInitializing ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : isProcessing ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <Send className="h-5 w-5" />
                        )}
                    </Button>
                </form>
            </div>
        </div>
    );
}
