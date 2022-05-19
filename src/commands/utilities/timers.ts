import type { CommandInteraction, ModalSubmitInteraction } from 'discord.js';
import type { SlashCommandChannelOption, SlashCommandStringOption } from '@discordjs/builders';
import type { Command, IntentionalAny } from 'src/types';
import { SlashCommandBuilder } from '@discordjs/builders';
import { getSubcommand } from 'src/discord-utils';
import { handleUpsert } from './reminders';

const timeOption = (option: SlashCommandStringOption) => {
  return option
    .setName('times')
    .setDescription('The delay for the timer. Examples: "5 mins". Can be comma-separated to create multiple.')
    .setRequired(true);
};
const channelOption = (option: SlashCommandChannelOption) => {
  return option
    .setName('channel')
    .setDescription('The channel to send the message in. Defaults to the current one if not provided.')
    .setRequired(false);
};
const intervalOption = (option: SlashCommandStringOption) => {
  return option
    .setName('interval')
    .setDescription('Interval to repeat timer. Examples: "24 hours" or "8640000"')
    .setRequired(false);
};

const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('timers')
  .setDescription('Sends a message after timer is up.');
commandBuilder.addSubcommand(subcommand => {
  subcommand
    .setName('create')
    .setDescription('Create a timer.')
    .addStringOption(timeOption)
    .addChannelOption(channelOption)
    .addStringOption(intervalOption);
  return subcommand;
});

async function run(interaction: CommandInteraction | ModalSubmitInteraction): Promise<IntentionalAny> {
  await interaction.deferReply({ ephemeral: true });

  const subcommand = getSubcommand(interaction);
  switch (subcommand) {
    case 'create': {
      return handleUpsert(interaction, commandBuilder);
    }
    default: {
      return interaction.editReply('What??');
    }
  }
}

const TimerCommand: Command = {
  guildOnly: false,
  slashCommandData: commandBuilder,
  runCommand: run,
  runModal: run,
  modalLabels: {
    times: 'The delay for the timer. Commas for multiple.',
    channel: 'The channel to send the message in.',
    interval: 'Interval to repeat timer.',
  },
  modalPlaceholders: {
    times: 'E.g. "5 mins" or "5 mins, 10 mins"',
    channel: 'Defaults to current one',
    interval: 'E.g. "24 hours" or "8640000"',
  },
};

export default TimerCommand;
