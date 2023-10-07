import { Command, ContextMenuTypes } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';
import { checkVoiceErrorsByInteraction } from 'src/discord-utils';
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
    const session = sessions.get(interaction.guild!.id);

    if (!session) {
      await interaction.editReply('Session does not exist.');
      return;
    }

    if (session.isPaused()) {
      session.resume();
      await interaction.editReply('Resumed.');
    } else {
      session.pause();
      await interaction.editReply('Paused.');
    }
  },

  runCommand: async interaction => {
    await interaction.deferReply({ ephemeral: true });

    const session = sessions.get(interaction.guild!.id);

    if (!session) {
      await interaction.editReply({
        components: [],
        embeds: [],
        content: 'Session does not exist.',
      });
      return;
    }
    await checkVoiceErrorsByInteraction(interaction);

    const success = session.pause();
    await interaction.editReply({
      content: success ? 'Paused.' : 'Could not pause.',
    });
    attachPlayerButtons(interaction, session);
  },
};

export default NowPlayingCommand;
