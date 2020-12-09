import type { ClientType, CommandRunMethod } from 'src/types';

import { Command } from 'discord.js-commando';
import { Role } from 'discord.js';
import { getModels } from 'src/models';
import { error } from 'src/logging';

const LIST_OPERATIONS = ['list', 'ls'] as const;
const ADD_OPERATIONS = ['add'] as const; // add the role when streaming
const REMOVE_OPERATIONS = ['remove', 'delete'] as const; // remove the role when streaming
const OPERATIONS = [
  ...LIST_OPERATIONS,
  ...ADD_OPERATIONS,
  ...REMOVE_OPERATIONS,
  'clear', // clear the relationship altogether (NOT the same as remove/delete)
] as const;

interface Args {
  operation: typeof OPERATIONS[number];
  role: Role | '',
}

/**
 * !streamer_rules <operation> <role>
 */
export default class StreamerRulesCommand extends Command {
  constructor(client: ClientType) {
    super(client, {
      name: 'streamer_rules',
      aliases: ['streamer_roles', 'streaming_rules', 'streaming_roles'],
      group: 'utilities',
      memberName: 'streamer_rules',
      description:
        'Adds/removes roles for members who are currently streaming.\n'
        + 'Use !streamer_rules add <role> to set up adding a role to any member who is currently streaming.\n'
        + 'Use !streamer_rules remove <role> to set up removing a role from any member who is currently streaming.\n'
        + 'Use !streamer_rules clear <role?> to remove this relationship for a role (or all roles, if not specified).\n'
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
          validate: text => OPERATIONS.includes(text),
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

  run: CommandRunMethod<Args> = async (msg, args) => {
    const { operation, role } = args;
    const guildId = msg.guild.id;
    const model = getModels().streamer_rules;

    // @ts-ignore These TS errors are useless. Same goes for rest of ts-ignores below.
    if (!role && ADD_OPERATIONS.concat(REMOVE_OPERATIONS).includes(operation)) return msg.reply('A role is required!');

    try {
      // @ts-ignore
      if (ADD_OPERATIONS.includes(operation)) {
        await model.create({
          guild_id: guildId,
          role_id: (role as Role).id,
          add: true,
        });
        return msg.say(`Users who are streaming will now be given the <@&${(role as Role).id}> role.`);
      }
      // @ts-ignore
      if (REMOVE_OPERATIONS.includes(operation)) {
        await model.create({
          guild_id: guildId,
          role_id: (role as Role).id,
          add: false,
        });
        return msg.say(`Users who are streaming will now have the <@&${(role as Role).id}> role removed.`);
      }
      // @ts-ignore
      if (LIST_OPERATIONS.includes(operation)) {
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
      if (operation === 'clear') {
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
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        return msg.reply('That role is already in the database!');
      }
      error(err);
      return msg.reply('Something went wrong...');
    }

    return msg.reply('What?');
  }
}
