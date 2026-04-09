'use client';

import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { transitions } from './animations/transitions';

interface ComposingViewProps {
    onSubmit: (message: string) => void;
    isLoading?: boolean;
    title?: string;
    subtitle?: string;
    textAreaPlaceholder?: string;
    sampleQuestions?: string[];
}

export function ComposingView({
    onSubmit,
    isLoading = false,
    title = "Let's make some picks",
    // subtitle = "How can I help this season?",
    textAreaPlaceholder = 'How can I help this season?',
    sampleQuestions = [],
}: ComposingViewProps) {
    const [message, setMessage] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim() || isLoading) return;
        onSubmit(message);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleSampleClick = (question: string) => {
        setMessage(question);
        textareaRef.current?.focus();
    };

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height =
                textareaRef.current.scrollHeight + 'px';
        }
    }, [message]);

    return (
        <motion.div
            variants={transitions.composingView}
            initial="initial"
            exit="exit"
            className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 px-4"
        >
            <div className="text-center space-y-2">
                <h1 className="text-5xl font-bold font-header">
                    {title} <span className="text-2xl">⚽️</span>
                </h1>
                {/* <p className="text-muted-foreground">{subtitle}</p> */}
            </div>

            <form onSubmit={handleSubmit} className="w-full max-w-2xl">
                <div className="bg-muted rounded-2xl border border-border focus-within:border-primary/50 transition-colors">
                    <textarea
                        ref={textareaRef}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={textAreaPlaceholder}
                        className="w-full bg-transparent text-foreground placeholder:text-muted-foreground p-6 pr-20 resize-none outline-none text-base"
                        rows={1}
                        disabled={isLoading}
                        autoFocus
                    />
                    <div className="flex justify-end p-3 pt-0">
                        <Button
                            type="submit"
                            size="icon"
                            disabled={!message.trim() || isLoading}
                            className="rounded-xl"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </form>

            {sampleQuestions.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full max-w-2xl">
                    {sampleQuestions.map((question, index) => (
                        <button
                            key={index}
                            onClick={() => handleSampleClick(question)}
                            className="text-left p-3 rounded-lg border-2 border-primary/20 bg-surface hover:border-secondary hover:shadow-md hover:shadow-secondary/20 transition-all duration-200 text-sm"
                        >
                            {question}
                        </button>
                    ))}
                </div>
            )}

            {/* add in the Powered by Claude */}
            <div className="text-center text-xs text-muted-foreground">
                <p>Powered by Claude</p>
            </div>
        </motion.div>
    );
}
