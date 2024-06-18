import { AudioResource, StreamType, createAudioResource } from '@discordjs/voice';

import ytdlExec from 'youtube-dl-exec';
import ffmpeg from 'fluent-ffmpeg';
import play from 'play-dl';
import ytdl from 'ytdl-core';
import { error } from 'src/logging';
import { getUniqueId } from 'src/utils';
import { getDetailsFromUrl as getYoutubeDetailsFromUrl } from './youtube';

export interface VideoDetails {
  title: string,
  duration?: number,
}

export interface AudioResourceOptions {
  seek?: number, // in seconds
  speed?: number, // multiplier
  shouldNormalizeAudio?: boolean,
}

export enum TrackVariant {
  YOUTUBE_VOD,
  YOUTUBE_LIVESTREAM,
  TWITCH_VOD,
  TWITCH_LIVESTREAM,
}

interface TrackConstructorOptions {
  link: string,
  variant: TrackVariant,
  details?: VideoDetails,
  sourceLink?: string,
}

const YOUTUBE_COOKIES = process.env.YOUTUBE_COOKIES;

export default class Track {
  public readonly id: string;
  public readonly link: string;
  public readonly variant: TrackVariant;
  public readonly sourceLink: string | undefined;
  private details: VideoDetails | undefined;

  public constructor(options: TrackConstructorOptions) {
    this.id = String(getUniqueId());
    this.link = options.link;
    this.variant = options.variant;
    this.details = options.details;
    this.sourceLink = options.sourceLink;
  }

  public async createAudioResource(options: AudioResourceOptions): Promise<AudioResource<Track>> {
    const { seek, speed, shouldNormalizeAudio = true } = options;

    // Cookies for play-dl are set in .data/youtube.data
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
        const process = ytdlExec.exec(this.link, {
          output: '-',
          quiet: true,
          format: 'bestaudio[ext=webm][acodec=opus][asr=48000]/bestaudio',
          cookies: './.data/cookies.txt',
          // These flags are not verified to reduce any server crashes,
          // but that is the intention.
          ignoreErrors: true,
          // @ts-ignore We know this is valid
          noAbortOnError: true,
        }, {
          // Pipe only stdout to the parent process
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        if (!process.stdout) {
          reject(new Error('No stdout'));
          return;
        }
        const stream = process.stdout;
        const onError = (err: unknown) => {
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
        process.on('error', onError);
        process.once('spawn', () => {
          // Use Opus format for better performance with Discord.js
          const manipulatedStream = ffmpeg({ source: stream })
            .audioCodec('libopus')
            .toFormat('ogg');
          if (speed) {
            manipulatedStream.audioFilters([{ filter: 'atempo', options: String(speed) }]);
          }
          if (seek) {
            manipulatedStream.setStartTime(Math.ceil(seek));
          }
          if (shouldNormalizeAudio) {
            // https://ffmpeg.org/ffmpeg-filters.html#loudnorm
            // https://k.ylo.ph/2016/04/04/loudnorm.html
            manipulatedStream.audioFilters([{
              filter: 'loudnorm',
              options: [
                'I=-40.0', // Set integrated loudness target. Range is -70.0 - -5.0. Default value is -24.0.
                'LRA=7.0', // Set loudness range target. Range is 1.0 - 50.0. Default value is 7.0.
                'TP=-2.0', // Set maximum true peak. Range is -9.0 - +0.0. Default value is -2.0.
              ],
            }]);
          }
          // No need to demuxProbe since we have piped the audio through FFmpeg and specified the Opus codec with Ogg container
          // @ts-expect-error This actually works
          return resolve(createAudioResource(manipulatedStream, { metadata: this, inputType: StreamType.OggOpus }));
        });
        process.on('exit', (code, signal) => {
          if (code || signal) {
            error('yt-dlp process exited with code', code, 'and signal', signal);
          }
        });
      });
    };

    /**
     * This is currently unused, but may be useful in the future.
     * For now, it's the least consistent method since some videos do not work for whatever reason.
     * This is probably faster than youtube-dl-exec, so it would be nice to use this instead if possible.
     */
    const tryYtdlCore: () => Promise<AudioResource<Track>> = async () => {
      const options: ytdl.downloadOptions | undefined = YOUTUBE_COOKIES ? {
        requestOptions: {
          headers: {
            cookie: YOUTUBE_COOKIES,
          },
        },
      } : undefined;
      const stream = ytdl(this.link, options);
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
        // play-dl is currently broken
        // if (!speed) {
        //   try {
        //     const audioResource = await tryPlayDl();
        //     return audioResource;
        //   } catch (err) {
        //     error('Error playing resource from play-dl', err);
        //   }
        // }
      }
      // We want to fall through if play-dl doesn't work, or the speed option is provided
      // eslint-disable-next-line no-fallthrough
      default: {
        const audioResource = await tryYtdlExec();
        return audioResource;
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
