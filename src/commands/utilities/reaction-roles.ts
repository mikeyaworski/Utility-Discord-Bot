import type { CommandInteraction, Message } from 'discord.js';
import type { Command, GenericMapping, BooleanMapping } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';
import removeDuplicates from 'lodash.uniq';
import get from 'lodash.get';

import { getModels } from 'src/models';
import { fetchMessageInGuild, handleError } from 'src/discord-utils';
import { shorten } from 'src/utils';
import { MESSAGE_PREVIEW_LENGTH } from 'src/constants';

const reactionMessagesUnique = getModels().reaction_messages_unique;
const reactionRoles = getModels().reaction_roles;

const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('reaction-roles')
  .setDescription('Create role-reaction messages.');
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('list');
  subcommand.setDescription('List the current reaction messages on a message, or for every message.');
  subcommand.addStringOption(option => {
    return option
      .setName('message_id')
      .setDescription('The ID of the message')
      .setRequired(false);
  });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('toggle-unique');
  subcommand.setDescription('Toggle whether or not reactions on a message need to be unique.');
  subcommand.addStringOption(option => {
    return option
      .setName('message_id')
      .setDescription('The ID of the message')
      .setRequired(true);
  });
  subcommand.addBooleanOption(option => {
    return option
      .setName('is_unique')
      .setDescription('Whether the message enforces unique reactions')
      .setRequired(true);
  });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('add');
  subcommand.setDescription('Add a reaction role.');
  subcommand.addStringOption(option => {
    return option
      .setName('message_id')
      .setDescription('The ID of the message')
      .setRequired(true);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('emoji')
      .setDescription('The reaction emoji')
      .setRequired(true);
  });
  subcommand.addRoleOption(option => {
    return option
      .setName('role')
      .setDescription('The role')
      .setRequired(true);
  });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('clear');
  subcommand.setDescription(
    'Clear all base role configurations, or just a particular one.',
  );
  subcommand.addStringOption(option => {
    return option
      .setName('message_id')
      .setDescription('The ID of the message')
      .setRequired(true);
  });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('remove');
  subcommand.setDescription(
    'Remove a single emoji reaction on a particular message.',
  );
  subcommand.addStringOption(option => {
    return option
      .setName('message_id')
      .setDescription('The ID of the message')
      .setRequired(true);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('emoji')
      .setDescription('The reaction emoji to remove')
      .setRequired(true);
  });
  return subcommand;
});

async function handleList(interaction: CommandInteraction) {
  const guildId = interaction.guild!.id;
  const messageId = interaction.options.getString('message_id', false);

  // message_id specifically cannot be undefined when querying, for some reason
  const baseWhere: {
    guild_id: string,
    message_id?: string,
    unique?: boolean,
  } = {
    guild_id: guildId,
  };
  if (messageId) baseWhere.message_id = messageId;

  const rules: {
    role_id: string;
    emoji: string;
    message_id: string;
  }[] = await reactionRoles.findAll({
    where: baseWhere,
    attributes: ['role_id', 'emoji', 'message_id'],
  });
  const uniqueRules: {
    unique: boolean;
    message_id: string;
  }[] = await reactionMessagesUnique.findAll({
    where: {
      ...baseWhere,
      // no need to return the rows which are false, since we can just treat them the same as undefined
      unique: true,
    },
    attributes: ['unique', 'message_id'],
  });

  if (!rules.length) return interaction.editReply('There are no role reactions assigned!');
  await interaction.editReply('Fetching...\nThis may take a minute.');

  const uniqueMapping = uniqueRules.reduce((acc, rule) => {
    return Object.assign(acc, {
      [rule.message_id]: rule.unique,
    });
  }, {} as BooleanMapping);

  const messageMapping: GenericMapping<Message | null | undefined> = {};
  const messageIds = removeDuplicates(rules.map(rule => rule.message_id));
  await Promise.all(messageIds.map(mId => {
    if (interaction.channel) {
      return fetchMessageInGuild(interaction.guild!, mId, interaction.channel);
    }
    return null;
  }));

  const responseMapping = rules.reduce((acc, rule) => {
    return {
      ...acc,
      [rule.message_id]: {
        ...acc[rule.message_id],
        unique: uniqueMapping[rule.message_id] || false,
        messageText: shorten(messageMapping[rule.message_id]?.content || '', MESSAGE_PREVIEW_LENGTH),
        emojis: {
          ...get(acc, [rule.message_id, 'emojis']),
          [rule.emoji]: [...get(acc, [rule.message_id, 'emojis', rule.emoji], []), rule.role_id],
        },
      },
    };
  }, {} as {
    [messageId: string]: {
      unique: boolean;
      messageText: string;
      emojis: {
        [emoji: string]: string[];
      };
    };
  });

  const response = Object.keys(responseMapping).reduce((acc, mId) => {
    const messageInfo = responseMapping[mId];
    acc = `${acc}__${mId}__\nMessage text: ${messageInfo.messageText}\nUnique reactions? ${messageInfo.unique ? 'Yes' : 'No'}\n`;
    const emojiResponse = Object.keys(messageInfo.emojis).reduce((emojiAcc, emoji) => {
      return `${emojiAcc}${emoji} - ${messageInfo.emojis[emoji].map(roleId => `<@&${roleId}>`).join(' ')}\n`;
    }, '');
    return `${acc}${emojiResponse}\n`;
  }, '');

  return interaction.editReply(response);
}

