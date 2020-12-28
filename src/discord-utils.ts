import type {
  TextChannel,
  DMChannel,
  Message,
  User,
  PermissionString,
  EmojiIdentifierResolvable,
  Guild,
} from 'discord.js';
import type { CommandoMessage, CommandoGuild } from 'discord.js-commando';
import type { EitherMessage } from 'src/types';

import emojiRegex from 'emoji-regex/RGI_Emoji';
import get from 'lodash.get';
import { getIntersection } from 'src/utils';
import { BULK_MESSAGES_LIMIT } from 'src/constants';
import { error } from 'src/logging';

/**
 * Provides generic error handing for dealing with database operations or Discord API requests.
 * This can be used as a fallback after any custom error handling for the use case.
 */
export function handleError(err: unknown, commandMsg: EitherMessage): Promise<Message | Message[]> {
  const name = get(err, 'name');
  const message = get(err, 'message');
  if (name === 'SequelizeUniqueConstraintError') {
    return commandMsg.reply('That is a duplicate entry in our database!');
  }
  if (message === 'Unknown Emoji') {
    return commandMsg.reply('I\'m not able to use that emoji!');
  }
  error(err);
  return commandMsg.reply(message || 'Something went wrong...');
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
export async function getMessagesInRange(
  channel: TextChannel | DMChannel,
  start: CommandoMessage,
  end: CommandoMessage,
): Promise<(EitherMessage)[]> {
  // this would be nice...
  // return (await channel.messages.fetch({
  //   after: start.id,
  //   before: end.id,
  //   limit: BULK_MESSAGES_LIMIT,
  // })).array();

  // swap them if start > end
  if (start.createdTimestamp > end.createdTimestamp) {
    const temp = start;
    start = end;
    end = temp;
  }

  const afterStartMsgs: (EitherMessage)[] = (await channel.messages.fetch({
    after: start.id,
    limit: BULK_MESSAGES_LIMIT,
  })).array().reverse(); // reverse so the messages are ordered chronologically
  afterStartMsgs.unshift(start);

  const beforeEndMsgs: (EitherMessage)[] = (await channel.messages.fetch({
    before: end.id,
    limit: BULK_MESSAGES_LIMIT,
  })).array();
  beforeEndMsgs.push(end);

  const intersection = getIntersection<EitherMessage>(
    afterStartMsgs,
    beforeEndMsgs,
    (a, b) => a.id === b.id,
  );

  if (intersection.length === 0) return [...afterStartMsgs];
  return intersection;
}

export function userHasPermission(
  channel: TextChannel,
  user: User,
  permission: PermissionString | PermissionString[],
): boolean {
  return channel.permissionsFor(user).has(permission);
}

export function isEmoji(arg: string): boolean {
  return /^<a?:.+:\d+>$/.test(arg) || emojiRegex().test(arg);
}

/**
 * Applies each reaction to the message in the order received.
 */
export async function reactMulitple(msg: Message, reactions: EmojiIdentifierResolvable[]): Promise<void> {
  for (let i = 0; i < reactions.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    await msg.react(reactions[i]);
  }
}

export function getLetterEmoji(offset: number): string {
  // starting code point: 127462
  return String.fromCodePoint(127462 + offset);
  // return [
  //   '🇦', '🇧', '🇨', '🇩', '🇪', '🇫', '🇬', '🇭', '🇮', '🇯', '🇰', '🇱', '🇲',
  //   '🇳', '🇴', '🇵', '🇶', '🇷', '🇸', '🇹', '🇺', '🇻', '🇼', '🇽', '🇾', '🇿',
  // ][offset];
}

export async function fetchMessageInGuild(guild: Guild | CommandoGuild, messageId: string, givenChannel?: TextChannel): Promise<Message | null> {
  await guild.fetch();
  if (givenChannel) {
    try {
      await givenChannel.fetch(true);
      const message = await givenChannel.messages.fetch(messageId, false, true);
      if (message) return message;
    } catch (err) {
      // intentionally left blank
    }
  }
  // do this with a vanilla loop so we can do it in order and make as little API calls as necessary
  let foundMessage = null;
  const channels = guild.channels.cache.array().filter(channel => channel.isText()) as TextChannel[];
  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    try {
      // eslint-disable-next-line no-await-in-loop
      const message = await channel.messages.fetch(messageId, false, true);
      if (message) {
        foundMessage = message;
        break;
      }
    } catch (err) {
      // intentionally left blank
    }
  }
  return foundMessage;
}
