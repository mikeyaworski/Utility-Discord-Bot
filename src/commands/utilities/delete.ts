import type { ClientType, CommandRunMethod } from 'src/types';
import type { CommandoMessage } from 'discord.js-commando';

import { Command } from 'discord.js-commando';
import { getMessagesInRange } from 'src/discord-utils';

interface Args {
  start: CommandoMessage,
  end: CommandoMessage | false,
  old: boolean;
}

/**
 * Example:
 * !delete <start_msg> <end_msg?>
 * !delete 784701167241658380 784701171147341834
 * !delete 784701167241658380
 */
export default class DeleteCommand extends Command {
  constructor(client: ClientType) {
    super(client, {
      name: 'delete',
      aliases: ['del', 'rm', 'remove'],
      group: 'utilities',
      memberName: 'delete',
      description: 'Deletes a range of messages.',
      userPermissions: ['MANAGE_MESSAGES'],
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

  run: CommandRunMethod<Args> = async (commandMsg, args) => {
    const { start, end, old } = args;
    const { channel } = start;

    // TODO: check that the user has permissions to delete messages in the channel, instead
    // of this check. Because we should be able to use this command from an arbitrary channel
    // (e.g. in #commands, delete messages in #general).
    if (commandMsg.channel.id !== start.channel.id || channel.type === 'dm') return null;

    // single message; not a range
    if (!end) {
      await start.delete();
      return commandMsg.delete();
    }

    const msgs = await getMessagesInRange(channel, start, end);
    if (old) {
      const msgIds = msgs.map(msg => msg.id);
      await channel.bulkDelete?.(msgIds);
    } else {
      await Promise.all(msgs.map(msg => msg.delete()));
    }

    return commandMsg.delete();
  }
}
