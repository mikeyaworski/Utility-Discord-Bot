import axios from 'axios';

import { IntentionalAny } from 'src/types';
import { MAX_SPOTIFY_PLAYLIST_PAGE_FETCHES, SPOTIFY_PLAYLIST_PAGE_SIZE } from 'src/constants';

const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;

function getSpotifyAuth() {
  if (!spotifyClientId || !spotifyClientSecret) throw new Error('Spotify API not configured.');
  return `Basic ${
    Buffer.from(`${spotifyClientId}:${spotifyClientSecret}`).toString('base64')
  }`;
}

const getSpotifyAccessToken = (() => {
  let accessToken: string | undefined;
  let accessTokenExpiry: number | null; // timestamp in ms
  return async (): Promise<string> => {
    if (accessTokenExpiry && accessToken && Date.now() < accessTokenExpiry) return accessToken;
    const data = new URLSearchParams({ grant_type: 'client_credentials' });
    const res = await axios.post('https://accounts.spotify.com/api/token', data, {
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: getSpotifyAuth(),
      },
    });
    accessTokenExpiry = Date.now() + res.data.expires_in * 1000;
    accessToken = res.data.access_token;
    return res.data.access_token;
  };
})();

export function getQueryFromSpotifyTrack(track: IntentionalAny): string {
  return `${
    track.name
  } ${
    track.artists.map((artist: IntentionalAny) => artist.name).join(' ')
  }`;
}

async function paginateSpotifyApi(route: string, params: [string, string][] = []): Promise<IntentionalAny> {
  const accessToken = await getSpotifyAccessToken();

  const url = new URL(`https://api.spotify.com/v1/${route}`);
  url.searchParams.set('limit', String(SPOTIFY_PLAYLIST_PAGE_SIZE));
  params.forEach(([name, value]) => {
    url.searchParams.set(name, value);
  });

  let numFetches = 0;
  const items: IntentionalAny[] = [];
  let next = url.href;
  do {
    const res = await axios.get(next, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    next = res.data.next;
    items.push(...res.data.items);
    numFetches += 1;
  } while (next && numFetches < MAX_SPOTIFY_PLAYLIST_PAGE_FETCHES);

  return items;
}

export async function parseSpotifyPlaylist(playlistId: string): Promise<string[]> {
  const items = await paginateSpotifyApi(`playlists/${playlistId}/tracks`, [
    ['fields', 'next,items(track(name,artists))'],
  ]);
  return items.map((item: IntentionalAny) => getQueryFromSpotifyTrack(item.track));
}

export async function parseSpotifyAlbum(albumId: string): Promise<string[]> {
  const items = await paginateSpotifyApi(`albums/${albumId}/tracks`);
  return items.map((item: IntentionalAny) => getQueryFromSpotifyTrack(item));
}

export async function parseSpotifyTrack(trackId: string): Promise<string> {
  const accessToken = await getSpotifyAccessToken();
  const res = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  return getQueryFromSpotifyTrack(res.data);
}

export enum LinkType {
  PLAYLIST,
  ALBUM,
  TRACK,
}

interface ParsedLink {
  type: LinkType,
  id: string,
}

export function parseSpotifyLink(link: string): ParsedLink {
  const url = new URL(link);
  if (url.origin !== 'https://open.spotify.com') {
    throw new Error('That is not a Spotify link.');
  }
  const [route, id] = url.pathname.substring(1).split('/');
  switch (route) {
    case 'playlist': {
      return {
        type: LinkType.PLAYLIST,
        id,
      };
    }
    case 'album': {
      return {
        type: LinkType.ALBUM,
        id,
      };
    }
    case 'track': {
      return {
        type: LinkType.TRACK,
        id,
      };
    }
    default: {
      throw new Error('Could not parse Spotify link.');
    }
  }
}
