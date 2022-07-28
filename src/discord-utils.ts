import {
  Message,
  User,
  PermissionResolvable,
  EmojiIdentifierResolvable,
  Guild,
  Role,
  CommandInteraction,
  TextBasedChannel,
  GuildChannel,
  EmbedBuilder,
  InteractionReplyOptions,
  ModalSubmitInteraction,
  CommandInteractionOption,
  Channel,
  GuildMember,
  SelectMenuComponentOptionData,
  MessagePayload,
  WebhookEditMessageOptions,
  TextChannel,
  SelectMenuBuilder,
  ActionRowBuilder,
  InteractionType,
  ContextMenuCommandInteraction,
  ButtonInteraction,
  ComponentType,
  ApplicationCommandOptionType,
  Interaction,
  ChatInputCommandInteraction,
  BaseInteraction,
} from 'discord.js';

import type { IntentionalAny, Command, AnyInteraction, AnyMapping, MessageResponse } from 'src/types';

import emojiRegex from 'emoji-regex/RGI_Emoji';
import get from 'lodash.get';
import {
  BULK_MESSAGES_LIMIT,
  MAX_MESSAGES_FETCH,
  DIGITS_REGEX,
  CHANNEL_ARG_REGEX,
  ROLE_ARG_REGEX,
  USER_ARG_REGEX,
  USER_DISCRIMINATOR_REGEX,
  INTERACTION_MAX_TIMEOUT,
} from 'src/constants';
import { error, log } from 'src/logging';
import { client } from 'src/client';
import { array, filterOutFalsy } from 'src/utils';
import chunk from 'lodash.chunk';
import { APIApplicationCommandOption } from 'discord-api-types/v10';

// TODO: This type guard is probably not accurate, though is practically fine for now
export function isText(channel: Channel): channel is TextChannel {
  return channel.isDMBased() || channel.isTextBased() || channel.isThread();
}
export function isCommand(interaction: BaseInteraction): interaction is ChatInputCommandInteraction {
  return interaction.type === InteractionType.ApplicationCommand && interaction.isChatInputCommand();
}
export function isModalSubmit(interaction: BaseInteraction): interaction is ModalSubmitInteraction {
  return interaction.type === InteractionType.ModalSubmit;
}
export function isButton(interaction: Interaction): interaction is ButtonInteraction {
  return interaction.type === InteractionType.MessageComponent && interaction.componentType === ComponentType.Button;
}
export function isContextMenu(interaction: BaseInteraction): interaction is ContextMenuCommandInteraction {
  return interaction.type === InteractionType.ApplicationCommand && interaction.isContextMenuCommand();
}

export function getErrorMsg(err: unknown): string {
  const name: string | undefined = get(err, 'name');
  const message: string | undefined = get(err, 'message');
  if (name === 'SequelizeUniqueConstraintError') {
    return 'That is a duplicate entry in our database!';
  }
  if (message === 'Unknown Emoji') {
    return 'I\'m not able to use that emoji!';
  }
  return message || 'Something went wrong...';
}

/**
 * Provides generic error handing for dealing with database operations or Discord API requests.
 * This can be used as a fallback after any custom error handling for the use case.
 */
