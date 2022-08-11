import { AudioResource, createAudioResource } from '@discordjs/voice';

import { exec as ytdlExec } from 'youtube-dl-exec';
import ffmpeg, { FfmpegCommand } from 'fluent-ffmpeg';
import play from 'play-dl';
import ytdl from 'ytdl-core';
import { error } from 'src/logging';
import { getDetailsFromUrl as getYoutubeDetailsFromUrl } from './youtube';

export interface VideoDetails {
  title: string,
  duration?: number,
}

export interface AudioResourceOptions {
  seek?: number, // in seconds
  speed?: number, // multiplier
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
    const { seek, speed } = options;

    const tryPlayDl: () => Promise<AudioResource<Track>> = async () => {
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
    };

    const tryYtdlExec: () => Promise<AudioResource<Track>> = async () => {
      // https://github.com/discordjs/voice/blob/f1869a9af5a44ec9a4f52c2dd282352b1521427d/examples/music-bot/src/music/track.ts#L46-L76
      return new Promise((resolve, reject) => {
        const process = ytdlExec(
          this.link, {
            output: '-',
            quiet: true,
            format: 'bestaudio',
          }, {
            stdio: ['ignore', 'pipe', 'ignore'],
            maxBuffer: 10_000_000,
            buffer: false,
          },
        );
        if (!process.stdout) {
          reject(new Error('No stdout'));
          return;
        }
        const stream = process.stdout;
        const onError = (err: unknown) => {
          console.log('TODO onError');
          if (!process.killed) process.kill();
          stream.resume();
          reject(err);
          // This ERR_STREAM_PREMATURE_CLOSE error happens when you skip the last song, but there is no issue with that.
          // TODO: See if there is an alternative way to skip songs which does not run into this error.
          // @ts-ignore This is useless TS
          if (typeof err === 'object' && err && 'code' in err && err.code === 'ERR_STREAM_PREMATURE_CLOSE') {
            return;
          }
          error(err);
        };
        let manipulatedStream: FfmpegCommand | undefined;
        process.once('spawn', () => {
          // TODO: This stream is from process.stdout. Need to clean this up
          // when ffmpeg closes right?
          // manipulatedStream = ffmpeg({ source: stream }).toFormat('mp3');
          if (speed && !seek) {
            manipulatedStream = ffmpeg({ source: stream }).toFormat('mp3').audioFilters(`atempo=${speed}`);
            // manipulatedStream.audioFilters(`atempo=${speed}`);
          } else if (seek && !speed) {
            manipulatedStream = ffmpeg({ source: stream }).toFormat('mp3').setStartTime(Math.ceil(seek));
            // manipulatedStream.setStartTime(Math.ceil(seek));
          } else if (seek && speed) {
            manipulatedStream = ffmpeg({ source: stream })
              .toFormat('mp3')
              .audioFilters(`atempo=${speed}`)
              .setStartTime(Math.ceil(seek));
            // manipulatedStream.setStartTime(Math.ceil(seek));
          } else {
            manipulatedStream = ffmpeg({ source: stream })
              .toFormat('mp3');
          }
          // @ts-expect-error This actually works
          const audioResource = createAudioResource(manipulatedStream, { metadata: this });
          return resolve(audioResource);
        }).catch(onError);

        // TODO: Can this work? To flush stdout and reclaim memory?
        process.once('close', () => {
          process.stdin?.write('');
        });
      });
    };

    /**
     * This is currently unused, but may be useful in the future.
     * For now, it's the least consistent method since some videos do not work for whatever reason.
     * This is probably faster than youtube-dl-exec, so it would be nice to use this instead if possible.
     */
    const tryYtdlCore: () => Promise<AudioResource<Track>> = async () => {
      const stream = ytdl(this.link);
      if (!seek && !speed) {
        return createAudioResource(stream, { metadata: this });
      }
      const manipulatedStream = ffmpeg({ source: stream }).toFormat('mp3');
      if (speed) {
        manipulatedStream.audioFilters(`atempo=${speed}`);
      }
      if (seek) {
        manipulatedStream.setStartTime(Math.ceil(seek));
      }
      // @ts-expect-error This actually works
      return createAudioResource(manipulatedStream, { metadata: this });
    };

    switch (this.variant) {
      case TrackVariant.YOUTUBE_LIVESTREAM:
      case TrackVariant.YOUTUBE_VOD: {
        if (!speed) {
          try {
            // const audioResource = await tryPlayDl();
            // return audioResource;
          } catch (err) {
            error(err);
          }
        }
      }
      // We want to fall through if play-dl doesn't work, or the speed option is provided
      // eslint-disable-next-line no-fallthrough
      default: {
        return tryYtdlExec();
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
