import dotenv from 'dotenv';

dotenv.config();

export const WAKE_INTERVAL = 10 * 60 * 1000;
export const COMMAND_PREFIX = process.env.ENVIRONMENT === 'production' ? '!' : '/';
export const BULK_MESSAGES_LIMIT = 100;
export const MESSAGE_PREVIEW_LENGTH = 50;
