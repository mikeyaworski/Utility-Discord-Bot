import type { VoiceConnection, AudioPlayer } from '@discordjs/voice';
import type { Guild } from 'discord.js';

import { promisify } from 'util';
import {
  createAudioPlayer,
  entersState,
  VoiceConnectionStatus,
  VoiceConnectionDisconnectReason,
  AudioPlayerStatus,
} from '@discordjs/voice';
import { log, error } from 'src/logging';
import { shuffleArray } from 'src/utils';
import sessions from './sessions';
import Track, { TrackVariant } from './track';

// https://github.com/discordjs/voice/blob/f1869a9af5a44ec9a4f52c2dd282352b1521427d/examples/music-bot/src/music/subscription.ts
export default class Session {
  public readonly voiceConnection: VoiceConnection;
  public readonly audioPlayer: AudioPlayer;
  private currentTrack: Track | undefined;
  public readonly queue: Track[];
  public readonly queueLoop: Track[] = [];
  private shuffled = false;
  private readonly guild: Guild;
  private queueLock = false;
  private readyLock = false;

  public constructor(guild: Guild, voiceConnection: VoiceConnection) {
    this.guild = guild;
    this.voiceConnection = voiceConnection;
    this.audioPlayer = createAudioPlayer();
    this.queue = [];

    this.voiceConnection.on('stateChange', async (oldState, newState) => {
      if (newState.status === VoiceConnectionStatus.Disconnected) {
        if (newState.reason === VoiceConnectionDisconnectReason.WebSocketClose && newState.closeCode === 4014) {
          // If the WebSocket closed with a 4014 code, this means that we should not manually attempt to reconnect,
          // but there is a chance the connection will recover itself if the reason of the disconnect was due to
          // switching voice channels. This is also the same code for the bot being kicked from the voice channel,
          // so we allow 5 seconds to figure out which scenario it is. If the bot has been kicked, we should destroy
          // the voice connection.
          try {
            // Probably moved voice channel
            await entersState(this.voiceConnection, VoiceConnectionStatus.Connecting, 5_000);
          } catch {
            // Probably removed from voice channel
            sessions.destroy(guild);
          }
        } else if (this.voiceConnection.rejoinAttempts < 5) {
          // The disconnect in this case is recoverable, so we will attempt to reconnect up to 5 times.
          await promisify(setTimeout)((this.voiceConnection.rejoinAttempts + 1) * 5_000);
          this.voiceConnection.rejoin();
        } else {
          // The disconnect in this case may be recoverable, but we've exceeded our retry attempts.
          sessions.destroy(guild);
        }
      } else if (newState.status === VoiceConnectionStatus.Destroyed) {
        // Once destroyed, stop the subscription
        this.stop();
      } else if (
        !this.readyLock
        && (newState.status === VoiceConnectionStatus.Connecting || newState.status === VoiceConnectionStatus.Signalling)
      ) {
        // Set a 20 second time limit for the connection to become ready before destroying the voice connection.
        // This stops the voice connection permanently existing in one of these states.
        this.readyLock = true;
        try {
          await entersState(this.voiceConnection, VoiceConnectionStatus.Ready, 20_000);
        } catch {
          sessions.destroy(guild);
        }
        this.readyLock = false;
      }
    });

    this.audioPlayer.on('stateChange', (oldState, newState) => {
      if (newState.status === AudioPlayerStatus.Idle && oldState.status !== AudioPlayerStatus.Idle) {
        // If the Idle state is entered from a non-Idle state, it means that an audio resource has finished playing.
        this.processQueue();
      }
    });

    this.audioPlayer.on('error', error);

    voiceConnection.subscribe(this.audioPlayer);
  }

  /**
   * Duplicate tracks without reusing the same ones, since once a track's audio resource gets destroyed,
   * it cannot be reused.
   */
  private duplicateTracks(tracks: Track[]): Track[] {
    return tracks.map(track => new Track(track.link, TrackVariant.YOUTUBE));
  }

  public getCurrentTrack(): Track | undefined {
    return this.currentTrack;
  }

  public setLoop(loop: boolean): void {
    if (loop) {
      const newQueueLoop = this.duplicateTracks(
        this.currentTrack ? [this.currentTrack].concat(this.queue) : this.queue,
      );
      this.queueLoop.splice(0, this.queueLoop.length, ...newQueueLoop);
    } else {
      this.queueLoop.splice(0, this.queueLoop.length);
    }
  }

  public isLooped(): boolean {
    return this.queueLoop.length > 0;
  }

  public isShuffled(): boolean {
    return this.shuffled;
  }

  private shuffleArray<T = Track>(array: T[]): void {
    const shuffledArray = Array.from(array);
    shuffleArray(shuffledArray);
    array.splice(0, array.length, ...shuffledArray);
  }

  public shuffle(): void {
    this.shuffleArray(this.queue);
    this.shuffleArray(this.queueLoop);
    this.shuffled = true;
  }

  public reverse(): void {
    this.queue.splice(0, this.queue.length, ...this.queue.reverse());
  }

  public clear(): void {
    this.queue.splice(0, this.queue.length);
    this.shuffled = false;
    this.setLoop(false);
  }

  public remove(idx: number): Track | undefined {
    return this.queue.splice(idx, 1)[0];
  }

  public enqueue(tracks: Track[]): Promise<void> {
    this.queue.push(...tracks);
    if (this.isLooped()) {
      this.queueLoop.push(...this.duplicateTracks(tracks));
    }
    return this.processQueue();
  }

  public pause(): boolean {
    return this.audioPlayer.pause();
  }

  public resume(): boolean {
    return this.audioPlayer.unpause();
  }

  public stop(): void {
    this.queueLock = true;
    this.queue.splice(0, this.queue.length);
    this.audioPlayer.stop(true);
  }

  public skip(): Promise<void> {
    return this.processQueue(true);
  }

  private async processQueue(forceSkip = false): Promise<void> {
    if (this.queueLock) {
      log('Queue lock prevented a problem.');
      return;
    }
    if (!forceSkip && this.audioPlayer.state.status !== AudioPlayerStatus.Idle) return;

    this.queueLock = true;

    if (!this.queue.length && !this.isLooped()) {
      this.shuffled = false;
    }

    // We have exhausted the queue, so refill it and re-shuffle the queue loop if applicable
    if (!this.queue.length && this.isLooped()) {
      this.queue.push(...this.queueLoop);
      const newQueueLoop = this.duplicateTracks(this.queueLoop);
      if (this.shuffled) this.shuffleArray(newQueueLoop);
      this.queueLoop.splice(0, this.queueLoop.length, ...newQueueLoop);
    }

    this.currentTrack = this.queue.shift();
    if (!this.currentTrack) {
      if (forceSkip) this.audioPlayer.stop(true);
      this.queueLock = false;
      return;
    }

    try {
      const resource = await this.currentTrack.getAudioResource();
      this.audioPlayer.play(resource);
    } catch (err) {
      error(err);
      log('Could not play track', this.currentTrack.link, this.currentTrack.variant);
      // Skip and try next
      this.queueLock = false;
      await this.processQueue();
    }
    this.queueLock = false;
  }
}
