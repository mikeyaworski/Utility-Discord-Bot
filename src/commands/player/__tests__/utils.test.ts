import {
  getTrackDurationString,
} from '../utils';

// Mock this so the DB doesn't get initialized from importing the client in discord-utils
jest.mock('src/client', () => ({}));

describe('player/utils', () => {
  describe('getTrackDurationString', () => {
    test('57s', async () => {
      expect(getTrackDurationString(0, 57000)).toBe('00:00 / 00:57');
    });
    test('65s', async () => {
      expect(getTrackDurationString(5000, 65000)).toBe('00:05 / 01:05');
    });
  });
});
