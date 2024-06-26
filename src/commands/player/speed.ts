import type { Command, CommandOrModalRunMethod } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';
import { checkVoiceErrorsByInteraction, parseInput } from 'src/discord-utils';
import sessions from './sessions';
import { attachPlayerButtons } from './utils';

const maxSpeed = 3;
const minSpeed = 0.5;

const commandBuilder = new SlashCommandBuilder()
  .setName('speed')
  .setDescription('Set the playback speed for the current session.')
  .addStringOption(option => option.setName('multiplier')
    .setDescription('The speed multiplier')
    .addChoices(
      { name: '1x', value: '1' },
      { name: '1.25x', value: '1.25' },
      { name: '1.5x', value: '1.5' },
      { name: '1.75x', value: '1.75' },
      { name: '2x', value: '2' },
      { name: '2.5x', value: '2.5' },
      { name: '2.75x', value: '2.75' },
      { name: '3x', value: '3' },
    )
    .setRequired(true));

const run: CommandOrModalRunMethod = async interaction => {
  await interaction.deferReply({ ephemeral: true });
  const session = sessions.get(interaction.guild!.id);
  if (!session) return interaction.editReply('Session does not exist');
  await checkVoiceErrorsByInteraction(interaction);

  const inputs = await parseInput({ slashCommandData: commandBuilder, interaction });
  const speedStr: string = inputs.multiplier.replace('x', ''); // if they type 1.5x instead of 1.5, let's be nice
  const speedNum = Number(speedStr);
  if (Number.isNaN(speedNum) || speedNum > maxSpeed || speedNum < minSpeed) {
    return interaction.editReply(`Your number is invalid or is out of range. Enter a number between ${minSpeed} and ${maxSpeed}`);
  }

  session.setPlaybackSpeed(speedNum);

  await interaction.editReply(`Future tracks will play with playback speed ${speedNum}x`);
  return attachPlayerButtons(interaction, session);
};

const SpeedCommand: Command = {
  guildOnly: true,
  slashCommandData: commandBuilder,
  runCommand: run,
  runModal: run,
  showModalWithNoArgs: true,
};

export default SpeedCommand;
