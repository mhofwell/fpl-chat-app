export interface SSEEvent {
    event: string;
    data: string;
    id?: string;
    retry?: number;
}

export class SSEParser {
    private buffer = '';
    private currentEvent: Partial<SSEEvent> = {};

    /**
     * Parse a chunk of SSE data and return complete events
     */
    parseChunk(chunk: string): SSEEvent[] {
        this.buffer += chunk;
        const lines = this.buffer.split('\n');
        const events: SSEEvent[] = [];
        
        // Keep the last line in buffer if it's incomplete
        this.buffer = lines.pop() || '';
        
        for (const line of lines) {
            if (line === '') {
                // Empty line signals end of event
                if (this.currentEvent.data !== undefined) {
                    events.push({
                        event: this.currentEvent.event || 'message',
                        data: this.currentEvent.data,
                        id: this.currentEvent.id,
                        retry: this.currentEvent.retry
                    });
                }
                this.currentEvent = {};
                continue;
            }
            
            if (line.startsWith(':')) {
                // Comment line, ignore
                continue;
            }
            
            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) {
                // Line without colon, treat entire line as field name
                this.processField(line, '');
            } else {
                const field = line.substring(0, colonIndex);
                let value = line.substring(colonIndex + 1);
                // Remove leading space if present
                if (value.startsWith(' ')) {
                    value = value.substring(1);
                }
                this.processField(field, value);
            }
        }
        
        return events;
    }
    
    private processField(field: string, value: string) {
        switch (field) {
            case 'event':
                this.currentEvent.event = value;
                break;
            case 'data':
                if (this.currentEvent.data === undefined) {
                    this.currentEvent.data = value;
                } else {
                    this.currentEvent.data += '\n' + value;
                }
                break;
            case 'id':
                this.currentEvent.id = value;
                break;
            case 'retry':
                const retryValue = parseInt(value, 10);
                if (!isNaN(retryValue)) {
                    this.currentEvent.retry = retryValue;
                }
                break;
        }
    }
    
    /**
     * Reset the parser state
     */
    reset() {
        this.buffer = '';
        this.currentEvent = {};
    }
}