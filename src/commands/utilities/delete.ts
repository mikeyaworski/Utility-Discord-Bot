import type { Message, NewsChannel, TextChannel } from 'discord.js';
import type { ClientType, CommandBeforeConfirmMethod, CommandAfterConfirmMethod, EitherMessage } from 'src/types';

import chunk from 'lodash.chunk';

import { BULK_MESSAGES_LIMIT } from 'src/constants';
import ConfirmationCommand, { DEFAULT_CONFIRMATION_INFO } from 'src/commands/confirmation-command';
import { getMessagesInRange, findMessageInGuild, userHasPermission } from 'src/discord-utils';

type Args = {
  startId: string,
  endId: string,
  isOld: boolean;
};

type IntermediateResult = {
  msgs: EitherMessage[],
  channel: TextChannel | NewsChannel,
};

/**
 * !delete <start_msg> [end_msg] [isOld]
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
      format: '<start_msg_id> [end_msg_id] [isOld]',
      guildOnly: true,
      throttling: {
        usages: 2,
        duration: 10,
      },
      args: [
        {
          key: 'startId',
          prompt: 'Message ID for the starting message.',
          type: 'string',
        },
        {
          key: 'endId',
          prompt: '(Optional) Message ID for the ending message (creates a range). Leave blank to only delete the starting message.',
          type: 'string',
          default: '',
        },
        {
          key: 'isOld',
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
    const { startId, endId } = args;
    const [startMsg, channel] = await findMessageInGuild(
      startId,
      commandMsg.guild,
      // We know it's a text channel since this is a guild-only command
      commandMsg.channel as TextChannel | NewsChannel,
    );
    if (!startMsg || !channel) {
      await commandMsg.reply('Could not find starting message.');
      return null;
    }

    if (!userHasPermission(channel, commandMsg.author, ['MANAGE_MESSAGES'])) {
      await commandMsg.reply(`You do not have permission to delete messages in <#${channel.id}>`);
      return null;
    }

    // single message; not a range
    if (!endId) {
      await startMsg.delete();
      await commandMsg.delete();
      return null;
    }

    let endMsg: Message;
    try {
      endMsg = await channel.messages.fetch(endId);
    } catch (err) {
      await commandMsg.reply('End message is not in the same channel as start message.');
      return null;
    }

    const [msgs, stoppedEarly] = await getMessagesInRange(channel, startMsg, endMsg);
    const confirmPrompt = `Are you sure you want to delete ${msgs.length} messages in <#${channel.id}>?${
      stoppedEarly ? '\nNote: Some messages in the range were not included due to a rate limit precaution.' : ''
    }`;
    return [{ msgs, channel }, confirmPrompt];
  }

  afterConfirm: CommandAfterConfirmMethod<Args, IntermediateResult> = async (result, commandMsg, args) => {
    const { msgs, channel } = result;
    const { isOld } = args;
    let numDeletedMessages = msgs.length;
    if (!isOld) {
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
  }
}
