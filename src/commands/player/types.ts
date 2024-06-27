import { TrackVariant, VideoDetails } from './track';

export enum QueryType {
  SPOTIFY_LINK,
  YOUTUBE_LINK,
  DIRECT_QUERY,
}

export interface Query {
  query: string,
  sourceLink?: string,
  type: QueryType,
}

export interface TrackData extends VideoDetails {
  id: string,
  value: string,
  sourceLink: string | undefined,
  variant: TrackVariant,
}

export interface CurrentTrackPlayTime {
  // all in MS
  started: number | null, // timestamp
  pauseStarted: number | null, // timestamp
  totalPauseTimeMs: number,
  seekedMs: number | null,
  speed: number,
}

export interface PlayerStatus {
  currentTime: CurrentTrackPlayTime,
  playbackSpeed: number,
  isLooped: boolean,
  isShuffled: boolean,
  isPaused: boolean,
  currentTrack: TrackData | null,
  queue: TrackData[],
  totalQueueSize: number,
}
