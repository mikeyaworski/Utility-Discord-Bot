import type { CommandInteraction } from 'discord.js';
import type { Command } from 'src/types';

import { validateURL } from 'ytdl-core';
import { SlashCommandBuilder } from '@discordjs/builders';
import { handleError } from 'src/discord-utils';
import sessions from './sessions';
import Track from './track';

const PlayCommand: Command = {
  guildOnly: true,
  slashCommandData: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Plays audio into a voice channel.')
    .addStringOption(option => option.setName('youtube').setDescription('YouTube Link').setRequired(false))
    .addStringOption(option => option.setName('query').setDescription('Generic query for YouTube').setRequired(false)),

  runCommand: async interaction => {
    await interaction.deferReply({ ephemeral: true });
    const youtubeLink = interaction.options.getString('youtube');
    const query = interaction.options.getString('query');

    // Assert guild since this is a guild-only command
    const guild = interaction.guild!;
    let session = sessions.get(guild);

    if (session) session.resume();

    if (!youtubeLink && !query && !session) {
      return interaction.editReply('You must provide at least one argument.');
    }

    if (youtubeLink) {
      if (!validateURL(youtubeLink)) {
        return interaction.editReply('Invalid YouTube link.');
      }
      const { user } = interaction;
      if (!user) {
        return interaction.editReply('Could not resolve user invoking command.');
      }
      try {
        const resolvedMember = await guild.members.fetch(user.id);
        const { channel } = resolvedMember.voice;

        if (!channel) {
          return interaction.editReply('You must be connected to a voice channel.');
        }

        if (!channel.joinable) {
          return interaction.editReply('I don\'t have permission to connect to your voice channel.');
        }

        if (!session) session = sessions.create(channel);
        const track = new Track(youtubeLink);
        await session.enqueue(track);
        const videoDetails = await track.getVideoDetails();
        if (session.queue.length) {
          return interaction.editReply(`Queued at position #${session.queue.length}: ${videoDetails.title}`);
        }
        return interaction.editReply(`Now playing: ${videoDetails.title}`);
      } catch (err) {
        return handleError(err, interaction);
      }
    } else if (query) {
      // TODO: Finish
      return interaction.editReply(`TODO: ${query}`);
    }
    return interaction.editReply('Resumed');
  },
};

export default PlayCommand;
