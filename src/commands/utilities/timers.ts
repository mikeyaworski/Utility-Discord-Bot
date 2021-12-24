import type { Command } from 'src/types';
import type { SlashCommandChannelOption, SlashCommandStringOption } from '@discordjs/builders';
import { SlashCommandBuilder } from '@discordjs/builders';
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

const TimerCommand: Command = {
  guildOnly: false,
  slashCommandData: commandBuilder,
  runCommand: async interaction => {
    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
      case 'create': {
        return handleUpsert(interaction);
      }
      default: {
        return interaction.editReply('What??');
      }
    }
  },
};

export default TimerCommand;
