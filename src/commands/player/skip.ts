import { CommandInteraction, ContextMenuCommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { checkVoiceErrorsByInteraction, isCommand } from 'src/discord-utils';
import type { Command } from 'src/types';
import { ContextMenuTypes } from 'src/types';
import { attachPlayerButtons } from './utils';
import sessions from './sessions';

async function run(interaction: CommandInteraction | ContextMenuCommandInteraction, shouldAttachButtons: boolean) {
  await interaction.deferReply({ ephemeral: true });
  const session = sessions.get(interaction.guild!.id);
  if (!session) return interaction.editReply('Session does not exist.');
  await checkVoiceErrorsByInteraction(interaction);

  let extraSkips = 0;
  if (isCommand(interaction)) {
    const amount = interaction.options.getInteger('amount', false) || 1;
    extraSkips = Math.max(0, amount - 1);
  }

  await session.skip(extraSkips);
  const newTrack = await session.getCurrentTrack();
  if (!newTrack) return interaction.editReply('Skipped.');

  try {
    const { title } = await newTrack.getVideoDetails();
    await interaction.editReply(`Skipped. Now playing: ${title}`);
  } catch {
    await interaction.editReply('Skipped.');
  }
  if (shouldAttachButtons) attachPlayerButtons(interaction, session);
  return null;
}

const SkipCommand: Command = {
  guildOnly: true,
  slashCommandData: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current track.')
    .addIntegerOption(option => option.setName('amount').setDescription('Number of songs to skip.').setRequired(false)),
  contextMenuData: {
    type: ContextMenuTypes.USER,
    name: 'skip',
  },
  runContextMenu: async interaction => run(interaction, false),
  runCommand: async interaction => run(interaction, true),
};

export default SkipCommand;
