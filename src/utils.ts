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
