import { Command, ContextMenuTypes, IntentionalAny } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';
import { ContextMenuInteraction } from 'discord.js';
import { attachPlayerButtons } from './utils';
import sessions from './sessions';

const NowPlayingCommand: Command = {
  guildOnly: true,
  slashCommandData: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the player.'),
  contextMenuData: {
    type: ContextMenuTypes.USER,
    name: 'pause/resume',
  },
  runContextMenu: async interaction => {
    await interaction.deferReply({ ephemeral: true });
    const session = sessions.get(interaction.guild!);

    if (!session) {
      await interaction.editReply('Session does not exist.');
      return;
    }

    const success = session.pause();
    if (!success) session.resume();
    await interaction.editReply({
      content: success ? 'Paused.' : 'Resumed.',
    });
  },

  runCommand: async interaction => {
    await interaction.deferReply({ ephemeral: true });

    const session = sessions.get(interaction.guild!);

    if (!session) {
      await interaction.editReply({
        components: [],
        embeds: [],
        content: 'Session does not exist.',
      });
      return;
    }

    const success = session.pause();
    await interaction.editReply({
      content: success ? 'Paused.' : 'Could not pause.',
    });
    attachPlayerButtons(interaction, session);
  },
};

export default NowPlayingCommand;
