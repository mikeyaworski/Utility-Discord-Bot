import type { ClientType, CommandRunMethod, Mutable, CommandOperationHandler } from 'src/types';

import { Command } from 'discord.js-commando';
import { Role } from 'discord.js';
import { getModels } from 'src/models';
import { handleError } from 'src/discord-utils';

const LIST_OPERATIONS = ['list', 'ls'] as const;
const ADD_OPERATIONS = ['add'] as const; // add the role when streaming
const REMOVE_OPERATIONS = ['remove', 'delete'] as const; // remove the role when streaming
const CLEAR_OPERATIONS = ['clear'] as const; // clear the relationship altogether (NOT the same as remove/delete)
const OPERATIONS = [
  ...LIST_OPERATIONS,
  ...ADD_OPERATIONS,
  ...REMOVE_OPERATIONS,
  ...CLEAR_OPERATIONS,
] as const;

const model = getModels().streamer_rules;

interface Args {
  operation: typeof OPERATIONS[number];
  role: Role | '';
}

type OperationHandler = CommandOperationHandler<Args>;

/**
 * !streamer_rules <operation> <role>
 */
export default class StreamerRulesCommand extends Command {
  constructor(client: ClientType) {
    super(client, {
      name: 'streamer_rules',
      aliases: ['streamer_roles', 'streaming_rules', 'streaming_roles', 'streamer-rules', 'streaming-rules', 'streaming-roles'],
      group: 'utilities',
      memberName: 'streamer_rules',
      description:
        'Adds/removes roles for members who are currently streaming.\n'
        + 'Use !streamer_rules add <role> to set up adding a role to any member who is currently streaming.\n'
        + 'Use !streamer_rules remove <role> to set up removing a role from any member who is currently streaming.\n'
        + 'Use !streamer_rules clear [role] to remove this relationship for a role (or all roles, if not specified).\n'
        + 'Use !streamer_rules list to see all rules.\n'
        + 'Note that "clear" and "remove" are NOT the same. "delete" is also an alias for "remove".',
      examples: [
        '!streamer_rules add @streaming',
        '!streamer_rules remove @private',
        '!streamer_rules clear @private',
        '!streamer_rules list',
      ],
      userPermissions: ['MANAGE_ROLES'],
      clientPermissions: ['MANAGE_ROLES'],
      guildOnly: true,
      args: [
        {
          key: 'operation',
          prompt: 'Whether to add or remove the following role from someone streaming.',
          type: 'string',
          oneOf: OPERATIONS as Mutable<typeof OPERATIONS>,
        },
        {
          key: 'role',
          prompt: 'The role to add/remove to members who are currently streaming.',
          type: 'role',
          default: '',
        },
      ],
    });
  }

  static handleAdd: OperationHandler = async (msg, { role }) => {
    const guildId = msg.guild.id;
    const roleId = (role as Role).id;
    await model.create({
      guild_id: guildId,
      role_id: roleId,
      add: true,
    });
    return msg.say(`Users who are streaming will now be given the <@&${roleId}> role.`);
  }

  static handleRemove: OperationHandler = async (msg, { role }) => {
    const guildId = msg.guild.id;
    const roleId = (role as Role).id;
    await model.create({
      guild_id: guildId,
      role_id: roleId,
      add: false,
    });
    return msg.say(`Users who are streaming will now have the <@&${roleId}> role removed.`);
  }

  static handleList: OperationHandler = async (msg, args) => {
    const guildId = msg.guild.id;
    const rules = await model.findAll({
      where: {
        guild_id: guildId,
      },
      attributes: ['role_id', 'add'],
    });
    if (!rules.length) return msg.say('There are no streamer roles being added or removed!');

    const rolesToAdd = rules.filter(row => row.add).map(row => row.role_id);
    const rolesToRemove = rules.filter(row => !row.add).map(row => row.role_id);
    const addStr = rolesToAdd.length ? rolesToAdd.reduce(
      (acc, roleId) => `${acc}\n<@&${roleId}>`,
      'The following roles will be added to members who are streaming:',
    ) : 'There are no roles being added to members who are streaming.';
    const removeStr = rolesToRemove.length ? rolesToRemove.reduce(
      (acc, roleId) => `${acc}\n<@&${roleId}>`,
      'The following roles will be removed from members who are streaming:',
    ) : 'There are no roles being removed from members who are streaming.';

    return msg.say(`${addStr}\n${removeStr}`);
  }

  static handleClear: OperationHandler = async (msg, { role }) => {
    const guildId = msg.guild.id;
    if (!role) {
      await model.destroy({
        where: {
          guild_id: guildId,
        },
      });
      return msg.say('All streaming role relationships were removed!');
    }
    await model.destroy({
      where: {
        guild_id: guildId,
        role_id: role.id,
      },
    });
    return msg.say(`Streaming role relationship for <@&${role.id}> was removed.`);
  }

  run: CommandRunMethod<Args> = async (msg, args) => {
    const { operation, role } = args;

    // @ts-expect-error These TS errors are useless. Same goes for rest of ts-expect-errors below.
    if (!role && ADD_OPERATIONS.concat(REMOVE_OPERATIONS).includes(operation)) return msg.reply('A role is required!');

    try {
      // @ts-expect-error
      if (ADD_OPERATIONS.includes(operation)) {
        await StreamerRulesCommand.handleAdd(msg, args);
        return null;
      }
      // @ts-expect-error
      if (REMOVE_OPERATIONS.includes(operation)) {
        await StreamerRulesCommand.handleRemove(msg, args);
        return null;
      }
      // @ts-expect-error
      if (LIST_OPERATIONS.includes(operation)) {
        await StreamerRulesCommand.handleList(msg, args);
        return null;
      }
      // @ts-expect-error
      if (CLEAR_OPERATIONS.includes(operation)) {
        await StreamerRulesCommand.handleClear(msg, args);
        return null;
      }
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        return msg.reply('That role is already in the database!');
      }
      return handleError(err, msg);
    }

    return msg.reply('What?');
  }
}
