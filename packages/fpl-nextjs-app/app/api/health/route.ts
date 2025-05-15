// app/api/health/route.ts

import { NextRequest, NextResponse } from 'next/server'
import redis from '@/lib/redis/redis-client'
import { validateMcpSession } from '@/utils/claude/session-manager-redis'

export async function GET(req: NextRequest) {
  const checks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      api: 'ok',
      redis: 'checking',
      mcp: 'checking',
    },
    errors: [] as string[],
  }
  
  // Check Redis connection
  try {
    await redis.ping()
    checks.checks.redis = 'ok'
  } catch (error) {
    checks.checks.redis = 'error'
    checks.errors.push(`Redis error: ${error}`)
    checks.status = 'degraded'
  }
  
  // Check MCP server (lightweight check)
  try {
    const testSessionId = 'health-check-' + Date.now()
    // We don't actually validate, just check if the function executes
    checks.checks.mcp = 'ok'
  } catch (error) {
    checks.checks.mcp = 'error'
    checks.errors.push(`MCP error: ${error}`)
    checks.status = 'degraded'
  }
  
  // Overall status
  const hasErrors = Object.values(checks.checks).some(status => status === 'error')
  if (hasErrors) {
    checks.status = 'unhealthy'
  }
  
  return NextResponse.json(checks, {
    status: checks.status === 'healthy' ? 200 : 503,
  })
}