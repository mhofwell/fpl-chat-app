# FPL Queue Service

A robust queue management service for Fantasy Premier League data processing using BullMQ and Redis.

## Overview

The FPL Queue Service manages various scheduled and on-demand jobs for the FPL Chat App using BullMQ, a Redis-based queue system. It handles different types of FPL data refresh jobs at various intervals, ensuring data is always up-to-date while managing resource consumption efficiently.

## Features

-   **Multiple Queue Types**: Handles different types of FPL data refreshes:

    -   Live match data refresh
    -   Daily full data refresh
    -   Hourly data updates
    -   Post-match data processing
    -   Dynamic schedule management

-   **Dashboard UI**: Built-in web dashboard for monitoring queue status and job execution
-   **Health Check API**: Endpoint to verify service health and Redis connectivity
-   **Job Management APIs**: REST endpoints for job creation and monitoring

## Technology Stack

-   **Node.js** with TypeScript
-   **Express.js** for HTTP server and APIs
-   **BullMQ** for queue management
-   **Redis** for queue storage
-   **EJS** for dashboard templating

## Setup

### Prerequisites

-   Node.js (v14+)
-   Redis server

### Installation

1. Clone the repository
2. Install dependencies:
    ```
    cd queue-service
    npm install
    ```
3. Create a `.env` file with the following variables:

    ```
    # Required
    REDIS_URL=redis://localhost:6379
    QUEUE_SECRET=your-queue-secret-key
    CRON_SECRET=your-cron-secret-key

    # Optional
    PORT=3002
    NODE_ENV=development
    NEXT_CLIENT_PRIVATE_URL=localhost
    NEXT_CLIENT_PORT=3000
    ```

### Running the Service

Development mode:

npm run dev

Production mode

npm run build
npm start

## Deployment

### Railway

When deploying on Railway:

1. Set up required environment variables in Railway dashboard
2. Generate a public domain to access the dashboard UI
3. Ensure Redis is properly configured as a dependency

## API Endpoints

### Queue Management

-   `POST /queue/:queueName`: Add a job to a specific queue

    -   Requires `x-queue-secret` header for authentication
    -   Body: `{ "data": {...}, "options": {...} }`

-   `GET /queue/:queueName/status`: Get current queue status
    -   Requires `x-queue-secret` header for authentication

### System Status

-   `GET /health`: Check service health
-   `GET /redis/keys/:pattern`: Search Redis keys (for debugging)
-   `GET /debug/queues`: Get detailed information about all queues

## Dashboard

Access the dashboard UI at:

-   Development: `http://localhost:{PORT}/dashboard`
-   Production: `https://{RAILWAY_PUBLIC_DOMAIN}/dashboard`

## Queue Types

-   **live-refresh**: Refreshes live match data (every 15 minutes during matches)
-   **daily-refresh**: Performs a full data refresh (daily)
-   **hourly-refresh**: Updates data regularly (hourly)
-   **post-match-refresh**: Updates data after matches are completed
-   **schedule-update**: Updates dynamic cron schedules based on fixture data

## Troubleshooting

-   **Job Stalling**: Occasional job stalling is normal and handled automatically by BullMQ
-   **Redis Connection Issues**: Verify Redis is running and connection string is correct
-   **Dashboard Not Available**: Ensure a public domain is generated in Railway

## License

ISC

# Test 123