import dotenv from 'dotenv';
import axios from 'axios';
import Spotify from 'spotify-url-info';
import uniq from 'lodash.uniq';

import { error } from 'src/logging';
import type { IntentionalAny } from 'src/types';
import {
  SPOTIFY_API_ROOT,
  MAX_SPOTIFY_PAGE_FETCHES,
  SPOTIFY_ABLUMS_FETCH_SIZE,
  SPOTIFY_PAGE_SIZE,
  MAX_QUEUE_LENGTH,
} from 'src/constants';
import chunk from 'lodash.chunk';
import get from 'lodash.get';
import { Query, QueryType } from './types';

dotenv.config();

const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;

export enum LinkType {
  PLAYLIST,
  ALBUM,
  TRACK,
  ARTIST,
}

interface ParsedLink {
  type: LinkType,
  id: string,
}

// TODO: Type the Spotify API responses

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
    case 'artist': {
      return {
        type: LinkType.ARTIST,
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
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'content-type': 'application/x-www-form-urlencoded',
        authorization: getSpotifyAuth(),
      },
    });
    accessTokenExpiry = Date.now() + res.data.expires_in * 1000;
    accessToken = res.data.access_token;
    return res.data.access_token;
  };
})();

export function getQueryFromSpotifyTrack(track: IntentionalAny): Query {
  // TODO: Consider adding "lyrics" or "audio" back to the end of this query.
  // The problem is that for certain tracks, e.g. https://open.spotify.com/track/6j5mgCnmTNqU5h9dzY2aUH,
  // this results in YouTube finding a bad result.
  // Auto-generated songs by YouTube are the best search results to find since it won't be a music video and it will be high quality.
  // We search "Provided to YouTube by" since the auto-generated videos seem to all have this at the top of the description.
  // E.g. https://www.youtube.com/watch?v=BLZWkjBXfN8
  const query = `${
    track.name
  } ${
    track.artists.map((artist: IntentionalAny) => artist.name).join(' ')
  } Provided to Youtube by`;
  const sourceLink: string | undefined = get(track, [
    'external_urls',
    'spotify',
  ]);
  return {
    query,
    sourceLink,
    type: QueryType.SPOTIFY_LINK,
  };
}

async function fetchSpotify(route: string, params: [string, string][] = []): Promise<IntentionalAny> {
  const url = new URL(`${SPOTIFY_API_ROOT}${route}`);
  params.forEach(([name, value]) => {
    url.searchParams.set(name, value);
  });
  const accessToken = await getSpotifyAccessToken();
  const res = await axios.get(url.href, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  return res.data;
}

async function paginate(next: string | null): Promise<IntentionalAny[]> {
  const accessToken = await getSpotifyAccessToken();
  let numFetches = 0;
  const items: IntentionalAny[] = [];
  while (next && numFetches < MAX_SPOTIFY_PAGE_FETCHES) {
    const res = await axios.get(next, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    next = res.data.next;
    items.push(...res.data.items);
    numFetches += 1;
  }
  return items;
}

async function paginateSpotifyApi(route: string, params: [string, string][] = []): Promise<IntentionalAny[]> {
  const url = new URL(`${SPOTIFY_API_ROOT}${route}`);
  url.searchParams.set('limit', String(SPOTIFY_PAGE_SIZE));
  params.forEach(([name, value]) => {
    url.searchParams.set(name, value);
  });
  return paginate(url.href);
}

async function getSpotifyTracksFallback(link: string): Promise<Query[]> {
  // This is capped at 100
  const tracks = await Spotify.getTracks(link);
  return tracks.map(track => getQueryFromSpotifyTrack(track));
}

export async function parseSpotifyPlaylist(link: string): Promise<Query[]> {
  const { id: playlistId } = parseSpotifyLink(link);
  try {
    const items = await paginateSpotifyApi(`/playlists/${playlistId}/tracks`, [
      ['fields', 'next,items(track(name,artists,external_urls))'],
    ]);
    return items.map((item: IntentionalAny) => getQueryFromSpotifyTrack(item.track));
  } catch (err) {
    error(err);
    return getSpotifyTracksFallback(link);
  }
}

export async function parseSpotifyAlbum(link: string): Promise<Query[]> {
  const { id: albumId } = parseSpotifyLink(link);
  try {
    const items = await paginateSpotifyApi(`/albums/${albumId}/tracks`);
    return items.map((item: IntentionalAny) => getQueryFromSpotifyTrack(item));
  } catch (err) {
    error(err);
    return getSpotifyTracksFallback(link);
  }
}

async function fetchSpotifyAlbums(albumIds: string[]): Promise<IntentionalAny[]> {
  const chunks = chunk(albumIds, SPOTIFY_ABLUMS_FETCH_SIZE).slice(0, MAX_SPOTIFY_PAGE_FETCHES);
  return Promise.all(chunks.map(async chunk => {
    const res = await fetchSpotify('/albums', [
      ['ids', chunk.join(',')],
    ]);
    return res.albums;
  })).then((chunks: IntentionalAny[]) => chunks.flat());
}

export async function parseSpotifyArtist(link: string): Promise<Query[]> {
  const { id: artistId } = parseSpotifyLink(link);
  try {
    const topTracks = await fetchSpotify(`/artists/${artistId}/top-tracks`, [
      ['market', 'US'],
    ]).then(r => r.tracks);
    const topTrackIds = new Set(topTracks.map((track: IntentionalAny) => track.id));
    const items = await paginateSpotifyApi(`/artists/${artistId}/albums`, [
      // 'album,single' is an alternative query, but it seems to return a lot duplicate & irrelevant results
      ['include_groups', 'album'],
    ]);
    const albumIds: string[] = items.map((item: IntentionalAny) => item.id);
    const albums = await fetchSpotifyAlbums(albumIds);
    const albumTracks = await Promise.all(albums.map(async album => {
      const { items, next } = album.tracks;
      const paginatedItems = await paginate(next);
      return items.concat(paginatedItems);
    })).then(chunks => chunks.flat());
    const tracks = [
      ...topTracks,
      ...albumTracks.filter(track => !topTrackIds.has(track.id)),
    ];
    return uniq(tracks.map(track => getQueryFromSpotifyTrack(track))).slice(0, MAX_QUEUE_LENGTH);
  } catch (err) {
    error(err);
    return getSpotifyTracksFallback(link);
  }
}

export async function parseSpotifyTrack(link: string): Promise<Query> {
  const { id: trackId } = parseSpotifyLink(link);
  try {
    const data = await fetchSpotify(`/tracks/${trackId}`);
    return getQueryFromSpotifyTrack(data);
  } catch (err) {
    error(err);
    const res = await Spotify.getData(link);
    return getQueryFromSpotifyTrack(res);
  }
}
