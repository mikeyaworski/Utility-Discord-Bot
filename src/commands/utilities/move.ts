import type { ClientType, CommandRunMethod } from 'src/types';
import type { DMChannel, Message, TextChannel } from 'discord.js';
import type { CommandoMessage } from 'discord.js-commando';

import Discord from 'discord.js';
import { Command } from 'discord.js-commando';
import { BULK_MESSAGES_LIMIT } from 'src/constants';
import { getIntersection } from 'src/utils';

interface Args {
  channel: TextChannel,
  start: CommandoMessage,
  end: CommandoMessage | false,
}

/**
 * Example:
 * !move <channel> <start_msg> <end_msg?>
 */
export default class MoveCommand extends Command {
  constructor(client: ClientType) {
    super(client, {
      name: 'move',
      aliases: ['mv'],
      group: 'utilities',
      memberName: 'move',
      description: 'Moves a range of messages to another channel.',
      userPermissions: ['MANAGE_MESSAGES'],
      args: [
        {
          key: 'channel',
          prompt: 'The channel to move all the messages to.',
          type: 'channel',
        },
        {
          key: 'start',
          prompt: 'Start message in the range.',
          type: 'message',
        },
        {
          key: 'end',
          prompt: '(Optional) End message in the range. Leave blank to only move the starting message.',
          type: 'message',
          // you can't do null... LOL
          default: false,
        },
      ],
    });
  }

  static async moveMessage(channel: TextChannel, msg: CommandoMessage | Message): Promise<void> {
    // await channel.send(`<@${msg.author.id}> said:\n${msg.content}`);
    const { author } = msg;
    const newMessage = new Discord.MessageEmbed()
      .setAuthor(author.username, author.avatarURL())
      .setDescription(msg.content)
      .attachFiles(msg.attachments.array());
    await channel.send(newMessage);
    await msg.delete();
  }

  /**
   * It would be awesome to just provide
   * { after: start.id, before: end.id } to the fetch,
   * but the API apparently does not support simultaneous options (lol).
   * So instead, we will fetch X messages after the start and X messages before the end,
   * and then take the intersection as the messages within the range.
   * If the intersection is empty, then there are more messages between the range than our limit allows us to find.
   * So just move all of the messages found after the start.
   */
  static async getMessagesInRange(
    channel: TextChannel | DMChannel,
    start: CommandoMessage,
    end: CommandoMessage,
  ): Promise<(Message | CommandoMessage)[]> {
    // this would be nice...
    // return (await channel.messages.fetch({
    //   after: start.id,
    //   before: end.id,
    //   limit: BULK_MESSAGES_LIMIT,
    // })).array();

    const msgs = [start];
    const afterStartMsgs = (await channel.messages.fetch({
      after: start.id,
      limit: BULK_MESSAGES_LIMIT,
    })).array().reverse(); // reverse so the messages are ordered chronologically
    const beforeEndMsgs = (await channel.messages.fetch({
      before: end.id,
      limit: BULK_MESSAGES_LIMIT,
    })).array();
    const intersection = getIntersection(
      afterStartMsgs,
      beforeEndMsgs,
      (a: Message, b: Message) => a.id === b.id,
    );

    if (intersection.length === 0) return [start, ...afterStartMsgs];
    return [
      start,
      ...intersection,
      end,
    ];
  }

  // TODO: check that the user asking to move the messages actually
  // has read & write access to the channel being moved to
  run: CommandRunMethod<Args> = async (commandMsg, args) => {
    const { channel: toChannel, start, end } = args;
    const fromChannel = start.channel;
    if (toChannel.id === fromChannel.id) return null;

    toChannel.startTyping();
    await toChannel.send(`__Messages moved from__ <#${fromChannel.id}>`);

    // single message; not a range
    if (!end) {
      await MoveCommand.moveMessage(toChannel, start);
      toChannel.stopTyping();
      return null;
    }

    const msgs = await MoveCommand.getMessagesInRange(fromChannel, start, end);

    // do these in order
    for (let i = 0; i < msgs.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await MoveCommand.moveMessage(toChannel, msgs[i]);
    }

    toChannel.stopTyping();
    return null;
  }
}
