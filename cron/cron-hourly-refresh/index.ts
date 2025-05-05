import dotenv from 'dotenv';
import fetch from 'node-fetch';
dotenv.config();

const NEXT_CLIENT_PORT = process.env.NEXT_CLIENT_PORT || 3000;
const BASE_URL = process.env.NEXT_CLIENT_PRIVATE_URL || 'fpl-mcp-chat.railway.internal';
const APP_URL = `http://${BASE_URL}:${NEXT_CLIENT_PORT}` || 'http://fpl-mcp-chat.railway.internal:3000';
const API_ENDPOINT = `${APP_URL}/api/cron/sync-fpl/hourly?family=0`; 
const CRON_SECRET = process.env.CRON_SECRET;

console.log(`Starting FPL hourly refresh job at ${new Date().toISOString()}`);
console.log(CRON_SECRET);
console.log(NEXT_CLIENT_PORT);
console.log(BASE_URL);
console.log(APP_URL);
console.log(API_ENDPOINT);

// Execute the refresh endpoint
(async () => {
    try {
        console.log(`Calling hourly refresh endpoint at ${API_ENDPOINT}`);

        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${CRON_SECRET}`,
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Hourly refresh job completed:', data);
    } catch (error) {
        console.error('Error running hourly refresh job:', error);
        process.exit(1); // Exit with error code
    }
    console.log('Hourly refresh job execution complete');
})(); 