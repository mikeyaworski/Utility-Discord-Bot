import type {
  TextChannel,
  DMChannel,
  NewsChannel,
  Channel,
  Message,
  User,
  PermissionString,
  EmojiIdentifierResolvable,
  Guild,
  Role,
} from 'discord.js';
import type { CommandoGuild } from 'discord.js-commando';
import type { EitherMessage } from 'src/types';

// @ts-ignore
import emojiRegex from 'emoji-regex/RGI_Emoji';
import get from 'lodash.get';
import { BULK_MESSAGES_LIMIT, MAX_MESSAGES_FETCH, DIGITS_REGEX, CHANNEL_ARG_REGEX } from 'src/constants';
import { error } from 'src/logging';
import { client } from 'src/client';

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

export async function findMessageInGuild(
  messageId: string,
  guild: CommandoGuild,
  startingChannel?: TextChannel | NewsChannel,
): Promise<[EitherMessage, TextChannel | NewsChannel] | []> {
  if (startingChannel) {
    try {
      const foundMsg = await startingChannel.messages.fetch(messageId);
      return [foundMsg, startingChannel];
    } catch (err) {
      // Do nothing
    }
  }
  const channels = guild.channels.cache
    .filter(channel => channel.isText())
    // assert based on the isText() filter
    .array() as (TextChannel | NewsChannel)[];
  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    try {
      const foundMsg = await channel.messages.fetch(messageId);
      return [foundMsg, channel];
    } catch (err) {
      // Do nothing
    }
  }
  return [];
}

/**
 * Fetch all messages between `start` and `end`, but stop fetching after reaching the `MAX_MESSAGES_FETCH` limit as a precaution.
 * If fetching was stopped due to reaching the limit, the second value in return tuple will be true.
 * Return type is of the form [msgs, stoppedFetchingEarly].
 */
export async function getMessagesInRange(
  channel: TextChannel | DMChannel | NewsChannel,
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

export function getChannelIdFromArg(channelArg: string): string | null {
  if (DIGITS_REGEX.test(channelArg)) {
    return channelArg;
  }
  if (CHANNEL_ARG_REGEX.test(channelArg)) {
    return channelArg.match(/\d+/)?.[0] || null;
  }
  return null;
}

export async function getChannel(channelArg: string): Promise<Channel | null> {
  const channelId = getChannelIdFromArg(channelArg);
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId);
  return channel || null;
}

export function checkMentionsEveryone(msg: string): boolean {
  return msg.includes('@everyone') || msg.includes('@here');
}

export function getRoleMentions(msg: string, guild: Guild): Role[] {
  const matches = msg.match(/<@&\d+>/g);
  if (!matches) return [];
  return matches
    .map(roleString => {
      const id = roleString.match(/<@&(\d+)>/)![1];
      return guild.roles.cache.get(id);
    })
    .filter(role => Boolean(role)) as Role[];
}

export function userHasPermission(
  channel: TextChannel | NewsChannel | DMChannel | Channel,
  user: User,
  permission: PermissionString | PermissionString[],
): boolean {
  if (!('permissionsFor' in channel)) return true;
  return Boolean(channel.permissionsFor(user)?.has(permission));
}

export function isCustomEmoji(arg: string): boolean {
  return /^<a?:.+:\d+>$/.test(arg);
}

export function isEmoji(arg: string): boolean {
  return isCustomEmoji(arg) || emojiRegex().test(arg);
}

/**
 * For custom emojis of the form <a:some_name:1234>, return 1234 (the ID). This is what's resolvable for message reactions.
 * For default, unicode emojis, just return the emoji string itself.
 */
export function getResolvableEmoji(emoji: string): string {
  if (isCustomEmoji(emoji)) {
    const matches = emoji.match(/^(<a?:.+:)(\d+)>$/);
    if (!matches?.length) throw new Error('Regex broken for finding emoji ID.');
    return matches[matches.length - 1];
  }
  return emoji;
}

/**
 * Applies each reaction to the message in the order received.
 */
export async function reactMulitple(msg: Message, reactions: EmojiIdentifierResolvable[]): Promise<void> {
  for (let i = 0; i < reactions.length; i++) {
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
