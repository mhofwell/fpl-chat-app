// utils/claude/session-manager-redis.ts

import { MCP_CONFIG } from '../../config/ai-config'
import redis from '../../lib/redis/redis-client'

interface SessionInfo {
  sessionId: string
  createdAt: number
  lastUsed: number
  isValid: boolean
}

const SESSION_PREFIX = 'mcp:session:'
const SESSION_INDEX_KEY = 'mcp:sessions:index'

/**
 * Initialize a new MCP session with Redis persistence
 */
export async function initializeMcpSession(forceNew = false): Promise<string | undefined> {
  const MCP_SERVER_URL = MCP_CONFIG.SERVER_URL
  const maxRetries = MCP_CONFIG.SESSION_RETRY_COUNT
  const baseRetryDelay = MCP_CONFIG.SESSION_RETRY_BACKOFF_MS

  // Check for valid existing sessions if not forcing new
  if (!forceNew) {
    const existingSession = await getValidSession()
    if (existingSession) {
      return existingSession
    }
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Initializing MCP session (attempt ${attempt}/${maxRetries})`)
      
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
      })

      const sessionId = response.headers.get('mcp-session-id')

      if (!sessionId) {
        console.error(`Failed to initialize MCP session: No session ID returned`)
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, baseRetryDelay * Math.pow(2, attempt - 1)))
          continue
        }
        
        return undefined
      }

      // Store the new session in Redis
      await cacheSession(sessionId)
      
      console.log(`MCP session initialized: ${sessionId}`)
      return sessionId
    } catch (error) {
      console.error(`Error initializing MCP session (attempt ${attempt}/${maxRetries}):`, error)
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, baseRetryDelay * Math.pow(2, attempt - 1)))
        continue
      }
    }
  }
  
  console.error(`Failed to initialize MCP session after ${maxRetries} attempts`)
  return undefined
}

/**
 * Validate an existing session with a heartbeat
 */
export async function validateMcpSession(sessionId: string): Promise<boolean> {
  const MCP_SERVER_URL = MCP_CONFIG.SERVER_URL
  const key = `${SESSION_PREFIX}${sessionId}`
  
  try {
    // Check if session exists in Redis first
    const sessionData = await redis.hgetall(key)
    if (!sessionData || sessionData.isValid === 'false') {
      return false
    }
    
    // Ping to check if the session is still valid
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
    })
    
    const isValid = response.ok
    
    // Update the session in Redis
    const multi = redis.multi()
    multi.hset(key, 'isValid', isValid.toString())
    multi.hset(key, 'lastUsed', Date.now().toString())
    
    if (isValid) {
      multi.expire(key, Math.floor(MCP_CONFIG.SESSION_TOKEN_EXPIRATION_MS / 1000))
    }
    
    await multi.exec()
    
    return isValid
  } catch (error) {
    console.error(`Error validating MCP session ${sessionId}:`, error)
    
    // Mark as invalid in Redis
    await redis.hset(key, 'isValid', 'false')
    
    return false
  }
}

/**
 * Get a valid session from Redis or create a new one
 */
export async function getOrCreateValidSession(
  existingSessionId?: string
): Promise<string | undefined> {
  // Try to validate the existing session if provided
  if (existingSessionId) {
    const isValid = await validateMcpSession(existingSessionId)
    if (isValid) {
      await updateSessionLastUsed(existingSessionId)
      return existingSessionId
    }
  }
  
  // Get a valid session from Redis
  const cachedSession = await getValidSession()
  if (cachedSession) {
    return cachedSession
  }
  
  // Create a new session if needed
  return await initializeMcpSession(true)
}

/**
 * Store a session in Redis
 */
async function cacheSession(sessionId: string): Promise<void> {
  const now = Date.now()
  const key = `${SESSION_PREFIX}${sessionId}`
  const ttlSeconds = Math.floor(MCP_CONFIG.SESSION_TOKEN_EXPIRATION_MS / 1000)
  
  const multi = redis.multi()
  
  // Store session data
  multi.hset(key, 'sessionId', sessionId)
  multi.hset(key, 'createdAt', now.toString())
  multi.hset(key, 'lastUsed', now.toString())
  multi.hset(key, 'isValid', 'true')
  
  // Add to session index
  multi.sadd(SESSION_INDEX_KEY, sessionId)
  
  // Set expiration
  multi.expire(key, ttlSeconds)
  
  await multi.exec()
}

/**
 * Get a valid session from Redis
 */
async function getValidSession(): Promise<string | undefined> {
  try {
    // Get all session IDs from the index
    const sessionIds = await redis.smembers(SESSION_INDEX_KEY)
    
    for (const sessionId of sessionIds) {
      const key = `${SESSION_PREFIX}${sessionId}`
      const sessionData = await redis.hgetall(key)
      
      if (sessionData && sessionData.isValid === 'true') {
        const lastUsed = parseInt(sessionData.lastUsed)
        const now = Date.now()
        
        // Check if session is not expired
        if (now - lastUsed < MCP_CONFIG.SESSION_TOKEN_EXPIRATION_MS) {
          return sessionId
        }
      }
      
      // Remove expired session from index
      await redis.srem(SESSION_INDEX_KEY, sessionId)
    }
    
    return undefined
  } catch (error) {
    console.error('Error getting valid session:', error)
    return undefined
  }
}

/**
 * Update the last used timestamp for a session
 */
async function updateSessionLastUsed(sessionId: string): Promise<void> {
  const key = `${SESSION_PREFIX}${sessionId}`
  
  try {
    const multi = redis.multi()
    multi.hset(key, 'lastUsed', Date.now().toString())
    multi.expire(key, Math.floor(MCP_CONFIG.SESSION_TOKEN_EXPIRATION_MS / 1000))
    await multi.exec()
  } catch (error) {
    console.error('Error updating session last used:', error)
  }
}

/**
 * Get session info
 */
export async function getSessionInfo(sessionId: string): Promise<SessionInfo | null> {
  const key = `${SESSION_PREFIX}${sessionId}`
  
  try {
    const data = await redis.hgetall(key)
    if (!data || !data.sessionId) {
      return null
    }
    
    return {
      sessionId: data.sessionId,
      createdAt: parseInt(data.createdAt),
      lastUsed: parseInt(data.lastUsed),
      isValid: data.isValid === 'true',
    }
  } catch (error) {
    console.error('Error getting session info:', error)
    return null
  }
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  try {
    const sessionIds = await redis.smembers(SESSION_INDEX_KEY)
    let cleaned = 0
    
    for (const sessionId of sessionIds) {
      const key = `${SESSION_PREFIX}${sessionId}`
      const exists = await redis.exists(key)
      
      if (!exists) {
        // Remove from index if key doesn't exist
        await redis.srem(SESSION_INDEX_KEY, sessionId)
        cleaned++
      }
    }
    
    return cleaned
  } catch (error) {
    console.error('Error cleaning up sessions:', error)
    return 0
  }
}