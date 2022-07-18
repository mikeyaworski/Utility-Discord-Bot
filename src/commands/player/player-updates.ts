import { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';
import { getSubcommand } from 'src/discord-utils';
import { PlayerUpdates } from 'src/models/player-updates';

const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('player-updates')
  .setDescription('Send player update messages publicly to a channel.');
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('clear');
  subcommand.setDescription('Clear this preference (do not send update messages).');
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('set');
  subcommand.setDescription('Set the channel for sending update messages.');
  subcommand.addChannelOption(option => {
    return option
      .setName('channel')
      .setDescription('The channel.')
      .setRequired(true);
  });
  return subcommand;
});

async function handleSet(interaction: ChatInputCommandInteraction) {
  const channel = interaction.options.getChannel('channel', true);
  await PlayerUpdates.upsert({
    guild_id: interaction.guildId!,
    channel_id: channel.id,
  });
  return interaction.editReply(`Player updates will be publicly sent to <#${channel.id}>`);
}

async function handleClear(interaction: ChatInputCommandInteraction) {
  await PlayerUpdates.destroy({
    where: {
      guild_id: interaction.guildId!,
    },
  });
  return interaction.editReply('Player updates will no longer be posted publicly.');
}

const PlayerUpdatesCommand: Command = {
  guildOnly: true,
  slashCommandData: commandBuilder,
  runCommand: async interaction => {
    await interaction.deferReply({
      ephemeral: true,
    });
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

export default PlayerUpdatesCommand;
