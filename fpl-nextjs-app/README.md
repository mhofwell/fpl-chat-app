# FPL Chat Assistant

This application provides a chat interface for Fantasy Premier League (FPL) data and insights using Claude AI.

## Prerequisites

1. Node.js (v18+)
2. Redis installed locally
3. Supabase account with a project set up
4. Claude API key

## Environment Setup

Create a `.env.local` file in the project root with the following variables:

NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
REDIS_URL=redis://localhost:6379
APP_ENV=development
NODE_ENV=development
CLAUDE_API_KEY=your_claude_api_key

## Setup Workflow

### 1. Drop All Tables (If Needed)

To reset the database completely:

```bash
npm run db:drop
```

### 2. Setup the Database

Run the database setup script to create all the necessary tables and policies:

```bash
npm run db:setup
```

This will:
- Create the exec_sql_function in Supabase (now integrated into the setup script)
- Create all required tables: teams, players, gameweeks, fixtures, profiles, user_preferences, chats, messages
- Set up RLS policies to secure the data
- Create triggers and functions for user management

### 3. Seed the Database with Fantasy Premier League Data

Populate the database with data from the FPL API:

```bash
npm run db:seed
```

This will:
- Fetch teams, players, gameweeks, and fixtures from the FPL API
- Insert or update the records in the database

### 4. Start the Development Server

```bash
npm run dev:local
```

This script will:
- Check if Redis is installed
- Start Redis if it's not already running
- Start the Next.js development server

## Verifying Setup

After setup, you should see the following tables in your Supabase dashboard:

- teams
- players
- gameweeks
- fixtures
- profiles
- user_preferences
- chats
- messages

## Common Issues & Troubleshooting

### Database Setup Issues

1. **Missing environment variables**: Ensure all Supabase credentials are correct in .env.local
2. **Permission issues**: Verify you have the required permissions in your Supabase project
3. **SQL errors**: Check the console output for specific error messages

### Seed Script Issues

1. **Import errors**: If you see errors related to importing `fplApiService`, ensure there are no `.ts` extensions in import statements
2. **API rate limiting**: The seed script includes delays to prevent overwhelming the FPL API

### Redis Issues

1. **Redis not installed**: Install Redis using `brew install redis` (macOS) or `apt install redis-server` (Ubuntu)
2. **Redis connection errors**: Verify Redis is running with `redis-cli ping` and check your REDIS_URL is correct

### Next.js Issues

1. **Port conflicts**: If port 3000 is in use, you can use `npm run dev -- -p 3001` to change the port

## Deployment

When deploying to Railway:

- Add all required environment variables to your Railway project
- Set up Redis as a service
- The database setup scripts can be run as part of your deployment process
