'use client';

import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { transitions } from './animations/transitions';
import type { MessageInputBarProps } from '@/lib/types/fpl-types';

export function MessageInputBar({
  onSubmit,
  isLoading = false,
  placeholder = "Send a message...",
}: MessageInputBarProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isLoading) return;
    onSubmit(message);
    setMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [message]);

  return (
    <motion.div
      variants={transitions.inputBar}
      initial="initial"
      animate="animate"
      className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border p-4 z-30"
    >
      <form onSubmit={handleSubmit} className="relative max-w-3xl mx-auto">
        <div className="bg-muted rounded-2xl border border-border focus-within:border-primary/50 transition-colors">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full bg-transparent text-foreground placeholder:text-muted-foreground p-4 pr-14 resize-none outline-none text-sm min-h-[52px] max-h-[200px]"
            rows={1}
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!message.trim() || isLoading}
            className="absolute right-2 bottom-2"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </motion.div>
  );
}