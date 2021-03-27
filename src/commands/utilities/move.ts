import type { Message, TextChannel } from 'discord.js';
import type { CommandoMessage } from 'discord.js-commando';
import type { ClientType, CommandBeforeConfirmMethod, CommandAfterConfirmMethod, EitherMessage } from 'src/types';

import Discord from 'discord.js';
import { getMessagesInRange, userHasPermission } from 'src/discord-utils';
import ConfirmationCommand, { DEFAULT_CONFIRMATION_INFO } from 'src/commands/confirmation-command';

type Args = {
  channel: TextChannel,
  start: CommandoMessage,
  end: CommandoMessage | false,
};

type IntermediateResult = EitherMessage[];

/**
 * !move <channel> <start_msg> [end_msg]
 */
export default class MoveCommand extends ConfirmationCommand<Args, IntermediateResult> {
  constructor(client: ClientType) {
    super(client, {
      name: 'move',
      aliases: ['mv'],
      group: 'utilities',
      memberName: 'move',
      description: 'Moves a range of messages to another channel.',
      examples: [
        '!move #other 784702649324929054 784702678847455242',
        '!move #other 784702649324929054',
      ],
      userPermissions: ['MANAGE_MESSAGES'],
      clientPermissions: ['MANAGE_MESSAGES'],
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
    }, {
      ...DEFAULT_CONFIRMATION_INFO,
      workingMessage: 'Fetching...\nThis may take a minute',
    });
  }

  static async moveMessage(channel: TextChannel, msg: Message | CommandoMessage): Promise<void> {
    // await channel.send(`<@${msg.author.id}> said:\n${msg.content}`);
    const { author } = msg;
    const newMessage = new Discord.MessageEmbed()
      .setAuthor(author.username, author.avatarURL() || undefined)
      .setDescription(msg.content)
      .attachFiles(msg.attachments.array());
    await channel.send(newMessage);
    await msg.delete();
  }

  beforeConfirm: CommandBeforeConfirmMethod<Args, IntermediateResult> = async (commandMsg, args) => {
    const { channel: toChannel, start, end } = args;
    const fromChannel = start.channel;
    if (toChannel.id === fromChannel.id) {
      await commandMsg.reply('You\'re moving messages to the same channel??');
      return null;
    }

    // It would be nice to use the hasPermission instance function, but that does not give us access to the resolved arguments
    // (we get strings instead of the resolved message/channel objects). So we check it here, in the run operation.
    if (!userHasPermission(toChannel, commandMsg.author, ['SEND_MESSAGES', 'VIEW_CHANNEL'])) {
      await commandMsg.reply(`You do not have access to send messages in <#${toChannel.id}>`);
      return null;
    }

    // single message; not a range
    if (!end) {
      toChannel.startTyping();
      await toChannel.send(`__Messages moved from__ <#${fromChannel.id}>`);
      await MoveCommand.moveMessage(toChannel, start);
      toChannel.stopTyping(true);
      await commandMsg.delete();
      return null;
    }

    const [msgs, stoppedEarly] = await getMessagesInRange(fromChannel, start, end);
    const confirmPrompt = `Are you sure you want to move ${msgs.length} messages to <#${toChannel.id}>?${
      stoppedEarly ? '\nNote: Some messages in the range were not included due to a rate limit precaution.' : ''
    }`;
    return [msgs, confirmPrompt];
  }

  afterConfirm: CommandAfterConfirmMethod<Args, IntermediateResult> = async (msgs, commandMsg, args) => {
    const { channel: toChannel, start } = args;
    const fromChannel = start.channel;

    toChannel.startTyping();
    await toChannel.send(`__Messages moved from__ <#${fromChannel.id}>`);

    // do these in order
    for (let i = 0; i < msgs.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await MoveCommand.moveMessage(toChannel, msgs[i]);
    }

    toChannel.stopTyping(true);
    return `${msgs.length} messages have been moved to <#${toChannel.id}>`;
  }
}
