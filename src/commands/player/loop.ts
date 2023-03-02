import type { Command } from 'src/types';
import { ContextMenuTypes } from 'src/types';
import sessions from './sessions';

const LoopCommand: Command = {
  guildOnly: true,
  contextMenuData: {
    type: ContextMenuTypes.USER,
    name: 'loop/unloop',
  },
  runContextMenu: async interaction => {
    await interaction.deferReply({ ephemeral: true });
    const session = sessions.get(interaction.guild!.id);
    if (!session) return interaction.editReply('Session does not exist.');
    if (session.isLooped()) {
      session.unloop();
      await interaction.editReply('Unlooped.');
    } else {
      session.loop();
      await interaction.editReply('Looped.');
    }
    return null;
  },
};

export default LoopCommand;
