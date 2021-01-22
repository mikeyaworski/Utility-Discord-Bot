import type { Message } from 'discord.js';
import type { ClientType, CommandRunMethod, Mutable, CommandOperationHandler, GenericMapping, BooleanMapping } from 'src/types';

import get from 'lodash.get';
import removeDuplicates from 'lodash.uniq';
import { Command } from 'discord.js-commando';
import { Role, TextChannel } from 'discord.js';
import { shorten } from 'src/utils';
import { fetchMessageInGuild, handleError } from 'src/discord-utils';
import { getModels } from 'src/models';
import { error } from 'src/logging';
import { MESSAGE_PREVIEW_LENGTH } from 'src/constants';

const reactionMessagesUnique = getModels().reaction_messages_unique;
const reactionRoles = getModels().reaction_roles;

const LIST_OPERATIONS = ['list', 'ls'] as const;
const ADD_OPERATIONS = ['add'] as const;
const REMOVE_OPERATIONS = ['remove', 'delete'] as const;
const OPERATIONS = [
  ...LIST_OPERATIONS,
  ...ADD_OPERATIONS,
  ...REMOVE_OPERATIONS,
  'unique',
  'clear',
] as const;

interface Args {
  operation: typeof OPERATIONS[number];
  messageId: string;
  emojiOrUnique: string | '';
  role: Role | '';
}

type OperationHandler = CommandOperationHandler<Args>;

/**
 * !reactions <operation> [message_id] [emoji | boolean] [role]
 */
export default class ReactionsCommand extends Command {
  constructor(client: ClientType) {
    super(client, {
      name: 'reactions',
      aliases: ['rxns', 'rr'],
      group: 'utilities',
      memberName: 'reactions',
      description:
        'Adds/removes roles for members who are currently streaming.\n'
        + 'Use !reactions add <message_id> <emoji> <role> to set up adding a role to any member who reacts with a particular emoji.\n'
        + 'Use !reactions remove <emoji> to remove an emoji reaction from the message.\n'
        + 'Use !reactions clear <message_id> to remove all emoji reactions on a message.\n'
        + 'Use !reactions list [message_id] to see all reaction rules for all messages, or a particular message.\n'
        + 'Note that "clear" and "remove" are NOT the same. "delete" is also an alias for "remove".',
      examples: [
        '!reactions add 784702649324929054 :smile: @role',
        '!reactions remove 784702649324929054 :smile:',
        '!reactions clear 784702649324929054',
        '!reactions unique 784702649324929054 true',
        '!reactions list',
        '!reactions list 784702649324929054',
      ],
      userPermissions: ['MANAGE_ROLES'],
      clientPermissions: ['MANAGE_ROLES'],
      guildOnly: true,
      throttling: {
        usages: 2,
        duration: 10,
      },
      args: [
        {
          key: 'operation',
          prompt: OPERATIONS.join(', '),
          type: 'string',
          oneOf: OPERATIONS as Mutable<typeof OPERATIONS>,
        },
        {
          key: 'messageId',
          prompt: 'The message for the reactions to be on.',
          // Can't use type: 'message' unfortunately.
          // It would be super convenient, but this type will not allow message IDs from other channels, which is a requirement here.
          type: 'string',
          default: '',
        },
        {
          key: 'emojiOrUnique',
          prompt:
            'If using unique operation, this is whether or not you can react to multiple emojis on the message.'
            + 'Otherwise, this is the reaction emoji.',
          type: 'string',
          default: '',
        },
        {
          key: 'role',
          prompt: 'The role to give for reacting with the emoji.',
          type: 'role',
          default: '',
        },
      ],
    });
  }

