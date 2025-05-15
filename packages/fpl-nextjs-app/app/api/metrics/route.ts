// app/api/metrics/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { exportMetrics } from '@/utils/monitoring/metrics'
import { createClient } from '@/utils/supabase/server'

export async function GET(req: NextRequest) {
  // Check if request is from admin or monitoring system
  const authHeader = req.headers.get('authorization')
  
  if (process.env.METRICS_AUTH_TOKEN && authHeader !== `Bearer ${process.env.METRICS_AUTH_TOKEN}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    // Export metrics in Prometheus format
    const metricsText = await exportMetrics()
    
    return new NextResponse(metricsText, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      },
    })
  } catch (error) {
    console.error('Error exporting metrics:', error)
    return NextResponse.json({ error: 'Failed to export metrics' }, { status: 500 })
  }
}