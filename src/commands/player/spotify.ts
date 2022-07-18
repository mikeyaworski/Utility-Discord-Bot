import dotenv from 'dotenv';
import axios from 'axios';
import Spotify from 'spotify-url-info';

import { error } from 'src/logging';
import type { IntentionalAny } from 'src/types';
import { MAX_SPOTIFY_PLAYLIST_PAGE_FETCHES, SPOTIFY_PLAYLIST_PAGE_SIZE } from 'src/constants';

dotenv.config();

const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;

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

function isSpotifySetUp() {
  return spotifyClientId && spotifyClientSecret;
}

function getSpotifyAuth() {
  if (!isSpotifySetUp()) throw new Error('Spotify API not configured.');
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
  // TODO: Consider adding "lyrics" or "audio" back to the end of this query.
  // The problem is that for certain tracks, e.g. https://open.spotify.com/track/6j5mgCnmTNqU5h9dzY2aUH,
  // this results in YouTube finding a bad result.
  return `${
    track.name
  } ${
    track.artists.map((artist: IntentionalAny) => artist.name).join(' ')
  } lyrics`;
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

export async function parseSpotifyPlaylist(link: string): Promise<string[]> {
  const { id: playlistId } = parseSpotifyLink(link);
  try {
    const items = await paginateSpotifyApi(`playlists/${playlistId}/tracks`, [
      ['fields', 'next,items(track(name,artists))'],
    ]);
    return items.map((item: IntentionalAny) => getQueryFromSpotifyTrack(item.track));
  } catch (err) {
    error(err);
    // This is capped at 100
    const tracks = await Spotify.getTracks(link);
    return tracks.map(track => getQueryFromSpotifyTrack(track));
  }
}

export async function parseSpotifyAlbum(link: string): Promise<string[]> {
  const { id: albumId } = parseSpotifyLink(link);
  try {
    const items = await paginateSpotifyApi(`albums/${albumId}/tracks`);
    return items.map((item: IntentionalAny) => getQueryFromSpotifyTrack(item));
  } catch (err) {
    error(err);
    // This is capped at 100
    const tracks = await Spotify.getTracks(link);
    return tracks.map(track => getQueryFromSpotifyTrack(track));
  }
}

export async function parseSpotifyTrack(link: string): Promise<string> {
  const { id: trackId } = parseSpotifyLink(link);
  try {
    const accessToken = await getSpotifyAccessToken();
    const res = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    return getQueryFromSpotifyTrack(res.data);
  } catch (err) {
    error(err);
    const res = await Spotify.getData(link);
    return getQueryFromSpotifyTrack(res);
  }
}
