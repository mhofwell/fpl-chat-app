'use client';

import { useEffect, useState } from 'react';
import { initializeMcpSession } from '@/app/actions/mcp';
import { ChatTransitionContainer } from '@/components/chat/chat-transition-container';
import { withRetry } from '@/lib/retry';

const SAMPLE_QUESTIONS = [
    "Who is the top scorer in the Premier League this season?",
    "Tell me about Manchester City's upcoming fixtures",
    "How is Erling Haaland performing in the last few gameweeks?",
    "Which defenders have the most clean sheets?",
];

export default function HomePage() {
    const [sessionId, setSessionId] = useState<string | null>(null);

    useEffect(() => {
        // Initialize MCP session on page load
        initializeMcpSession().then((id) => {
            if (id) {
                setSessionId(id);
                console.log('MCP session initialized:', id);
            }
        });
    }, []);

    const handleSendMessage = async (message: string, onStreamUpdate?: (text: string) => void) => {
        console.log('Sending message to Claude:', message);
        
        
        const makeRequest = async () => {
            const response = await fetch('/api/chat/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message }),
            });
            
            if (!response.ok) {
                throw new Error('Failed to send message');
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body');
            }

            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        
                        if (data === '[DONE]') {
                            return;
                        }

                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.text && onStreamUpdate) {
                                onStreamUpdate(parsed.text);
                            }
                            if (parsed.userMessage) {
                                // This is an error response from our API
                                const error = new Error(parsed.userMessage);
                                (error as any).retryable = parsed.retryable;
                                (error as any).errorType = parsed.type;
                                
                                if (parsed.retryable) {
                                    throw error;
                                } else {
                                    // Non-retryable error, throw immediately
                                    throw error;
                                }
                            }
                        } catch (e) {
                            if (e instanceof Error && e.message !== data) {
                                throw e; // Re-throw actual errors
                            }
                            console.error('Error parsing stream data:', e);
                        }
                    }
                }
            }
        };

        try {
            await withRetry(makeRequest, {
                maxRetries: 3,
                initialDelay: 1000,
                shouldRetry: (error) => {
                    // Only retry if the error is marked as retryable
                    return (error as any).retryable === true;
                }
            });
        } catch (error) {
            console.error('Failed to get response from Claude after retries:', error);
            throw error;
        }
    };

    return (
        <div className="w-full h-full">
            <ChatTransitionContainer
                onSendMessage={handleSendMessage}
                sampleQuestions={SAMPLE_QUESTIONS}
                title="Let's make some picks"
                subtitle="How can I help this season?"
                userName="MH"
                userInitials="MH"
            />
        </div>
    );
}
