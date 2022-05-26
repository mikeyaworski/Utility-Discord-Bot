import type { Command } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';
import { getSecondsFromClockString } from 'src/utils';
import sessions from './sessions';
import { attachPlayerButtons } from './utils';

const SeekCommand: Command = {
  guildOnly: true,
  slashCommandData: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Skip to a specific part of the audio.')
    .addStringOption(option => option.setName('amount').setDescription('In seconds, or a clock string of the form xx:xx:xx').setRequired(true)),

  runCommand: async interaction => {
    await interaction.deferReply({
      ephemeral: true,
    });
    const session = sessions.get(interaction.guild!);
    if (!session) {
      await interaction.editReply('Session does not exist');
      return;
    }
    const seek = interaction.options.getString('amount', true);
    const numSeconds = Number.isNaN(Number(seek)) ? getSecondsFromClockString(seek) : Number(seek);
    await session.seek(numSeconds);
    await interaction.editReply(`Seeking to ${numSeconds} seconds.`);
    attachPlayerButtons(interaction, session);
  },
};

export default SeekCommand;
