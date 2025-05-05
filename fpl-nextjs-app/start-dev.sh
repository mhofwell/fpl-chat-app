#!/bin/bash

# Check if Redis is installed
if ! command -v redis-server &> /dev/null; then
    echo "Redis is not installed. Please install Redis first."
    echo "MacOS: brew install redis"
    echo "Ubuntu: sudo apt install redis-server"
    exit 1
fi

# Check if Redis is already running
if pgrep redis-server > /dev/null; then
    echo "Redis is already running"
    # Get the port Redis is running on
    REDIS_PORT=$(redis-cli config get port | grep -A 1 "port" | tail -1)
    echo "Redis is running on port: $REDIS_PORT"
else
    echo "Starting Redis server..."
    redis-server &
    echo "Redis started"
fi

# Start Next.js development server
echo "Starting Next.js development server..."
npm run dev
