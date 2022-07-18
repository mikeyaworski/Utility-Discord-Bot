import type { Message, TextBasedChannel } from 'discord.js';
import type { Command, CommandBeforeConfirmMethod, CommandAfterConfirmMethod, BeforeConfirmResponse } from 'src/types';

import chunk from 'lodash.chunk';
import { SlashCommandBuilder } from '@discordjs/builders';

import {
  findMessageInGuild,
  getMessagesInRange,
  usersHaveChannelPermission,
  getInfoFromCommandInteraction,
  findMessageInChannel,
  parseInput,
  isModalSubmit,
  isCommand,
} from 'src/discord-utils';
import { client } from 'src/client';
import { filterOutFalsy } from 'src/utils';
import { BULK_MESSAGES_LIMIT } from 'src/constants';
import ConfirmationCommandRunner from 'src/commands/confirmation-command';

interface IntermediateResult {
  msgs: Message[],
  channel: TextBasedChannel,
}

const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('delete')
  .setDescription('Deletes a range of messages.');
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
commandBuilder.addBooleanOption(option => {
  return option
    .setName('is_old')
    .setDescription('Whether any of the messages are over 14 days old.')
    .setRequired(false);
});

const beforeConfirm: CommandBeforeConfirmMethod<IntermediateResult> = async interaction => {
  let startId: string;
  let endId: string | null;
  if (isModalSubmit(interaction)) {
    const inputs = await parseInput({
      slashCommandData: commandBuilder,
      interaction,
    });
    startId = inputs.start_message_id;
    endId = inputs.end_message_id;
  } else {
    startId = interaction.options.getString('start_message_id', true);
    endId = interaction.options.getString('end_message_id');
  }

  if (!interaction.channel) {
    await interaction.editReply('Could not find starting message.');
    return null;
  }

  let startMsg: Message | undefined | null;
  let channel: TextBasedChannel | undefined;
  if (interaction.guild) {
    [startMsg, channel] = await findMessageInGuild(
      startId,
      interaction.guild,
      interaction.channel,
    );
  } else {
    startMsg = await findMessageInChannel(startId, interaction.channel);
    channel = interaction.channel;
  }

  if (!startMsg || !channel) {
    await interaction.editReply('Could not find starting message.');
    return null;
  }

  const { author } = await getInfoFromCommandInteraction(interaction, { ephemeral: true });
  if (!author) {
    await interaction.editReply('Could not find who is invoking this command.');
    return null;
  }
  const authorAndBot = filterOutFalsy([author, client.user]);

  if (!usersHaveChannelPermission({ channel, users: authorAndBot, permissions: ['ManageMessages'] })) {
    await interaction.editReply(`One of us not have permission to delete messages in <#${channel.id}>`);
    return null;
  }

  // single message; not a range
  if (!endId) {
    await startMsg.delete();
    await interaction.editReply('Message deleted.');
    return null;
  }

  let endMsg: Message;
  try {
    endMsg = await channel.messages.fetch(endId);
  } catch (err) {
    await interaction.editReply('End message is not in the same channel as start message.');
    return null;
  }

  const [msgs, stoppedEarly] = await getMessagesInRange(channel, startMsg, endMsg);
  const confirmPrompt = `Are you sure you want to delete ${msgs.length} messages in <#${channel.id}>?${
    stoppedEarly ? '\nNote: Some messages in the range were not included due to a rate limit precaution.' : ''
  }`;
  const workingMessage = `Deleting ${msgs.length} messages in <#${channel.id}>...`;
  const res: BeforeConfirmResponse<IntermediateResult> = {
    intermediateResult: { msgs, channel },
    confirmPrompt,
    workingMessage,
  };
  return res;
};

const afterConfirm: CommandAfterConfirmMethod<IntermediateResult> = async (interaction, result) => {
  const { msgs, channel } = result;
  let isOld: boolean;
  if (isModalSubmit(interaction)) {
    const inputs = await parseInput({ slashCommandData: commandBuilder, interaction });
    isOld = inputs.is_old;
  } else {
    isOld = Boolean(interaction.options.getBoolean('is_old'));
  }
  let numDeletedMessages = msgs.length;
  if (!isOld && 'bulkDelete' in channel) {
    const msgIds = msgs.map(msg => msg.id);
    const chunkedMsgIds = chunk(msgIds, BULK_MESSAGES_LIMIT);
    numDeletedMessages = 0;
    await Promise.all(chunkedMsgIds.map(async msgIdsChunk => {
      numDeletedMessages += (await channel.bulkDelete(msgIdsChunk)).size;
    }));
  } else {
    await Promise.all(msgs.map(msg => msg.delete()));
  }
  return `${numDeletedMessages} messages have been deleted.`;
};

const DeleteCommand: Command = {
  guildOnly: false,
  slashCommandData: commandBuilder,
  ...ConfirmationCommandRunner(
    beforeConfirm,
    afterConfirm,
    {
      workingMessage: 'Fetching...\nThis may take a minute.',
      declinedMessage: 'No messages were deleted.',
      ephemeral: true,
      useFallbackModal: true,
    },
  ),
  modalLabels: {
    is_old: 'Whether any of the msgs are over 14 days old.',
    end_message_id: '(Optional) Message ID for the ending message.',
  },
};

export default DeleteCommand;
