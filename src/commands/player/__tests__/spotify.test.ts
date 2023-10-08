import {
  LinkType,
  parseSpotifyLink,
} from '../spotify';

describe('spotify', () => {
  describe('parseSpotifyLink', () => {
    test('Valid playlist', async () => {
      const res = await parseSpotifyLink('https://open.spotify.com/playlist/foo?si=bar');
      expect(res.type).toEqual(LinkType.PLAYLIST);
      expect(res.id).toEqual('foo');
    });
    test('Valid album', async () => {
      const res = await parseSpotifyLink('https://open.spotify.com/album/foo?si=bar');
      expect(res.type).toEqual(LinkType.ALBUM);
      expect(res.id).toEqual('foo');
    });
    test('Valid track', async () => {
      const res = await parseSpotifyLink('https://open.spotify.com/track/foo?si=bar');
      expect(res.type).toEqual(LinkType.TRACK);
      expect(res.id).toEqual('foo');
    });
    test('Valid artist', async () => {
      const res = await parseSpotifyLink('https://open.spotify.com/artist/foo?si=bar');
      expect(res.type).toEqual(LinkType.ARTIST);
      expect(res.id).toEqual('foo');
    });
    test('Invalid spotify link', async () => {
      expect(parseSpotifyLink('https://open.spotify.com/foobar/foo?si=bar&dl_branch=1')).rejects.toThrowError();
    });
    test('Totally wrong link', async () => {
      expect(parseSpotifyLink('https://youtube.com/watch?v=foobar')).rejects.toThrowError();
    });
    test('Not even a link', async () => {
      expect(parseSpotifyLink('foobar')).rejects.toThrowError();
    });
  });
});
