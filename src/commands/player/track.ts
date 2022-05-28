import { AudioResource, createAudioResource } from '@discordjs/voice';

import ffmpeg from 'fluent-ffmpeg';
import play from 'play-dl';
import ytdl from 'ytdl-core';
import { error } from 'src/logging';
import { getDetailsFromUrl as getYoutubeDetailsFromUrl } from './youtube';

export interface VideoDetails {
  title: string,
  duration?: number,
}

interface AudioResourceOptions {
  seek?: number, // in seconds
}

export enum TrackVariant {
  YOUTUBE_VOD,
  YOUTUBE_LIVESTREAM,
  TWITCH_VOD,
  TWITCH_LIVESTREAM,
}

export default class Track {
  public readonly link: string;
  public readonly variant: TrackVariant;
  private details: VideoDetails | undefined;

  public constructor(link: string, variant: TrackVariant, details?: VideoDetails) {
    this.link = link;
    this.variant = variant;
    this.details = details;
  }

  public async createAudioResource(options: AudioResourceOptions): Promise<AudioResource<Track>> {
    switch (this.variant) {
      // play-dl is no longer actively maintained, so we have a fallback
      case TrackVariant.YOUTUBE_LIVESTREAM:
      case TrackVariant.YOUTUBE_VOD: {
        try {
          const source = options.seek
            ? await play.stream(this.link, {
              seek: options.seek,
            })
            : await play.stream(this.link);
          const audioResource = await createAudioResource(source.stream, {
            metadata: this,
            inputType: source.type,
          });
          return audioResource;
        } catch (err) {
          error(err);
        }
      }
      // We want to fall through if play-dl doesn't work
      // eslint-disable-next-line no-fallthrough
      default: {
        const { seek = 0 } = options;
        const stream = ytdl(this.link);
        const seekedStream = seek
          ? ffmpeg({ source: stream }).toFormat('mp3').setStartTime(Math.ceil(seek))
          : stream;
        // @ts-expect-error This actually works
        return createAudioResource(seekedStream, {
          metadata: this,
        });
      }
    }
  }

  public async getVideoDetails(): Promise<VideoDetails> {
    if (this.details) return { ...this.details };
    switch (this.variant) {
      case TrackVariant.YOUTUBE_LIVESTREAM:
      case TrackVariant.YOUTUBE_VOD: {
        this.details = await getYoutubeDetailsFromUrl(this.link);
        break;
      }
      case TrackVariant.TWITCH_VOD: {
        // TODO: Add support for fetching Twitch titles
        this.details = {
          title: 'TODO',
        };
        break;
      }
      default: {
        this.details = {
          title: 'TODO',
        };
        break;
      }
    }
    return { ...this.details };
  }

  public async getAudioResource(options: AudioResourceOptions = {}): Promise<AudioResource> {
    const audioResource = await this.createAudioResource(options);
    return audioResource;
  }
}
