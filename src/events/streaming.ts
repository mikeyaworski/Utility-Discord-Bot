import { Presence, Collection, Role, ActivityType } from 'discord.js';
import type { EventTrigger } from 'src/types';

import { StreamerRollbackRoles } from 'src/models/streamer-rollback-roles';
import { StreamerRules } from 'src/models/streamer-rules';
import { log } from 'src/logging';

function getNewRoles(existingRoles: Collection<string, Role>, rules: (StreamerRules | StreamerRollbackRoles)[]): string[] {
  const rolesToAdd = rules.filter(rule => rule.add).map(rule => rule.role_id);
  const rolesToRemove = rules.filter(rule => !rule.add).map(rule => rule.role_id);
  return existingRoles
    .map(role => role.id)
    .filter(roleId => !rolesToRemove.includes(roleId))
    .concat(rolesToAdd);
}

const StreamingEvent: EventTrigger = ['presenceUpdate', async (oldPresence: Presence, newPresence: Presence): Promise<void> => {
  const wasStreaming = oldPresence?.activities.some(activity => activity.type === ActivityType.Streaming);
  const isStreaming = newPresence?.activities.some(activity => activity.type === ActivityType.Streaming);
  // useful for debugging
  // const wasStreaming = oldPresence?.clientStatus.desktop === 'dnd';
  // const isStreaming = newPresence?.clientStatus.desktop === 'dnd';

  if (wasStreaming === isStreaming) return;

  const { guild } = newPresence;
  const guildId = guild!.id;
  const member = await guild!.members.fetch({
    user: newPresence.member!.id,
    force: true,
  });

  if (isStreaming) {
    // they've started streaming
    log('Now streaming:', member.user.username);
    log('Member has roles:', member.roles.cache.map(role => role.id).toString());
    const rules = await StreamerRules.findAll({
      where: {
        guild_id: guildId,
      },
      attributes: ['role_id', 'add'],
    });
    const existingRoles = member.roles.cache;
    const newRoles = getNewRoles(existingRoles, rules);
    await member.roles.set(newRoles, 'Roles added/removed once stream was started.');
    rules.forEach(async ({ role_id: roleId, add }) => {
      if (add !== existingRoles.has(roleId)) {
        await StreamerRollbackRoles.destroy({
          where: {
            guild_id: guildId,
            role_id: roleId,
            user_id: member.id,
          },
        });
        await StreamerRollbackRoles.create({
          guild_id: guildId,
          role_id: roleId,
          user_id: member.id,
          add: !add,
        });
        log(`Rollback role ${roleId} added for member ${member.user.username}`);
      }
    });
  }

  if (wasStreaming) {
    // they've stopped streaming
    log('Stopped streaming:', member.user.username);
    log('Member has roles:', member.roles.cache.map(role => role.id).toString());
    const rollbacksQuery = {
      where: {
        guild_id: guildId,
        user_id: member.id,
      },
      attributes: ['role_id', 'add'],
    };
    const rollbacks = await StreamerRollbackRoles.findAll(rollbacksQuery);
    // Manually calculate the new roles and use `roles.set` instead of simply using `roles.add` and `roles.remove`
    // because the Discord API has super weird behavior where the API calls will clobber one another.
    const newRoles = getNewRoles(member.roles.cache, rollbacks);
    log(`New roles set for member ${member.user.username}:`, newRoles.toString());
    await member.roles.set(newRoles, 'Roles rolled back after stream was stopped.');
    await StreamerRollbackRoles.destroy(rollbacksQuery);
  }
}];

export default [StreamingEvent];
