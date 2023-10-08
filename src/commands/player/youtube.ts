import axios from 'axios';
import YouTubeSr from 'youtube-sr';
import pLimit from 'p-limit';
import { parse as parseIso8601Duration, toSeconds } from 'iso8601-duration';

import type { GenericMapping, IntentionalAny } from 'src/types';
import { CONCURRENCY_LIMIT, MAX_YT_PLAYLIST_PAGE_FETCHES, YT_PLAYLIST_PAGE_SIZE } from 'src/constants';
import { log, error } from 'src/logging';
import { filterOutFalsy } from 'src/utils';
import chunk from 'lodash.chunk';
import Track, { TrackVariant, VideoDetails } from './track';
import { Query, QueryType } from './types';

type TracksFetchedCallback = (newTracks: Track[]) => void;

export const getTracksFromQueries = (() => {
  const queryCache = new Map<string, string>();
  return async (queries: Query[], tracksFetchedCb?: TracksFetchedCallback): Promise<Track[]> => {
    // Arbitrary concurrency limit to prevent rate limiting or audio hitching.
    const limit = pLimit(CONCURRENCY_LIMIT);
    const promises = queries.map(({ query, sourceLink, type }) => limit(async () => {
      try {
        if (queryCache.has(query)) {
          return new Track({
            link: queryCache.get(query)!,
            variant: TrackVariant.YOUTUBE_VOD,
            sourceLink,
          });
        }
        const [firstResult, secondResult] = await YouTubeSr.search(query, {
          type: 'video',
          limit: 2,
        });
        // For some queries, like "Justin Bieber What Do You Mean", the first result has no indiciation that it's a music video,
        // but we need to somehow still prefer the second result, so we've decided that if the second result includes "lyrics", that is preferred
        const firstResultIsMusicVideo = [
          'music video',
          'hd video',
        ].some(match => firstResult?.title?.toLowerCase().includes(match));
        const secondResultIsLyrics = secondResult?.title?.toLowerCase().includes('lyrics');
        const shouldUseSecondResult = secondResult
          && type === QueryType.SPOTIFY_LINK
          && (firstResultIsMusicVideo || secondResultIsLyrics);
        const res = shouldUseSecondResult ? secondResult : firstResult;
        const youtubeLink = `https://youtube.com/watch?v=${res.id}`;
        const youtubeTitle = res.title;
        const youtubeDuration = res.duration;
        queryCache.set(query, youtubeLink);
        const newTrack = new Track({
          link: youtubeLink,
          variant: TrackVariant.YOUTUBE_VOD,
          details: youtubeTitle ? {
            title: youtubeTitle,
            duration: youtubeDuration,
          } : undefined,
          sourceLink,
        });
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
    const playlistItemsRes = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
      params: {
        playlistId,
        maxResults: YT_PLAYLIST_PAGE_SIZE,
        part: 'snippet,contentDetails',
        key: process.env.YOUTUBE_API_KEY,
        pageToken: nextPageToken,
      },
    });
    numPagesFetched += 1;
    nextPageToken = playlistItemsRes.data.nextPageToken;
    interface Result {
      link: string,
      details: VideoDetails,
    }
    const videoIds = (playlistItemsRes.data.items as IntentionalAny[])
      .map((item: IntentionalAny) => item.contentDetails?.videoId)
      .filter(Boolean)
      .join(',');
    const videoDetailsRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        // No pagination required for the list of IDs
        id: videoIds,
        part: 'contentDetails',
        key: process.env.YOUTUBE_API_KEY,
      },
    });
    const durations = (videoDetailsRes.data.items as IntentionalAny[]).reduce((acc, item) => {
      acc[item.id] = toSeconds(parseIso8601Duration(item.contentDetails.duration)) * 1000;
      return acc;
    }, {} as GenericMapping<number>);
    const youtubeResults: Result[] = playlistItemsRes.data.items
      .filter((item: IntentionalAny) => item.snippet?.resourceId?.kind === 'youtube#video')
      .map((item: IntentionalAny) => ({
        link: `https://youtube.com/watch?v=${item.snippet?.resourceId.videoId}`,
        details: {
          title: item.snippet?.title,
          duration: durations[item.contentDetails?.videoId],
        },
      }));
    tracks.push(...youtubeResults.map(({ link, details }) => new Track({
      link,
      variant: TrackVariant.YOUTUBE_VOD,
      details,
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
    return allResults.videos.map(video => new Track({
      link: video.url,
      variant: TrackVariant.YOUTUBE_VOD,
      details: video.title ? {
        title: video.title,
        duration: video.duration,
      } : undefined,
    }));
  }
}

export const getDetailsFromUrl = (() => {
  const cache = new Map<string, VideoDetails>();
  return async (url: string): Promise<VideoDetails> => {
    if (cache.has(url)) return cache.get(url)!;
    log('Fetching YouTube title for video', url);
    const videoRes = await YouTubeSr.getVideo(url);
    const { title, duration } = videoRes;
    if (!title) throw new Error('Could not fetch title');
    cache.set(url, { title, duration });
    return { title, duration };
  };
})();
