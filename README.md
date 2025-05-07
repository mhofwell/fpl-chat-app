# FPL Chat App

A comprehensive Fantasy Premier League (FPL) application with multiple components:

- **cron**: Microservices for scheduled data refreshes and updates
- **queue-service**: BullMQ-powered job processing system 
- **fpl-nextjs-app**: Next.js frontend application with API routes

## Repository Structure

This monorepo contains all components of the FPL Chat App system:

```
.
├── cron/                 # Scheduled job components
├── fpl-mcp-server/       # Backend server  
└── fpl-nextjs-app/       # Next.js frontend
```

## Development

Each component has its own package.json and can be developed independently.

## Deployment

This application is deployed on Railway. Each component is deployed separately but tracked in this single repository.