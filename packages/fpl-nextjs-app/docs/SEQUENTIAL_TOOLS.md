# Sequential Tool Execution

## Overview

The Sequential Tool Execution feature provides better support for complex multi-tool operations where Claude needs to chain multiple tools together based on the results of previous operations.

## Features

- **Tool Pipeline Management**: Execute tools in a specific order with dependency tracking
- **Real-time Progress Updates**: See the status of each tool as it executes
- **Error Recovery**: Graceful handling of tool failures with retry logic
- **Dependency Resolution**: Automatically determines which tools can run in parallel vs sequentially
- **Loop Prevention**: Built-in phase limits to prevent infinite tool loops

## How to Enable

Set the environment variable:

```bash
USE_SEQUENTIAL_TOOLS=true
```

## Architecture

### ToolPipeline

Manages the execution queue and tracks tool state:
- Pending, executing, completed, or error states
- Dependency tracking between tools
- Metrics collection

### ToolCoordinator

Orchestrates the interaction between Claude and the tool pipeline:
- Processes Claude's tool requests
- Manages execution phases
- Handles context between tool calls

## Example Flow

1. User asks a complex question requiring multiple tools
2. Claude determines the initial set of tools needed
3. Tools are added to the pipeline with dependencies
4. Pipeline executes tools in order, respecting dependencies
5. Results are passed back to Claude for next steps
6. Process repeats until Claude has all needed information
7. Final response is generated with complete context

## Benefits

- Better handling of complex queries
- More efficient tool usage
- Clear visibility into execution flow
- Improved error handling
- Prevents stuck loops

## Fallback

If the feature flag is disabled, the system falls back to the original recursive tool execution method for backward compatibility.