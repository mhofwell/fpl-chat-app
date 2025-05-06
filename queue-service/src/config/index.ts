import dotenv from 'dotenv';
dotenv.config();

const NEXT_CLIENT_PORT = process.env.NEXT_CLIENT_PORT || 3000;
const NEXT_CLIENT_PRIVATE_URL = process.env.NEXT_CLIENT_PRIVATE_URL || 'localhost';
const NEXT_APP_URL = `http://${NEXT_CLIENT_PRIVATE_URL}:${NEXT_CLIENT_PORT}`;

export const config = {
  environment: process.env.NODE_ENV || 'development',
  
  api: {
    port: parseInt(process.env.PORT || '3001', 10),
    secret: process.env.QUEUE_SECRET || 'default-secret-change-me',
  },
  
  nextApp: {
    url: NEXT_APP_URL,
    privateUrl: NEXT_CLIENT_PRIVATE_URL,
    port: NEXT_CLIENT_PORT,
  },
  
  cron: {
    secret: process.env.CRON_SECRET || 'default-cron-secret-change-me',
  },
};

export * from './queue-config';
