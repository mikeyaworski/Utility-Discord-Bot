import {
  array,
  filterOutFalsy,
  getIntersection,
  shorten,
  parseDelay,
  isYoutubeLink,
  isTwitchVodLink,
  getClockString,
  getSecondsFromClockString,
  getUniqueId,
} from '../utils';

describe('utils', () => {
  describe('array', () => {
    test('converts a single element to an array', () => {
      expect(array('foo')).toEqual(['foo']);
    });

    test('works when passed an object', () => {
      expect(array({ foo: 'bar' })).toEqual([{ foo: 'bar' }]);
    });

    test('returns the original array if given an array', () => {
      expect(array(['foo', 'bar'])).toEqual(['foo', 'bar']);
    });
  });

  describe('filterOutFalsy', () => {
    test('filters out falsy values', () => {
      const filtered = filterOutFalsy(
        [0, 'false', 1, null, 2, undefined, 3, false, ''],
      );
      expect(filtered).toEqual(['false', 1, 2, 3]);
    });
  });

  describe('getIntersection', () => {
    const comparator = (el1: number, el2: number) => el1 === el2;
    test('returns the intersection', () => {
      const a = [1, 2, 3];
      const b = [2, 3, 4];
      const intersection = getIntersection(a, b, comparator);
      expect(intersection).toEqual([2, 3]);
    });
    test('maintains the order', () => {
      const a = [3, 2, 1];
      const b = [1, 3, 5];
      const intersection = getIntersection(a, b, comparator);
      expect(intersection).toEqual([3, 1]);
    });
  });

  describe('shorten', () => {
    test('does not shorten and does not include ellipsis on short message', () => {
      const shortenedMsg = shorten('foobar', 10);
      expect(shortenedMsg).toEqual('foobar');
    });
    test('shortens and includes ellipsis on long message', () => {
      const shortenedMsg = shorten('foobar', 5);
      expect(shortenedMsg).toEqual('fooba...');
    });
  });

  describe('parseDelay', () => {
    test('pure digit', () => {
      const expected = 600;
      expect(parseDelay('600')).toEqual(expected);
    });
    test('milliseconds', () => {
      const expected = 10;
      expect(parseDelay('10 ms')).toEqual(expected);
      expect(parseDelay('10 milliseconds')).toEqual(expected);
      expect(parseDelay('10 millisecond')).toEqual(expected);
      expect(parseDelay('10ms')).toEqual(expected);
    });
    test('seconds', () => {
      const expected = 10 * 1000;
      expect(parseDelay('10 seconds')).toEqual(expected);
      expect(parseDelay('10 secs')).toEqual(expected);
      expect(parseDelay('10 sec')).toEqual(expected);
      expect(parseDelay('10 s')).toEqual(expected);
      expect(parseDelay('10s')).toEqual(expected);
    });
    test('minutes', () => {
      const expected = 10 * 60 * 1000;
      expect(parseDelay('10 minutes')).toEqual(expected);
      expect(parseDelay('10 minute')).toEqual(expected);
      expect(parseDelay('10 mins')).toEqual(expected);
      expect(parseDelay('10 min')).toEqual(expected);
      expect(parseDelay('10min')).toEqual(expected);
    });
    test('hours', () => {
      const expected = 10 * 60 * 60 * 1000;
      expect(parseDelay('10 hours')).toEqual(expected);
      expect(parseDelay('10 hour')).toEqual(expected);
      expect(parseDelay('10 hr')).toEqual(expected);
      expect(parseDelay('10 h')).toEqual(expected);
      expect(parseDelay('10h')).toEqual(expected);
    });
    test('days', () => {
      const expected = 10 * 24 * 60 * 60 * 1000;
      expect(parseDelay('10 days')).toEqual(expected);
      expect(parseDelay('10 day')).toEqual(expected);
      expect(parseDelay('10 d')).toEqual(expected);
      expect(parseDelay('10d')).toEqual(expected);
    });
    test('throws for invalid input', () => {
      expect(() => parseDelay('random')).toThrowError();
    });
  });

  describe('isYoutubeLink', () => {
    test('proper link', () => {
      expect(isYoutubeLink('https://youtube.com/watch?v=QnL5P0tFkwM')).toBe(true);
    });
    test('proper link', () => {
      expect(isYoutubeLink('https://youtube.com/watch?v=QnL5P0t-FkwM')).toBe(true);
    });
    test('proper link', () => {
      expect(isYoutubeLink('https://youtube.com/watch?v=QnL5P0t_FkwM')).toBe(true);
    });
    test('www', () => {
      expect(isYoutubeLink('https://www.youtube.com/watch?v=QnL5P0tFkwM')).toBe(true);
    });
    test('extra query parameters', () => {
      expect(isYoutubeLink('https://www.youtube.com/watch?v=QnL5P0tFkwM&foo=bar')).toBe(false);
    });
    test('invalid link', () => {
      expect(isYoutubeLink('https://twitter.com')).toBe(false);
    });
  });

  describe('isTwitchVodLink', () => {
    test('proper link', () => {
      expect(isTwitchVodLink('https://twitch.tv/videos/12345')).toBe(true);
    });
    test('www', () => {
      expect(isTwitchVodLink('https://www.twitch.tv/videos/12345')).toBe(true);
    });
    test('invalid link', () => {
      expect(isTwitchVodLink('https://twitch.tv/foobar')).toBe(false);
    });
  });

  describe('getClockString', () => {
    test('0', () => {
      expect(getClockString(0)).toBe('0');
    });
    test('1s', () => {
      expect(getClockString(1000)).toBe('01');
    });
    test('5s', () => {
      expect(getClockString(5000)).toBe('05');
    });
    test('1m', () => {
      expect(getClockString(60 * 1000)).toBe('01:00');
    });
    test('1m 5s', () => {
      expect(getClockString(60 * 1000 + 5 * 1000)).toBe('01:05');
    });
    test('1h', () => {
      expect(getClockString(60 * 60 * 1000)).toBe('01:00:00');
    });
    test('1h 5s', () => {
      expect(getClockString(60 * 60 * 1000 + 5 * 1000)).toBe('01:00:05');
    });
    test('1h 10m 5s', () => {
      expect(getClockString(60 * 60 * 1000 + 10 * 60 * 1000 + 5 * 1000)).toBe('01:10:05');
    });
    test('min portion length', () => {
      expect(getClockString(0, 1)).toBe('00');
      expect(getClockString(0, 2)).toBe('00:00');
      expect(getClockString(0, 3)).toBe('00:00:00');
      expect(getClockString(1000, 2)).toBe('00:01');
      expect(getClockString(1000, 3)).toBe('00:00:01');
      expect(getClockString(60 * 1000, 2)).toBe('01:00');
      expect(getClockString(60 * 1000, 3)).toBe('00:01:00');
      expect(getClockString(60 * 60 * 1000, 3)).toBe('01:00:00');
    });
  });

  describe('getSecondsFromClockString', () => {
    test('0', () => {
      expect(getSecondsFromClockString('0')).toBe(0);
    });
    test('10', () => {
      expect(getSecondsFromClockString('10')).toBe(10);
    });
    test('1:00', () => {
      expect(getSecondsFromClockString('1:00')).toBe(60);
    });
    test('2:05', () => {
      expect(getSecondsFromClockString('2:05')).toBe(125);
    });
    test('2:5', () => {
      expect(getSecondsFromClockString('2:5')).toBe(125);
    });
    test('2:3:5', () => {
      expect(getSecondsFromClockString('2:3:5')).toBe(2 * 3600 + 3 * 60 + 5);
    });
    test('02:03:05', () => {
      expect(getSecondsFromClockString('02:03:05')).toBe(2 * 3600 + 3 * 60 + 5);
    });
    test('01:00:5', () => {
      expect(getSecondsFromClockString('01:00:5')).toBe(3600 + 5);
    });
    test('01:02:03:04', () => {
      expect(() => getSecondsFromClockString('01:02:03:04')).toThrowError();
    });
    test('foobar', () => {
      expect(() => getSecondsFromClockString('foobar')).toThrowError();
    });
  });

  describe('getUniqueId', () => {
    test('first call', () => {
      expect(getUniqueId()).toBe(1);
    });
    test('second call', () => {
      expect(getUniqueId()).toBe(2);
    });
    test('third call', () => {
      expect(getUniqueId()).toBe(3);
    });
  });
});
