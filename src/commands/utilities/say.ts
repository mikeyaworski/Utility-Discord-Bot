import type { Command, IntentionalAny } from 'src/types';
import { SlashCommandBuilder } from '@discordjs/builders';
import { getInfoFromCommandInteraction, checkMessageErrors, parseInput, sendMessage } from 'src/discord-utils';
import { CommandInteraction, ModalSubmitInteraction } from 'discord.js';

const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('say')
  .setDescription('Sends a message.')
  .addStringOption(option => option
    .setName('message')
    .setDescription('The message')
    .setRequired(true));

async function run(interaction: CommandInteraction | ModalSubmitInteraction): Promise<IntentionalAny> {
  await interaction.deferReply({ ephemeral: true });
  const inputs = await parseInput({ slashCommandData: commandBuilder, interaction });
  const message: string = inputs.message;
  const { channel, author } = await getInfoFromCommandInteraction(interaction, { ephemeral: true });

  if (!channel) throw new Error('Could not find channel.');
  if (!author) throw new Error('Could not find author.');

  // Throws if there is an issue
  checkMessageErrors({
    channel,
    author,
    message,
  });

  await sendMessage(channel, message);
  await interaction.editReply('Sent.');
}

const SayCommand: Command = {
  guildOnly: false,
  slashCommandData: commandBuilder,
  runCommand: run,
  runModal: run,
};

export default SayCommand;
