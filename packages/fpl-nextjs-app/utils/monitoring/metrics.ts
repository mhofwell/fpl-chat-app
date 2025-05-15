// utils/monitoring/metrics.ts

import redis from '../../lib/redis/redis-client'

const METRICS_PREFIX = 'metrics:'
const COUNTERS_PREFIX = `${METRICS_PREFIX}counters:`
const GAUGES_PREFIX = `${METRICS_PREFIX}gauges:`
const HISTOGRAMS_PREFIX = `${METRICS_PREFIX}histograms:`

interface MetricOptions {
  labels?: Record<string, string>
  ttl?: number // TTL in seconds
}

/**
 * Increment a counter metric
 */
export async function incrementCounter(
  name: string, 
  value: number = 1,
  options: MetricOptions = {}
): Promise<void> {
  const key = buildMetricKey(COUNTERS_PREFIX, name, options.labels)
  
  try {
    await redis.incrby(key, value)
    
    if (options.ttl) {
      await redis.expire(key, options.ttl)
    }
  } catch (error) {
    console.error(`Error incrementing counter ${name}:`, error)
  }
}

/**
 * Set a gauge metric
 */
export async function setGauge(
  name: string,
  value: number,
  options: MetricOptions = {}
): Promise<void> {
  const key = buildMetricKey(GAUGES_PREFIX, name, options.labels)
  
  try {
    await redis.set(key, value.toString())
    
    if (options.ttl) {
      await redis.expire(key, options.ttl)
    }
  } catch (error) {
    console.error(`Error setting gauge ${name}:`, error)
  }
}

/**
 * Record a histogram value (stores distribution)
 */
export async function recordHistogram(
  name: string,
  value: number,
  options: MetricOptions = {}
): Promise<void> {
  const baseKey = buildMetricKey(HISTOGRAMS_PREFIX, name, options.labels)
  const now = Math.floor(Date.now() / 1000) // Unix timestamp
  
  try {
    const multi = redis.multi()
    
    // Store individual value with timestamp
    multi.zadd(`${baseKey}:values`, now, `${now}:${value}`)
    
    // Update statistics
    multi.hincrby(`${baseKey}:stats`, 'count', 1)
    multi.hincrbyfloat(`${baseKey}:stats`, 'sum', value)
    
    // Update min/max
    const stats = await redis.hgetall(`${baseKey}:stats`)
    const currentMin = parseFloat(stats?.min || 'Infinity')
    const currentMax = parseFloat(stats?.max || '-Infinity')
    
    if (value < currentMin) {
      multi.hset(`${baseKey}:stats`, 'min', value.toString())
    }
    if (value > currentMax) {
      multi.hset(`${baseKey}:stats`, 'max', value.toString())
    }
    
    await multi.exec()
    
    // Clean up old values (keep last hour)
    const cutoff = now - 3600
    await redis.zremrangebyscore(`${baseKey}:values`, '-inf', cutoff)
  } catch (error) {
    console.error(`Error recording histogram ${name}:`, error)
  }
}

/**
 * Get metric value
 */
export async function getMetric(
  type: 'counter' | 'gauge',
  name: string,
  labels?: Record<string, string>
): Promise<number | null> {
  const prefix = type === 'counter' ? COUNTERS_PREFIX : GAUGES_PREFIX
  const key = buildMetricKey(prefix, name, labels)
  
  try {
    const value = await redis.get(key)
    return value ? parseFloat(value) : null
  } catch (error) {
    console.error(`Error getting metric ${name}:`, error)
    return null
  }
}

/**
 * Get histogram statistics
 */
export async function getHistogramStats(
  name: string,
  labels?: Record<string, string>
): Promise<{
  count: number
  sum: number
  min: number
  max: number
  avg: number
  p50: number
  p95: number
  p99: number
} | null> {
  const key = buildMetricKey(HISTOGRAMS_PREFIX, name, labels)
  
  try {
    const stats = await redis.hgetall(`${key}:stats`)
    if (!stats || !stats.count) {
      return null
    }
    
    const count = parseInt(stats.count)
    const sum = parseFloat(stats.sum)
    const min = parseFloat(stats.min)
    const max = parseFloat(stats.max)
    const avg = sum / count
    
    // Get percentiles from sorted set
    const values = await redis.zrange(`${key}:values`, 0, -1)
    const parsedValues = values.map(v => parseFloat(v.split(':')[1])).sort((a, b) => a - b)
    
    const p50 = parsedValues[Math.floor(parsedValues.length * 0.5)] || 0
    const p95 = parsedValues[Math.floor(parsedValues.length * 0.95)] || 0
    const p99 = parsedValues[Math.floor(parsedValues.length * 0.99)] || 0
    
    return { count, sum, min, max, avg, p50, p95, p99 }
  } catch (error) {
    console.error(`Error getting histogram stats ${name}:`, error)
    return null
  }
}

