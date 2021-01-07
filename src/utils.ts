/**
 * Returns the intersection of two arrays (in the order of a)
 * @param a An array
 * @param b An array
 * @param comparator (optional) A comparator function for two elements
 *   (one from a and one from b).
 */
export function getIntersection<T>(
  a: T[],
  b: T[],
  comparator: (elA: T, elB: T) => boolean,
): T[] {
  return a.filter(elA => {
    return b.some(elB => {
      return comparator(elA, elB);
    });
  });
}

/**
 * Cuts text to a certain length and if the text exceeds the length, appends an ellipsis to the end.
 */
export function shorten(msg: string, length: number): string {
  if (msg.length <= length) return msg;
  return `${msg.substring(0, length)}...`;
}

/**
 * For parsing command input of delays. Note that this function is NOT used for parsing input of dates.
 * Throws an error if it's not parsable.
 * TODO: support months and years as well
 * @param {string} arg Some string representation of time, e.g. "600" or "10 minutes" or "July 10th".
 *   If the argument is purely numeric, then it will be treated as milliseconds.
 * @returns An integer representing the number of milliseconds for delay.
 */
export function parseDelay(arg: string): number {
  arg = arg.trim();
  const pureDigits = /^\d+$/;
  const milliseconds = /\d+\s(ms|milliseconds?)$/;
  const secs = /\d+\s(s|secs?|seconds?)$/;
  const mins = /\d+\s(m|mins?|minutes?)$/;
  const hours = /\d+\s(hr?|hours?)$/;
  const days = /\d+\s(d|days?)$/;
  if (pureDigits.test(arg)) {
    return parseInt(arg, 10);
  }
  const numericalMatch = arg.match(/\d+/);
  const numericalPart = numericalMatch ? parseInt(numericalMatch[0], 10) : null;
  let unitMultiplier: number | null = null;
  if (milliseconds.test(arg)) {
    unitMultiplier = 1;
  }
  if (secs.test(arg)) {
    unitMultiplier = 1000;
  }
  if (mins.test(arg)) {
    unitMultiplier = 60 * 1000;
  }
  if (hours.test(arg)) {
    unitMultiplier = 60 * 60 * 1000;
  }
  if (days.test(arg)) {
    unitMultiplier = 24 * 60 * 60 * 1000;
  }
  if (!numericalPart || !unitMultiplier) {
    throw new Error(`Could not parse delay: ${arg}`);
  }
  return numericalPart * unitMultiplier;
}
