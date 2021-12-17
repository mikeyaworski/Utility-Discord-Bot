import type { AudioResource } from '@discordjs/voice';

import { createAudioResource, demuxProbe } from '@discordjs/voice';
import { exec as ytdl } from 'youtube-dl-exec';
import { error } from 'src/logging';
import { getTitleFromUrl } from './youtube';

export enum TrackVariant {
  YOUTUBE,
  TWITCH_VOD,
}

export default class Track {
  public readonly link: string;
  public readonly variant: TrackVariant;

  public constructor(link: string, variant: TrackVariant) {
    this.link = link;
    this.variant = variant;
  }

  public createAudioResource(): Promise<AudioResource<Track>> {
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

  public async getVideoDetails(): Promise<{ title: string }> {
    switch (this.variant) {
      case TrackVariant.YOUTUBE: {
        return {
          title: await getTitleFromUrl(this.link),
        };
      }
      case TrackVariant.TWITCH_VOD: {
        // TODO: Add support for fetching Twitch titles
        return {
          title: 'TODO',
        };
      }
      default: {
        return {
          title: 'TODO',
        };
      }
    }
  }

  public async getAudioResource(): Promise<AudioResource> {
    const audioResource = await this.createAudioResource();
    return audioResource;
  }
}
