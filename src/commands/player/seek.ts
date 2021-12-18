import type { Command } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';
import sessions from './sessions';
import { attachPlayerButtons } from './utils';

const SeekCommand: Command = {
  guildOnly: true,
  slashCommandData: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Skip to a specific part of the audio.')
    .addNumberOption(option => option.setName('amount').setDescription('In seconds.').setRequired(true)),

  runCommand: async interaction => {
    await interaction.deferReply({
      ephemeral: true,
    });
    const session = sessions.get(interaction.guild!);
    if (!session) {
      await interaction.editReply('Session does not exist');
      return;
    }
    const seek = interaction.options.getNumber('amount', true);
    await session.seek(seek);
    await interaction.editReply(`Seeking to ${seek} seconds.`);
    attachPlayerButtons(interaction, session);
  },
};

export default SeekCommand;
