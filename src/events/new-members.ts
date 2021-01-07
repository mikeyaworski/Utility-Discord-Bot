import type { GuildMember } from 'discord.js';
import type { EventTrigger } from 'src/types';

import { getModels } from 'src/models';
import { error } from 'src/logging';

const NewMemberEvent: EventTrigger = ['guildMemberAdd', async (member: GuildMember): Promise<void> => {
  const roles: {
    role_id: string;
    delay: number | null;
  }[] = await getModels().base_roles.findAll({
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
