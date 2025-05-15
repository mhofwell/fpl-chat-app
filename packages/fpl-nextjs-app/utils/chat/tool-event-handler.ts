export interface ToolExecutionEvent {
    name: string;
    displayName?: string;
    status: 'pending' | 'executing' | 'complete' | 'error';
    message?: string;
    executionTime?: number;
    error?: string;
    id?: string;
}

export interface ToolEventHandlerOptions {
    onToolStart: (event: ToolExecutionEvent) => void;
    onToolUpdate: (event: ToolExecutionEvent) => void;
    onToolComplete: (event: ToolExecutionEvent) => void;
    onToolError: (event: ToolExecutionEvent) => void;
}

export class ToolEventHandler {
    private options: ToolEventHandlerOptions;
    private activeTools: Map<string, ToolExecutionEvent> = new Map();

    constructor(options: ToolEventHandlerOptions) {
        this.options = options;
    }

    handleToolEvent(eventType: string, data: any): void {
        switch (eventType) {
            case 'tool-start':
                this.handleToolStart(data);
                break;
            case 'tool-processing':
                this.handleToolProcessing(data);
                break;
            case 'tool-result':
                this.handleToolResult(data);
                break;
            case 'tool-error':
                this.handleToolError(data);
                break;
        }
    }

    private handleToolStart(data: any): void {
        const event: ToolExecutionEvent = {
            name: data.name,
            displayName: data.displayName,
            status: 'pending',
            message: data.message || `Starting ${data.displayName || data.name}...`,
            id: data.id,
        };
        
        this.activeTools.set(data.name, event);
        this.options.onToolStart(event);
    }

    private handleToolProcessing(data: any): void {
        const existing = this.activeTools.get(data.name);
        const event: ToolExecutionEvent = {
            ...existing,
            name: data.name,
            displayName: data.displayName,
            status: 'executing',
            message: data.message || `Executing ${data.displayName || data.name}...`,
        };
        
        this.activeTools.set(data.name, event);
        this.options.onToolUpdate(event);
    }

    private handleToolResult(data: any): void {
        const existing = this.activeTools.get(data.name);
        const event: ToolExecutionEvent = {
            ...existing,
            name: data.name,
            displayName: data.displayName,
            status: 'complete',
            message: data.message || `${data.displayName || data.name} completed`,
            executionTime: data.executionTime,
        };
        
        this.activeTools.delete(data.name);
        this.options.onToolComplete(event);
    }

    private handleToolError(data: any): void {
        const existing = this.activeTools.get(data.name);
        const event: ToolExecutionEvent = {
            ...existing,
            name: data.name,
            displayName: data.displayName,
            status: 'error',
            error: data.error,
            message: data.message || `${data.displayName || data.name} failed`,
            executionTime: data.executionTime,
        };
        
        this.activeTools.delete(data.name);
        this.options.onToolError(event);
    }

    reset(): void {
        this.activeTools.clear();
    }

    getActiveTools(): ToolExecutionEvent[] {
        return Array.from(this.activeTools.values());
    }
}