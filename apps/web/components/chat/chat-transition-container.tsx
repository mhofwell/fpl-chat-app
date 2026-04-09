'use client';

import { useState, useCallback, useId } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ComposingView } from './composing-view';
import { ConversationView } from './conversation-view';
import type { Message, ChatTransitionContainerProps, ChatViewState } from '@/lib/types/fpl-types';

export function ChatTransitionContainer({
  onSendMessage,
  sampleQuestions = [],
  title,
  subtitle,
  userName,
  userInitials,
}: ChatTransitionContainerProps) {
  const [viewState, setViewState] = useState<ChatViewState>('composing');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messageIdPrefix = useId();

  const handleSendMessage = useCallback(async (content: string) => {
    const userMessage: Message = {
      id: `${messageIdPrefix}-user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setViewState('conversation');
    setIsLoading(true);

    // Add assistant message placeholder
    const assistantMessage: Message = {
      id: `${messageIdPrefix}-assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      if (onSendMessage) {
        // Create a callback to handle streaming updates
        const onStreamUpdate = (text: string) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id
                ? { ...msg, content: msg.content + text }
                : msg
            )
          );
        };

        const response = await onSendMessage(content, onStreamUpdate);
        
        // Mark streaming as complete
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? { ...msg, isStreaming: false }
              : msg
          )
        );
      } else {
        // Simulate streaming response
        const mockResponse = "I'm here to help you with your Fantasy Premier League team! What would you like to know?";
        let streamedContent = '';
        
        for (let i = 0; i < mockResponse.length; i++) {
          streamedContent += mockResponse[i];
          const currentContent = streamedContent;
          
          await new Promise((resolve) => setTimeout(resolve, 30));
          
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id
                ? { ...msg, content: currentContent }
                : msg
            )
          );
        }

        // Mark streaming as complete
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? { ...msg, isStreaming: false }
              : msg
          )
        );
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessage.id
            ? { 
                ...msg, 
                content: 'Sorry, I encountered an error. Please try again.', 
                isStreaming: false 
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [messageIdPrefix, onSendMessage]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setViewState('composing');
  }, []);

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
          />
        )}
      </AnimatePresence>
    </div>
  );
}