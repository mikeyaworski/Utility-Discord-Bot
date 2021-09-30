import type { MoreVideoDetails } from 'ytdl-core';
import type { AudioResource } from '@discordjs/voice';

import { createAudioResource, demuxProbe } from '@discordjs/voice';
import { raw as ytdl } from 'youtube-dl-exec';
import { getInfo } from 'ytdl-core';

export default class Track {
  public readonly youtubeLink: string;
  // private audioResourcePromise: Promise<AudioResource>;
  // private videoDetailsPromise: Promise<MoreVideoDetails>

  public constructor(youtubeLink: string) {
    this.youtubeLink = youtubeLink;
    // this.videoDetailsPromise = getInfo(youtubeLink).then(videoInfo => videoInfo.videoDetails);
    // this.audioResourcePromise = this.createAudioResource();
  }

  public createAudioResource(): Promise<AudioResource<Track>> {
    return new Promise((resolve, reject) => {
      const process = ytdl(
        this.youtubeLink, {
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

  public async getVideoDetails(): Promise<MoreVideoDetails> {
    // return this.videoDetailsPromise;
    const info = await getInfo(this.youtubeLink).then(videoInfo => videoInfo.videoDetails);
    return info;
  }

  public async getAudioResource(): Promise<AudioResource> {
    // return this.audioResourcePromise;
    const audioResource = await this.createAudioResource();
    return audioResource;
  }
}
