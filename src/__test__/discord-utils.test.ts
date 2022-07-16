import {
  isCustomEmoji,
  isEmoji,
  getResolvableEmoji,
  parseArguments,
  getChannelIdFromArg,
} from '../discord-utils';

// Mock this so the DB doesn't get initialized from importing the client in discord-utils
jest.mock('src/client', () => ({
  client: {
    channels: {
      fetch: (channelId: string) => ({ id: getChannelIdFromArg(channelId) }),
    },
  },
}));
jest.mock('discord.js', () => ({}));

describe('discord-utils', () => {
  describe('isCustomEmoji', () => {
    it('works for regular', () => {
      expect(isCustomEmoji('<:foo_bar:1234>')).toBe(true);
    });
    it('works for animated', () => {
      expect(isCustomEmoji('<a:foo_bar:1234>')).toBe(true);
    });
    it('rejects unicode emojis', () => {
      expect(isCustomEmoji('👍')).toBe(false);
    });
  });
  describe('isEmoji', () => {
    it('works for regular custom', () => {
      expect(isEmoji('<:foo_bar:1234>')).toBe(true);
    });
    it('works for animated custom', () => {
      expect(isEmoji('<a:foo_bar:1234>')).toBe(true);
    });
    it('works for unicode emojis', () => {
      expect(isEmoji('👍')).toBe(true);
    });
    it('rejects random strings', () => {
      expect(isEmoji('foobar')).toBe(false);
    });
  });
  describe('getResolvableEmoji', () => {
    it('works for regular custom emojis', () => {
      expect(getResolvableEmoji('<:foo_bar:1234>')).toBe('1234');
    });
    it('works for animated custom emojis', () => {
      expect(getResolvableEmoji('<:foo_bar:1234>')).toBe('1234');
    });
    it('works for unicode emojis', () => {
      expect(getResolvableEmoji('👍')).toBe('👍');
    });
  });
  describe('parseArguments', () => {
    it('foo', async () => {
      const args = await parseArguments('foo');
      expect(args).toEqual(['foo']);
    });
    it('foo bar', async () => {
      const args = await parseArguments('foo bar');
      expect(args).toEqual(['foo', 'bar']);
    });
    it('"foo bar"', async () => {
      const args = await parseArguments('"foo bar"');
      expect(args).toEqual(['foo bar']);
    });
    it('"foo" "bar"', async () => {
      const args = await parseArguments('"foo" "bar"');
      expect(args).toEqual(['foo', 'bar']);
    });
    it('\'foo bar\'', async () => {
      const args = await parseArguments('\'foo bar\'');
      expect(args).toEqual(['foo bar']);
    });
    it('\'foo\' \'bar\'', async () => {
      const args = await parseArguments('\'foo\' \'bar\'');
      expect(args).toEqual(['foo', 'bar']);
    });
    it('\'foo\' \'bar\'', async () => {
      const args = await parseArguments('\'foo\' \'bar\'');
      expect(args).toEqual(['foo', 'bar']);
    });
    it('test1 test2 "test3" "test4" "test5 test6" test7 \'test8 test9\' 👍 test10', async () => {
      const args = await parseArguments('test1 test2 "test3" "test4" "test5 test6" test7 \'test8 test9\' 👍 test10');
      expect(args).toEqual(['test1', 'test2', 'test3', 'test4', 'test5 test6', 'test7', 'test8 test9', '👍', 'test10']);
    });
    it('"some question" 👍 "Option 1" 👎 "Option 2"', async () => {
      const args = await parseArguments('"some question" 👍 "Option 1" 👎 "Option 2"');
      expect(args).toEqual(['some question', '👍', 'Option 1', '👎', 'Option 2']);
    });
    it('"foo" <#12345> bar', async () => {
      const args = await parseArguments('"foo" <#12345> bar');
      expect(args).toEqual(['foo', { id: '12345' }, 'bar']);
    });
    it('"foo" <#12345> bar', async () => {
      const args = await parseArguments('"foo" <#12345> bar', { parseChannels: false });
      expect(args).toEqual(['foo', '<#12345>', 'bar']);
    });
  });
});
