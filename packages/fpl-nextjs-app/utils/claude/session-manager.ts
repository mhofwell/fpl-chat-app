// app/utils/session-manager.ts

import { MCP_CONFIG } from '../../config/ai-config';

// Type definitions
type SessionInfo = {
  sessionId: string;
  createdAt: number; // timestamp
  lastUsed: number; // timestamp
  isValid: boolean;
};

// Cache to store session information
const sessionCache = new Map<string, SessionInfo>();

/**
 * Initialize a new MCP session
 */
export async function initializeMcpSession(forceNew = false): Promise<string | undefined> {
  const MCP_SERVER_URL = MCP_CONFIG.SERVER_URL;
  const maxRetries = MCP_CONFIG.SESSION_RETRY_COUNT;
  const baseRetryDelay = MCP_CONFIG.SESSION_RETRY_BACKOFF_MS;

  // Check for valid existing sessions if not forcing new
  if (!forceNew) {
    const existingSession = getValidSession();
    if (existingSession) {
      return existingSession;
    }
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Initializing MCP session (attempt ${attempt}/${maxRetries})`);
      
      // Send a compliant MCP initialize request
      const response = await fetch(`${MCP_SERVER_URL}/mcp`, {
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

      // Get the session ID from response headers
      const sessionId = response.headers.get('mcp-session-id');

      if (!sessionId) {
        console.error(
          `Failed to initialize MCP session (attempt ${attempt}/${maxRetries}): No session ID returned`
        );
        
        // Check if the response has a JSON error
        try {
          const errorResponse = await response.text();
          console.error('Error response:', errorResponse);
        } catch (parseError) {
          // Ignore parse errors
        }
        
        // Only retry if we haven't reached max attempts
        if (attempt < maxRetries) {
          // Wait a bit before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, baseRetryDelay * Math.pow(2, attempt - 1)));
          continue;
        }
        
        return undefined;
      }

      // Store the new session
      cacheSession(sessionId);
      
      console.log(`MCP session initialized: ${sessionId}`);
      return sessionId;
    } catch (error) {
      console.error(`Error initializing MCP session (attempt ${attempt}/${maxRetries}):`, error);
      
      // Only retry if we haven't reached max attempts
      if (attempt < maxRetries) {
        // Wait a bit before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, baseRetryDelay * Math.pow(2, attempt - 1)));
        continue;
      }
    }
  }
  
  console.error(`Failed to initialize MCP session after ${maxRetries} attempts`);
  return undefined;
}

/**
 * Validate an existing session with a heartbeat
 */
export async function validateMcpSession(sessionId: string): Promise<boolean> {
  const MCP_SERVER_URL = MCP_CONFIG.SERVER_URL;
  
  try {
    // Skip validation if the session is already known to be invalid
    const existingSession = sessionCache.get(sessionId);
    if (existingSession && !existingSession.isValid) {
      return false;
    }
    
    // Simple ping to check if the session is still valid
    const response = await fetch(`${MCP_SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'ping',
        params: {},
        id: Date.now(),
      }),
    });
    
    // Session is valid if response is successful
    const isValid = response.ok;
    
    // Update the session cache
    if (existingSession) {
      existingSession.isValid = isValid;
      existingSession.lastUsed = Date.now();
      sessionCache.set(sessionId, existingSession);
    }
    
    return isValid;
  } catch (error) {
    console.error(`Error validating MCP session ${sessionId}:`, error);
    
    // Mark the session as invalid in the cache
    if (sessionCache.has(sessionId)) {
      const session = sessionCache.get(sessionId)!;
      session.isValid = false;
      sessionCache.set(sessionId, session);
    }
    
    return false;
  }
}

/**
 * Get a valid session from cache or create a new one
 */
export async function getOrCreateValidSession(
  existingSessionId?: string
): Promise<string | undefined> {
  // Try to validate the existing session if provided
  if (existingSessionId) {
    const isValid = await validateMcpSession(existingSessionId);
    if (isValid) {
      // Update last used time
      updateSessionLastUsed(existingSessionId);
      return existingSessionId;
    }
  }
  
  // Get a valid session from cache
  const cachedSession = getValidSession();
  if (cachedSession) {
    return cachedSession;
  }
  
  // Create a new session if needed
  return await initializeMcpSession(true);
}

/**
 * Store a session in the cache
 */
function cacheSession(sessionId: string): void {
  const now = Date.now();
  sessionCache.set(sessionId, {
    sessionId,
    createdAt: now,
    lastUsed: now,
    isValid: true,
  });
}

/**
 * Get a valid session from the cache
 */
function getValidSession(): string | undefined {
  const now = Date.now();
  const sessionExpirationTime = MCP_CONFIG.SESSION_TOKEN_EXPIRATION_MS;
  
  // Check each session in the cache
  for (const [sessionId, session] of Array.from(sessionCache.entries())) {
    // Skip invalid sessions
    if (!session.isValid) {
      continue;
    }
    
    // Skip expired sessions
    if (now - session.lastUsed > sessionExpirationTime) {
      session.isValid = false;
      sessionCache.set(sessionId, session);
      continue;
    }
    
    // Return the first valid session
    return sessionId;
  }
  
  return undefined;
}

/**
 * Update the last used timestamp for a session
 */
function updateSessionLastUsed(sessionId: string): void {
  const session = sessionCache.get(sessionId);
  if (session) {
    session.lastUsed = Date.now();
    sessionCache.set(sessionId, session);
  }
}

/**
 * Clean up expired sessions from the cache
 */
export function cleanupExpiredSessions(): void {
  const now = Date.now();
  const sessionExpirationTime = MCP_CONFIG.SESSION_TOKEN_EXPIRATION_MS;
  
  for (const [sessionId, session] of Array.from(sessionCache.entries())) {
    // Remove invalid or expired sessions
    if (!session.isValid || now - session.lastUsed > sessionExpirationTime) {
      sessionCache.delete(sessionId);
    }
  }
}

// Set up a periodic cleanup of expired sessions (every 5 minutes)
if (typeof window !== 'undefined') {
  setInterval(cleanupExpiredSessions, 5 * 60 * 1000);
}