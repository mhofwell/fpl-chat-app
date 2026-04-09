# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Fantasy Premier League (FPL) chat application built as a Turborepo monorepo with the following structure:

- **apps/next-client**: Next.js client application with Supabase authentication
- **apps/fpl-mcp-server**: MCP (Model Context Protocol) server using Bun runtime  
- **packages/redis**: Shared Redis client package using ioredis
- **types**: Shared TypeScript types across the workspace

## Development Commands

### Root Level (Turborepo)
```bash
# Install dependencies (uses Bun as package manager)
bun install

# Run all apps in development
bun run dev

# Build all apps  
bun run build

# Start all apps
bun run start

# Run linting (when configured)
bun run lint

# Run type checking (when configured)
bun run typecheck
```

### Next.js Client (`apps/next-client`)
```bash
cd apps/next-client

# Development
bun run dev

# Build
bun run build  

# Start production server
bun run start
```

### MCP Server (`apps/fpl-mcp-server`)
```bash
cd apps/fpl-mcp-server

# Development with watch mode
bun run dev

# Start server
bun run start

# Build for production
bun run build

# Type checking
bun run typecheck
```

## Environment Setup

### Next.js Client (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
FPL_MCP_SERVER_BASE_URL=http://localhost
FPL_MCP_SERVER_PORT=3001
```

### MCP Server (`.env`)
```
NEXT_CLIENT_BASE_URL=http://localhost
NEXT_CLIENT_PORT=3000
```

## Architecture Overview

### Application Structure
1. **Next.js Client**: 
   - Supabase authentication with SSR cookie management
   - Server actions for MCP communication
   - Chat interface components with transitions
   - Protected routes with middleware

2. **MCP Server**:
   - Express-based HTTP transport for MCP protocol
   - Session management with transport reuse
   - CORS configuration for client communication
   - Streamable HTTP responses

3. **Shared Packages**:
   - Redis client for caching (ioredis-based)
   - Common TypeScript types

### Key Technical Details

**Authentication Flow**
- Supabase Auth with cookie-based sessions
- Middleware protection for `/protected` routes
- Server-side client creation with cookies

**MCP Integration**
- Server actions for MCP session initialization
- Tool calling with session persistence
- SSE (Server-Sent Events) support for streaming

**TypeScript Configuration**
- Monorepo setup with composite projects
- Shared base configuration
- Strict mode enabled across all packages

## Project Dependencies

- **Runtime**: Bun 1.2.14 (package manager and runtime)
- **Framework**: Next.js (latest) with App Router
- **UI**: Tailwind CSS, shadcn/ui components
- **Auth**: Supabase (SSR package)
- **State**: Framer Motion for animations
- **Backend**: Express 5.x for MCP server
- **Protocol**: Model Context Protocol SDK