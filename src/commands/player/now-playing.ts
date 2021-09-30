import type { Command } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';
import sessions from './sessions';

const NowPlayingCommand: Command = {
  guildOnly: true,
  slashCommandData: new SlashCommandBuilder()
    .setName('now-playing')
    .setDescription('Display the title of the track that is currently playing.'),

  runCommand: async interaction => {
    await interaction.deferReply({
      ephemeral: true,
    });

    const session = sessions.get(interaction.guild!);
    if (!session) return interaction.editReply('Session does not exist.');

    const currentTrack = session.getCurrentTrack();
    if (!currentTrack) return interaction.editReply('Nothing is playing.');

    const videoDetails = await currentTrack.getVideoDetails();
    return interaction.editReply(videoDetails.title);
  },
};

export default NowPlayingCommand;
