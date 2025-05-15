// utils/claude/tool-pipeline.ts

/**
 * Tool pipeline manager for better sequential tool execution
 */

import { MessageParam } from '@anthropic-ai/sdk/resources';

export interface ToolCall {
  id: string;
  name: string;
  input: any;
  status: 'pending' | 'executing' | 'completed' | 'error';
  result?: any;
  error?: string;
  executionTime?: number;
  dependencies?: string[]; // IDs of tools this depends on
  metadata?: {
    displayName?: string;
    message?: string;
    retryCount?: number;
  };
}

export interface ToolPipelineState {
  tools: ToolCall[];
  context: {
    messages: MessageParam[];
    sessionId: string;
    chatId: string;
  };
  currentPhase: number;
  maxPhases: number;
  totalExecutionTime: number;
}

export class ToolPipeline {
  private state: ToolPipelineState;
  private onToolUpdate?: (tool: ToolCall) => void;
  
  constructor(
    sessionId: string,
    chatId: string,
    messages: MessageParam[] = [],
    onToolUpdate?: (tool: ToolCall) => void
  ) {
    this.state = {
      tools: [],
      context: {
        messages,
        sessionId,
        chatId
      },
      currentPhase: 0,
      maxPhases: 10, // Prevent infinite loops
      totalExecutionTime: 0
    };
    this.onToolUpdate = onToolUpdate;
  }

