import {
  array,
  filterOutFalsy,
  getIntersection,
  shorten,
  parseDelay,
} from '../utils';

describe('utils', () => {
  describe('array', () => {
    it('converts a single element to an array', () => {
      expect(array('foo')).toEqual(['foo']);
    });

    it('works when passed an object', () => {
      expect(array({ foo: 'bar' })).toEqual([{ foo: 'bar' }]);
    });

    it('returns the original array if given an array', () => {
      expect(array(['foo', 'bar'])).toEqual(['foo', 'bar']);
    });
  });

  describe('filterOutFalsy', () => {
    it('filters out falsy values', () => {
      const filtered = filterOutFalsy(
        [0, 'false', 1, null, 2, undefined, 3, false, ''],
      );
      expect(filtered).toEqual(['false', 1, 2, 3]);
    });
  });

  describe('getIntersection', () => {
    const comparator = (el1: number, el2: number) => el1 === el2;
    it('returns the intersection', () => {
      const a = [1, 2, 3];
      const b = [2, 3, 4];
      const intersection = getIntersection(a, b, comparator);
      expect(intersection).toEqual([2, 3]);
    });
    it('maintains the order', () => {
      const a = [3, 2, 1];
      const b = [1, 3, 5];
      const intersection = getIntersection(a, b, comparator);
      expect(intersection).toEqual([3, 1]);
    });
  });

  describe('shorten', () => {
    it('does not shorten and does not include ellipsis on short message', () => {
      const shortenedMsg = shorten('foobar', 10);
      expect(shortenedMsg).toEqual('foobar');
    });
    it('shortens and includes ellipsis on long message', () => {
      const shortenedMsg = shorten('foobar', 5);
      expect(shortenedMsg).toEqual('fooba...');
    });
  });

  describe('parseDelay', () => {
    it('pure digit', () => {
      const expected = 600;
      expect(parseDelay('600')).toEqual(expected);
    });
    it('milliseconds', () => {
      const expected = 10;
      expect(parseDelay('10 ms')).toEqual(expected);
      expect(parseDelay('10 milliseconds')).toEqual(expected);
      expect(parseDelay('10 millisecond')).toEqual(expected);
    });
    it('seconds', () => {
      const expected = 10 * 1000;
      expect(parseDelay('10 seconds')).toEqual(expected);
      expect(parseDelay('10 secs')).toEqual(expected);
      expect(parseDelay('10 sec')).toEqual(expected);
      expect(parseDelay('10 s')).toEqual(expected);
    });
    it('minutes', () => {
      const expected = 10 * 60 * 1000;
      expect(parseDelay('10 minutes')).toEqual(expected);
      expect(parseDelay('10 minute')).toEqual(expected);
      expect(parseDelay('10 mins')).toEqual(expected);
      expect(parseDelay('10 min')).toEqual(expected);
    });
    it('hours', () => {
      const expected = 10 * 60 * 60 * 1000;
      expect(parseDelay('10 hours')).toEqual(expected);
      expect(parseDelay('10 hour')).toEqual(expected);
      expect(parseDelay('10 hr')).toEqual(expected);
      expect(parseDelay('10 h')).toEqual(expected);
    });
    it('days', () => {
      const expected = 10 * 24 * 60 * 60 * 1000;
      expect(parseDelay('10 days')).toEqual(expected);
      expect(parseDelay('10 day')).toEqual(expected);
      expect(parseDelay('10 d')).toEqual(expected);
    });
    it('throws for invalid input', () => {
      expect(() => parseDelay('random')).toThrowError();
    });
  });
});
