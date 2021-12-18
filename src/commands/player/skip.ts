import { CommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import type { Command } from 'src/types';
import { ContextMenuTypes } from 'src/types';
import { attachPlayerButtons } from './utils';
import sessions from './sessions';

async function run(interaction: CommandInteraction, shouldAttachButtons: boolean) {
  await interaction.deferReply({ ephemeral: true });
  const session = sessions.get(interaction.guild!);
  if (!session) return interaction.editReply('Session does not exist.');

  await session.skip();
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
    .setDescription('Skip the current track.'),
  contextMenuData: {
    type: ContextMenuTypes.USER,
    name: 'skip',
  },
  runContextMenu: async interaction => {
    run(interaction, false);
  },
  runCommand: async interaction => {
    run(interaction, true);
  },
};

export default SkipCommand;
