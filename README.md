# FPL Chat App

A Fantasy Premier League (FPL) chat application with multiple components:

- **cron**: Scheduled jobs for data synchronization
- **fpl-mcp-server**: Backend server with FPL tools and API integration
- **fpl-nextjs-app**: Next.js frontend application

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