import { AudioResource, StreamType, createAudioResource } from '@discordjs/voice';

import { kill as killNodeProcess } from 'node:process';
import ytdlExec from 'youtube-dl-exec';
import prism from 'prism-media';
import play from 'play-dl';
import { error } from 'src/logging';
import { filterOutFalsy, getUniqueId } from 'src/utils';
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
  TWITTER,
  REDDIT,
  ARBITRARY,
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
        }, {
          // Pipe stdout and stderr to the parent process. Ignore stdin.
          // Obviously stdout is for the audio data, and stderr is for any error output.
          stdio: ['ignore', 'pipe', 'pipe'],
          // Detached so any child processes created by this yt-dlp process (e.g. FFmpeg for YouTube livestreams)
          // will go into a process group that we can cleanup.
          detached: true,
        });
        if (!process.stdout) {
          reject(new Error('No stdout'));
          return;
        }
        const killProcesses = () => {
          const childProcessesGroupId = process.pid;
          if (!process.killed) process.kill();
          if (childProcessesGroupId != null) killNodeProcess(-childProcessesGroupId);
        };
        const stream = process.stdout;
        const onError = (err: unknown) => {
          // When there is a null or 0 exit code, it means that the process was terminated intentionally and without error
          if (typeof err === 'object' && err && 'exitCode' in err && !err.exitCode) {
            return;
          }
          killProcesses();
          stream.resume();
          reject(err);
          error(err);
        };

        process.catch(onError);
        process.on('error', onError); // This may be redundant, but it doesn't seem to ever get called

        process.once('spawn', () => {
          // What we are doing:
          // 1. Using yt-dlp to get a raw stream of data from YouTube
          // 2. Feeding the stream into an FFmpeg transcoder (transcoding the YouTube audio stream to a s16le format for the raw audio)
          // 3. Manipulating the stream in various ways with FFmpeg (e.g. seeking, playback speed, loudness normalization)
          // 4. Feeding the raw audio data (s16le) into an Opus encoder with the correct settings for Discord's API
          // 5. Creating an audio resource with that Opus encoder

          // https://ffmpeg.org/ffmpeg-filters.html#loudnorm
          // https://k.ylo.ph/2016/04/04/loudnorm.html
          const loudNormOptions = [
            'I=-40.0', // Set integrated loudness target. Range is -70.0 - -5.0. Default value is -24.0.
            'LRA=7.0', // Set loudness range target. Range is 1.0 - 50.0. Default value is 7.0.
            'TP=-2.0', // Set maximum true peak. Range is -9.0 - +0.0. Default value is -2.0.
          ];

          const audioFilters: [string, string][] = filterOutFalsy([
            Boolean(speed) && ['atempo', String(speed)],
            shouldNormalizeAudio && ['loudnorm', `${loudNormOptions.join(':')}`],
          ]);

          const audioFilterArg: [string, string] | null = audioFilters.length
            ? ['-filter:a', audioFilters.map(filter => filter.join('=')).join(',')]
            : null;

          const ffmpegArgs: ([string, string] | [string] | false | null)[] = [
            Boolean(seek) && ['-ss', String(seek)],
            ['-analyzeduration', '0'],
            ['-loglevel', '0'],
            ['-f', 's16le'],
            ['-ar', '48000'],
            ['-ac', '2'],
            audioFilterArg,
          ];

          const transcoder = new prism.FFmpeg({
            args: filterOutFalsy(ffmpegArgs.flat()),
          });
          const s16le = stream.pipe(transcoder);
          // https://discord.com/developers/docs/topics/voice-connections#encrypting-and-sending-voice
          // Voice data sent to discord should be encoded with Opus, using two channels (stereo) and a sample rate of 48kHz.
          const encoder = new prism.opus.Encoder({ rate: 48000, channels: 2, frameSize: 960 });
          const opus = s16le.pipe(encoder);

          const resource = createAudioResource(opus, { metadata: this, inputType: StreamType.Opus });
          resource.playStream.on('close', () => {
            // Clean up processes to avoid memory leaks
            transcoder.destroy();
            killProcesses();
          });
          return resolve(resource);
        });
      });
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
      case TrackVariant.TWITCH_LIVESTREAM:
      case TrackVariant.TWITCH_VOD: {
        // TODO: Add support for fetching Twitch titles
        this.details = {
          title: 'TODO',
        };
        break;
      }
      case TrackVariant.TWITTER: {
        // TODO: Add support for fetching Twitter titles
        this.details = {
          title: 'TODO',
        };
        break;
      }
      case TrackVariant.REDDIT: {
        // TODO: Add support for fetching Reddit titles
        this.details = {
          title: 'TODO',
        };
        break;
      }
      case TrackVariant.ARBITRARY:
      default: {
        // TODO: Add support for fetching title from URL of arbitrary website (HTML title tag probably)
        this.details = {
          title: 'Unknown',
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
