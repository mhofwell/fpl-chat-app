// cache-dashboard.ts
import redis from '@/lib/redis/redis-client';

async function displayCacheDashboard() {
    try {
        console.log('FPL Redis Cache Dashboard');
        console.log('========================\n');

        // Get all FPL-related cache keys
        const keys = await redis.keys('fpl:*');
        console.log(`Total cached items: ${keys.length}`);

        // Group keys by type
        const keysByType = keys.reduce(
            (acc, key) => {
                const type = key.split(':')[1] || 'other';
                if (!acc[type]) acc[type] = [];
                acc[type].push(key);
                return acc;
            },
            {} as Record<string, string[]>
        );

        // Display cache by type
        console.log('\nCache by Type:');
        for (const [type, typeKeys] of Object.entries(keysByType)) {
            console.log(`\n${type.toUpperCase()} (${typeKeys.length} items):`);

            // Display each key with TTL
            for (const key of typeKeys) {
                const ttl = await redis.ttl(key);
                console.log(`- ${key}: TTL ${ttl} seconds`);
            }
        }
    } catch (error) {
        console.error('Error displaying cache dashboard:', error);
    } finally {
        await redis.quit();
    }
}

displayCacheDashboard();
