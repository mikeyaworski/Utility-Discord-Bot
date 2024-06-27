import {
  AudioPlayer,
  createAudioPlayer,
  entersState,
  VoiceConnectionStatus,
  VoiceConnectionDisconnectReason,
  AudioPlayerStatus,
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnection,
} from '@discordjs/voice';
import type { VoiceBasedChannel, VoiceState } from 'discord.js';

import { promisify } from 'util';

import { QUEUE_SNIPPET_LENGTH } from 'src/constants';
import { client } from 'src/client';
import { PlayerSettings } from 'src/models/player-settings';
import { log, error } from 'src/logging';
import { shuffleArray } from 'src/utils';
import { getChannel, isText } from 'src/discord-utils';
import { emit } from 'src/api/sockets';
import { SocketEventTypes } from 'src/types/sockets';
import sessions from './sessions';
import Track, { AudioResourceOptions } from './track';
import { getMessageData, listenForPlayerButtons } from './utils';
import { runNowPlaying } from './now-playing';
import { PlayerStatus, TrackData, CurrentTrackPlayTime } from './types';

// https://github.com/discordjs/voice/blob/f1869a9af5a44ec9a4f52c2dd282352b1521427d/examples/music-bot/src/music/subscription.ts
export default class Session {
  public readonly audioPlayer: AudioPlayer;
  private currentTrack: Track | undefined;
  public readonly queue: Track[];
  public readonly queueLoop: Track[] = [];
  private shuffled = false;
  private readonly guildId: string;
  private channelId: string;
  private queueLock = false;
  private readyLock = false;
  private playbackSpeed = 1;
  // Store this redundantly to avoid the need to fetch it from the database every time a new track starts
  private shouldNormalizeAudio = false;

  // DiscordJS does not provide this for us, so we manually keep track of an approximate duration in the current track
  private currentTrackPlayTime: CurrentTrackPlayTime = {
    started: null,
    pauseStarted: null,
    totalPauseTimeMs: 0,
    seekedMs: null,
    speed: 1,
  };

