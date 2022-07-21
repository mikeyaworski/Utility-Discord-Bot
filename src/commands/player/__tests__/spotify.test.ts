import {
  LinkType,
  parseSpotifyLink,
} from '../spotify';

describe('spotify', () => {
  describe('parseSpotifyLink', () => {
    test('Valid playlist', () => {
      const res = parseSpotifyLink('https://open.spotify.com/playlist/foo?si=bar');
      expect(res.type).toEqual(LinkType.PLAYLIST);
      expect(res.id).toEqual('foo');
    });
    test('Valid album', () => {
      const res = parseSpotifyLink('https://open.spotify.com/album/foo?si=bar');
      expect(res.type).toEqual(LinkType.ALBUM);
      expect(res.id).toEqual('foo');
    });
    test('Valid track', () => {
      const res = parseSpotifyLink('https://open.spotify.com/track/foo?si=bar');
      expect(res.type).toEqual(LinkType.TRACK);
      expect(res.id).toEqual('foo');
    });
    test('Valid artist', () => {
      const res = parseSpotifyLink('https://open.spotify.com/artist/foo?si=bar');
      expect(res.type).toEqual(LinkType.ARTIST);
      expect(res.id).toEqual('foo');
    });
    test('Invalid spotify link', () => {
      expect(() => {
        parseSpotifyLink('https://open.spotify.com/foobar/foo?si=bar&dl_branch=1');
      }).toThrowError();
    });
    test('Totally wrong link', () => {
      expect(() => {
        parseSpotifyLink('https://youtube.com/watch?v=foobar');
      }).toThrowError();
    });
    test('Not even a link', () => {
      expect(() => {
        parseSpotifyLink('foobar');
      }).toThrowError();
    });
  });
});
