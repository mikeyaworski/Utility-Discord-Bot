import type { LogArg } from 'src/types';

/* eslint-disable no-console */

export function log(...args: LogArg[]): void {
  console.log(...args);
}

export function warn(...args: LogArg[]): void {
  console.warn(...args);
}

export function error(...args: LogArg[]): void {
  console.error(...args);
}

/* eslint-enable no-console */
