import dotenv from 'dotenv';
dotenv.config();

const NEXT_CLIENT_PORT = process.env.NEXT_CLIENT_PORT || 3000;
const NEXT_CLIENT_PRIVATE_URL = process.env.NEXT_CLIENT_PRIVATE_URL || 'localhost';
const NEXT_APP_URL = `http://${NEXT_CLIENT_PRIVATE_URL}:${NEXT_CLIENT_PORT}`;

export const config = {
  environment: process.env.NODE_ENV || 'development',
  
  api: {
    port: parseInt(process.env.PORT || '3002', 10),
    secret: process.env.QUEUE_SECRET,
  },
  
  nextApp: {
    url: NEXT_APP_URL,
  },
  
  cron: {
    secret: process.env.CRON_SECRET,
  },
};

export * from './queue-config';
