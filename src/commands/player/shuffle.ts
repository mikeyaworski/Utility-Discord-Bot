import type { Command } from 'src/types';
import { ContextMenuTypes } from 'src/types';
import sessions from './sessions';

const ShuffleCommand: Command = {
  guildOnly: true,
  contextMenuData: {
    type: ContextMenuTypes.USER,
    name: 'shuffle',
  },
  runContextMenu: async interaction => {
    await interaction.deferReply({ ephemeral: true });
    const session = sessions.get(interaction.guild!);
    if (!session) return interaction.editReply('Session does not exist.');

    session.shuffle();
    await interaction.editReply('Queue shuffled.');
    return null;
  },
};

export default ShuffleCommand;
