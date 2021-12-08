import type { Command } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';
import { attachAndListenToPlayerButtons } from './utils';
import sessions from './sessions';

const NowPlayingCommand: Command = {
  guildOnly: true,
  slashCommandData: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the player.'),

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
    attachAndListenToPlayerButtons(interaction, session);
  },
};

export default NowPlayingCommand;
