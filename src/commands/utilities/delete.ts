import type { CommandoMessage } from 'discord.js-commando';
import type { TextChannel } from 'discord.js';
import type { ClientType, CommandBeforeConfirmMethod, CommandAfterConfirmMethod, EitherMessage } from 'src/types';

import chunk from 'lodash.chunk';

import { BULK_MESSAGES_LIMIT } from 'src/constants';
import ConfirmationCommand, { DEFAULT_CONFIRMATION_INFO } from 'src/commands/confirmation-command';
import { getMessagesInRange } from 'src/discord-utils';

type Args = {
  start: CommandoMessage,
  end: CommandoMessage | false,
  old: boolean;
};

type IntermediateResult = EitherMessage[];

/**
 * !delete <start_msg> [end_msg] [old]
 */
export default class DeleteCommand extends ConfirmationCommand<Args, IntermediateResult> {
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
      throttling: {
        usages: 2,
        duration: 10,
      },
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
    }, {
      ...DEFAULT_CONFIRMATION_INFO,
      workingMessage: 'Fetching...\nThis may take a minute',
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

    const [msgs, stoppedEarly] = await getMessagesInRange(channel, start, end);
    const confirmPrompt = `Are you sure you want to delete ${msgs.length} messages?${
      stoppedEarly ? '\nNote: Some messages in the range were not included due to a rate limit precaution.' : ''
    }`;
    return [msgs, confirmPrompt];
  }

  afterConfirm: CommandAfterConfirmMethod<Args, IntermediateResult> = async (msgs, commandMsg, args) => {
    const { start, old } = args;
    const { channel } = start;
    let numDeletedMessages: number = msgs.length;
    if (!old) {
      const msgIds = msgs.map(msg => msg.id);
      // we know it is a text channel since it otherwise would not have passed beforeConfirm
      const textChannel = channel as TextChannel;
      const chunkedMsgIds = chunk(msgIds, BULK_MESSAGES_LIMIT);
      numDeletedMessages = 0;
      await Promise.all(chunkedMsgIds.map(async msgIdsChunk => {
        numDeletedMessages += (await textChannel.bulkDelete(msgIdsChunk)).size;
      }));
    } else {
      await Promise.all(msgs.map(msg => msg.delete()));
    }
    return `${numDeletedMessages} messages have been deleted.`;
  }
}
