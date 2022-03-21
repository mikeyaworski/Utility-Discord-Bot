import type {
  AnyChannel,
  Message,
  User,
  PermissionString,
  EmojiIdentifierResolvable,
  Guild,
  Role,
  CommandInteraction,
  TextBasedChannel,
  GuildChannel,
  ButtonInteraction,
  ContextMenuInteraction,
} from 'discord.js';
import type { IntentionalAny } from 'src/types';

import emojiRegex from 'emoji-regex/RGI_Emoji';
import get from 'lodash.get';
import { BULK_MESSAGES_LIMIT, MAX_MESSAGES_FETCH, DIGITS_REGEX, CHANNEL_ARG_REGEX, INTERACTION_MAX_TIMEOUT, ONE_MINUTE } from 'src/constants';
import { error } from 'src/logging';
import { client } from 'src/client';
import { array, filterOutFalsy } from 'src/utils';

/**
 * Provides generic error handing for dealing with database operations or Discord API requests.
 * This can be used as a fallback after any custom error handling for the use case.
 */
export function handleError(
  err: unknown,
  interaction: CommandInteraction | ButtonInteraction | ContextMenuInteraction,
): Promise<IntentionalAny> {
  const name: string | undefined = get(err, 'name');
  const message: string | undefined = get(err, 'message');
  if (name === 'SequelizeUniqueConstraintError') {
    return interaction.editReply('That is a duplicate entry in our database!');
  }
  if (message === 'Unknown Emoji') {
    return interaction.editReply('I\'m not able to use that emoji!');
  }
  error(err);
  return interaction.editReply(message || 'Something went wrong...');
}

export function eventuallyRemoveComponents(interaction: CommandInteraction): void {
  // Unfortunately, we can't catch this error. If message components exist 15 minutes after the interaction
  // has been created, interacting with any of the components will crash the app.
  setTimeout(() => {
    interaction.editReply({
      components: [],
    }).catch(() => {
      // Intentionally empty
    });
  // Subtract one minute to beat the timeout
  }, INTERACTION_MAX_TIMEOUT - ONE_MINUTE);
}

export async function findMessageInGuild(
  messageId: string,
  guild: Guild,
  startingChannel?: TextBasedChannel | null,
): Promise<[Message, TextBasedChannel] | []> {
  if (startingChannel) {
    try {
      const foundMsg = await startingChannel.messages.fetch(messageId);
      return [foundMsg, startingChannel];
    } catch (err) {
      // Do nothing
    }
  }
  // TODO: Search threads as well
  const channels = Array.from((await guild.channels.fetch()).values());
  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    if (!channel.isText() || channel === startingChannel) continue;
    try {
      const foundMsg = await channel.messages.fetch(messageId);
      return [foundMsg, channel];
    } catch (err) {
      // Do nothing
    }
  }
  return [];
}

export async function findMessageInChannel(
  messageId: string,
  channel: TextBasedChannel,
): Promise<Message | null> {
  try {
    const foundMsg = await channel.messages.fetch(messageId);
    return foundMsg;
  } catch (err) {
    return null;
  }
}

/**
 * Fetch all messages between `start` and `end`, but stop fetching after reaching the `MAX_MESSAGES_FETCH` limit as a precaution.
 * If fetching was stopped due to reaching the limit, the second value in return tuple will be true.
 * Return type is of the form [msgs, stoppedFetchingEarly].
 */