  static handleList: OperationHandler = async commandMsg => {
    const guildId = commandMsg.guild.id;

    const rules: {
      role_id: string;
      emoji: string;
      message_id: string;
    }[] = await reactionRoles.findAll({
      where: {
        guild_id: guildId,
      },
      attributes: ['role_id', 'emoji', 'message_id'],
    });
    const uniqueRules: {
      unique: boolean;
      message_id: string;
    }[] = await reactionMessagesUnique.findAll({
      where: {
        guild_id: guildId,
        // no need to return the rows which are false, since we can just treat them the same as undefined
        unique: true,
      },
      attributes: ['unique', 'message_id'],
    });

    if (!rules.length) return commandMsg.say('There are no role reactions assigned!');
    const responseMsg = await commandMsg.say('Fetching...\nThis may take a minute.') as Message;

    const uniqueMapping = uniqueRules.reduce((acc, rule) => {
      return Object.assign(acc, {
        [rule.message_id]: rule.unique,
      });
    }, {} as BooleanMapping);

    const messageMapping: GenericMapping<Message | null | undefined> = {};
    const messageIds = removeDuplicates(rules.map(rule => rule.message_id));
    await Promise.all(messageIds.map(messageId => {
      return fetchMessageInGuild(commandMsg.guild, messageId, commandMsg.channel as TextChannel);
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

    const response = Object.keys(responseMapping).reduce((acc, messageId) => {
      const messageInfo = responseMapping[messageId];
      acc = `${acc}__${messageId}__\nMessage text: ${messageInfo.messageText}\nUnique reactions? ${messageInfo.unique ? 'Yes' : 'No'}\n`;
      const emojiResponse = Object.keys(messageInfo.emojis).reduce((emojiAcc, emoji) => {
        return `${emojiAcc}${emoji} - ${messageInfo.emojis[emoji].map(roleId => `<@&${roleId}>`).join(' ')}\n`;
      }, '');
      return `${acc}${emojiResponse}\n`;
    }, '');

    return responseMsg.edit(response);
  }

  static handleAdd: OperationHandler = async (commandMsg, args) => {
    const guildId = commandMsg.guild.id;
    const { emojiOrUnique, messageId, role } = args;
    if (!emojiOrUnique) return commandMsg.reply('Specify an emoji.');
    if (!role) return commandMsg.reply('Specify a role.');
    if (!messageId) return commandMsg.reply('Specify a message.');
    const message = await fetchMessageInGuild(commandMsg.guild, messageId);
    if (!message) return commandMsg.reply('Could not find message!');
    await message.react(emojiOrUnique);
    await reactionRoles.create({
      guild_id: guildId,
      role_id: role.id,
      emoji: emojiOrUnique,
      message_id: messageId,
    });
    return commandMsg.say(`Role <@&${role.id}> will be added when reacting with emoji ${emojiOrUnique}!`);
  }

  static handleRemove: OperationHandler = async (commandMsg, args) => {
    const { emojiOrUnique, messageId } = args;
    const guildId = commandMsg.guild.id;
    if (!emojiOrUnique) return commandMsg.reply('Specify an emoji.');
    await reactionRoles.destroy({
      where: {
        guild_id: guildId,
        message_id: messageId,
        emoji: emojiOrUnique,
      },
    });
    return commandMsg.say(`Roles for emoji ${emojiOrUnique} have been removed from the message.`);
  }

  static handleUnique: OperationHandler = async (commandMsg, { emojiOrUnique, messageId }) => {
    const guildId = commandMsg.guild.id;
    if (!['true', 'false'].includes(emojiOrUnique)) return commandMsg.reply('Specify \'true\' or \'false\'.');
    const unique = emojiOrUnique === 'true';
    await reactionMessagesUnique.upsert({
      guild_id: guildId,
      message_id: messageId,
      unique,
    });
    const response = unique
      ? 'Members may only react to a single emoji on that message now!'
      : 'Members may react to as many emojis as they want now!';
    return commandMsg.say(response);
  }

  static handleClear: OperationHandler = async (commandMsg, { messageId }) => {
    const guildId = commandMsg.guild.id;
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
    return commandMsg.say('Role reactions have been removed from the message.');
  }

  run: CommandRunMethod<Args> = async (commandMsg, args) => {
    const { operation, messageId } = args;

    // @ts-expect-error These TS errors are useless. Same goes for rest of ts-expect-errors below.
    if (!messageId && OPERATIONS.filter(op => !LIST_OPERATIONS.includes(op)).includes(operation)) {
      return commandMsg.reply('A message ID is required!');
    }

    // use await... and return null instead of return ...
    // so that we can catch the errors here
    try {
      // @ts-expect-error
      if (LIST_OPERATIONS.includes(operation)) {
        await ReactionsCommand.handleList(commandMsg, args);
        return null;
      }
      if (operation === 'unique') {
        await ReactionsCommand.handleUnique(commandMsg, args);
        return null;
      }
      // @ts-expect-error
      if (ADD_OPERATIONS.includes(operation as string)) {
        await ReactionsCommand.handleAdd(commandMsg, args);
        return null;
      }
      // @ts-expect-error
      if (REMOVE_OPERATIONS.includes(operation)) {
        await ReactionsCommand.handleRemove(commandMsg, args);
        return null;
      }
      if (operation === 'clear') {
        await ReactionsCommand.handleClear(commandMsg, args);
        return null;
      }
    } catch (err) {
      if (err.message === 'Unknown Emoji') {
        return commandMsg.reply('I\'m not able to use that emoji!');
      }
      return handleError(err, commandMsg);
    }

    return commandMsg.reply('What?');
  }
}
