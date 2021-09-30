import type { Command } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';
import sessions from './sessions';

const NowPlayingCommand: Command = {
  guildOnly: true,
  slashCommandData: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume the player (unpause).'),

  runCommand: async interaction => {
    await interaction.deferReply({ ephemeral: true });

    const session = sessions.get(interaction.guild!);
    if (!session) return interaction.editReply('Session does not exist.');
    const success = session.resume();

    if (success) return interaction.editReply('Resumed.');
    return interaction.editReply('Could not resume.');
  },
};

export default NowPlayingCommand;
