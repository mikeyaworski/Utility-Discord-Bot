import type { MessageReaction, User, Message, Collection, Snowflake } from 'discord.js';
import type { EventTrigger } from 'src/types';

import { getModels } from 'src/models';
import { error } from 'src/logging';

// https://discordjs.guide/popular-topics/reactions.html#listening-for-reactions-on-old-messages
async function reactionReady(messageReaction: MessageReaction): Promise<boolean> {
  // When we receive a reaction we check if the reaction is partial or not
  if (messageReaction.partial) {
    // If the message this reaction belongs to was removed the fetching might result in an API error, which we need to handle
    try {
      await messageReaction.fetch();
    } catch (err) {
      error('Something went wrong when fetching the message: ', err);
      return false;
      // Return as `reaction.message.author` may be undefined/null
    }
  }
  return true;
}

const ReactionAddEvent: EventTrigger = ['messageReactionAdd', async (messageReaction: MessageReaction, user: User): Promise<void> => {
  if (user.bot) return;
  if (!(await reactionReady(messageReaction))) return;

  const guildId = messageReaction.message.guild!.id;
  const messageId = messageReaction.message.id;
  const member = await messageReaction.message.guild!.members.fetch({
    user,
    force: true,
  });

  type UniqueRule = {
    unique: boolean;
  }
  type Rule = {
    role_id: string;
    emoji: string;
  }

  const [uniqueRule, rules] = await Promise.all([
    getModels().reaction_messages_unique.findOne({
      where: {
        guild_id: guildId,
        message_id: messageId,
      },
      attributes: ['unique'],
    }) as Promise<UniqueRule | null>,
    getModels().reaction_roles.findAll({
      where: {
        guild_id: guildId,
        message_id: messageId,
      },
      attributes: ['role_id', 'emoji'],
    }) as Promise<Rule[]>,
  ]);

  const rolesToAdd = rules.filter(rule => rule.emoji === messageReaction.emoji.toString()).map(rule => rule.role_id);
  const emojisToUnreact = rules.filter(rule => rule.emoji !== messageReaction.emoji.toString()).map(rule => rule.emoji);

  try {
    await member.roles.add(rolesToAdd);
  } catch (err) {
    // likely to happen if the role trying to be given is higher than the bot's role
    error(err);
  }

  if (uniqueRule?.unique) {
    // Update the cache of users for each reaction on the message.
    // It would be awesome to do this as a job when the bot spins up, but doing the fetches
    // at that time will not update the cache used here for some reason... weird API.
    await Promise.all(messageReaction.message.reactions.cache.map(async reaction => {
      if (!reaction.users.cache.size) {
        // Note: this only works for the first 100 users
        await reaction.users.fetch();
      }
    }));

    emojisToUnreact.forEach(emoji => {
      const reaction = messageReaction.message.reactions.resolve(emoji);
      if (!reaction) return;
      try {
        // If the cache is populated, let's reduce API calls by comparing against the cache.
        // The cache should be populated since we populate it above.
        // But if the cache is empty, let's just force remove the reaction (potentially wasting an API call, but we don't know for sure).
        if (!reaction.users.cache.size || reaction.users.cache.has(user.id)) {
          reaction.users.remove(user);
        }
      } catch (err) {
        error(err);
      }
    });
  }
}];

const ReactionRemoveEvent: EventTrigger = ['messageReactionRemove', async (messageReaction: MessageReaction, user: User): Promise<void> => {
  if (user.bot) return;
  if (!(await reactionReady(messageReaction))) return;
  const guildId = messageReaction.message.guild!.id;
  const messageId = messageReaction.message.id;
  const member = await messageReaction.message.guild!.members.fetch({
    user,
    force: true,
  });
  const rules = await getModels().reaction_roles.findAll({
    where: {
      guild_id: guildId,
      message_id: messageId,
      emoji: messageReaction.emoji.toString(),
    },
    attributes: ['role_id'],
  });
  const roleIds: string[] = rules.map(rule => rule.role_id);
  try {
    await member.roles.remove(roleIds);
  } catch (err) {
    // likely to happen if the role trying to be removed is higher than the bot's role
    error(err);
  }
}];

const MessageDeleteEvent: EventTrigger = ['messageDelete', async (message: Message): Promise<void> => {
  await Promise.all([
    getModels().reaction_roles.destroy({
      where: {
        guild_id: message.guild?.id,
        message_id: message.id,
      },
    }),
    getModels().reaction_messages_unique.destroy({
      where: {
        guild_id: message.guild?.id,
        message_id: message.id,
      },
    }),
  ]);
}];

const MessageDeleteBulkEvent: EventTrigger = ['messageDeleteBulk', async (messages: Collection<Snowflake, Message>): Promise<void> => {
  messages.forEach(MessageDeleteEvent[1]);
}];

export default [
  ReactionAddEvent,
  ReactionRemoveEvent,
  MessageDeleteEvent,
  MessageDeleteBulkEvent,
];
