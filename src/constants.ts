export const CONFIRM_EMOJI = '✅';
export const DECLINE_EMOJI = '❌';
export const SUCCESS_COLOR = '#01FF01';

export const CONFIRMATION_DEFAULT_TIMEOUT = 30 * 1000;
export const FOURTEEN_MINUTES = 1000 * 60 * 14;

export const DIGITS_REGEX = /^\d+$/;
export const CHANNEL_ARG_REGEX = /^<#\d+>$/;

export const Colors = Object.freeze({
  SUCCESS: '#8bc34a',
  WARN: '#ffc107',
  DANGER: '#f44336',
} as const);

export const BULK_MESSAGES_LIMIT = 100;
export const MAX_MESSAGES_FETCH = 500;

export const MIN_REMINDER_INTERVAL = 10 * 60;
export const WAKE_INTERVAL = 10 * 60 * 1000;
export const MESSAGE_PREVIEW_LENGTH = 50;

export const YT_PLAYLIST_PAGE_SIZE = 50;
export const MAX_YT_PLAYLIST_PAGE_FETCHES = 4;

export const SPOTIFY_PLAYLIST_PAGE_SIZE = 50;
export const MAX_SPOTIFY_PLAYLIST_PAGE_FETCHES = 1;
