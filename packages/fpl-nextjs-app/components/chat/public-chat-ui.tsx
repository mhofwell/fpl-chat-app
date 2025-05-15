'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { initializeMcpSession } from '@/app/actions/mcp-tools';
import { Loader2, Send, PlusCircle, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SSEParser } from '@/utils/sse-parser';
import { ToolEventHandler, ToolEventHandlerOptions, ToolExecutionEvent } from '@/utils/chat/tool-event-handler';
import { StateBatchManager } from '@/utils/state-batch-manager';

interface ToolExecution {
    name: string;
    displayName?: string;
    status: 'pending' | 'executing' | 'complete' | 'error';
    message?: string;
    executionTime?: number;
    startedAt?: number;
}

interface Message {
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
    usingTool?: ToolExecution;
    toolExecutions?: ToolExecution[];
}

// Tool execution timeline component
const ToolExecutionTimeline: React.FC<{ executions: ToolExecution[] }> = ({ executions }) => {
    if (executions.length === 0) return null;
    
    return (
        <div className="mb-3 p-2 bg-muted/50 rounded-md">
            <div className="text-xs font-medium mb-2">Tool Executions:</div>
            <div className="space-y-1">
                {executions.map((execution, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs">
                        <div className="flex items-center">
                            {execution.status === 'pending' && (
                                <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                            )}
                            {execution.status === 'complete' && (
                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                            )}
                            {execution.status === 'error' && (
                                <XCircle className="h-3 w-3 text-red-500" />
                            )}
                        </div>
                        <span className="flex-1">
                            {execution.displayName || execution.name}
                            {execution.executionTime && (
                                <span className="ml-1 text-muted-foreground">
                                    ({(execution.executionTime / 1000).toFixed(1)}s)
                                </span>
                            )}
                        </span>
                        {execution.message && (
                            <span className="text-muted-foreground truncate max-w-[200px]">
                                {execution.message}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

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
    const [retryCount, setRetryCount] = useState(0);
    const [isRetrying, setIsRetrying] = useState(false);
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

    const handleSubmit = async (e: React.FormEvent, customMessage?: string, isRetry = false) => {
        e.preventDefault();
        const messageToSend = customMessage || input;
        if (!messageToSend.trim() || isProcessing || isInitializing) return;

        // Clear any previous errors
        setError(null);
        
        if (!isRetry) {
            // Add user message to UI immediately (only on first attempt)
            const userMessage: Message = { role: 'user', content: messageToSend };
            setMessages((prev) => [...prev, userMessage]);
            setInput('');
            setRetryCount(0);
        } else {
            setRetryCount(prev => prev + 1);
        }
        
        setIsProcessing(true);
        setIsRetrying(isRetry);
        
        // Initialize batch manager for efficient state updates
        const batchManager = new StateBatchManager(10); // 10ms batch delay for streaming
        const batchedSetMessages = batchManager.createBatchedSetter('messages', setMessages);

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
            const sseParser = new SSEParser();
            
            // Initialize tool event handler with batched updates
            const toolHandler = new ToolEventHandler({
                onToolStart: (event: ToolExecutionEvent) => {
                    batchedSetMessages((prev) => {
                        const newMessages = [...prev];
                        if (newMessages[assistantMessageIndex]) {
                            const existing = newMessages[assistantMessageIndex];
                            const executions = existing.toolExecutions || [];
                            newMessages[assistantMessageIndex] = {
                                ...existing,
                                usingTool: event,
                                toolExecutions: [...executions, event],
                            };
                        }
                        return newMessages;
                    });
                },
                onToolUpdate: (event: ToolExecutionEvent) => {
                    batchedSetMessages((prev) => {
                        const newMessages = [...prev];
                        if (newMessages[assistantMessageIndex]) {
                            const existing = newMessages[assistantMessageIndex];
                            newMessages[assistantMessageIndex] = {
                                ...existing,
                                usingTool: event,
                                toolExecutions: existing.toolExecutions?.map(e => 
                                    e.name === event.name ? event : e
                                ),
                            };
                        }
                        return newMessages;
                    });
                },
                onToolComplete: (event: ToolExecutionEvent) => {
                    batchedSetMessages((prev) => {
                        const newMessages = [...prev];
                        if (newMessages[assistantMessageIndex]) {
                            const existing = newMessages[assistantMessageIndex];
                            newMessages[assistantMessageIndex] = {
                                ...existing,
                                usingTool: event,
                                toolExecutions: existing.toolExecutions?.map(e => 
                                    e.name === event.name ? { ...event, status: 'complete' } : e
                                ),
                            };
                        }
                        return newMessages;
                    });
                },
                onToolError: (event: ToolExecutionEvent) => {
                    batchedSetMessages((prev) => {
                        const newMessages = [...prev];
                        if (newMessages[assistantMessageIndex]) {
                            const existing = newMessages[assistantMessageIndex];
                            newMessages[assistantMessageIndex] = {
                                ...existing,
                                usingTool: event,
                                toolExecutions: existing.toolExecutions?.map(e => 
                                    e.name === event.name ? { ...event, status: 'error' } : e
                                ),
                            };
                        }
                        return newMessages;
                    });
                }
            });

            // Read the stream
            const processStream = async () => {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        // Decode the chunk and parse SSE events
                        const chunk = decoder.decode(value, { stream: true });
                        const events = sseParser.parseChunk(chunk);
                        
                        for (const sseEvent of events) {
                            if (!sseEvent.data) continue;

                            try {
                                const parsed = JSON.parse(sseEvent.data);
                                const eventType = sseEvent.event === 'message' ? parsed.type || 'message' : sseEvent.event;

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
                                            batchedSetMessages((prev) => {
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
                                        case 'tool-result':
                                        case 'tool-error':
                                            toolHandler.handleToolEvent(eventType, parsed);
                                            break;

                                        case 'error':
                                            // Handle different error types gracefully
                                            const errorMessage = parsed.error || 'An error occurred';
                                            setError(errorMessage);
                                            
                                            // Show error in conversation
                                            batchedSetMessages((prev) => {
                                                const newMessages = [...prev];
                                                if (newMessages[assistantMessageIndex]) {
                                                    newMessages[assistantMessageIndex] = {
                                                        ...newMessages[assistantMessageIndex],
                                                        content: currentContent || `I encountered an error: ${errorMessage}`,
                                                        isStreaming: false,
                                                    };
                                                }
                                                return newMessages;
                                            });
                                            
                                            setIsProcessing(false);
                                            return;


                                        case 'done':
                                            batchedSetMessages((prev) => {
                                                const newMessages = [...prev];
                                                if (newMessages[assistantMessageIndex]) {
                                                    const message = newMessages[assistantMessageIndex];
                                                    newMessages[assistantMessageIndex] = {
                                                        ...message,
                                                        isStreaming: false
                                                    };
                                                }
                                                return newMessages;
                                            });
                                            batchManager.flushUpdates(); // Ensure all pending updates are applied
                                            setIsProcessing(false);
                                            return;
                                    }
                                } catch (error) {
                                    console.error('Error parsing SSE data:', error);
                                }
                            }
                        }
                    } catch (error) {
                    console.error('Stream reading error:', error);
                    
                    // Don't show error if stream was intentionally closed
                    if (!reader.closed) {
                        const streamError = error instanceof Error ? error.message : 'Unknown error';
                        
                        // Show partial response if available
                        if (currentContent) {
                            batchedSetMessages((prev) => {
                                const newMessages = [...prev];
                                if (newMessages[assistantMessageIndex]) {
                                    newMessages[assistantMessageIndex] = {
                                        ...newMessages[assistantMessageIndex],
                                        content: currentContent + '\n\n[Response interrupted]',
                                        isStreaming: false,
                                    };
                                }
                                return newMessages;
                            });
                        }
                        
                        // Check if this is a recoverable error
                        if (!isRetry && retryCount < 2 && 
                            (streamError.includes('Connection lost') || 
                             streamError.includes('Stream terminated'))) {
                            setError(`Connection lost. Reconnecting... (${retryCount + 1}/2)`);
                            setTimeout(() => {
                                handleSubmit(e, messageToSend, true);
                            }, 1500);
                        } else {
                            setError('Connection lost. Please try again.');
                        }
                    }
                    
                    setIsProcessing(false);
                } finally {
                    // Clean up parser state and flush any pending updates
                    sseParser.reset();
                    batchManager.flushUpdates();
                }
            };

            await processStream();

        } catch (error) {
            console.error('Error handling message:', error);
            const errorMessage = 'Failed to process your message.';
            
            // Determine if we should retry
            const shouldRetry = !isRetry && retryCount < 3 && 
                error instanceof Error && 
                (error.message.includes('NetworkError') || 
                 error.message.includes('TypeError: Failed to fetch') ||
                 error.message.includes('Connection refused'));
            
            if (shouldRetry) {
                setError(`${errorMessage} Retrying... (${retryCount + 1}/3)`);
                setIsProcessing(false);
                
                // Retry after a short delay
                setTimeout(() => {
                    handleSubmit(e, messageToSend, true);
                }, 1000 * (retryCount + 1));
            } else {
                setError(`${errorMessage} Please try again.`);
                setIsProcessing(false);
                
                batchedSetMessages((prev) => [
                    ...prev,
                    {
                        role: 'assistant',
                        content: `Sorry, there was an error processing your request${retryCount > 0 ? ' after ' + retryCount + ' retries' : ''}. Please try again.`,
                    },
                ]);
            }
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
                <div className="mx-4 mt-4 p-3 bg-destructive/15 text-sm rounded-md">
                    <div className="flex items-center justify-between">
                        <span className="text-destructive">{error}</span>
                        <div className="flex items-center gap-2">
                            {!isRetrying && error.includes('Please try again') && messages.length > 0 && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
                                        if (lastUserMessage) {
                                            handleSubmit(new Event('submit') as any, lastUserMessage.content);
                                        }
                                    }}
                                    disabled={isProcessing}
                                >
                                    <RefreshCw className="h-3 w-3 mr-1" />
                                    Retry
                                </Button>
                            )}
                            <button
                                onClick={() => setError(null)}
                                className="text-destructive hover:text-destructive/80"
                            >
                                ×
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Global loading state */}
                {isProcessing && messages.length > 0 && (
                    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm p-2 mb-2 rounded-md border shadow-sm">
                        <div className="flex items-center gap-2 text-sm">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            <span className="text-muted-foreground">Processing your request...</span>
                        </div>
                    </div>
                )}
                
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

                            {/* Tool execution timeline for multiple tools */}
                            {message.toolExecutions && message.toolExecutions.length > 1 && (
                                <ToolExecutionTimeline executions={message.toolExecutions} />
                            )}
                            
                            {/* Single tool usage indicator */}
                            {message.usingTool && (!message.toolExecutions || message.toolExecutions.length <= 1) && (
                                <div className="mb-2 space-y-1">
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
                                        {message.usingTool.status === 'complete' && (
                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                        )}
                                        {message.usingTool.status === 'error' && (
                                            <XCircle className="h-3 w-3 mr-1" />
                                        )}
                                        {message.usingTool.displayName || message.usingTool.name}
                                        {message.usingTool.executionTime && (
                                            <span className="ml-1 opacity-70">
                                                ({(message.usingTool.executionTime / 1000).toFixed(1)}s)
                                            </span>
                                        )}
                                    </Badge>
                                    {message.usingTool.message && (
                                        <p className="text-xs text-muted-foreground pl-2">
                                            {message.usingTool.message}
                                        </p>
                                    )}
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