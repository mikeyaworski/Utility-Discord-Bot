import type { AudioResource } from '@discordjs/voice';

import { createAudioResource, demuxProbe } from '@discordjs/voice';
import { raw as ytdl } from 'youtube-dl-exec';
import { getTitleFromUrl } from './youtube';

export enum TrackVariant {
  YOUTUBE,
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
      const onError = (error: Error) => {
        if (!process.killed) process.kill();
        stream.resume();
        reject(error);
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
    return {
      title: await getTitleFromUrl(this.link),
    };
  }

  public async getAudioResource(): Promise<AudioResource> {
    const audioResource = await this.createAudioResource();
    return audioResource;
  }
}
