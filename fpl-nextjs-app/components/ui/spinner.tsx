'use client';

import * as React from 'react';
import { Loader } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
    size?: 'sm' | 'md' | 'lg';
}

export function Spinner({ size = 'md', className, ...props }: SpinnerProps) {
    const sizeMap = {
        sm: 'h-4 w-4',
        md: 'h-6 w-6',
        lg: 'h-8 w-8',
    };

    return (
        <div className={cn('animate-spin', className)} {...props}>
            <Loader className={cn(sizeMap[size], 'text-primary')} />
        </div>
    );
}
