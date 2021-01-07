import type { ClientType, CommandRunMethod, Mutable, CommandOperationHandler } from 'src/types';

import { Command } from 'discord.js-commando';
import { Role } from 'discord.js';
import { error } from 'src/logging';
import { getModels } from 'src/models';
import { handleError } from 'src/discord-utils';
import { parseDelay } from 'src/utils';

const LIST_OPERATIONS = ['list', 'ls'] as const;
const ADD_OPERATIONS = ['add'] as const;
const CLEAR_OPERATIONS = ['clear'] as const;
const OPERATIONS = [
  ...LIST_OPERATIONS,
  ...ADD_OPERATIONS,
  ...CLEAR_OPERATIONS,
] as const;

const model = getModels().base_roles;

interface Args {
  operation: typeof OPERATIONS[number];
  role: Role | '';
  delay: string;
}

type OperationHandler = CommandOperationHandler<Args>;

/**
 * !base_roles <operation> <role> [timeout]
 */
export default class StreamerRulesCommand extends Command {
  constructor(client: ClientType) {
    super(client, {
      name: 'base_roles',
      aliases: ['noob_roles'],
      group: 'utilities',
      memberName: 'base_roles',
      description:
        'Adds base roles for new members, with an optional delay before adding.\n'
        + 'Use !base_roles add <role> [delay] to set up adding a base role for any new member.\n'
        + 'Use !base_roles clear [role] to remove a base role (or all of them, if no role specified).\n'
        + 'Use !base_roles list to see all base roles.',
      examples: [
        '!base_roles add @noob',
        '!base_roles add @noob 10 minutes',
        '!base_roles clear @noob',
        '!base_roles list',
      ],
      userPermissions: ['MANAGE_ROLES'],
      clientPermissions: ['MANAGE_ROLES'],
      guildOnly: true,
      args: [
        {
          key: 'operation',
          prompt: 'Whether you\'re adding, clearing or listing base roles.',
          type: 'string',
          oneOf: OPERATIONS as Mutable<typeof OPERATIONS>,
        },
        {
          key: 'role',
          prompt: 'The base role to add for new members.',
          type: 'role',
          default: '',
        },
        {
          key: 'delay',
          prompt: 'Optional delay before the role gets added to a new member.',
          type: 'string',
          default: '',
        },
      ],
    });
  }

  static handleAdd: OperationHandler = async (msg, { role, delay }) => {
    const guildId = msg.guild.id;
    const roleId = (role as Role).id;
    try {
      const delayMs = delay ? parseDelay(delay) : null;
      await model.create({
        guild_id: guildId,
        role_id: roleId,
        delay: delayMs,
      });
      const response = `New members will now be given the <@&${roleId}> role`;
      if (!delayMs) return msg.say(`${response}.`);
      return msg.say(`${response} after a ${delayMs} millisecond delay.`);
    } catch (err) {
      error(err);
      return handleError(err, msg);
    }
  }

  static handleList: OperationHandler = async (msg, args) => {
    const guildId = msg.guild.id;
    const roles: {
      role_id: string;
      delay: number | null;
    }[] = await model.findAll({
      where: {
        guild_id: guildId,
      },
      attributes: ['role_id', 'delay'],
    });
    if (!roles.length) return msg.say('There are no base roles!');

    const response = roles.reduce((acc, role) => {
      return `${acc}\n<@&${role.role_id}>${role.delay ? ` - ${role.delay} millisecond delay` : ''}`;
    }, 'The following roles will be added to new members:');

    return msg.say(response);
  }

  static handleClear: OperationHandler = async (msg, { role }) => {
    const guildId = msg.guild.id;
    if (!role) {
      await model.destroy({
        where: {
          guild_id: guildId,
        },
      });
      return msg.say('All base roles were removed!');
    }
    await model.destroy({
      where: {
        guild_id: guildId,
        role_id: role.id,
      },
    });
    return msg.say(`Base role for <@&${role.id}> was removed.`);
  }

  run: CommandRunMethod<Args> = async (msg, args) => {
    const { operation, role } = args;

    // @ts-expect-error These TS errors are useless. Same goes for rest of ts-expect-errors below.
    if (!role && ADD_OPERATIONS.includes(operation)) return msg.reply('A role is required!');

    try {
      // @ts-expect-error
      if (ADD_OPERATIONS.includes(operation)) {
        await StreamerRulesCommand.handleAdd(msg, args);
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
