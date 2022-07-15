import axios from 'axios';
import YouTubeSr from 'youtube-sr';
import pLimit from 'p-limit';

import type { IntentionalAny } from 'src/types';
import { CONCURRENCY_LIMIT, MAX_YT_PLAYLIST_PAGE_FETCHES, YT_PLAYLIST_PAGE_SIZE } from 'src/constants';
import { log, error } from 'src/logging';
import { filterOutFalsy } from 'src/utils';
import chunk from 'lodash.chunk';
import Track, { TrackVariant } from './track';

type TracksFetchedCallback = (newTracks: Track[]) => void;

export const getTracksFromQueries = (() => {
  const queryCache = new Map<string, string>();
  return async (queries: string[], tracksFetchedCb?: TracksFetchedCallback): Promise<Track[]> => {
    // Arbitrary concurrency limit to prevent rate limiting or audio hitching.
    const limit = pLimit(CONCURRENCY_LIMIT);
    const promises = queries.map(query => limit(async () => {
      try {
        if (queryCache.has(query)) {
          return new Track(queryCache.get(query)!, TrackVariant.YOUTUBE_VOD);
        }
        const res = await YouTubeSr.searchOne(query, 'video');
        const youtubeLink = `https://youtube.com/watch?v=${res.id}`;
        const youtubeTitle = res.title;
        const youtubeDuration = res.duration;
        queryCache.set(query, youtubeLink);
        const newTrack = new Track(youtubeLink, TrackVariant.YOUTUBE_VOD, youtubeTitle ? {
          title: youtubeTitle,
          duration: youtubeDuration,
        } : undefined);
        // We can't do this because this messes with the order of the queries that get enqueued
        // if (tracksFetchedCb) {
        //   tracksFetchedCb([newTrack]);
        // }
        return newTrack;
      } catch (err) {
        log('Could not fetch YouTube link for query', query);
        return null;
      }
    }));

    // Chunk this and do it sequentially so we can maintain the original queueing order,
    // but still provide incremental progress while we continually fetch
    const chunks = chunk(promises, CONCURRENCY_LIMIT);
    for (let i = 0; i < chunks.length; i++) {
      const tracks = await Promise.all(chunks[i]);
      if (tracksFetchedCb) {
        tracksFetchedCb(filterOutFalsy(tracks));
      }
    }

    const newQueryTracks = await Promise.all(promises);
    return filterOutFalsy(newQueryTracks);
  };
})();

export async function parseYoutubePlaylistFromApi(playlistUrl: string): Promise<Track[]> {
  if (!process.env.YOUTUBE_API_KEY) throw new Error('YouTube API key not configured.');

  const url = new URL(playlistUrl);
  const playlistId = url.searchParams.get('list');

  let numPagesFetched = 0;
  let nextPageToken: string | undefined;
  const tracks: Track[] = [];

  do {
    const res = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
      params: {
        playlistId,
        maxResults: YT_PLAYLIST_PAGE_SIZE,
        part: 'snippet',
        key: process.env.YOUTUBE_API_KEY,
        pageToken: nextPageToken,
      },
    });
    numPagesFetched += 1;
    nextPageToken = res.data.nextPageToken;
    const youtubeResults: { link: string, title: string }[] = res.data.items
      .filter((item: IntentionalAny) => item.snippet?.resourceId?.kind === 'youtube#video')
      .map((item: IntentionalAny) => ({
        link: `https://youtube.com/watch?v=${item.snippet?.resourceId.videoId}`,
        title: item.snippet?.title,
      }));
    tracks.push(...youtubeResults.map(({ link, title }) => new Track(link, TrackVariant.YOUTUBE_VOD, {
      title,
    })));
  } while (nextPageToken && numPagesFetched < MAX_YT_PLAYLIST_PAGE_FETCHES);

  return tracks;
}

export async function parseYoutubePlaylist(playlistUrl: string): Promise<Track[]> {
  try {
    const res = await parseYoutubePlaylistFromApi(playlistUrl);
    return res;
  } catch (err) {
    error(err);
    const limit = YT_PLAYLIST_PAGE_SIZE * MAX_YT_PLAYLIST_PAGE_FETCHES;
    const playlist = await YouTubeSr.getPlaylist(playlistUrl, { limit });
    const allResults = await playlist.fetch(limit);
    return allResults.videos.map(video => new Track(video.url, TrackVariant.YOUTUBE_VOD, video.title ? {
      title: video.title,
    } : undefined));
  }
}

export const getDetailsFromUrl = (() => {
  interface Details {
    title: string,
    duration?: number,
  }
  const cache = new Map<string, Details>();
  return async (url: string): Promise<Details> => {
    if (cache.has(url)) return cache.get(url)!;
    log('Fetching YouTube title for video', url);
    const videoRes = await YouTubeSr.getVideo(url);
    const { title, duration } = videoRes;
    if (!title) throw new Error('Could not fetch title');
    cache.set(url, { title, duration });
    return { title, duration };
  };
})();
