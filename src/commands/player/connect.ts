import type { Command } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';
import sessions from './sessions';

const ConnectCommand: Command = {
  guildOnly: true,
  slashCommandData: new SlashCommandBuilder()
    .setName('connect')
    .setDescription('Connect bot to a voice channel.')
    .addChannelOption(option => option.setName('channel').setDescription('The channel to connect to.').setRequired(false)),

  runCommand: async interaction => {
    await interaction.deferReply({ ephemeral: true });
    let channel = interaction.options.getChannel('channel');

    // Assert guild since this is a guild-only command
    const guild = interaction.guild!;

    if (sessions.get(guild)) return interaction.editReply('I\'m already connected to a voice channel.');

    if (!channel) {
      const { user } = interaction;
      if (!user) return interaction.editReply('Could not resolve user invoking command.');
      const resolvedMember = await guild.members.fetch(user.id);
      channel = resolvedMember.voice.channel;
    }

    if (!channel) return interaction.editReply('I have no idea which channel to join.');
    if (channel.type !== 'GUILD_VOICE') return interaction.editReply('That\'s not a voice channel.');
    if (!channel.joinable) return interaction.editReply('I don\'t have permission to connect to your voice channel.');

    sessions.create(channel);
    return interaction.editReply('Connected.');
  },
};

export default ConnectCommand;
