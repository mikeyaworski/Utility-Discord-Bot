import type { GuildMember } from 'discord.js';
import type { EventTrigger } from 'src/types';

import { BaseRoles } from 'src/models/base-roles';
import { error } from 'src/logging';

const NewMemberEvent: EventTrigger = ['guildMemberAdd', async (member: GuildMember): Promise<void> => {
  const roles = await BaseRoles.findAll({
    where: {
      guild_id: member.guild.id,
    },
    attributes: ['role_id', 'delay'],
  });
  try {
    roles.forEach(role => {
      setTimeout(() => {
        member.roles.add(role.role_id);
      }, role.delay || 0);
    });
  } catch (err) {
    // likely to happen if the role trying to be added is higher than the bot's role
    error(err);
  }
}];

export default [
  NewMemberEvent,
];
