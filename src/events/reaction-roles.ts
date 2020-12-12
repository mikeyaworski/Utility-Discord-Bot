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
  const guildId = messageReaction.message.guild.id;
  const messageId = messageReaction.message.id;
  const member = await messageReaction.message.guild.members.fetch({
    user,
    force: true,
  });
  const [uniqueRule, rules] = await Promise.all([
    getModels().reaction_messages_unique.findOne({
      where: {
        guild_id: guildId,
        message_id: messageId,
      },
    }),
    getModels().reaction_roles.findAll({
      where: {
        guild_id: guildId,
        message_id: messageId,
        emoji: messageReaction.emoji.toString(),
      },
      attributes: ['role_id'],
    }),
  ]);
  const roleIds = rules.map(rule => rule.role_id);
  roleIds.forEach(async roleId => {
    try {
      if (!member.roles.cache.has(roleId)) member.roles.add(roleId);
    } catch (err) {
      // likely to happen if the role trying to be given is higher than the bot's role
      error(err);
    }
  });
  if (uniqueRule?.unique) {
    const otherReactions = messageReaction.message.reactions.cache.filter(reaction => reaction.emoji.toString() !== messageReaction.emoji.toString());
    otherReactions.forEach(otherReaction => {
      try {
        if (otherReaction.users.cache.has(user.id)) otherReaction.users.remove(user);
      } catch (err) {
        error(err);
      }
    });
  }
}];

const ReactionRemoveEvent: EventTrigger = ['messageReactionRemove', async (messageReaction: MessageReaction, user: User): Promise<void> => {
  if (user.bot) return;
  if (!(await reactionReady(messageReaction))) return;
  const guildId = messageReaction.message.guild.id;
  const messageId = messageReaction.message.id;
  const member = await messageReaction.message.guild.members.fetch({
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
  const roleIds = rules.map(rule => rule.role_id);
  roleIds.forEach(async roleId => {
    try {
      if (member.roles.cache.has(roleId)) member.roles.remove(roleId);
    } catch (err) {
      // likely to happen if the role trying to be removed is higher than the bot's role
      error(err);
    }
  });
}];

const MessageDeleteEvent: EventTrigger = ['messageDelete', async (message: Message): Promise<void> => {
  await Promise.all([
    getModels().reaction_roles.destroy({
      where: {
        guild_id: message.guild.id,
        message_id: message.id,
      },
    }),
    getModels().reaction_messages_unique.destroy({
      where: {
        guild_id: message.guild.id,
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
