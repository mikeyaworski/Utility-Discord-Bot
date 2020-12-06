import type { ClientType, CommandRunMethod } from 'src/types';
import type { Message, TextChannel } from 'discord.js';
import type { CommandoMessage } from 'discord.js-commando';

import Discord from 'discord.js';
import { Command } from 'discord.js-commando';
import { getMessagesInRange, userHasPermission } from 'src/discord-utils';

interface Args {
  channel: TextChannel,
  start: CommandoMessage,
  end: CommandoMessage | false,
}

/**
 * Example:
 * !move <channel> <start_msg> <end_msg?>
 * !move #other 784702649324929054 784702678847455242
 * !move #other 784702649324929054
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
      clientPermissions: ['MANAGE_MESSAGES'],
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

  static async moveMessage(channel: TextChannel, msg: Message | CommandoMessage): Promise<void> {
    // await channel.send(`<@${msg.author.id}> said:\n${msg.content}`);
    const { author } = msg;
    const newMessage = new Discord.MessageEmbed()
      .setAuthor(author.username, author.avatarURL())
      .setDescription(msg.content)
      .attachFiles(msg.attachments.array());
    await channel.send(newMessage);
    await msg.delete();
  }

  run: CommandRunMethod<Args> = async (commandMsg, args) => {
    const { channel: toChannel, start, end } = args;
    const fromChannel = start.channel;
    if (toChannel.id === fromChannel.id) {
      return commandMsg.reply('You\'re moving messages to the same channel??');
    }

    // It would be nice to use the hasPermission instance function, but that does not give us access to the resolved arguments
    // (we get strings instead of the resolved message/channel objects). So we check it here, in the run operation.
    if (!userHasPermission(toChannel, start.author, ['SEND_MESSAGES', 'VIEW_CHANNEL'])) {
      return commandMsg.reply(`You do not have access to send messages in <#${toChannel.id}>`);
    }

    toChannel.startTyping();
    await toChannel.send(`__Messages moved from__ <#${fromChannel.id}>`);

    // single message; not a range
    if (!end) {
      await MoveCommand.moveMessage(toChannel, start);
      toChannel.stopTyping();
      return commandMsg.delete();
    }

    const msgs = await getMessagesInRange(fromChannel, start, end);

    // do these in order
    for (let i = 0; i < msgs.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await MoveCommand.moveMessage(toChannel, msgs[i]);
    }

    toChannel.stopTyping(true);
    return commandMsg.delete();
  }
}
