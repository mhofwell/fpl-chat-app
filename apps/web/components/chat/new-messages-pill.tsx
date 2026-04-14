'use client';

import { motion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NewMessagesPillProps {
    onClick: () => void;
    className?: string;
}

/**
 * Pill shown when the user has scrolled up from the bottom and new
 * assistant messages are arriving. Clicking jumps back to the bottom.
 */
export function NewMessagesPill({ onClick, className }: NewMessagesPillProps) {
    return (
        <motion.button
            type="button"
            onClick={onClick}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={cn(
                'absolute bottom-28 left-1/2 -translate-x-1/2 z-10',
                'flex items-center gap-1.5 rounded-full px-4 py-2',
                'bg-secondary text-secondary-foreground shadow-md',
                'hover:bg-secondary/90 transition-colors',
                'text-sm font-medium',
                className
            )}
        >
            <ArrowDown className="h-3.5 w-3.5" />
            New messages
        </motion.button>
    );
}