/**
 * Build metric key with labels
 */
function buildMetricKey(
  prefix: string,
  name: string,
  labels?: Record<string, string>
): string {
  if (!labels || Object.keys(labels).length === 0) {
    return `${prefix}${name}`
  }
  
  // Sort labels for consistent key generation
  const sortedLabels = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(',')
  
  return `${prefix}${name}{${sortedLabels}}`
}

/**
 * Application-specific metrics
 */
export const Metrics = {
  // API metrics
  async recordApiRequest(endpoint: string, method: string, status: number, duration: number) {
    await incrementCounter('api_requests_total', 1, {
      labels: { endpoint, method, status: status.toString() }
    })
    await recordHistogram('api_request_duration_ms', duration, {
      labels: { endpoint, method }
    })
  },
  
  // Tool metrics
  async recordToolCall(toolName: string, success: boolean, duration: number) {
    await incrementCounter('tool_calls_total', 1, {
      labels: { tool: toolName, status: success ? 'success' : 'error' }
    })
    await recordHistogram('tool_call_duration_ms', duration, {
      labels: { tool: toolName }
    })
  },
  
  // Session metrics
  async recordSessionCreated() {
    await incrementCounter('mcp_sessions_created_total')
  },
  
  async recordSessionValidated(valid: boolean) {
    await incrementCounter('mcp_session_validations_total', 1, {
      labels: { status: valid ? 'valid' : 'invalid' }
    })
  },
  
  // Chat metrics
  async recordChatMessage(role: 'user' | 'assistant', tokenCount: number) {
    await incrementCounter('chat_messages_total', 1, {
      labels: { role }
    })
    await incrementCounter('chat_tokens_total', tokenCount, {
      labels: { role }
    })
  },
  
  // Rate limit metrics
  async recordRateLimitCheck(allowed: boolean, userType: string) {
    await incrementCounter('rate_limit_checks_total', 1, {
      labels: { allowed: allowed.toString(), user_type: userType }
    })
  },
  
  // Cache metrics
  async recordCacheOperation(operation: 'hit' | 'miss' | 'set', cacheType: 'redis' | 'memory') {
    await incrementCounter('cache_operations_total', 1, {
      labels: { operation, type: cacheType }
    })
  },
  
  // Error metrics
  async recordError(errorType: string, context: string) {
    await incrementCounter('errors_total', 1, {
      labels: { type: errorType, context }
    })
  },
  
  // System metrics
  async recordMemoryUsage() {
    if (typeof process !== 'undefined') {
      const memUsage = process.memoryUsage()
      await setGauge('memory_usage_bytes', memUsage.heapUsed, {
        labels: { type: 'heap_used' }
      })
      await setGauge('memory_usage_bytes', memUsage.heapTotal, {
        labels: { type: 'heap_total' }
      })
      await setGauge('memory_usage_bytes', memUsage.rss, {
        labels: { type: 'rss' }
      })
    }
  },
  
  // Active connections
  async setActiveConnections(count: number) {
    await setGauge('active_connections', count)
  }
}

/**
 * Export metrics in Prometheus format
 */
export async function exportMetrics(): Promise<string> {
  const output: string[] = []
  
  try {
    // Export counters
    const counterKeys = await redis.keys(`${COUNTERS_PREFIX}*`)
    for (const key of counterKeys) {
      const value = await redis.get(key)
      const name = key.replace(COUNTERS_PREFIX, '')
      output.push(`# TYPE ${name} counter`)
      output.push(`${name} ${value}`)
    }
    
    // Export gauges
    const gaugeKeys = await redis.keys(`${GAUGES_PREFIX}*`)
    for (const key of gaugeKeys) {
      const value = await redis.get(key)
      const name = key.replace(GAUGES_PREFIX, '')
      output.push(`# TYPE ${name} gauge`)
      output.push(`${name} ${value}`)
    }
    
    // Export histograms
    const histogramKeys = await redis.keys(`${HISTOGRAMS_PREFIX}*:stats`)
    for (const key of histogramKeys) {
      const baseName = key.replace(HISTOGRAMS_PREFIX, '').replace(':stats', '')
      const stats = await getHistogramStats(baseName)
      
      if (stats) {
        output.push(`# TYPE ${baseName} histogram`)
        output.push(`${baseName}_count ${stats.count}`)
        output.push(`${baseName}_sum ${stats.sum}`)
        output.push(`${baseName}_min ${stats.min}`)
        output.push(`${baseName}_max ${stats.max}`)
        output.push(`${baseName}_avg ${stats.avg}`)
        output.push(`${baseName}_p50 ${stats.p50}`)
        output.push(`${baseName}_p95 ${stats.p95}`)
        output.push(`${baseName}_p99 ${stats.p99}`)
      }
    }
  } catch (error) {
    console.error('Error exporting metrics:', error)
  }
  
  return output.join('\n')
}