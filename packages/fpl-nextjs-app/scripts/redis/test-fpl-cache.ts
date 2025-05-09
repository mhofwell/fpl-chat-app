// test-fpl-cache.ts
import { fplApiService } from '@/lib/fpl-api/service';
import redis from '@/lib/redis/redis-client';

async function testFplCaching() {
    try {
        console.log('Testing FPL API caching with Redis...');

        // Clear any existing cache for teams
        await redis.del('fpl:teams');
        console.log('Cleared existing teams cache');

        console.log('First call - should fetch from API:');
        console.time('First call');
        const teamsFirstCall = await fplApiService.getTeams();
        console.timeEnd('First call');
        console.log(`Retrieved ${teamsFirstCall.length} teams`);

        // Check if data was cached
        const cachedData = await redis.get('fpl:teams');
        console.log(
            'Cache status:',
            cachedData ? 'Data cached successfully' : 'Caching failed'
        );

        console.log('\nSecond call - should get from cache:');
        console.time('Second call');
        const teamsSecondCall = await fplApiService.getTeams();
        console.timeEnd('Second call');
        console.log(`Retrieved ${teamsSecondCall.length} teams`);

        // Clean up
        console.log('\nTest complete. Closing connection...');
    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await redis.quit();
    }
}

testFplCaching();
