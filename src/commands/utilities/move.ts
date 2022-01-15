import type { Message, TextBasedChannel, TextChannel, ContextMenuInteraction } from 'discord.js';
import {
  Command,
  CommandBeforeConfirmMethod,
  CommandAfterConfirmMethod,
  ContextMenuTypes,
  IntentionalAny,
} from 'src/types';

import Discord from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import get from 'lodash.get';

import {
  findMessageInGuild,
  getMessagesInRange,
  usersHavePermission,
  getInfoFromCommandInteraction,
  getChannel,
} from 'src/discord-utils';
import { client } from 'src/client';
import { filterOutFalsy } from 'src/utils';
import ConfirmationCommandRunner from 'src/commands/confirmation-command';
import { CONFIRMATION_DEFAULT_TIMEOUT } from 'src/constants';

interface IntermediateResult {
  msgs: Message[],
  toChannel: TextBasedChannel,
  fromChannel: TextBasedChannel,
}

async function moveMessage(channel: TextBasedChannel | TextChannel, msg: Message): Promise<void> {
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

async function handleContextMenu(interaction: ContextMenuInteraction): Promise<IntentionalAny> {
  await interaction.deferReply({ ephemeral: true });

  const ogChannelId = interaction.channelId;
  const ogMessageId = interaction.options.getMessage('message')?.id;
  const ogChannel = ogChannelId && await getChannel(ogChannelId);
  const ogMessage = ogMessageId && ogChannel && ogChannel.isText() && await ogChannel.messages.fetch(ogMessageId);

  if (!ogMessage) return interaction.editReply('Could not fetch original message!');
  if (!ogChannel) return interaction.editReply('Could not fetch original channel!');

  const allChannels = Array.from(await interaction.guild!.channels.cache.values());
  const { author } = await getInfoFromCommandInteraction(interaction, { ephemeral: true });
  if (!author) return interaction.editReply('Could not find who is invoking this command!');
  const authorAndBot = filterOutFalsy([author, client.user]);

  const textChannelsWithPermission = allChannels
    .filter(channel => channel.isText())
    .filter(channel => {
      return usersHavePermission(channel, authorAndBot, ['VIEW_CHANNEL', 'SEND_MESSAGES'])
        && channel.id !== ogChannel.id;
    });

  const options = textChannelsWithPermission
    .map(channel => {
      const parentCategory = channel.parentId && allChannels.find(p => p.id === channel.parentId);
      const duplicateNamedChannel = textChannelsWithPermission.find(textChannel => {
        return textChannel.id !== channel.id
          && textChannel.name === channel.name
          && textChannel.parentId !== channel.parentId;
      });
      const label = (duplicateNamedChannel && parentCategory)
        ? `#${channel.name} (${parentCategory.name})`
        : `#${channel.name}`;
      return {
        label,
        value: channel.id,
      };
    });

  const menu = new Discord.MessageSelectMenu({
    customId: 'channel',
    placeholder: 'Select a channel...',
    options,
  });
  const row = new Discord.MessageActionRow({
    components: [menu],
  });
  await interaction.editReply({
    content: 'Select a channel to move the message to.',
    components: [row],
  });

  try {
    const selectInteraction = await interaction.channel?.awaitMessageComponent({
      filter: i => i.message.interaction?.id === interaction.id,
      time: CONFIRMATION_DEFAULT_TIMEOUT,
    }).catch(() => {
      // Intentionally empty catch
    });
    if (selectInteraction?.isSelectMenu()) {
      // Apparently there is no way to defer button interactions in the way we want.
      // The button's loading state cannot stay for more than 3 seconds, regardless of how we choose to defer.
      await interaction.editReply({
        content: 'Moving message...',
        components: [],
      });

      const toChannelId = selectInteraction.values[0];
      const toChannel = await getChannel(toChannelId);

      if (!toChannel || !toChannel.isText()) throw new Error(`Could not fetch channel from ID: ${toChannelId}`);

      await moveMessage(toChannel, ogMessage);
      return interaction.editReply('1 message moved.');
    }
    // If we get here, then the interaction button was not clicked.
    return interaction.editReply({
      content: `Confirmation timed out after ${CONFIRMATION_DEFAULT_TIMEOUT / 1000} seconds.`,
      components: [],
    });
  } catch (err) {
    return interaction.editReply(`Error: ${get(err, 'message', 'Something went wrong.')}`);
  }
}

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
  slashCommandData: commandBuilder,
  contextMenuData: {
    type: ContextMenuTypes.MESSAGE,
    name: 'move',
  },
  runContextMenu: handleContextMenu,
  ...ConfirmationCommandRunner(
    beforeConfirm,
    afterConfirm,
    {
      workingMessage: 'Fetching...\nThis may take a minute.',
      declinedMessage: 'No messages were moved.',
      ephemeral: true,
    },
  ),
};

export default MoveCommand;
