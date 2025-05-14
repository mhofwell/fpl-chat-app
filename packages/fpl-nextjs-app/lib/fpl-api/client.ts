// Get environment
const appEnv = process.env.APP_ENV || 'development';
const isDevMode = appEnv === 'development';

// Primary endpoints
const BOOTSTRAP_STATIC =
    'https://fantasy.premierleague.com/api/bootstrap-static/';
const FIXTURES = 'https://fantasy.premierleague.com/api/fixtures/';
const PLAYER_DETAIL = 'https://fantasy.premierleague.com/api/element-summary/';
const GAMEWEEK_LIVE = 'https://fantasy.premierleague.com/api/event/';

// Calculate appropriate TTL based on the endpoint and environment
export function calculateTtl(endpoint: string): number {
    // Use shorter TTLs in development for easier testing
    const devMultiplier = isDevMode ? 0.2 : 1; // 20% of the time in development

    if (endpoint.includes('live')) {
        return 60 * 15 * devMultiplier; // 15 minutes (or 3 minutes in dev)
    } else if (endpoint === 'bootstrap-static') {
        return 60 * 60 * 4 * devMultiplier; // 4 hours (or 48 minutes in dev)
    } else if (endpoint === 'fixtures') {
        return 60 * 60 * 24 * devMultiplier; // 24 hours (or ~5 hours in dev)
    } else {
        return 60 * 60 * 12 * devMultiplier; // 12 hours default (or ~2.5 hours in dev)
    }
}



// Standard headers for all API requests to avoid header value errors
const standardHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

// Helper function for consistent fetch requests with error handling
async function fetchWithStandardHeaders(url: string, requestDescription: string) {
    const startTime = Date.now();
    try {
        if (isDevMode) console.log(`[DEV] Fetching ${requestDescription}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: standardHeaders,
            credentials: 'omit'  // Don't send cookies
        });

        if (!response.ok) {
            if (response.status === 429) {
                // Too many requests, implement exponential backoff
                const retryAfter = response.headers.get('Retry-After') || '60';
                const waitTime = parseInt(retryAfter, 10) * 1000;
                console.warn(`Rate limited by FPL API. Retrying ${requestDescription} after ${waitTime}ms wait.`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                
                // Retry the request
                return fetchWithStandardHeaders(url, requestDescription);
            }
            
            throw new Error(`Failed to fetch ${requestDescription}: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const endTime = Date.now();

        if (isDevMode) {
            console.log(`[DEV] ${requestDescription} fetched successfully in ${endTime - startTime}ms`);
        }

        return data;
    } catch (error) {
        const endTime = Date.now();
        if (isDevMode) {
            console.error(`[DEV] Error fetching ${requestDescription} after ${endTime - startTime}ms:`, error);
        }
        throw error;
    }
}

// Basic FPL API client
export const fplApi = {
    getBootstrapStatic: async () => {
        return fetchWithStandardHeaders(BOOTSTRAP_STATIC, 'bootstrap static data');
    },

    getFixtures: async () => {
        return fetchWithStandardHeaders(FIXTURES, 'fixtures data');
    },

    getPlayerDetail: async (playerId: number) => {
        return fetchWithStandardHeaders(`${PLAYER_DETAIL}${playerId}/`, `player detail for ID: ${playerId}`);
    },

    getGameweekLive: async (gameweekId: number) => {
        return fetchWithStandardHeaders(`${GAMEWEEK_LIVE}${gameweekId}/live/`, `gameweek live data for ID: ${gameweekId}`);
    },
};
