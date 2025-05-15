import { Dispatch, SetStateAction } from 'react';

interface BatchUpdate<T> {
    setter: Dispatch<SetStateAction<T>>;
    value: T | ((prev: T) => T);
}

export class StateBatchManager {
    private pendingUpdates: Map<string, BatchUpdate<any>> = new Map();
    private batchTimer: NodeJS.Timeout | null = null;
    private batchDelay: number;

    constructor(batchDelay: number = 16) { // Default to ~60fps
        this.batchDelay = batchDelay;
    }

    /**
     * Schedule a state update to be batched with other updates
     */
    scheduleUpdate<T>(
        key: string,
        setter: Dispatch<SetStateAction<T>>,
        value: T | ((prev: T) => T)
    ): void {
        this.pendingUpdates.set(key, { setter, value });
        
        if (!this.batchTimer) {
            this.batchTimer = setTimeout(() => {
                this.flushUpdates();
            }, this.batchDelay);
        }
    }

    /**
     * Force flush all pending updates immediately
     */
    flushUpdates(): void {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        // Process all pending updates
        const updates = Array.from(this.pendingUpdates.entries());
        this.pendingUpdates.clear();

        // Apply updates using React's batching
        Promise.resolve().then(() => {
            updates.forEach(([_, update]) => {
                update.setter(update.value);
            });
        });
    }

    /**
     * Clear all pending updates without applying them
     */
    clear(): void {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        this.pendingUpdates.clear();
    }

    /**
     * Check if there are pending updates
     */
    hasPendingUpdates(): boolean {
        return this.pendingUpdates.size > 0;
    }

    /**
     * Create a batched version of a state setter
     */
    createBatchedSetter<T>(
        key: string,
        setter: Dispatch<SetStateAction<T>>
    ): Dispatch<SetStateAction<T>> {
        return (value: T | ((prev: T) => T)) => {
            this.scheduleUpdate(key, setter, value);
        };
    }
}