import {
  getIntersection,
  shorten,
} from '../utils';

describe('utils', () => {
  describe('getIntersection', () => {
    const comparator = (el1, el2) => el1 === el2;
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
});
