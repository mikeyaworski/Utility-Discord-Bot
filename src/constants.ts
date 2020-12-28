import dotenv from 'dotenv';

dotenv.config();

export const CONFIRM_REACTION = '✅';
export const DECLINE_REACTION = '❌';
export const CONFIRMATION_DEFAULT_TIMEOUT = 30 * 1000;

export const Colors = Object.freeze({
  SUCCESS: '#8bc34a',
  WARN: '#ffc107',
  DANGER: '#f44336',
});

export const BULK_MESSAGES_LIMIT = 100;
export const MAX_MESSAGES_FETCH = 500;

export const WAKE_INTERVAL = 10 * 60 * 1000;
export const COMMAND_PREFIX = process.env.ENVIRONMENT === 'production' ? '!' : '/';
export const MESSAGE_PREVIEW_LENGTH = 50;
