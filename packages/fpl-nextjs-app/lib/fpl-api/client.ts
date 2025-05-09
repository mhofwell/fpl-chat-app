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



// Basic FPL API client
export const fplApi = {
    getBootstrapStatic: async () => {
        try {
            if (isDevMode) console.log('[DEV] Fetching bootstrap static data');

            const response = await fetch(BOOTSTRAP_STATIC);
            if (!response.ok)
                throw new Error(
                    `Failed to fetch bootstrap static: ${response.statusText}`
                );

            const data = await response.json();

            if (isDevMode) {
                console.log('[DEV] Bootstrap static data fetched successfully');
            }

            return data;
        } catch (error) {
            if (isDevMode) {
                console.error('[DEV] Error fetching bootstrap static:', error);
            }
            throw error;
        }
    },

    getFixtures: async () => {
        try {
            if (isDevMode) console.log('[DEV] Fetching fixtures data');

            const response = await fetch(FIXTURES);
            if (!response.ok)
                throw new Error(
                    `Failed to fetch fixtures: ${response.statusText}`
                );

            const data = await response.json();

            if (isDevMode) {
                console.log('[DEV] Fixtures data fetched successfully');
            }

            return data;
        } catch (error) {
            if (isDevMode) {
                console.error('[DEV] Error fetching fixtures:', error);
            }
            throw error;
        }
    },

    getPlayerDetail: async (playerId: number) => {
        try {
            if (isDevMode)
                console.log(`[DEV] Fetching player detail for ID: ${playerId}`);

            const response = await fetch(`${PLAYER_DETAIL}${playerId}/`);
            if (!response.ok)
                throw new Error(
                    `Failed to fetch player detail: ${response.statusText}`
                );

            const data = await response.json();

            if (isDevMode) {
                console.log(
                    `[DEV] Player detail fetched successfully for ID: ${playerId}`
                );
            }

            return data;
        } catch (error) {
            if (isDevMode) {
                console.error(
                    `[DEV] Error fetching player detail for ID: ${playerId}:`,
                    error
                );
            }
            throw error;
        }
    },

    getGameweekLive: async (gameweekId: number) => {
        try {
            if (isDevMode)
                console.log(
                    `[DEV] Fetching gameweek live data for ID: ${gameweekId}`
                );

            const response = await fetch(`${GAMEWEEK_LIVE}${gameweekId}/live/`);
            if (!response.ok)
                throw new Error(
                    `Failed to fetch gameweek live: ${response.statusText}`
                );

            const data = await response.json();

            if (isDevMode) {
                console.log(
                    `[DEV] Gameweek live data fetched successfully for ID: ${gameweekId}`
                );
            }

            return data;
        } catch (error) {
            if (isDevMode) {
                console.error(
                    `[DEV] Error fetching gameweek live for ID: ${gameweekId}:`,
                    error
                );
            }
            throw error;
        }
    },
};
