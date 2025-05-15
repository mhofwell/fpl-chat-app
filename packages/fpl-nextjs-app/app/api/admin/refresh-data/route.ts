// app/api/admin/refresh-data/route.ts

import { NextResponse } from 'next/server';
import { cacheManager } from '@/lib/fpl-api/cache-manager-mvp';

export async function POST(request: Request) {
  // Add your own authentication here
  const { searchParams } = new URL(request.url);
  const adminKey = searchParams.get('key');
  
  if (adminKey !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const { type = 'all' } = await request.json();
    
    console.log(`Manual data refresh requested: ${type}`);
    
    // Clear specific cache patterns based on type
    switch (type) {
      case 'players':
        await cacheManager.invalidatePattern('fpl:players:*');
        await cacheManager.invalidatePattern('fpl:leaders:*');
        break;
      case 'fixtures':
        await cacheManager.invalidatePattern('fpl:fixtures:*');
        break;
      case 'all':
        await cacheManager.invalidatePattern('fpl:*');
        break;
    }
    
    // Force refresh bootstrap data
    await cacheManager.getBootstrapData(true);
    
    return NextResponse.json({
      success: true,
      message: `Cache cleared for: ${type}`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to refresh data' },
      { status: 500 }
    );
  }
}