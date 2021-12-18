import type { AudioResource } from '@discordjs/voice';

import { createAudioResource, demuxProbe } from '@discordjs/voice';
import { exec as ytdl } from 'youtube-dl-exec';
import play from 'play-dl';
import { error } from 'src/logging';
import { getTitleFromUrl as getYoutubeTitleFromUrl } from './youtube';

interface VideoDetails {
  title: string,
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

  public async createAudioResource(): Promise<AudioResource<Track>> {
    switch (this.variant) {
      case TrackVariant.YOUTUBE_LIVESTREAM:
      case TrackVariant.YOUTUBE_VOD: {
        const stream = await play.stream(this.link);
        return createAudioResource(stream.stream, {
          metadata: this,
          inputType: stream.type,
        });
      }
      default: {
        return new Promise((resolve, reject) => {
          const process = ytdl(
            this.link, {
              // @ts-ignore This library has incomplete typing
              o: '-',
              q: '',
              f: 'bestaudio[ext=webm+acodec=opus+asr=48000]/bestaudio',
              r: '100K',
            }, {
              stdio: ['ignore', 'pipe', 'ignore'],
            },
          );
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
          process.once('spawn', () => {
            demuxProbe(stream)
              .then(probe => resolve(
                createAudioResource(probe.stream, {
                  metadata: this,
                  inputType: probe.type,
                }),
              ))
              .catch(onError);
          }).catch(onError);
        });
      }
    }
  }

  public async getVideoDetails(): Promise<VideoDetails> {
    if (this.details) return { ...this.details };
    switch (this.variant) {
      case TrackVariant.YOUTUBE_LIVESTREAM:
      case TrackVariant.YOUTUBE_VOD: {
        this.details = {
          title: await getYoutubeTitleFromUrl(this.link),
        };
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

  public async getAudioResource(): Promise<AudioResource> {
    const audioResource = await this.createAudioResource();
    return audioResource;
  }
}
