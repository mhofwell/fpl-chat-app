# FPL Chat App

A comprehensive Fantasy Premier League (FPL) application with multiple components:

- **cron**: Microservices for scheduled data refreshes and updates
- **queue-service**: BullMQ-powered job processing system in Node.js
- **fpl-nextjs-app**: Next.js frontend application with API routes
- **fpl-mcp-server**: Node.js MCP server

## Repository Structure

This monorepo contains all components of the FPL Chat App system:

```
.
├── cron/ # Scheduled job microservices
│ ├── cron-daily-refresh/
│ ├── cron-hourly-refresh/
│ ├── cron-live-refresh/
│ ├── cron-post-match-refresh/
│ └── cron-scheduler-manager/
├── queue-service/ # Background job processing service
└── fpl-nextjs-app/ # Next.js frontend and API routes
└── fpl-mcp-server/ # MCP Server 
```

## Development

Each component has its own package.json and can be developed independently. The system uses Redis for job queue management between components.

## Deployment

This application is deployed on Railway. Each component is deployed as a separate service but tracked in this single repository. The system relies on environment variables for configuration and service discovery.