  /**
   * Add a tool to the pipeline
   */
  addTool(tool: Omit<ToolCall, 'id' | 'status'>): string {
    const toolCall: ToolCall = {
      ...tool,
      id: `tool_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      status: 'pending'
    };
    
    this.state.tools.push(toolCall);
    this.notifyUpdate(toolCall);
    return toolCall.id;
  }

  /**
   * Execute the next pending tool in the pipeline
   */
  async executeNext(
    executor: (tool: ToolCall) => Promise<any>
  ): Promise<ToolCall | null> {
    // Find next tool that's ready to execute
    const nextTool = this.findNextExecutableTools();
    if (!nextTool) return null;

    // Update status
    nextTool.status = 'executing';
    this.notifyUpdate(nextTool);
    
    const startTime = Date.now();
    
    try {
      // Execute the tool
      const result = await executor(nextTool);
      
      // Update tool with result
      nextTool.status = 'completed';
      nextTool.result = result;
      nextTool.executionTime = Date.now() - startTime;
      this.state.totalExecutionTime += nextTool.executionTime;
      
      this.notifyUpdate(nextTool);
      return nextTool;
      
    } catch (error) {
      // Handle execution error
      nextTool.status = 'error';
      nextTool.error = error instanceof Error ? error.message : String(error);
      nextTool.executionTime = Date.now() - startTime;
      
      this.notifyUpdate(nextTool);
      return nextTool;
    }
  }

  /**
   * Find the next tool that can be executed
   * (all dependencies are satisfied)
   */
  private findNextExecutableTools(): ToolCall | null {
    return this.state.tools.find(tool => {
      // Tool must be pending
      if (tool.status !== 'pending') return false;
      
      // All dependencies must be completed
      if (tool.dependencies?.length) {
        const allDepsCompleted = tool.dependencies.every(depId => {
          const dep = this.state.tools.find(t => t.id === depId);
          return dep && dep.status === 'completed';
        });
        if (!allDepsCompleted) return false;
      }
      
      return true;
    }) || null;
  }

  /**
   * Check if all tools are complete
   */
  isComplete(): boolean {
    return this.state.tools.every(tool => 
      tool.status === 'completed' || tool.status === 'error'
    );
  }

  /**
   * Get results of all completed tools
   */
  getResults(): Array<{ toolId: string; name: string; result: any }> {
    return this.state.tools
      .filter(tool => tool.status === 'completed')
      .map(tool => ({
        toolId: tool.id,
        name: tool.name,
        result: tool.result
      }));
  }

  /**
   * Get all errors
   */
  getErrors(): Array<{ toolId: string; name: string; error: string }> {
    return this.state.tools
      .filter(tool => tool.status === 'error')
      .map(tool => ({
        toolId: tool.id,
        name: tool.name,
        error: tool.error || 'Unknown error'
      }));
  }

  /**
   * Build context messages including tool results
   */
  buildContextMessages(): MessageParam[] {
    const messages = [...this.state.context.messages];
    
    // Add tool results as assistant messages
    this.state.tools
      .filter(tool => tool.status === 'completed' || tool.status === 'error')
      .forEach(tool => {
        if (tool.status === 'completed') {
          messages.push({
            role: 'assistant',
            content: [
              {
                type: 'tool_result',
                tool_use_id: tool.id,
                content: JSON.stringify(tool.result)
              }
            ]
          });
        } else {
          messages.push({
            role: 'assistant',
            content: [
              {
                type: 'tool_result',
                tool_use_id: tool.id,
                is_error: true,
                content: tool.error || 'Tool execution failed'
              }
            ]
          });
        }
      });
    
    return messages;
  }

  /**
   * Increment phase and check if we've hit the limit
   */
  nextPhase(): boolean {
    this.state.currentPhase++;
    return this.state.currentPhase < this.state.maxPhases;
  }

  /**
   * Get current state for debugging/monitoring
   */
  getState(): ToolPipelineState {
    return { ...this.state };
  }

  /**
   * Get pipeline metrics
   */
  getMetrics() {
    const completed = this.state.tools.filter(t => t.status === 'completed').length;
    const failed = this.state.tools.filter(t => t.status === 'error').length;
    const pending = this.state.tools.filter(t => t.status === 'pending').length;
    const executing = this.state.tools.filter(t => t.status === 'executing').length;
    
    return {
      total: this.state.tools.length,
      completed,
      failed,
      pending,
      executing,
      currentPhase: this.state.currentPhase,
      totalExecutionTime: this.state.totalExecutionTime,
      averageExecutionTime: completed > 0 
        ? this.state.totalExecutionTime / completed 
        : 0
    };
  }

  /**
   * Notify about tool updates
   */
  private notifyUpdate(tool: ToolCall) {
    if (this.onToolUpdate) {
      this.onToolUpdate(tool);
    }
  }

  /**
   * Create a visual representation of the pipeline
   */
  visualizePipeline(): string {
    let visualization = 'Tool Pipeline:\n';
    
    this.state.tools.forEach((tool, index) => {
      const statusIcon = {
        pending: '⏸',
        executing: '▶',
        completed: '✓',
        error: '✗'
      }[tool.status];
      
      visualization += `${index + 1}. [${statusIcon}] ${tool.name}`;
      
      if (tool.dependencies?.length) {
        visualization += ` (deps: ${tool.dependencies.join(', ')})`;
      }
      
      if (tool.executionTime) {
        visualization += ` [${(tool.executionTime / 1000).toFixed(1)}s]`;
      }
      
      if (tool.error) {
        visualization += ` - Error: ${tool.error}`;
      }
      
      visualization += '\n';
    });
    
    const metrics = this.getMetrics();
    visualization += `\nPhase: ${metrics.currentPhase}`;
    visualization += `\nCompleted: ${metrics.completed}/${metrics.total}`;
    visualization += `\nTotal Time: ${(metrics.totalExecutionTime / 1000).toFixed(1)}s`;
    
    return visualization;
  }
}

/**
 * Helper to plan tool execution from Claude's response
 */
export function planToolSequence(
  claudeToolCalls: any[],
  previousResults?: Map<string, any>
): ToolCall[] {
  const tools: ToolCall[] = [];
  
  claudeToolCalls.forEach((call, index) => {
    const tool: ToolCall = {
      id: call.id || `tool_${index}`,
      name: call.name,
      input: call.input,
      status: 'pending'
    };
    
    // Analyze if this tool depends on previous results
    if (previousResults && call.input) {
      const inputStr = JSON.stringify(call.input);
      const dependencies: string[] = [];
      
      // Check if input references previous tool results
      previousResults.forEach((_, toolId) => {
        if (inputStr.includes(toolId)) {
          dependencies.push(toolId);
        }
      });
      
      if (dependencies.length > 0) {
        tool.dependencies = dependencies;
      }
    }
    
    tools.push(tool);
  });
  
  return tools;
}