  public constructor(channel: VoiceBasedChannel, shouldNormalizeAudio: boolean) {
    const voiceConnection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
    });

    this.shouldNormalizeAudio = shouldNormalizeAudio;
    this.channelId = channel.id;
    this.guildId = channel.guild.id;
    this.audioPlayer = createAudioPlayer();
    this.queue = [];

    voiceConnection.on('stateChange', async (oldState, newState) => {
      if (newState.status === VoiceConnectionStatus.Disconnected) {
        if (newState.reason === VoiceConnectionDisconnectReason.WebSocketClose && newState.closeCode === 4014) {
          // If the WebSocket closed with a 4014 code, this means that we should not manually attempt to reconnect,
          // but there is a chance the connection will recover itself if the reason of the disconnect was due to
          // switching voice channels. This is also the same code for the bot being kicked from the voice channel,
          // so we allow 5 seconds to figure out which scenario it is. If the bot has been kicked, we should destroy
          // the voice connection.
          try {
            // Probably moved voice channel
            await entersState(voiceConnection, VoiceConnectionStatus.Connecting, 5_000);
          } catch {
            // Probably removed from voice channel
            sessions.destroy(this.guildId);
          }
        } else if (voiceConnection.rejoinAttempts < 5) {
          // The disconnect in this case is recoverable, so we will attempt to reconnect up to 5 times.
          await promisify(setTimeout)((voiceConnection.rejoinAttempts + 1) * 5_000);
          voiceConnection.rejoin();
        } else {
          // The disconnect in this case may be recoverable, but we've exceeded our retry attempts.
          sessions.destroy(this.guildId);
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
          await entersState(voiceConnection, VoiceConnectionStatus.Ready, 20_000);
        } catch {
          sessions.destroy(this.guildId);
        }
        this.readyLock = false;
      }
    });

    // For keeping track of play and pause time
    this.audioPlayer.on('stateChange', (oldState, newState) => {
      if (newState.status === AudioPlayerStatus.Playing && this.currentTrackPlayTime.started == null) {
        this.currentTrackPlayTime.started = Date.now();
        this.emitPlayerStatus();
      }
      if (newState.status !== AudioPlayerStatus.Playing && oldState.status === AudioPlayerStatus.Playing) {
        this.currentTrackPlayTime.pauseStarted = Date.now();
        log('Paused at', this.currentTrackPlayTime.pauseStarted);
        this.emitPlayerStatus();
      } else if (newState.status === AudioPlayerStatus.Playing && oldState.status !== AudioPlayerStatus.Playing) {
        if (this.currentTrackPlayTime.pauseStarted != null) {
          const pausedTime = Date.now() - this.currentTrackPlayTime.pauseStarted;
          log('Resumed after being paused for', pausedTime, 'milliseconds');
          this.currentTrackPlayTime.totalPauseTimeMs += pausedTime;
          this.currentTrackPlayTime.pauseStarted = null;
          log('New total pause time:', this.currentTrackPlayTime.totalPauseTimeMs, 'millseconds');
          this.emitPlayerStatus();
        }
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

    // Bind this function to the class context
    this.handleVoiceStateChange = this.handleVoiceStateChange.bind(this);
    client.on('voiceStateUpdate', this.handleVoiceStateChange);
  }

  private handleVoiceStateChange(oldState: VoiceState, newState: VoiceState): void {
    if (newState.id === client.user?.id && newState.channelId) {
      this.channelId = newState.channelId;
    }
  }

  public destroy(): void {
    client.removeListener('voiceStateUpdate', this.handleVoiceStateChange);
    const voiceConnection = this.getVoiceConnection();
    if (voiceConnection) voiceConnection.destroy();
    const room = `${this.guildId}_${this.channelId}_CONNECT`;
    emit({
      type: SocketEventTypes.PLAYER_DISCONNECTED,
      data: {
        guildId: this.guildId,
        channelId: this.channelId,
      },
    }, [room]);
  }

  public async getPlayerStatus(): Promise<PlayerStatus> {
    const getTrackData: (track: Track) => Promise<TrackData> = async track => ({
      id: track.id,
      value: track.value,
      sourceLink: track.sourceLink,
      variant: track.variant,
      ...await track.getVideoDetails().catch(() => ({
        title: 'Unknown',
      })),
    });
    const queue = this.isLooped() ? this.queue.concat(this.queueLoop) : this.queue;
    return {
      currentTrack: this.currentTrack ? await getTrackData(this.currentTrack) : null,
      currentTime: {
        ...this.currentTrackPlayTime,
        // Even if seeking was not invoked on the session, the track URL may have a seek time in it
        seekedMs: this.currentTrackPlayTime.seekedMs ?? this.currentTrack?.getSeekTimeMs() ?? null,
      },
      playbackSpeed: this.playbackSpeed,
      queue: await Promise.all(queue.slice(0, QUEUE_SNIPPET_LENGTH).map(track => getTrackData(track))),
      totalQueueSize: queue.length,
      isPaused: this.isPaused(),
      isLooped: this.isLooped(),
      isShuffled: this.isShuffled(),
    };
  }

  private async emitPlayerStatus(): Promise<void> {
    const channel = await getChannel(this.channelId);
    if (channel && !channel.isDMBased()) {
      const room = `${this.guildId}_${this.channelId}_CONNECT`;
      emit({
        type: SocketEventTypes.PLAYER_STATUS_CHANGED,
        data: {
          ...await this.getPlayerStatus(),
          guildId: this.guildId,
          channel: {
            name: channel.name,
          },
        },
      }, [room]);
    }
  }

  /**
   * Duplicate tracks without reusing the same ones, since once a track's audio resource gets destroyed,
   * it cannot be reused.
   */
  private duplicateTracks(tracks: Track[]): Track[] {
    return tracks.map(track => new Track({
      value: track.value,
      variant: track.variant,
      sourceLink: track.sourceLink,
    }));
  }

  public getCurrentTrack(): Track | undefined {
    return this.currentTrack;
  }

  public loop(): void {
    const newQueueLoop = this.duplicateTracks(
      this.currentTrack ? [this.currentTrack].concat(this.queue) : this.queue,
    );
    this.queueLoop.splice(0, this.queueLoop.length, ...newQueueLoop);
    this.emitPlayerStatus();
  }

  public unloop(): void {
    this.queueLoop.splice(0, this.queueLoop.length);
    this.emitPlayerStatus();
  }

  public isLooped(): boolean {
    return this.queueLoop.length > 0;
  }

  public isShuffled(): boolean {
    return this.shuffled;
  }

  public shuffle(): void {
    shuffleArray(this.queue);
    shuffleArray(this.queueLoop);
    this.shuffled = true;
    this.emitPlayerStatus();
  }

  /**
   * Note: This does not restore the original order of the queue,
   * but this means that if the queue is looped, it won't be reshuffled after looping.
   */
  public unshuffle(): void {
    this.shuffled = false;
    this.emitPlayerStatus();
  }

  public reverse(): void {
    this.queue.splice(0, this.queue.length, ...this.queue.reverse());
    this.emitPlayerStatus();
  }

  public clear(): void {
    this.queue.splice(0, this.queue.length);
    this.unshuffle();
    this.unloop();
    this.emitPlayerStatus();
  }

  public remove(id: string): Track | undefined
  public remove(idx: number): Track | undefined
  public remove(idOrIdx: string | number): Track | undefined {
    const idx = typeof idOrIdx === 'string'
      ? this.queue.findIndex(track => track.id === idOrIdx)
      : idOrIdx;
    const result = this.queue.splice(idx, 1)[0];
    this.emitPlayerStatus();
    return result;
  }

  public move(from: number, to: number): Track | undefined {
    const [track] = this.queue.splice(from, 1);
    this.queue.splice(to, 0, track);
    this.emitPlayerStatus();
    return track;
  }

  public enqueue(tracks: Track[], pushToFront = false): Promise<void> {
    if (this.isShuffled()) shuffleArray(tracks);
    if (pushToFront) {
      this.queue.unshift(...tracks);
    } else {
      this.queue.push(...tracks);
    }
    if (this.isLooped()) {
      if (pushToFront) {
        this.queueLoop.unshift(...this.duplicateTracks(tracks));
      } else {
        this.queueLoop.push(...this.duplicateTracks(tracks));
      }
    }
    return this.processQueue();
  }

  public pause(): boolean {
    return this.audioPlayer.pause();
  }

  public resume(): boolean {
    return this.audioPlayer.unpause();
  }

  public isPaused(): boolean {
    return this.audioPlayer.state.status === AudioPlayerStatus.Paused;
  }

  private stop(): void {
    this.queueLock = true;
    this.queue.splice(0, this.queue.length);
    this.audioPlayer.stop(true);
    this.currentTrackPlayTime = {
      started: null,
      pauseStarted: null,
      totalPauseTimeMs: 0,
      seekedMs: null,
      speed: this.playbackSpeed,
    };
  }

  /**
   * @param extraSkips If provided, will skip additional songs in the queue instead of just the current track
   */
  public skip(extraSkips = 0): Promise<void> {
    this.queue.splice(0, extraSkips);
    return this.processQueue(true);
  }

  public setPlaybackSpeed(speed: number): void {
    this.playbackSpeed = speed;
  }

  public getPlaybackSpeed(): number {
    return this.currentTrackPlayTime.speed;
  }

  public setShouldNormalizeAudio(shouldNormalizeAudio: boolean): void {
    this.shouldNormalizeAudio = shouldNormalizeAudio;
  }

  public getShouldNormalizeAudio(): boolean {
    return this.shouldNormalizeAudio;
  }

  private getAudioResourceOptions(): AudioResourceOptions {
    return {
      speed: this.playbackSpeed !== 1 ? this.playbackSpeed : undefined,
      shouldNormalizeAudio: this.shouldNormalizeAudio,
    };
  }

  public async seek(amountSeconds: number): Promise<void> {
    if (!this.currentTrack) return;
    const resource = await this.currentTrack.getAudioResource({
      ...this.getAudioResourceOptions(),
      seek: amountSeconds,
    });
    this.audioPlayer.play(resource);
    this.currentTrackPlayTime = {
      // It could buffer before starting, so we don't initialize the start time just yet
      started: null,
      seekedMs: amountSeconds * 1000,
      pauseStarted: null,
      totalPauseTimeMs: 0,
      speed: this.playbackSpeed,
    };
    this.emitPlayerStatus();
  }

  /**
   * @returns An approximation of the time played in the current resource
   */
  public getCurrentTrackPlayTime(): number {
    if (!this.currentTrackPlayTime.started) return 0;
    const trackUrlSeek = this.currentTrack?.getSeekTimeMs() ?? 0;
    const timeSinceStart = Date.now() - this.currentTrackPlayTime.started;
    const totalPauseTimeMs = this.isPaused() && this.currentTrackPlayTime.pauseStarted != null
      ? (Date.now() - this.currentTrackPlayTime.pauseStarted) + this.currentTrackPlayTime.totalPauseTimeMs
      : this.currentTrackPlayTime.totalPauseTimeMs;
    const timePlayed = (timeSinceStart - totalPauseTimeMs) * this.currentTrackPlayTime.speed;
    if (this.currentTrackPlayTime.seekedMs != null) {
      return timePlayed + this.currentTrackPlayTime.seekedMs;
    }
    // Even if seeking was not invoked on the session, the track URL may have a seek time in it
    return timePlayed + trackUrlSeek;
  }

  public getVoiceConnection(): VoiceConnection | undefined {
    return getVoiceConnection(this.guildId);
  }

  private async processQueue(forceSkip = false): Promise<void> {
    if (this.queueLock) {
      log('Queue lock prevented a problem.');
      return;
    }
    if (!forceSkip && this.audioPlayer.state.status !== AudioPlayerStatus.Idle) {
      this.emitPlayerStatus();
      return;
    }

    this.queueLock = true;

    if (!this.queue.length && !this.isLooped()) {
      this.shuffled = false;
    }

    // We have exhausted the queue, so refill it and re-shuffle the queue loop if applicable
    if (!this.queue.length && this.isLooped()) {
      this.queue.push(...this.queueLoop);
      const newQueueLoop = this.duplicateTracks(this.queueLoop);
      if (this.shuffled) shuffleArray(newQueueLoop);
      this.queueLoop.splice(0, this.queueLoop.length, ...newQueueLoop);
    }

    this.currentTrack = this.queue.shift();
    if (!this.currentTrack) {
      if (forceSkip) this.audioPlayer.stop(true);
      this.queueLock = false;
      this.emitPlayerStatus();
      return;
    }

    try {
      const resource = await this.currentTrack.getAudioResource(this.getAudioResourceOptions());
      this.audioPlayer.play(resource);
      log('Playing new track', this.currentTrack.value, this.currentTrack.variant);

      this.currentTrackPlayTime = {
        // It could buffer before starting, so we don't initialize the start time just yet
        started: null,
        pauseStarted: null,
        totalPauseTimeMs: 0,
        seekedMs: null,
        speed: this.playbackSpeed,
      };

      this.emitPlayerStatus();

      // TODO: Extract this to a helper function
      // Also consider baking this into replyWithSessionButtons, but adding an option
      // to specify that we do not want to update the embeded data when buttons are interacted with
      const playerSettings = await PlayerSettings.findByPk(this.guildId);
      const playerUpdatesChannel = playerSettings?.updates_channel_id;
      if (playerUpdatesChannel) {
        const channel = await getChannel(playerUpdatesChannel);
        if (channel && isText(channel)) {
          const nowPlayingData = await runNowPlaying(this);
          const messageData = await getMessageData({
            session: this,
            run: () => Promise.resolve(nowPlayingData),
          });
          const message = await channel.send(messageData).catch(error);
          if (message) {
            listenForPlayerButtons({
              message,
              cb: async () => {
                const newMessageData = await getMessageData({
                  session: this,
                  run: () => Promise.resolve(nowPlayingData),
                });
                await message.edit(newMessageData);
              },
            });
          }
        }
      }
    } catch (err) {
      error(err);
      log('Could not play track', this.currentTrack.value, this.currentTrack.variant);
      // Skip and try next
      this.queueLock = false;
      await this.processQueue();
    }
    this.queueLock = false;
  }
}
