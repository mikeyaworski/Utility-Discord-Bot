import type { Message, TextBasedChannels } from 'discord.js';
import type { Command, CommandBeforeConfirmMethod, CommandAfterConfirmMethod } from 'src/types';

import ConfirmationCommandRunner, { DEFAULT_CONFIRMATION_INFO } from 'src/commands/confirmation-command';

import Discord from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

import {
  findMessageInGuild,
  getMessagesInRange,
  usersHavePermission,
  getInfoFromCommandInteraction,
} from 'src/discord-utils';
import { client } from 'src/client';
import { filterOutFalsy } from 'src/utils';

interface IntermediateResult {
  msgs: Message[],
  toChannel: TextBasedChannels,
  fromChannel: TextBasedChannels,
}

async function moveMessage(channel: TextBasedChannels, msg: Message): Promise<void> {
  await channel.sendTyping();
  const newMessage = new Discord.MessageEmbed({
    author: {
      name: msg.author.username,
      icon_url: msg.author.avatarURL() || undefined,
    },
    description: msg.content,
  });
  await channel.send({
    embeds: [newMessage],
    files: Array.from(msg.attachments.values()),
  });
  await msg.delete();
}

const beforeConfirm: CommandBeforeConfirmMethod<IntermediateResult> = async interaction => {
  const channelId = interaction.options.getChannel('to_channel', true).id;
  const startId = interaction.options.getString('start_message_id', true);
  const endId = interaction.options.getString('end_message_id');

  const toChannel = await interaction.guild!.channels.fetch(channelId);
  if (!toChannel || !toChannel.isText()) {
    interaction.editReply(`Could not resolve toChannel: <#${channelId}>`);
    return null;
  }

  const [startMsg, fromChannel] = await findMessageInGuild(
    startId,
    interaction.guild!,
    interaction.channel,
  );

  if (!startMsg || !fromChannel) {
    await interaction.editReply('Could not find starting message.');
    return null;
  }

  if (toChannel.id === fromChannel.id) {
    await interaction.editReply('You\'re moving messages to the same channel??');
    return null;
  }

  const { author } = await getInfoFromCommandInteraction(interaction, { ephemeral: true });

  if (!author) {
    await interaction.editReply('Could not find who is invoking this command.');
    return null;
  }

  const authorAndBot = filterOutFalsy([author, client.user]);

  if (!usersHavePermission(toChannel, authorAndBot, ['SEND_MESSAGES', 'VIEW_CHANNEL'])) {
    await interaction.editReply(`One of us not have access to send messages in <#${toChannel.id}>`);
    return null;
  }

  if (!usersHavePermission(fromChannel, authorAndBot, ['MANAGE_MESSAGES', 'VIEW_CHANNEL'])) {
    await interaction.editReply(`One of us not have access to delete messages in <#${fromChannel.id}>`);
    return null;
  }

  // single message; not a range
  if (!endId) {
    await toChannel.sendTyping();
    await toChannel.send(`__Messages moved from__ <#${fromChannel.id}>`);
    await moveMessage(toChannel, startMsg);
    await interaction.editReply('1 message moved.');
    return null;
  }

  let endMsg: Message;
  try {
    endMsg = await fromChannel.messages.fetch(endId);
  } catch (err) {
    await interaction.editReply('End message is not in the same channel as start message.');
    return null;
  }

  const [msgs, stoppedEarly] = await getMessagesInRange(fromChannel, startMsg, endMsg);
  const confirmPrompt = `Are you sure you want to move ${msgs.length} messages to <#${toChannel.id}>?${
    stoppedEarly ? '\nNote: Some messages in the range were not included due to a rate limit precaution.' : ''
  }`;
  const workingPrompt = `Moving ${msgs.length} messages to <#${toChannel.id}>...`;
  return {
    intermediateResult: { msgs, toChannel, fromChannel },
    confirmPrompt,
    workingPrompt,
  };
};

const afterConfirm: CommandAfterConfirmMethod<IntermediateResult> = async (interaction, result) => {
  const { msgs, toChannel, fromChannel } = result;

  toChannel.sendTyping();
  await toChannel.send(`__Messages moved from__ <#${fromChannel.id}>`);

  // do these in order
  for (let i = 0; i < msgs.length; i++) {
    await moveMessage(toChannel, msgs[i]);
  }

  return `${msgs.length} messages have been moved to <#${toChannel.id}>`;
};

const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('move')
  .setDescription('Moves a range of messages to another channel.');
commandBuilder.addChannelOption(option => {
  return option
    .setName('to_channel')
    .setDescription('Channel to move message(s) to.')
    .setRequired(true);
});
commandBuilder.addStringOption(option => {
  return option
    .setName('start_message_id')
    .setDescription('Message ID for the starting message.')
    .setRequired(true);
});
commandBuilder.addStringOption(option => {
  return option
    .setName('end_message_id')
    .setDescription('Message ID for the ending message (creates a range). Leave blank to only move the starting message.')
    .setRequired(false);
});

const MoveCommand: Command = {
  guildOnly: true,
  data: commandBuilder,
  ...ConfirmationCommandRunner(
    beforeConfirm,
    afterConfirm,
    {
      ...DEFAULT_CONFIRMATION_INFO,
      workingMessage: 'Fetching...\nThis may take a minute.',
      declinedMessage: 'No messages were moved.',
    },
  ),
};

export default MoveCommand;
