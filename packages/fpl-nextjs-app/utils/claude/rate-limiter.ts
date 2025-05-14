// app/utils/rate-limiter.ts

import { CLAUDE_CONFIG } from '../../config/ai-config';

// Type definitions
type RateLimitEntry = {
  timestamp: number;
  userId?: string;
  ipAddress?: string;
};

type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
  message: string;
};

// In-memory storage for rate limiting entries
// In production, this should be replaced with Redis or similar
const rateLimitStore = new Map<string, RateLimitEntry[]>();

// Default rate limit configuration
const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: CLAUDE_CONFIG.MAX_REQUESTS_PER_MINUTE,
  message: 'Too many requests, please try again later.',
};

// Different rate limit configurations based on user type
const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  // Default for all users
  'default': DEFAULT_RATE_LIMIT,
  
  // Anonymous users get more restricted limits
  'anonymous': {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: Math.floor(CLAUDE_CONFIG.MAX_REQUESTS_PER_MINUTE / 2),
    message: 'Too many requests from unregistered users, please try again later or sign in for higher limits.',
  },
  
  // Premium users get higher limits
  'premium': {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: CLAUDE_CONFIG.MAX_REQUESTS_PER_MINUTE * 2,
    message: 'You have reached your premium rate limit. Please try again shortly.',
  },
};

/**
 * Clean expired entries from the rate limiter store
 */
function cleanExpiredEntries(): void {
  const now = Date.now();
  
  for (const [key, entries] of Array.from(rateLimitStore.entries())) {
    // Get the config for this user type (or default)
    const userType = key.split(':')[0];
    const config = RATE_LIMIT_CONFIGS[userType] || DEFAULT_RATE_LIMIT;
    
    // Filter to keep only entries within the time window
    const validEntries = entries.filter((entry: RateLimitEntry) => 
      now - entry.timestamp < config.windowMs
    );
    
    if (validEntries.length === 0) {
      // Remove empty entries
      rateLimitStore.delete(key);
    } else if (validEntries.length !== entries.length) {
      // Update with only valid entries
      rateLimitStore.set(key, validEntries);
    }
  }
}

/**
 * Get rate limit key for a request
 */
function getRateLimitKey(userId?: string, ipAddress?: string, userType = 'default'): string {
  // Prefer user ID if available
  if (userId) {
    return `${userType}:user:${userId}`;
  }
  
  // Fall back to IP address
  if (ipAddress) {
    return `${userType}:ip:${ipAddress}`;
  }
  
  // Generic fallback (should be avoided)
  return `${userType}:generic`;
}

/**
 * Check if a request exceeds rate limits
 */
export function checkRateLimit(
  userId?: string,
  ipAddress?: string,
  userType = 'default'
): { limited: boolean; message?: string; remainingRequests: number } {
  // Clean expired entries first
  cleanExpiredEntries();
  
  // Determine user type for rate limit config
  const config = RATE_LIMIT_CONFIGS[userType] || DEFAULT_RATE_LIMIT;
  
  // Get the key for this request
  const key = getRateLimitKey(userId, ipAddress, userType);
  
  // Get existing entries for this key
  const now = Date.now();
  const timeWindow = now - config.windowMs;
  const entries = rateLimitStore.get(key) || [];
  
  // Filter to only recent entries
  const recentEntries = entries.filter(entry => entry.timestamp > timeWindow);
  
  // Check if the rate limit has been exceeded
  const limited = recentEntries.length >= config.maxRequests;
  
  // Calculate remaining requests
  const remainingRequests = Math.max(0, config.maxRequests - recentEntries.length);
  
  return {
    limited,
    message: limited ? config.message : undefined,
    remainingRequests,
  };
}

/**
 * Record a new request for rate limiting
 */
export function recordRequest(
  userId?: string,
  ipAddress?: string,
  userType = 'default'
): void {
  // Get the key for this request
  const key = getRateLimitKey(userId, ipAddress, userType);
  
  // Get existing entries
  const entries = rateLimitStore.get(key) || [];
  
  // Add this request
  const newEntry: RateLimitEntry = {
    timestamp: Date.now(),
    userId,
    ipAddress,
  };
  
  // Update the store
  rateLimitStore.set(key, [...entries, newEntry]);
}

/**
 * Apply rate limiting to an API request
 * Returns true if the request should proceed, false if rate limited
 */
export function applyRateLimit(
  userId?: string,
  ipAddress?: string,
  userType = 'default'
): { allowed: boolean; message?: string; remainingRequests: number } {
  // Check the rate limit
  const { limited, message, remainingRequests } = checkRateLimit(userId, ipAddress, userType);
  
  // If not limited, record this request
  if (!limited) {
    recordRequest(userId, ipAddress, userType);
  }
  
  return {
    allowed: !limited,
    message,
    remainingRequests,
  };
}

// Set up a periodic cleanup of expired rate limit entries (every minute)
if (typeof window !== 'undefined') {
  setInterval(cleanExpiredEntries, 60 * 1000);
}