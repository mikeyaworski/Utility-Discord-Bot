import type { Command } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';
import { getIsInSameChannelAsBot, usersHaveChannelPermission } from 'src/discord-utils';
import { client } from 'src/client';
import sessions from './sessions';

const LeaveCommand: Command = {
  guildOnly: true,
  slashCommandData: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Disconnect the bot from voice channels.'),
  runCommand: async interaction => {
    await interaction.deferReply({ ephemeral: true });

    // Assert guild since this is a guild-only command
    const guild = interaction.guild!;

    const botMember = await guild.members.fetch(client.user!.id);
    const isInSameChannelAsBot = await getIsInSameChannelAsBot({
      userId: interaction.user.id,
      guildId: guild.id,
    });

    if (!botMember.voice.channel) {
      await interaction.editReply('Bot is not connected to a voice channel.');
      return;
    }

    if (!isInSameChannelAsBot
      && !usersHaveChannelPermission({
        channel: botMember.voice.channel,
        users: interaction.user,
        permissions: 'MoveMembers',
      })) {
      await interaction.editReply('You do not have permission to disconnect this bot.');
      return;
    }

    // Redundant disconnection just in case it's not in our connections list for whatever reason
    await botMember.voice.disconnect();
    sessions.destroy(guild.id);
    await interaction.editReply('Disconnected');
  },
};

export default LeaveCommand;
