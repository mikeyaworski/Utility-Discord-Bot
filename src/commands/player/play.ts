import type { CommandInteraction } from 'discord.js';
import type { Command } from 'src/types';

import { getInfo } from 'ytdl-core';
import { AudioResource, joinVoiceChannel, createAudioResource, demuxProbe, VoiceConnectionStatus, createAudioPlayer } from '@discordjs/voice';
import { raw as ytdl } from 'youtube-dl-exec';
import { SlashCommandBuilder } from '@discordjs/builders';
import { isYoutubeLink } from 'src/utils';
import { handleError } from 'src/discord-utils';
import { error } from 'src/logging';
import { create, disconnect } from './connections';

// https://github.com/discordjs/voice/blob/f1869a9af5a44ec9a4f52c2dd282352b1521427d/examples/music-bot/src/music/track.ts#L46-L76
function createAudioResourceTodo(youtubeLink: string): Promise<AudioResource> {
  return new Promise((resolve, reject) => {
    const process = ytdl(
      youtubeLink,
      {
        o: '-',
        q: '',
        f: 'bestaudio[ext=webm+acodec=opus+asr=48000]/bestaudio',
        r: '100K',
      },
      { stdio: ['ignore', 'pipe', 'ignore'] },
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
    process
      .once('spawn', () => {
        demuxProbe(stream)
          .then(probe => resolve(createAudioResource(probe.stream, {
            inputType: probe.type,
          })))
          .catch(onError);
      })
      .catch(onError);
  });
}

const PlayCommand: Command = {
  guildOnly: true,
  slashCommandData: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Plays audio into a voice channel.')
    .addStringOption(option => option.setName('youtube').setDescription('YouTube Link').setRequired(false))
    .addStringOption(option => option.setName('query').setDescription('Generic query for YouTube').setRequired(false)),

  async runCommand(interaction: CommandInteraction): Promise<void> {
    const youtubeLink = interaction.options.getString('youtube');
    const query = interaction.options.getString('query');

    if (!youtubeLink && !query) {
      await interaction.reply({
        ephemeral: true,
        content: 'You must provide at least one argument.',
      });
      return;
    }
    await interaction.deferReply({ ephemeral: true });

    if (youtubeLink) {
      if (!isYoutubeLink(youtubeLink)) {
        await interaction.editReply('Invalid YouTube link.');
        return;
      }
      const { user } = interaction;
      if (!user) {
        await interaction.editReply('Could not resolve user invoking command.');
        return;
      }
      try {
        // Assert guild since this is a guild-only command
        const resolvedMember = await interaction.guild!.members.fetch(user.id);
        const { channel } = resolvedMember.voice;

        if (!channel) {
          await interaction.editReply('You must be connected to a voice channel.');
          return;
        }

        if (!channel.joinable) {
          await interaction.editReply('I don\'t have permission to connect to your voice channel.');
          return;
        }

        const videoInfo = await getInfo(youtubeLink);
        const audioPlayer = createAudioPlayer();
        const audioResource = await createAudioResourceTodo(youtubeLink);
        const voiceConnection = joinVoiceChannel({
          channelId: channel.id,
          guildId: channel.guild.id,
          adapterCreator: channel.guild.voiceAdapterCreator,
        });
        voiceConnection.subscribe(audioPlayer);
        voiceConnection.on('stateChange', (oldState, newState) => {
          if (newState.status === VoiceConnectionStatus.Disconnected
            || newState.status === VoiceConnectionStatus.Destroyed) {
            disconnect(channel.guild);
          }
        });
        voiceConnection.on('error', error);
        create(channel.guild, voiceConnection);
        audioPlayer.play(audioResource);

        await interaction.editReply(`Playing: ${videoInfo.videoDetails.title}`);
      } catch (err) {
        handleError(err, interaction);
      }
    } else if (query) {
      // TODO: Finish
      await interaction.editReply(`TODO: ${query}`);
    }
  },
};

export default PlayCommand;