export async function handleError(
  err: unknown,
  interaction: AnyInteraction,
): Promise<IntentionalAny> {
  // Modal interactions are really broken, so we need to defer and then edit the reply. Replying immediately doesn't work.
  async function sendResponse(msg: string) {
    if (isModalSubmit(interaction) && !interaction.deferred) {
      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply(msg);
      return;
    }
    await interaction.editReply(msg);
  }
  const msg = getErrorMsg(err);
  return sendResponse(msg).catch(error);
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
    if (!isText(channel) || channel === startingChannel) continue;
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

export function getRoleIdFromArg(roleArg: string): string | null {
  if (DIGITS_REGEX.test(roleArg)) {
    return roleArg;
  }
  if (ROLE_ARG_REGEX.test(roleArg)) {
    return roleArg.match(/\d+/)?.[0] || null;
  }
  return null;
}

export function getUserIdFromArg(userArg: string): string | null {
  if (DIGITS_REGEX.test(userArg)) {
    return userArg;
  }
  if (USER_ARG_REGEX.test(userArg)) {
    return userArg.match(/\d+/)?.[0] || null;
  }
  return null;
}

export async function getChannel(channelArg: string): Promise<Channel | null> {
  const channelId = getChannelIdFromArg(channelArg);
  if (!channelId) return null;
  try {
    const channel = await client.channels.fetch(channelId);
    return channel || null;
  } catch (err) {
    error(err);
    return null;
  }
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

export function usersHaveChannelPermission({
  channel,
  users,
  permissions,
}: {
  channel: TextBasedChannel | GuildChannel,
  users: User | User[],
  permissions: PermissionResolvable,
}): boolean {
  users = array(users);
  if (!('permissionsFor' in channel)) return true;
  return users.every(user => Boolean(channel.permissionsFor(user)?.has(permissions)));
}

export function interactionHasServerPermission({
  interaction,
  permissions,
}: {
  interaction: AnyInteraction,
  permissions: PermissionResolvable,
}): boolean {
  if (!interaction.member) return true;
  const actualPerms = interaction.member.permissions;
  return typeof actualPerms !== 'string' && actualPerms.has(permissions);
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
      const message = await givenChannel.messages.fetch({
        message: messageId,
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
    if (!isText(channel) || channel === givenChannel) continue;
    try {
      const message = await channel.messages.fetch({
        message: messageId,
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
  interaction: AnyInteraction,
  options: { ephemeral?: boolean } = {},
): Promise<{
  channel: TextBasedChannel | null | undefined,
  message: Message | null | undefined,
  author: User | null | undefined,
}> {
  const { ephemeral = false } = options;
  const interactionMsg = !ephemeral ? await interaction.fetchReply() : null;

  if (!interaction.channelId) {
    const author = interaction.user;
    return {
      message: null,
      channel: null,
      author,
    };
  }

  // Guild
  if (interaction.inGuild()) {
    const channel = await interaction.guild!.channels.fetch(interaction.channelId);
    if (!channel || !isText(channel)) {
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
  interaction: AnyInteraction,
  channelArg: ReturnType<ChatInputCommandInteraction['options']['getChannel']>,
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
    if (fetchedArgChannel && isText(fetchedArgChannel)) channel = fetchedArgChannel;
  }
  return {
    channel,
    ...rest, // Doesn't have anything to do with the channel, but we fetch the info anyway, so forward it along
  };
}

/**
 * Naive argument parsing. Splits by whitespace, but quoted sections are treated as one entire argument.
 */
export async function parseArguments(input: string, options: { parseChannels?: boolean } = {}): Promise<(string | Channel)[]> {
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

export function checkMessageErrors(interaction: AnyInteraction, {
  message,
  channel,
  author,
}: {
  message: string | null,
  channel: TextBasedChannel | null | undefined,
  author: User,
}): void {
  const authorAndBot = filterOutFalsy([author, client.user]);

  if (channel && !usersHaveChannelPermission({ channel, users: authorAndBot, permissions: 'SendMessages' })) {
    throw new Error(`One of us does not have permission to send messages in <#${channel.id}>`);
  }

  // TODO: Remove this comment if it's outdated with v13
  // Do not check against msg.mentions since putting the mentions like
  // @everyone or <@&786840067103653931> won't register as a mention
  // if the user does not have permission, but will register as a mention
  // when the bot (with permission) posts the reminder.

  if (message && channel && interaction.guild) {
    if (checkMentionsEveryone(message) && !usersHaveChannelPermission({ channel, users: authorAndBot, permissions: 'MentionEveryone' })) {
      throw new Error(`One of us does not have permission to mention everyone in <#${channel.id}>`);
    }

    const unmentionableRoleMention = getRoleMentions(message, interaction.guild).find(role => !role.mentionable);
    if (unmentionableRoleMention && !usersHaveChannelPermission({ channel, users: authorAndBot, permissions: 'MentionEveryone' })) {
      throw new Error(`One of us does not have permission to mention the role: ${unmentionableRoleMention.name}`);
    }
  }
}

export async function replyWithEmbeds({
  interaction,
  embeds,
  messageArgs,
  ephemeral,
}: {
  interaction: AnyInteraction,
  embeds: EmbedBuilder[],
  messageArgs?: InteractionReplyOptions,
  ephemeral?: boolean,
}): Promise<void> {
  // 10 is the max number of embeds per message
  const chunkedEmbeds = chunk(embeds, 10);
  // These need to be done sequentially because there would otherwise be a race condition between editing and following up
  for (let i = 0; i < chunkedEmbeds.length; i++) {
    if (i > 0) {
      await interaction.followUp({
        ...messageArgs,
        embeds: chunkedEmbeds[i],
        ephemeral,
      });
    } else {
      await interaction.editReply({
        ...messageArgs,
        embeds: chunkedEmbeds[i],
      });
    }
  }
}

export async function replyWithSelect({
  interaction,
  options,
  placeholder,
  label,
  isFollowUp,
  onSelect,
  workingMsg,
}: {
  interaction: AnyInteraction,
  options: SelectMenuComponentOptionData[],
  placeholder?: string,
  label?: string,
  isFollowUp?: boolean,
  onSelect: (value: string, message: MessageResponse) => Promise<void | WebhookEditMessageOptions>,
  workingMsg?: string,
}): Promise<void> {
  const menu = new SelectMenuBuilder({
    customId: 'select',
    placeholder,
    options: options.map(o => ({
      ...o,
      label: o.label.slice(0, 100),
    })).slice(0, 25),
  });
  const row = new ActionRowBuilder<SelectMenuBuilder>({
    components: [menu],
  });

  const selectMsg = isFollowUp
    ? await interaction.followUp({
      ephemeral: true,
      content: label,
      components: [row],
    })
    : await interaction.editReply({
      content: label,
      components: [row],
    });

  try {
    const selectInteraction = await interaction.channel?.awaitMessageComponent({
      filter: i => i.message.id === selectMsg.id && i.user.id === interaction.user.id,
      time: INTERACTION_MAX_TIMEOUT,
    }).catch(() => {
      // Intentionally empty catch
    });
    if (selectInteraction?.isSelectMenu()) {
      await selectInteraction.deferUpdate().catch(() => {
        log('Could not defer update for interaction', selectInteraction.customId);
      });
      if (workingMsg) {
        await interaction.webhook.editMessage(selectMsg.id, {
          content: workingMsg,
          components: [],
        });
      }
      const result = await onSelect(selectInteraction.values[0], selectMsg);
      if (result) {
        await interaction.webhook.editMessage(selectMsg.id, result);
      }
    } else {
      // If we get here, then the interaction button was not clicked.
      await interaction.webhook.editMessage(selectMsg.id, {
        content: 'Favorites selection timed out.',
        components: [],
      });
    }
  } catch (err) {
    await interaction.webhook.editMessage(selectMsg.id, `Error: ${get(err, 'message', 'Something went wrong.')}`);
  }
}

export function getCommandInfoFromInteraction(interaction: ModalSubmitInteraction): {
  commandName: string,
  subcommand: string | null,
} {
  const matches = interaction.customId.match(/(.+)\s(.+)/);
  if (!matches) return { commandName: interaction.customId, subcommand: null };
  return { commandName: matches[1], subcommand: matches[2] };
}

export async function resolveMember(input: string, interaction: AnyInteraction): Promise<GuildMember | null | undefined> {
  if (!interaction.guild || !input) return null;
  const userId = getChannelIdFromArg(input);
  if (userId) {
    const member = await interaction.guild.members.fetch(userId);
    if (!member) throw new Error(`Could not find member with ID: ${userId}`);
    return member;
  }
  let discriminator: string | undefined;
  let formattedInput = input.toLowerCase().replace('@', '');
  const matches = formattedInput.match(USER_DISCRIMINATOR_REGEX);
  if (matches) {
    formattedInput = matches[1];
    discriminator = matches[2];
  }
  // These have an order of preference, because nicknames can be duplicates
  let member = await interaction.guild.members.cache.find(member => {
    const username = member.user.username.toLowerCase();
    if (discriminator) return member.user.discriminator === discriminator && username === formattedInput;
    return username === formattedInput;
  });
  if (!member && !discriminator) {
    member = await interaction.guild.members.cache.find(member => {
      return member.displayName.toLowerCase() === formattedInput;
    });
  }
  if (!member && !discriminator) {
    member = await interaction.guild.members.cache.find(member => {
      return member.nickname?.toLowerCase() === formattedInput;
    });
  }
  return member;
}

export async function resolveChannel(input: string, interaction: AnyInteraction): Promise<Channel | null | undefined> {
  if (!interaction.guild || !input) return null;
  const channelId = getChannelIdFromArg(input);
  if (channelId) {
    const channel = await interaction.guild.channels.fetch(channelId);
    return channel;
  }
  const formattedInput = input.toLowerCase().replace('#', '');
  const channel = await interaction.guild.channels.cache.find(channel => {
    return get(channel, 'name')?.toLowerCase() === formattedInput;
  });
  return channel;
}

export async function resolveRole(input: string, interaction: AnyInteraction): Promise<Role | null | undefined> {
  if (!interaction.guild || !input) return null;
  const roleId = getRoleIdFromArg(input);
  if (roleId) {
    const role = await interaction.guild.roles.fetch(roleId);
    return role;
  }
  const role = await interaction.guild.roles.cache.find(role => {
    return role.name.toLowerCase() === input.replace('@', '').toLowerCase();
  });
  return role;
}

/**
 * TODO: Type the response
 */
export async function parseInput({
  slashCommandData,
  interaction,
}: {
  slashCommandData: NonNullable<Command['slashCommandData']>,
  interaction: AnyInteraction,
}): Promise<AnyMapping> {
  const resolvedInputs: AnyMapping = {};
  function parseCommandOption(option: CommandInteractionOption) {
    if (!isCommand(interaction)) return;
    if (option.type === ApplicationCommandOptionType.Subcommand) {
      option.options?.forEach(option => {
        parseCommandOption(option);
      });
    } else {
      const { options } = interaction;
      switch (option.type) {
        case ApplicationCommandOptionType.Role: {
          resolvedInputs[option.name] = options.getRole(option.name);
          break;
        }
        case ApplicationCommandOptionType.Channel: {
          resolvedInputs[option.name] = options.getChannel(option.name);
          break;
        }
        case ApplicationCommandOptionType.Integer: {
          resolvedInputs[option.name] = options.getInteger(option.name);
          break;
        }
        case ApplicationCommandOptionType.Number: {
          resolvedInputs[option.name] = options.getNumber(option.name);
          break;
        }
        case ApplicationCommandOptionType.Mentionable: {
          resolvedInputs[option.name] = options.getMentionable(option.name);
          break;
        }
        case ApplicationCommandOptionType.String: {
          resolvedInputs[option.name] = options.getString(option.name);
          break;
        }
        case ApplicationCommandOptionType.User: {
          resolvedInputs[option.name] = options.getUser(option.name);
          break;
        }
        default: {
          resolvedInputs[option.name] = option.value;
        }
      }
    }
  }

  if (isCommand(interaction)) {
    interaction.options.data.forEach(option => {
      parseCommandOption(option);
    });
    return resolvedInputs;
  }

  async function parseModalOption(option: APIApplicationCommandOption) {
    if (!isModalSubmit(interaction)) return;
    let input: string;
    try {
      input = interaction.fields.getTextInputValue(option.name);
    } catch (err) {
      error(err);
      return;
    }
    switch (option.type) {
      case 4: { // Integer
        const int = parseInt(input, 10);
        if (Number.isNaN(int)) throw new Error(`Could not parse "${input}" to an integer.`);
        resolvedInputs[option.name] = int;
        break;
      }
      case 10: { // Number
        const num = Number(input);
        if (Number.isNaN(num)) throw new Error(`Could not parse "${input}" to a number.`);
        resolvedInputs[option.name] = num;
        break;
      }
      case 5: { // Boolean
        if (input) {
          let bool: boolean | null = null;
          if (/^(t|true|y|yes|ya|yea|yeah)$/i.test(input)) bool = true;
          if (/^(f|false|n|no|nope|nah|naw)$/i.test(input)) bool = false;
          if (bool == null) throw new Error(`Could not parse "${input}" to a boolean.`);
          resolvedInputs[option.name] = bool;
        }
        break;
      }
      case 6: { // User
        if (!interaction.guild || !input) break;
        const member = await resolveMember(input, interaction);
        if (!member) throw new Error(`Could not find member based on: ${input}`);
        resolvedInputs[option.name] = member;
        break;
      }
      case 9: { // Mentionable
        // TODO
        // We don't currently have a command which uses this, so build this out later.
        resolvedInputs[option.name] = input;
        break;
      }
      case 7: { // Channel
        if (!interaction.guild || !input) break;
        const channel = await resolveChannel(input, interaction);
        if (!channel) throw new Error(`Could not find channel based on: ${input}`);
        resolvedInputs[option.name] = channel;
        break;
      }
      case 8: { // Role
        if (!interaction.guild || !input) break;
        const role = await resolveRole(input, interaction);
        if (!role) throw new Error(`Could not find role based on: ${input}`);
        resolvedInputs[option.name] = role;
        break;
      }
      case 3: // String
      default: {
        if (!input) break;
        if (!interaction.guild) {
          resolvedInputs[option.name] = input;
          break;
        }
        const promises: Promise<void>[] = [];
        const channelReferences = input.match(/#[a-zA-Z\d-]+/gi);
        if (channelReferences) log('Resolving channel references from', input);
        promises.push(...channelReferences?.map(async channelReference => {
          log('Resolving channel from', channelReference);
          const channel = await resolveChannel(channelReference, interaction);
          if (channel) input = input.replace(channelReference, `<#${channel.id}>`);
        }) || []);
        // TODO: Support mentions which contain a space
        const mentions = input.match(/@[^\s+]+/gi);
        if (mentions) log('Resolving mentions from', input);
        promises.push(...mentions?.map(async mention => {
          log('Resolving member from', mention);
          const member = await resolveMember(mention, interaction);
          if (member) input = input.replace(mention, `<@${member.id}>`);
        }) || []);
        interaction.guild.roles.cache.forEach(role => {
          const roleMention = `@${role.name.toLowerCase()}`;
          const idx = input.toLowerCase().indexOf(roleMention);
          if (idx >= 0) {
            log('Found role mention', role.name, role.id, 'from input', input);
            input = input.toLowerCase().replace(new RegExp(roleMention, 'gi'), `<@&${role.id}>`);
          }
        });
        await Promise.all(promises);
        resolvedInputs[option.name] = input;
      }
    }
  }

  if (isModalSubmit(interaction)) {
    const { subcommand } = getCommandInfoFromInteraction(interaction);
    await Promise.all(slashCommandData.options.map(async option => {
      const json = option.toJSON();
      if (json.type === 1) { // subcommand
        if (!json.options || (subcommand && option.toJSON().name !== subcommand)) return;
        await Promise.all(json.options.map(async option => {
          // @ts-ignore Useless TS
          await parseModalOption(option);
        }));
      } else {
        // @ts-ignore Useless TS
        await parseModalOption(json);
      }
    }));
  }

  return resolvedInputs;
}

export function getSubcommand(interaction: CommandInteraction | ModalSubmitInteraction): string | null {
  let subcommand: string | null = null;
  if (isModalSubmit(interaction)) {
    subcommand = getCommandInfoFromInteraction(interaction).subcommand;
  } else if (isCommand(interaction)) {
    subcommand = interaction.options.getSubcommand();
  }
  return subcommand;
}

export function editLatest({
  interaction,
  messageId,
  data,
}: {
  interaction: AnyInteraction,
  messageId?: string,
  data: string | MessagePayload | WebhookEditMessageOptions,
}): ReturnType<AnyInteraction['editReply']> {
  if (messageId) return interaction.webhook.editMessage(messageId, data);
  return interaction.editReply(data);
}
