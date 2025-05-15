// app/api/cron/fpl-update/route.ts

import { NextResponse } from 'next/server';
import { cacheManager } from '@/lib/fpl-api/cache-manager-mvp';
import { fplApiClient } from '@/lib/fpl-api/fpl-api-client-mvp';

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const updateType = searchParams.get('type') || 'regular';
    
    console.log(`Starting FPL data update: ${updateType}`);
    
    let updated = [];
    
    // Always update bootstrap data
    await cacheManager.getBootstrapData(true);
    updated.push('bootstrap');
    
    // Update fixtures
    const currentGW = await fplApiClient.getCurrentGameweek();
    if (currentGW) {
      await cacheManager.getFixtures(currentGW, true);
      updated.push(`fixtures-gw${currentGW}`);
    }
    
    // Update all fixtures for 'full' update
    if (updateType === 'full') {
      await cacheManager.getFixtures(undefined, true);
      updated.push('fixtures-all');
    }
    
    // Clear derived caches
    await cacheManager.invalidatePattern('fpl:leaders:*');
    await cacheManager.invalidatePattern('fpl:players:stats*');
    
    return NextResponse.json({
      success: true,
      updateType,
      updated,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in FPL update cron:', error);
    return NextResponse.json(
      { 
        error: 'Update failed', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

// Also support POST
export async function POST(request: Request) {
  return GET(request);
}