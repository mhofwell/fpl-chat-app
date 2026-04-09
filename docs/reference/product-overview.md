# Fantasy Premiere League Assistant

## Overview

We're building an application that will act as a Fantasy Premiere League assistant for users who want to do two things: 

1. Ask questions about anything related to the English Premeire League
2. Get assistance on decisions related to Fantasy Premiere League. 

We will start with a simple MVP the goal is to prove out the MCP server works really well. 

## FPL API Schema

Location: /project/fpl-api-schema.md 

Description: The exact schema of the Fantasy Premiere League API. 

## Technology

### Client App
Next.js 

### Model Context Protocol (MCP) Server
We will use a Model Context Protocol (MCP) Typescript server to establish resources and tools to access Premiere League data. 

### MCP MVP Requirements: 

- Written in Typescript
- The server will send messages via SSE with StreamableHTTP. 
- We will create resources for tools to call that hold static data from the FPL API to reduce API calls. 
- We will develop a comprehensive suite of tools to handle various cases: 

### Tools: 

MVP Player tools: 

get_player_current_season_stats
- All season data from bootstrap-static related to that player ID. (bootstrap-static elements array)
- Perfect for "how many points does Salah have?" "How many red cards did he get so far?" 

get_player_current_season_history
- Match-by-match performance (element-summary.history) 
- Perfect for "how did Salah perform last 5 games?" "How many goals did he score last match day?"

get_player_upcoming_fixtures
- Upcoming fixtures (element-summary.fixtures)
- Perfect for "who does Salah play next?"

get_player_past_season_history
- Historical season summaries (element-summary.history_past)
  - Perfect for "how did Salah do last season?"

### Resources

Strategy: Our resources will act as a static source of data for our tools. 

MVP Player Resources: 

  1. fpl_bootstrap
    - Endpoint: /bootstrap-static/
    - Contains: teams, events, elements, element_types
    - Used by: fpl_player_stats
  2. fpl_player_detail/{player_id}
    - Endpoint: /element-summary/{player_id}/
    - Contains: fixtures, history, history_past
    - Used by: fpl_player_history, fpl_player_fixtures, fpl_player_seasons

  Simple and clear:
  - fpl_bootstrap - everyone knows this is the main FPL data
  - fpl_player_detail/{player_id} - clearly player-specific detailed data

  - get_player_current_season_stats → bootstrap_static → filter elements array by player ID
  - get_player_current_season_history → player_element_summary/{id} → return history array
  - get_player_upcoming_fixtures → player_element_summary/{id} → return fixtures array
  - get_player_past_season_history → player_element_summary/{id} → return history_past array

  The key insight: Don't over-engineer the resource layer. Just cache the raw FPL API responses and do the data processing in the tools.

### Simple In-Memory Cache Implementation for Node

  - Store memory cache in Node.js memory with TTL
  - Lost on restart but rebuilds quickly
  - Good for development, might work for production with low traffic

  ***EXAMPLE***

    // Simple in-memory cache
  const cache = new Map();

  async function getCachedData(key, fetcher, ttlSeconds) {
    const cached = cache.get(key);

    // Check if exists and not expired
    if (cached && Date.now() < cached.expires) {
      return cached.data;
    }

    // Cache miss - fetch fresh data
    const freshData = await fetcher();

    // Store with expiration
    cache.set(key, {
      data: freshData,
      expires: Date.now() + (ttlSeconds * 1000)
    });

    return freshData;
  }

  // Usage in tools
  const bootstrap = await getCachedData(
    'fpl_bootstrap',
    () => fetch('/bootstrap-static/'),
    24 * 60 * 60 // 24 hours
  );

  const playerDetail = await getCachedData(
    `fpl_player_detail:${playerId}`,
    () => fetch(`/element-summary/${playerId}/`),
    4 * 60 * 60 // 4 hours  
  );

# MVP Phase 1: 

***Simpler is better***

Next.js Client: 
- Create a Next.js client
- Create a Claude client. 

Example: 

