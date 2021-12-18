import type { CommandInteraction, ContextMenuInteraction } from 'discord.js';
import { Command, ContextMenuTypes, IntentionalAny } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';
import { usersHavePermission } from 'src/discord-utils';
import { client } from 'src/client';
import sessions from './sessions';

const LeaveCommand: Command = {
  guildOnly: true,
  slashCommandData: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Disconnect the bot from voice channels.'),
  runCommand: async interaction => {
    await interaction.deferReply({
      ephemeral: true,
    });

    // Assert guild since this is a guild-only command
    const guild = interaction.guild!;
    const invokerMember = await guild.members.fetch(interaction.user.id);
    const botMember = await guild.members.fetch(client!.user!.id);
    const botVoiceState = guild.voiceStates.cache.find(vs => vs.member?.id === botMember.id);
    const invokerVoiceState = guild.voiceStates.cache.find(vs => vs.member?.id === invokerMember.id);

    if (!botVoiceState || !botVoiceState.channel) {
      await interaction.editReply('Bot is not connected to a voice channel.');
      return;
    }
    const { channel: botConnectedChannel } = botVoiceState;
    const invokerConnectedChannel = invokerVoiceState?.channel;

    if (invokerConnectedChannel !== botConnectedChannel && !usersHavePermission(botConnectedChannel, interaction.user, 'MOVE_MEMBERS')) {
      await interaction.editReply('You do not have permission to disconnect this bot.');
      return;
    }

    // Redundant disconnection just in case it's not in our connections list for whatever reason
    await botVoiceState.disconnect();
    sessions.destroy(guild);
    await interaction.editReply('Disconnected');
  },
};

export default LeaveCommand;
