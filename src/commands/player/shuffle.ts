import type { Command } from 'src/types';
import { ContextMenuTypes, IntentionalAny } from 'src/types';
import { SlashCommandBuilder } from '@discordjs/builders';
import { ContextMenuInteraction } from 'discord.js';
import { attachPlayerButtons } from './utils';
import sessions from './sessions';

async function shuffleContextMenu(interaction:ContextMenuInteraction) : Promise<IntentionalAny> {
  await interaction.deferReply({ ephemeral: true });
  const session = sessions.get(interaction.guild!);
  if (!session) return interaction.editReply('Session does not exist.');

  session.shuffle();
  await interaction.editReply('Queue shuffled.');
  return null;
}

const ShuffleCommand: Command = {
  guildOnly: true,
  slashCommandData: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('shuffle the current queue.'),
  contextMenuData: {
    type: ContextMenuTypes.USER,
    name: 'shuffle',
  },
  runContextMenu: shuffleContextMenu,
  runCommand: async interaction => {
    await interaction.deferReply({ ephemeral: true });
    const session = sessions.get(interaction.guild!);
    if (!session) return interaction.editReply('Session does not exist.');

    session.shuffle();
    await interaction.editReply('Queue shuffled.');
    attachPlayerButtons(interaction, session);
    return null;
  },
};

export default ShuffleCommand;
