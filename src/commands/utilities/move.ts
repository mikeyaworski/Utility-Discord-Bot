import type { Message, NewsChannel, TextChannel } from 'discord.js';
import type { CommandoMessage } from 'discord.js-commando';
import type { ClientType, CommandBeforeConfirmMethod, CommandAfterConfirmMethod, EitherMessage } from 'src/types';

import Discord from 'discord.js';
import { findMessageInGuild, getMessagesInRange, userHasPermission } from 'src/discord-utils';
import ConfirmationCommand, { DEFAULT_CONFIRMATION_INFO } from 'src/commands/confirmation-command';

type Args = {
  channel: TextChannel,
  startId: string,
  endId: string,
};

type IntermediateResult = {
  msgs: EitherMessage[],
  channel: TextChannel | NewsChannel,
};

/**
 * !move <channel> <start_msg_id> [end_msg_id]
 */
export default class MoveCommand extends ConfirmationCommand<Args, IntermediateResult> {
  constructor(client: ClientType) {
    super(client, {
      name: 'move',
      aliases: ['mv'],
      group: 'utilities',
      memberName: 'move',
      description: 'Moves a range of messages to another channel.\n'
        + 'Use !move #to-channel <message_id> to move a single message.\n'
        + 'Use !move #to-channel <start_message_id> <end_message_id> to move a range of messages.',
      examples: [
        '!move #other 784702649324929054 784702678847455242',
        '!move #other 784702649324929054',
      ],
      format: '!move <channel> <start_msg_id> [end_msg_id]',
      guildOnly: true,
      throttling: {
        usages: 2,
        duration: 10,
      },
      args: [
        {
          key: 'channel',
          prompt: 'The channel to move all the messages to.',
          type: 'channel',
        },
        {
          key: 'startId',
          prompt: 'Message ID for the starting message.',
          type: 'string',
        },
        {
          key: 'endId',
          prompt: '(Optional) Message ID for the ending message (creates a range). Leave blank to only move the starting message.',
          type: 'string',
          default: '',
        },
      ],
    }, {
      ...DEFAULT_CONFIRMATION_INFO,
      workingMessage: 'Fetching...\nThis may take a minute',
    });
  }

  static async moveMessage(channel: TextChannel, msg: Message | CommandoMessage): Promise<void> {
    // await channel.send(`<@${msg.author.id}> said:\n${msg.content}`);
    await channel.sendTyping();
    const newMessage = new Discord.MessageEmbed()
      .setAuthor(msg.author.username, msg.author.avatarURL() || undefined)
      .setDescription(msg.content);
    await channel.send({
      embeds: [newMessage],
      files: Array.from(msg.attachments.values()),
    });
    await msg.delete();
  }

  beforeConfirm: CommandBeforeConfirmMethod<Args, IntermediateResult> = async (commandMsg, args) => {
    const { channel: toChannel, startId, endId } = args;
    const [startMsg, fromChannel] = await findMessageInGuild(
      startId,
      commandMsg.guild,
      // We know it's a text channel since this is a guild-only command
      commandMsg.channel as TextChannel | NewsChannel,
    );

    if (!startMsg || !fromChannel) {
      await commandMsg.reply('Could not find starting message.');
      return null;
    }

    if (toChannel.id === fromChannel.id) {
      await commandMsg.reply('You\'re moving messages to the same channel??');
      return null;
    }

    if (!userHasPermission(toChannel, commandMsg.author, ['SEND_MESSAGES', 'VIEW_CHANNEL'])) {
      await commandMsg.reply(`You do not have access to send messages in <#${toChannel.id}>`);
      return null;
    }

    if (!userHasPermission(fromChannel, commandMsg.author, ['MANAGE_MESSAGES', 'VIEW_CHANNEL'])) {
      await commandMsg.reply(`You do not have access to delete messages in <#${fromChannel.id}>`);
      return null;
    }

    // single message; not a range
    if (!endId) {
      await toChannel.sendTyping();
      await toChannel.send(`__Messages moved from__ <#${fromChannel.id}>`);
      await MoveCommand.moveMessage(toChannel, startMsg);
      await commandMsg.delete();
      return null;
    }

    let endMsg: Message;
    try {
      endMsg = await fromChannel.messages.fetch(endId);
    } catch (err) {
      await commandMsg.reply('End message is not in the same channel as start message.');
      return null;
    }

    const [msgs, stoppedEarly] = await getMessagesInRange(fromChannel, startMsg, endMsg);
    const confirmPrompt = `Are you sure you want to move ${msgs.length} messages to <#${toChannel.id}>?${
      stoppedEarly ? '\nNote: Some messages in the range were not included due to a rate limit precaution.' : ''
    }`;
    return [{ msgs, channel: fromChannel }, confirmPrompt];
  }

  afterConfirm: CommandAfterConfirmMethod<Args, IntermediateResult> = async (result, commandMsg, args) => {
    const { msgs, channel: fromChannel } = result;
    const { channel: toChannel } = args;

    toChannel.sendTyping();
    await toChannel.send(`__Messages moved from__ <#${fromChannel.id}>`);

    // do these in order
    for (let i = 0; i < msgs.length; i++) {
      await MoveCommand.moveMessage(toChannel, msgs[i]);
    }

    return `${msgs.length} messages have been moved to <#${toChannel.id}>`;
  }
}
