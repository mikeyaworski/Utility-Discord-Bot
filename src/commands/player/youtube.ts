import { Cluster } from 'puppeteer-cluster';
import axios from 'axios';

import type { IntentionalAny } from 'src/types';
import { MAX_YT_PLAYLIST_PAGE_FETCHES, YT_PLAYLIST_PAGE_SIZE } from 'src/constants';
import { log, error } from 'src/logging';
import Track, { TrackVariant } from './track';

const clusterInitialization = (async () => {
  try {
    const cluster = await Cluster.launch({
      concurrency: Cluster.CONCURRENCY_CONTEXT,
      maxConcurrency: 2,
      puppeteerOptions: {
        // @ts-ignore This is incorrect typing
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
      },
    });
    await cluster.task(async ({ page, data: query }) => {
      const url = new URL('https://www.youtube.com/results');
      url.searchParams.set('search_query', query);
      await page.goto(url.href, {
        waitUntil: ['load', 'domcontentloaded'],
      });
      const firstResultElement = await page.$('a#video-title');
      const youtubeLink: string = await page.evaluate(e => e.href, firstResultElement);
      return youtubeLink;
    });
    return cluster;
  } catch (err) {
    error(err);
    throw new Error('Puppeteer not configured');
  }
})();

type TracksFetchedCallback = (newTracks: Track[]) => void;

const queryCache = new Map<string, string>();
export async function getTracksFromQueries(queries: string[], tracksFetchedCb?: TracksFetchedCallback): Promise<Track[]> {
  const cluster = await clusterInitialization;

  const cachedQueries = queries.filter(query => queryCache.has(query));
  const newQueries = queries.filter(query => !queryCache.has(query));

  const cachedQueryTracks = cachedQueries.map(query => new Track(queryCache.get(query)!, TrackVariant.YOUTUBE));
  if (tracksFetchedCb) {
    tracksFetchedCb(cachedQueryTracks);
  }

  const newQueryTracks = await Promise.all(newQueries.map(async query => {
    try {
      const youtubeLink = await cluster.execute(query);
      queryCache.set(query, youtubeLink);
      const newTrack = new Track(youtubeLink, TrackVariant.YOUTUBE);
      if (tracksFetchedCb) {
        tracksFetchedCb([newTrack]);
      }
      return newTrack;
    } catch (err) {
      log('Could not fetch YouTube link for query', query);
      return null;
    }
  }));

  return cachedQueryTracks.concat(newQueryTracks.filter(Boolean) as Track[]);
}

export async function parseYoutubePlaylist(playlistUrl: string): Promise<Track[]> {
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
    const youtubeLinks: string[] = res.data.items
      .filter((item: IntentionalAny) => item.snippet?.resourceId?.kind === 'youtube#video')
      .map((item: IntentionalAny) => `https://youtube.com/watch?v=${item.snippet?.resourceId.videoId}`);
    tracks.push(...youtubeLinks.map(youtubeLink => new Track(youtubeLink, TrackVariant.YOUTUBE)));
  } while (nextPageToken && numPagesFetched < MAX_YT_PLAYLIST_PAGE_FETCHES);

  return tracks;
}
