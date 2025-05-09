# FPL Cron Services

This directory contains the cron services for refreshing FPL data at different intervals.

## Services

1. **cron-live-refresh**: Refreshes live match data (runs every 15 minutes during matches)
2. **cron-daily-refresh**: Performs a full data refresh (runs once per day)
3. **cron-hourly-refresh**: Performs a regular update of data (runs hourly)
4. **cron-post-match-refresh**: Updates data after matches are completed (runs at specified intervals after matches)
5. **cron-scheduler-manager**: Updates the dynamic cron schedule based on fixture data (runs daily)

## Dynamic Scheduling

The system now supports dynamic scheduling of cron jobs based on fixture times:

- The scheduler manager fetches fixture data and creates time windows for each job type
- Live refresh and post-match refresh jobs check if they should run based on current time
- This prevents unnecessary job runs when no matches are scheduled
- The schedule is updated daily at 1:00 AM UTC

To enable/disable dynamic scheduling, update the `enable_dynamic_scheduling` value in the `system_config` table.

## Railway Configuration

These services are meant to be deployed on Railway.app as separate services that communicate with the main Next.js application using railway's internal networking.

### Setup Instructions

For each service (`cron-live-refresh`, `cron-daily-refresh`, `cron-hourly-refresh`, `cron-post-match-refresh`, `cron-scheduler-manager`):

1. Create a new service in Railway
2. Link the service to this repository
3. Set the service root directory to the respective cron service directory (e.g., `cron/cron-daily-refresh`)
4. Set the following environment variables:
   - `NEXT_CLIENT_PRIVATE_URL`: The railway internal URL of your Next.js app (e.g., `fpl-mcp-chat.railway.internal`)
   - `NEXT_CLIENT_PORT`: The port your Next.js app runs on (default is `3000`)
   - `CRON_SECRET`: A secret token that matches the one in your Next.js app for authentication

5. Configure the cron schedule in Railway:
   - **cron-live-refresh**: `*/15 * * * *` (every 15 minutes)
   - **cron-daily-refresh**: `0 4 * * *` (every day at 4:00 AM UTC)
   - **cron-hourly-refresh**: `5 * * * *` (5 minutes past every hour)
   - **cron-post-match-refresh**: `*/35 * * * *` (every 35 minutes)
   - **cron-scheduler-manager**: `0 1 * * *` (every day at 1:00 AM UTC)

### Development

To test locally:

1. Navigate to the cron service directory:
   ```
   cd cron/cron-daily-refresh
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with the required environment variables:
   ```
   NEXT_CLIENT_PRIVATE_URL=localhost
   NEXT_CLIENT_PORT=3000
   CRON_SECRET=your-secret-token
   ```

4. Build and run:
   ```
   npm run build
   npm start
   ```

## Troubleshooting

- Make sure the `CRON_SECRET` matches between the cron service and the Next.js app
- Check that your Next.js app is properly exposed within Railway's internal network
- Verify that the correct endpoints are being called in each cron service
- Ensure the environment variables are properly set in Railway 