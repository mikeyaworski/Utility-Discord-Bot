import type { Command } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';
import sessions from './sessions';

const NowPlayingCommand: Command = {
  guildOnly: true,
  slashCommandData: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the player.'),

  runCommand: async interaction => {
    await interaction.deferReply({ ephemeral: true });

    const session = sessions.get(interaction.guild!);
    if (!session) return interaction.editReply('Session does not exist.');
    const success = session.pause();

    if (success) return interaction.editReply('Paused.');
    return interaction.editReply('Could not pause.');
  },
};

export default NowPlayingCommand;
