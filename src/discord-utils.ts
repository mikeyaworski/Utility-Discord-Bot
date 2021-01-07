import type {
  TextChannel,
  DMChannel,
  Message,
  User,
  PermissionString,
  EmojiIdentifierResolvable,
  Guild,
} from 'discord.js';
import type { CommandoGuild } from 'discord.js-commando';
import type { EitherMessage } from 'src/types';

// @ts-ignore
import emojiRegex from 'emoji-regex/RGI_Emoji';
import get from 'lodash.get';
import { BULK_MESSAGES_LIMIT, MAX_MESSAGES_FETCH } from 'src/constants';
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
 * Fetch all messages between `start` and `end`, but stop fetching after reaching the `MAX_MESSAGES_FETCH` limit as a precaution.
 * If fetching was stopped due to reaching the limit, the second value in return tuple will be true.
 * Return type is of the form [msgs, stoppedFetchingEarly].
 */
export async function getMessagesInRange(
  channel: TextChannel | DMChannel,
  start: EitherMessage,
  end: EitherMessage,
): Promise<[EitherMessage[], boolean]> {
  // swap them if start > end
  if (start.createdTimestamp > end.createdTimestamp) {
    const temp = start;
    start = end;
    end = temp;
  }

  let stoppedEarly = true;
  const msgs = [start];
  while (msgs.length < MAX_MESSAGES_FETCH) {
    // eslint-disable-next-line no-await-in-loop
    const fetchedMsgs: (Message)[] = (await channel.messages.fetch({
      // cannot also provide the "before: end.id" option since multiple options are not supported by the API
      after: start.id,
      limit: BULK_MESSAGES_LIMIT,
    })).array().reverse(); // reverse so the messages are ordered chronologically

    const indexOfEndMsg = fetchedMsgs.findIndex(msg => msg.id === end.id);

    if (indexOfEndMsg === -1) {
      // haven't reached the end message yet, so add messages and keep fetching for more
      msgs.push(...fetchedMsgs);
      start = fetchedMsgs[fetchedMsgs.length - 1];
    } else {
      // found the end message, so add messages (ignoring ones after end message) and stop fetching
      msgs.push(...fetchedMsgs.slice(0, indexOfEndMsg + 1));
      stoppedEarly = false;
      break;
    }
  }
  return [msgs, stoppedEarly];
}

export function userHasPermission(
  channel: TextChannel,
  user: User,
  permission: PermissionString | PermissionString[],
): boolean {
  return Boolean(channel.permissionsFor(user)?.has(permission));
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
