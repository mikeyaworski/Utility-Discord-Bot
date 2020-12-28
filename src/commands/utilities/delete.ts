import type { CommandoMessage } from 'discord.js-commando';
import type { TextChannel } from 'discord.js';
import type { ClientType, CommandBeforeConfirmMethod, CommandAfterConfirmMethod, EitherMessage } from 'src/types';

import ConfirmationCommand from 'src/commands/confirmation-command';
import { getMessagesInRange } from 'src/discord-utils';

interface Args {
  start: CommandoMessage,
  end: CommandoMessage | false,
  old: boolean;
}

type IntermediateResult = EitherMessage[];

/**
 * !delete <start_msg> [end_msg]
 */
export default class DeleteCommand extends ConfirmationCommand<IntermediateResult> {
  constructor(client: ClientType) {
    super(client, {
      name: 'delete',
      aliases: ['del', 'rm', 'remove'],
      group: 'utilities',
      memberName: 'delete',
      description: 'Deletes a range of messages.',
      examples: [
        '!delete 784701167241658380 784701171147341834',
        '!delete 784701167241658380',
      ],
      userPermissions: ['MANAGE_MESSAGES'],
      clientPermissions: ['MANAGE_MESSAGES'],
      guildOnly: true,
      args: [
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
        {
          key: 'old',
          prompt: '(Optional) Whether or not the messages will be over two weeks old (requires different API calls).',
          type: 'boolean',
          default: false,
        },
      ],
    });
  }

  beforeConfirm: CommandBeforeConfirmMethod<Args, IntermediateResult> = async (commandMsg, args) => {
    const { start, end } = args;
    const { channel } = start;

    if (channel.type === 'dm') return null;

    // single message; not a range
    if (!end) {
      await start.delete();
      await commandMsg.delete();
      return null;
    }

    const msgs = await getMessagesInRange(channel, start, end);
    return [msgs, `Are you sure you want to delete ${msgs.length} messages?`];
  }

  afterConfirm: CommandAfterConfirmMethod<Args, IntermediateResult> = async (msgs, commandMsg, args) => {
    const { start, old } = args;
    const { channel } = start;
    let numDeletedMessages: number = msgs.length;
    if (old) {
      const msgIds = msgs.map(msg => msg.id);
      // we know it is a text channel since it otherwise would not have passed beforeConfirm
      numDeletedMessages = (await (channel as TextChannel).bulkDelete(msgIds)).size;
    } else {
      await Promise.all(msgs.map(msg => msg.delete()));
    }
    return `${numDeletedMessages} messages have been deleted.`;
  }
}
