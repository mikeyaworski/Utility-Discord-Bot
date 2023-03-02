import type { Command, CommandOrModalRunMethod } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';
import { getSecondsFromClockString } from 'src/utils';
import { checkVoiceErrors, parseInput } from 'src/discord-utils';
import sessions from './sessions';
import { attachPlayerButtons } from './utils';

const commandBuilder = new SlashCommandBuilder()
  .setName('seek')
  .setDescription('Skip to a specific part of the audio.')
  .addStringOption(option => option.setName('timestamp')
    .setDescription('In seconds, or a string of the form xx:xx:xx')
    .setRequired(false))
  .addStringOption(option => option.setName('rewind')
    .setDescription('In seconds, or a string of the form xx:xx:xx')
    .setRequired(false))
  .addStringOption(option => option.setName('fast-forward')
    .setDescription('In seconds, or a string of the form xx:xx:xx')
    .setRequired(false));

function getNumSeconds(input: string): number {
  return Number.isNaN(Number(input)) ? getSecondsFromClockString(input) : Number(input);
}

const run: CommandOrModalRunMethod = async interaction => {
  await interaction.deferReply({
    ephemeral: true,
  });
  const session = sessions.get(interaction.guild!.id);
  if (!session) {
    await interaction.editReply('Session does not exist');
    return;
  }
  await checkVoiceErrors(interaction);

  const inputs = await parseInput({ slashCommandData: commandBuilder, interaction });
  const timestamp: string | undefined = inputs.timestamp;
  const rewind: string | undefined = inputs.rewind;
  const fastForward: string | undefined = inputs['fast-forward'];

  const timestampSeconds = timestamp ? getNumSeconds(timestamp) : null;
  const rewindSeconds = rewind ? getNumSeconds(rewind) : null;
  const fastForwardSeconds = fastForward ? getNumSeconds(fastForward) : null;

  if (timestampSeconds != null) {
    await session.seek(timestampSeconds);
    await interaction.editReply(`Seeking to ${timestampSeconds} seconds.`);
    attachPlayerButtons(interaction, session);
  } else if (rewindSeconds != null) {
    const numSeconds = Math.max(0, Math.round(session.getCurrentTrackPlayTime() / 1000 - rewindSeconds));
    await session.seek(numSeconds);
    await interaction.editReply(`Seeking to ${numSeconds} seconds.`);
    attachPlayerButtons(interaction, session);
  } else if (fastForwardSeconds != null) {
    const numSeconds = Math.round(session.getCurrentTrackPlayTime() / 1000 + fastForwardSeconds);
    await session.seek(numSeconds);
    await interaction.editReply(`Seeking to ${numSeconds} seconds.`);
    attachPlayerButtons(interaction, session);
  } else {
    await interaction.editReply('At least one argument is required');
  }
};

const SeekCommand: Command = {
  guildOnly: true,
  slashCommandData: commandBuilder,
  runCommand: run,
  runModal: run,
  showModalWithNoArgs: true,
  modalLabels: {
    timestamp: 'Time in video',
    rewind: 'Rewind',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'fast-forward': 'Fast Forward',
  },
  modalPlaceholders: {
    timestamp: 'In seconds, or a string of the form xx:xx:xx',
    rewind: 'In seconds, or a string of the form xx:xx:xx',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'fast-forward': 'In seconds, or a string of the form xx:xx:xx',
  },
};

export default SeekCommand;