async function handleClear(interaction: CommandInteraction) {
  const guildId = interaction.guild!.id;
  const messageId = interaction.options.getString('message_id', true);

  await Promise.all([
    reactionRoles.destroy({
      where: {
        guild_id: guildId,
        message_id: messageId,
      },
    }),
    reactionMessagesUnique.destroy({
      where: {
        guild_id: guildId,
        message_id: messageId,
      },
    }),
  ]);
  return interaction.editReply('Role reactions have been removed from the message.');
}

async function handleAdd(interaction: CommandInteraction) {
  const guildId = interaction.guild!.id;
  const messageId = interaction.options.getString('message_id', true);
  const emoji = interaction.options.getString('emoji', true);
  const role = interaction.options.getRole('role', true);

  if (!interaction.guild!.roles.cache.has(role.id) || role.name === '@everyone') {
    return interaction.editReply('Invalid role');
  }

  if (!emoji) return interaction.editReply('Specify an emoji.');
  if (!role) return interaction.editReply('Specify a role.');
  if (!messageId) return interaction.editReply('Specify a message.');
  const message = await fetchMessageInGuild(interaction.guild!, messageId);
  if (!message) return interaction.editReply('Could not find message!');
  await message.react(emoji);
  try {
    await reactionRoles.create({
      guild_id: guildId,
      role_id: role.id,
      emoji,
      message_id: messageId,
    });
  } catch (err) {
    return handleError(err, interaction);
  }
  return interaction.editReply(`Role <@&${role.id}> will be added when reacting with emoji ${emoji}!`);
}

async function handleRemove(interaction: CommandInteraction) {
  const messageId = interaction.options.getString('message_id', true);
  const emoji = interaction.options.getString('emoji', true);

  const guildId = interaction.guild!.id;
  if (!emoji) return interaction.editReply('Specify an emoji.');
  await reactionRoles.destroy({
    where: {
      guild_id: guildId,
      message_id: messageId,
      emoji,
    },
  });
  return interaction.editReply(`Roles for emoji ${emoji} have been removed from the message.`);
}

async function handleUnique(interaction: CommandInteraction) {
  const guildId = interaction.guild!.id;
  const messageId = interaction.options.getString('message_id', true);
  const unique = interaction.options.getBoolean('is_unique', true);

  await reactionMessagesUnique.upsert({
    guild_id: guildId,
    message_id: messageId,
    unique,
  });
  const response = unique
    ? 'Members may only react to a single emoji on that message now!'
    : 'Members may react to as many emojis as they want now!';
  return interaction.editReply(response);
}

const ReactionRolesCommand: Command = {
  guildOnly: true,
  userPermissions: ['MANAGE_ROLES', 'ADD_REACTIONS'],
  clientPermissions: ['MANAGE_ROLES', 'ADD_REACTIONS'],
  data: commandBuilder,
  run: async interaction => {
    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
      case 'list': {
        return handleList(interaction);
      }
      case 'add': {
        return handleAdd(interaction);
      }
      case 'remove': {
        return handleRemove(interaction);
      }
      case 'clear': {
        return handleClear(interaction);
      }
      case 'toggle-unique': {
        return handleUnique(interaction);
      }
      default: {
        return interaction.editReply('What??');
      }
    }
  },
};

export default ReactionRolesCommand;
