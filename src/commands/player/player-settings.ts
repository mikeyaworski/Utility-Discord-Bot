import type { Channel, ChatInputCommandInteraction } from 'discord.js';
import type { CreationAttributes } from 'sequelize';
import type { Command } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';
import { getInteractionConnectedVoiceChannels, getSubcommand, parseInput } from 'src/discord-utils';
import { PlayerSettings } from 'src/models/player-settings';
import sessions from './sessions';

const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('player-settings')
  .setDescription('Adjust various player settings, e.g. audio levels and message updates.');
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('clear-updates-channel');
  subcommand.setDescription('Stops update messages from being sent to any channel.');
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('set');
  subcommand.setDescription('Set the channel for sending update messages.');
  subcommand.addChannelOption(option => {
    return option
      .setName('updates_channel')
      .setDescription('Send player update messages publicly to this channel.')
      .setRequired(false);
  });
  subcommand.addBooleanOption(option => {
    return option
      .setName('normalize')
      .setDescription('Whether you want to normalize audio levels for the player.')
      .setRequired(false);
  });
  return subcommand;
});

async function handleSet(interaction: ChatInputCommandInteraction) {
  const {
    normalize: shouldNormalizeAudio,
    updates_channel: updatesChannel,
  } = await parseInput({ slashCommandData: commandBuilder, interaction }) as {
    normalize?: boolean,
    updates_channel: Channel,
  };

  if (shouldNormalizeAudio == null && !updatesChannel) {
    throw new Error('You did not provide any settings to change.');
  }

  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const session = sessions.get(guildId);

  const newPlayerSettings: CreationAttributes<PlayerSettings> = {
    guild_id: guildId,
  };

  if (shouldNormalizeAudio != null) {
    const [
      invokerChannel,
      botChannel,
    ] = await getInteractionConnectedVoiceChannels({
      userId,
      guildId,
    });

    // Don't allow them to change this setting when the bot is currently connected for someone else
    if (botChannel && botChannel.members.size > 1 && invokerChannel?.id !== botChannel.id) {
      throw new Error('You cannot change this setting while the bot is connected for other members.');
    }

    if (session) session.setShouldNormalizeAudio(shouldNormalizeAudio);
    newPlayerSettings.normalize = shouldNormalizeAudio;
  }

  if (updatesChannel) {
    newPlayerSettings.updates_channel_id = updatesChannel.id;
  }

  await PlayerSettings.upsert(newPlayerSettings);

  const responseLines = ['Player settings updated.'];
  if (newPlayerSettings.updates_channel_id) {
    responseLines.push(`Player updates will be publicly sent to <#${newPlayerSettings.updates_channel_id}>.`);
  }
  if (newPlayerSettings.normalize != null) {
    responseLines.push(shouldNormalizeAudio
      ? 'Future tracks will play with normalized audio.'
      : 'Future tracks will play with regular audio.');
  }

  return interaction.editReply(responseLines.join('\n'));
}

async function handleClear(interaction: ChatInputCommandInteraction) {
  const playerSettings = await PlayerSettings.findByPk(interaction.guildId!);
  if (playerSettings) {
    await playerSettings.update({
      updates_channel_id: null,
    });
    return interaction.editReply('Player updates will no longer be posted publicly.');
  }
  return interaction.editReply('Player settings were already empty.');
}

const PlayerSettingsCommand: Command = {
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
      case 'clear-updates-channel': {
        await handleClear(interaction);
        break;
      }
      default: {
        break;
      }
    }
  },
};

export default PlayerSettingsCommand;
