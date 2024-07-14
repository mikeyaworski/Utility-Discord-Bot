import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';
import { getSubcommand } from 'src/discord-utils';
import { MovieNightConfig } from 'src/models/movie-night-config';

const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('movie-night-config')
  .setDescription('Create thread and mention role in channel');
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('clear');
  subcommand.setDescription('Clear this preference (do not send create thread or mention role).');
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('set');
  subcommand.setDescription('Set the channel for creating thread.');
  subcommand.addChannelOption(option => {
    return option
      .setName('channel')
      .setDescription('The channel to create a thread in.')
      .setRequired(true);
  });
  subcommand.addRoleOption(option => {
    return option
      .setName('role')
      .setDescription('The role to mention.')
      .setRequired(true);
  });
  return subcommand;
});

async function handleSet(interaction: ChatInputCommandInteraction) {
  const channel = interaction.options.getChannel('channel', true);
  const role = interaction.options.getRole('role', true);
  await MovieNightConfig.upsert({
    guild_id: interaction.guildId!,
    channel_id: channel.id,
    role_id: role.id,
  });
  return interaction.editReply(`Threads will be created in <#${channel.id}> and will mention role <@&${role.id}>`);
}

async function handleClear(interaction: ChatInputCommandInteraction) {
  await MovieNightConfig.destroy({
    where: {
      guild_id: interaction.guildId!,
    },
  });
  return interaction.editReply('Threads will no longer be created and role mentions will no longer happen once a movie is started.');
}

const MovieNightConfigCommand: Command = {
  guildOnly: true,
  slashCommandData: commandBuilder,
  runCommand: async interaction => {
    await interaction.deferReply({ ephemeral: true });
    const subcommand = getSubcommand(interaction);
    switch (subcommand) {
      case 'set': {
        await handleSet(interaction);
        break;
      }
      case 'clear': {
        await handleClear(interaction);
        break;
      }
      default: {
        break;
      }
    }
  },
};

export default MovieNightConfigCommand;
