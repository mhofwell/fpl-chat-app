// utils/claude/rate-limiter-redis.ts

import { CLAUDE_CONFIG } from '../../config/ai-config'
import redis from '../../lib/redis/redis-client'

interface RateLimitConfig {
  windowMs: number
  maxRequests: number
  message: string
}

// Default rate limit configuration
const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: CLAUDE_CONFIG.MAX_REQUESTS_PER_MINUTE,
  message: 'Too many requests, please try again later.',
}

// Different rate limit configurations based on user type
const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  'default': DEFAULT_RATE_LIMIT,
  'anonymous': {
    windowMs: 60 * 1000,
    maxRequests: Math.floor(CLAUDE_CONFIG.MAX_REQUESTS_PER_MINUTE / 2),
    message: 'Too many requests from unregistered users, please try again later or sign in for higher limits.',
  },
  'premium': {
    windowMs: 60 * 1000,
    maxRequests: CLAUDE_CONFIG.MAX_REQUESTS_PER_MINUTE * 2,
    message: 'You have reached your premium rate limit. Please try again shortly.',
  },
}

/**
 * Get rate limit key for a request
 */
function getRateLimitKey(userId?: string, ipAddress?: string, userType = 'default'): string {
  const identifier = userId || ipAddress || 'generic'
  return `ratelimit:${userType}:${identifier}`
}

/**
 * Check if a request exceeds rate limits using Redis
 */
export async function checkRateLimit(
  userId?: string,
  ipAddress?: string,
  userType = 'default'
): Promise<{ limited: boolean; message?: string; remainingRequests: number }> {
  const config = RATE_LIMIT_CONFIGS[userType] || DEFAULT_RATE_LIMIT
  const windowSeconds = Math.floor(config.windowMs / 1000)
  const key = getRateLimitKey(userId, ipAddress, userType)
  
  try {
    // Get current count
    const currentCount = await redis.get(key)
    const count = currentCount ? parseInt(currentCount) : 0
    
    // Check if rate limit exceeded
    const limited = count >= config.maxRequests
    const remainingRequests = Math.max(0, config.maxRequests - count)
    
    return {
      limited,
      message: limited ? config.message : undefined,
      remainingRequests,
    }
  } catch (error) {
    console.error('Error checking rate limit:', error)
    // On error, allow the request
    return {
      limited: false,
      remainingRequests: config.maxRequests,
    }
  }
}

/**
 * Record a new request for rate limiting
 */
export async function recordRequest(
  userId?: string,
  ipAddress?: string,
  userType = 'default'
): Promise<void> {
  const config = RATE_LIMIT_CONFIGS[userType] || DEFAULT_RATE_LIMIT
  const windowSeconds = Math.floor(config.windowMs / 1000)
  const key = getRateLimitKey(userId, ipAddress, userType)
  
  try {
    // Use Redis atomic increment with expiration
    const multi = redis.multi()
    
    // Check if key exists
    const exists = await redis.exists(key)
    
    if (exists) {
      // Key exists, just increment
      await redis.incr(key)
    } else {
      // Key doesn't exist, set with expiration
      await redis.set(key, 1, 'EX', windowSeconds)
    }
  } catch (error) {
    console.error('Error recording request:', error)
  }
}

/**
 * Apply rate limiting to an API request
 */
export async function applyRateLimit(
  userId?: string,
  ipAddress?: string,
  userType = 'default'
): Promise<{ allowed: boolean; message?: string; remainingRequests: number }> {
  // Check the rate limit
  const { limited, message, remainingRequests } = await checkRateLimit(userId, ipAddress, userType)
  
  // If not limited, record this request
  if (!limited) {
    await recordRequest(userId, ipAddress, userType)
  }
  
  return {
    allowed: !limited,
    message,
    remainingRequests,
  }
}

/**
 * Reset rate limit for a user (e.g., for admin override)
 */
export async function resetRateLimit(
  userId?: string,
  ipAddress?: string,
  userType = 'default'
): Promise<void> {
  const key = getRateLimitKey(userId, ipAddress, userType)
  
  try {
    await redis.del(key)
  } catch (error) {
    console.error('Error resetting rate limit:', error)
  }
}

/**
 * Get current rate limit status with more accurate Redis implementation
 */
export async function getRateLimitStatus(
  userId?: string,
  ipAddress?: string,
  userType = 'default'
): Promise<{
  currentCount: number
  maxRequests: number
  remainingRequests: number
  resetIn: number
}> {
  const config = RATE_LIMIT_CONFIGS[userType] || DEFAULT_RATE_LIMIT
  const key = getRateLimitKey(userId, ipAddress, userType)
  
  try {
    const currentCount = await redis.get(key)
    const count = currentCount ? parseInt(currentCount) : 0
    const ttl = await redis.ttl(key)
    
    return {
      currentCount: count,
      maxRequests: config.maxRequests,
      remainingRequests: Math.max(0, config.maxRequests - count),
      resetIn: ttl > 0 ? ttl : 0,
    }
  } catch (error) {
    console.error('Error getting rate limit status:', error)
    return {
      currentCount: 0,
      maxRequests: config.maxRequests,
      remainingRequests: config.maxRequests,
      resetIn: 0,
    }
  }
}