// utils/claude/tool-coordinator.ts

/**
 * Coordinates sequential tool execution with Claude
 */

import { Anthropic } from '@anthropic-ai/sdk';
import { MessageParam } from '@anthropic-ai/sdk/resources';
import { ToolPipeline, ToolCall } from './tool-pipeline';
import { Stream } from '@anthropic-ai/sdk/streaming';

export interface ToolCoordinatorOptions {
  anthropic: Anthropic;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  tools: any[];
  onToolUpdate?: (tool: ToolCall) => void;
  onStreamEvent?: (event: any) => void;
}

export class ToolCoordinator {
  private pipeline: ToolPipeline;
  private options: ToolCoordinatorOptions;
  private resultMap: Map<string, any> = new Map();
  
  constructor(
    sessionId: string,
    chatId: string,
    messages: MessageParam[],
    options: ToolCoordinatorOptions
  ) {
    this.pipeline = new ToolPipeline(
      sessionId,
      chatId,
      messages,
      options.onToolUpdate
    );
    this.options = options;
  }

  /**
   * Execute a complete tool sequence based on Claude's guidance
   */
  async executeSequence(
    userMessage: string,
    toolExecutor: (tool: ToolCall) => Promise<any>
  ): Promise<{
    finalResponse: string;
    toolResults: Array<{ toolId: string; name: string; result: any }>;
    errors: Array<{ toolId: string; name: string; error: string }>;
    metrics: any;
  }> {
    let finalResponse = '';
    
    // Initial Claude call to determine first set of tools
    const initialStream = await this.createClaudeStream([
      ...this.pipeline.buildContextMessages(),
      { role: 'user', content: userMessage }
    ]);
    
    // Process initial stream
    const initialTools = await this.processStream(initialStream);
    
    // Add initial tools to pipeline
    initialTools.forEach(tool => {
      this.pipeline.addTool(tool);
    });
    
    // Execute tools in phases
    while (!this.pipeline.isComplete() && this.pipeline.nextPhase()) {
      // Execute all ready tools
      while (true) {
        const tool = await this.pipeline.executeNext(toolExecutor);
        if (!tool) break;
        
        // Store result for future reference
        if (tool.status === 'completed') {
          this.resultMap.set(tool.id, tool.result);
        }
      }
      
      // Get Claude's next instructions based on results
      const contextMessages = this.pipeline.buildContextMessages();
      const followUpStream = await this.createClaudeStream(contextMessages);
      
      // Process follow-up stream
      const followUpTools = await this.processStream(followUpStream);
      
      // Add new tools to pipeline
      followUpTools.forEach(tool => {
        this.pipeline.addTool(tool);
      });
      
      // Capture final response if no more tools
      if (followUpTools.length === 0) {
        // Final response stream
        for await (const event of followUpStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text') {
            finalResponse += event.delta.text;
            this.options.onStreamEvent?.({
              type: 'text',
              content: event.delta.text
            });
          }
        }
        break;
      }
    }
    
    return {
      finalResponse,
      toolResults: this.pipeline.getResults(),
      errors: this.pipeline.getErrors(),
      metrics: this.pipeline.getMetrics()
    };
  }

  /**
   * Create a Claude stream with proper configuration
   */
  private async createClaudeStream(messages: MessageParam[]): Promise<Stream<any>> {
    return this.options.anthropic.messages.create({
      model: this.options.model,
      max_tokens: this.options.maxTokens,
      system: this.enhancedSystemPrompt(),
      messages,
      tools: this.options.tools,
      tool_choice: { type: 'auto' },
      stream: true,
    });
  }

  /**
   * Enhanced system prompt for better sequential tool use
   */
  private enhancedSystemPrompt(): string {
    return `${this.options.systemPrompt}

When using tools in sequence:
1. Plan your approach before making tool calls
2. Use the results of previous tools to inform subsequent calls
3. Handle errors gracefully and adapt your strategy
4. Provide clear context about what each tool is doing
5. Summarize results comprehensively when all tools complete

Remember:
- You can chain multiple tools together to accomplish complex tasks
- Previous tool results are available for use in subsequent calls
- Be efficient and avoid redundant tool calls
- Explain your reasoning when the sequence might not be obvious`;
  }

  /**
   * Process a Claude stream and extract tool calls
   */
  private async processStream(stream: Stream<any>): Promise<any[]> {
    const toolCalls: any[] = [];
    let currentToolCall: any = null;
    
    for await (const event of stream) {
      switch (event.type) {
        case 'content_block_start':
          if (event.content_block.type === 'tool_use') {
            currentToolCall = {
              id: event.content_block.id,
              name: event.content_block.name,
              input: {}
            };
            
            this.options.onStreamEvent?.({
              type: 'tool-start',
              id: event.content_block.id,
              name: event.content_block.name
            });
          }
          break;
          
        case 'content_block_delta':
          if (event.delta.type === 'tool_use' && currentToolCall) {
            if (event.delta.input) {
              currentToolCall.input = {
                ...currentToolCall.input,
                ...JSON.parse(event.delta.input)
              };
            }
          }
          break;
          
        case 'content_block_stop':
          if (currentToolCall) {
            toolCalls.push(currentToolCall);
            currentToolCall = null;
          }
          break;
      }
    }
    
    return toolCalls;
  }

  /**
   * Create a dependency graph for tool execution
   */
  analyzeDependencies(tools: any[]): Map<string, string[]> {
    const dependencies = new Map<string, string[]>();
    
    tools.forEach((tool, index) => {
      const toolDeps: string[] = [];
      
      // Check if this tool's input references other tool IDs
      const inputStr = JSON.stringify(tool.input);
      tools.slice(0, index).forEach((prevTool, prevIndex) => {
        if (inputStr.includes(prevTool.id) || 
            inputStr.includes(`tool_${prevIndex}`)) {
          toolDeps.push(prevTool.id);
        }
      });
      
      if (toolDeps.length > 0) {
        dependencies.set(tool.id, toolDeps);
      }
    });
    
    return dependencies;
  }

  /**
   * Get execution plan visualization
   */
  getExecutionPlan(): string {
    return this.pipeline.visualizePipeline();
  }

  /**
   * Get current state for debugging
   */
  getState() {
    return {
      pipeline: this.pipeline.getState(),
      results: Array.from(this.resultMap.entries())
    };
  }
}

/**
 * Helper function to create a simple sequential executor
 */
export async function executeSequentialTools(
  messages: MessageParam[],
  userMessage: string,
  sessionId: string,
  chatId: string,
  config: {
    anthropic: Anthropic;
    model: string;
    maxTokens: number;
    systemPrompt: string;
    tools: any[];
    toolExecutor: (name: string, input: any) => Promise<any>;
    onToolUpdate?: (tool: ToolCall) => void;
    onStreamEvent?: (event: any) => void;
  }
): Promise<any> {
  const coordinator = new ToolCoordinator(
    sessionId,
    chatId,
    messages,
    {
      ...config,
      onToolUpdate: config.onToolUpdate,
      onStreamEvent: config.onStreamEvent
    }
  );
  
  const toolExecutor = async (tool: ToolCall) => {
    return config.toolExecutor(tool.name, tool.input);
  };
  
  return coordinator.executeSequence(userMessage, toolExecutor);
}