export async function getMessagesInRange(
  channel: TextBasedChannel,
  start: Message,
  end: Message,
): Promise<[Message[], boolean]> {
  // swap them if start > end
  if (start.createdTimestamp > end.createdTimestamp) {
    const temp = start;
    start = end;
    end = temp;
  }

  let stoppedEarly = true;
  const msgs = [start];
  while (msgs.length < MAX_MESSAGES_FETCH) {
    const fetchedMsgs: (Message)[] = Array.from((await channel.messages.fetch({
      // cannot also provide the "before: end.id" option since multiple options are not supported by the API
      after: start.id,
      limit: BULK_MESSAGES_LIMIT,
    })).values()).reverse(); // reverse so the messages are ordered chronologically

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

export async function getChannel(channelArg: string): Promise<AnyChannel | null> {
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

export function usersHavePermission(
  channel: TextBasedChannel | GuildChannel,
  userOrUsers: User | User[],
  permission: PermissionString | PermissionString[],
): boolean {
  const users = array(userOrUsers);
  if (!('permissionsFor' in channel)) return true;
  return users.every(user => Boolean(channel.permissionsFor(user)?.has(permission)));
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

export async function fetchMessageInGuild(guild: Guild, messageId: string, givenChannel?: TextBasedChannel): Promise<Message | null> {
  await guild.fetch();
  if (givenChannel) {
    try {
      await givenChannel.fetch(true);
      const message = await givenChannel.messages.fetch(messageId, {
        cache: false,
        force: true,
      });
      if (message) return message;
    } catch (err) {
      // intentionally left blank
    }
  }
  // do this with a vanilla loop so we can do it sequentially and make as little API calls as necessary
  let foundMessage = null;
  // TODO: Search threads as well
  const channels = Array.from((await guild.channels.fetch()).values());
  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    if (!channel.isText() || channel === givenChannel) continue;
    try {
      const message = await channel.messages.fetch(messageId, {
        cache: false,
        force: true,
      });
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

export async function getInfoFromCommandInteraction(
  interaction: CommandInteraction | ContextMenuInteraction,
  options: { ephemeral?: boolean } = {},
): Promise<{
  channel: TextBasedChannel | null | undefined,
  message: Message | null | undefined,
  author: User | null | undefined,
}> {
  const { ephemeral = false } = options;
  const interactionMsg = !ephemeral ? await interaction.fetchReply() : null;

  // Guild
  if (interaction.inGuild()) {
    const channel = await interaction.guild!.channels.fetch(interaction.channelId);
    if (!channel || !channel.isText()) {
      return {
        message: null,
        channel: null,
        author: null,
      };
    }
    const message = interactionMsg ? await channel.messages.fetch(interactionMsg.id) : null;
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    const author = member?.user;
    return {
      channel,
      message,
      author,
    };
  }

  // DM
  const channel = await client.channels.fetch(interaction.channelId) as TextBasedChannel | null;
  const author = interaction.user;
  const message = interactionMsg ? await channel?.messages.fetch(interactionMsg.id) : null;
  return {
    channel,
    message,
    author,
  };
}

export async function findOptionalChannel(
  interaction: CommandInteraction,
  channelArg: ReturnType<CommandInteraction['options']['getChannel']>,
): Promise<{
  channel: TextBasedChannel | null | undefined,
  message: Message | null | undefined,
  author: User | null | undefined,
}> {
  const { channel: fetchedCurrentChannel, ...rest } = await getInfoFromCommandInteraction(interaction, { ephemeral: true });
  let channel: TextBasedChannel | undefined | null = fetchedCurrentChannel;
  const channelIdArg = channelArg?.id;
  if (channelIdArg) {
    const fetchedArgChannel = await client.channels.fetch(channelIdArg);
    if (fetchedArgChannel?.isText()) channel = fetchedArgChannel;
  }
  return {
    channel,
    ...rest, // Doesn't have anything to do with the channel, but we fetch the info anyway, so forward it along
  };
}

/**
 * Naive argument parsing. Splits by whitespace, but quoted sections are treated as one entire argument.
 */
export async function parseArguments(input: string, options: { parseChannels?: boolean } = {}): Promise<(string | AnyChannel)[]> {
  const { parseChannels = true } = options;

  // https://stackoverflow.com/a/16261693/2554605
  const stringArgs = input.match(/(?:[^\s"']+|['"][^'"]*["'])+/g)?.map(arg => {
    if (arg.startsWith('"') && arg.endsWith('"')) {
      return arg.substring(1, arg.length - 1);
    }
    if (arg.startsWith('\'') && arg.endsWith('\'')) {
      return arg.substring(1, arg.length - 1);
    }
    return arg.trim();
  });
  if (!stringArgs) throw new Error(`Unable to parse input: ${input}`);

  return Promise.all(stringArgs.map(async arg => {
    if (parseChannels && CHANNEL_ARG_REGEX.test(arg)) {
      const channel = await getChannel(arg);
      return channel || arg;
    }
    return arg;
  }));
}

export function checkMessageErrors(interaction: CommandInteraction, {
  message,
  channel,
  author,
}: {
  message: string | null,
  channel: TextBasedChannel | null | undefined,
  author: User,
}): void {
  const authorAndBot = filterOutFalsy([author, client.user]);

  if (channel && !usersHavePermission(channel, authorAndBot, 'SEND_MESSAGES')) {
    throw new Error(`One of us does not have permission to send messages in <#${channel.id}>`);
  }

  // TODO: Remove this comment if it's outdated with v13
  // Do not check against msg.mentions since putting the mentions like
  // @everyone or <@&786840067103653931> won't register as a mention
  // if the user does not have permission, but will register as a mention
  // when the bot (with permission) posts the reminder.

  if (message && channel && interaction.guild) {
    if (checkMentionsEveryone(message) && !usersHavePermission(channel, authorAndBot, 'MENTION_EVERYONE')) {
      throw new Error(`One of us does not have permission to mention everyone in <#${channel.id}>`);
    }

    const unmentionableRoleMention = getRoleMentions(message, interaction.guild).find(role => !role.mentionable);
    if (unmentionableRoleMention && !usersHavePermission(channel, authorAndBot, 'MENTION_EVERYONE')) {
      throw new Error(`One of us does not have permission to mention the role: ${unmentionableRoleMention.name}`);
    }
  }
}