export async function initializeMcpSession(retryCount = 3): Promise<string | undefined> {
    // Get MCP server URL with fallback
    const MCP_SERVER_URL = process.env.EXPRESS_MCP_SERVER_PRIVATE || 
        (process.env.RAILWAY_ENVIRONMENT_NAME ? 'http://fpl-mcp-server.railway.internal:8080' : 'http://localhost:3001');

    console.log(`EXPRESS_MCP_SERVER_PRIVATE env var: "${process.env.EXPRESS_MCP_SERVER_PRIVATE}"`);
    console.log(`Using MCP Server URL: "${MCP_SERVER_URL}"`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Railway Environment: ${process.env.RAILWAY_ENVIRONMENT_NAME}`);

    for (let attempt = 1; attempt <= retryCount; attempt++) {
        try {
            console.log(`Initializing MCP session (attempt ${attempt}/${retryCount})`);
            
            // Test if we can reach the MCP server
            try {
                const healthUrl = buildMcpUrl(MCP_SERVER_URL, 'health');
                console.log(`Health check URL: ${healthUrl}`);
                
                const healthCheck = await fetch(healthUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                
                console.log(`Health check response: ${healthCheck.status}`);
                
                if (!healthCheck.ok) {
                    console.error(`MCP server health check failed: ${healthCheck.status}`);
                    throw new Error(`MCP server not healthy: ${healthCheck.status}`);
                }
            } catch (healthError) {
                console.error('Failed to reach MCP server health check:', healthError);
                throw new Error(`MCP server unreachable at ${MCP_SERVER_URL}: ${healthError instanceof Error ? healthError.message : String(healthError)}`);
            }
            
            // Send a compliant MCP initialize request
            const mcpEndpoint = buildMcpUrl(MCP_SERVER_URL, 'mcp');
            console.log(`Building MCP endpoint from URL: "${MCP_SERVER_URL}" with path "mcp"`);
            console.log(`Result MCP endpoint: "${mcpEndpoint}"`);
            console.log(`Attempting to connect to MCP endpoint: ${mcpEndpoint}`);
            
            const response = await fetch(mcpEndpoint, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/event-stream'
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'initialize',
                    params: {
                        protocolVersion: '0.1.0',
                        capabilities: {
                            experimental: {},
                            sampling: {},
                        },
                        clientInfo: {
                            name: 'fpl-nextjs-app',
                            version: '1.0.0',
                        },
                    },
                    id: 1,
                }),
            });

            console.log(`Initialize response status: ${response.status}`);
            console.log(`Initialize response headers:`, Object.fromEntries(response.headers.entries()));

            // Get the session ID from response headers
            const sessionId = response.headers.get('mcp-session-id');

            if (!sessionId) {
                console.error(
                    `Failed to initialize MCP session (attempt ${attempt}/${retryCount}): No session ID returned`
                );
                
                // Check if the response has a JSON error
                try {
                    const errorResponse = await response.text();
                    console.error('Error response:', errorResponse);
                } catch (parseError) {
                    // Ignore parse errors
                }
                
                // Only retry if we haven't reached max attempts
                if (attempt < retryCount) {
                    // Wait a bit before retrying (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt - 1)));
                    continue;
                }
                
                return undefined;
            }

            console.log(`MCP session initialized: ${sessionId}`);
            return sessionId;
        } catch (error) {
            console.error(`Error initializing MCP session (attempt ${attempt}/${retryCount}):`, error);
            console.error(`Error details:`, {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                cause: error instanceof Error ? error.cause : undefined
            });
            
            // Only retry if we haven't reached max attempts
            if (attempt < retryCount) {
                // Wait a bit before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt - 1)));
                continue;
            }
        }
    }
    
    console.error(`Failed to initialize MCP session after ${retryCount} attempts`);
    return undefined;
}


MCP Server
- Create in /apps folder
- A Model Context Protocol Typescript server.
- Use SSE and StreamableHTTP
- Successfully create and preserve sessions. 
- Sessions are set-up and work. 
- Successful request -> response from next-client to fpl-mcp-server
- Test and ensure it responds adequitley to all questions from the client.

# MVP Phase 2: 

Next.js Client
- Simple system prompt. 

MCP Server: 
- Tools for Claude
- Resources for Claue

Packages: 
- Any FPL API helpers necesssary. 