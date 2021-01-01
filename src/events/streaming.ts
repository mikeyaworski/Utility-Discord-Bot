import type { Presence } from 'discord.js';
import type { EventTrigger } from 'src/types';

import { getModels } from 'src/models';
import { log } from 'src/logging';

const StreamingEvent: EventTrigger = ['presenceUpdate', async (oldPresence: Presence, newPresence: Presence): Promise<void> => {
  const wasStreaming = oldPresence?.activities.some(activity => activity.type === 'STREAMING');
  const isStreaming = newPresence?.activities.some(activity => activity.type === 'STREAMING');
  // useful for debugging
  // const wasStreaming = oldPresence?.clientStatus.desktop === 'dnd';
  // const isStreaming = newPresence?.clientStatus.desktop === 'dnd';

  if (wasStreaming === isStreaming) return;

  const { guild } = newPresence;
  const member = await guild.members.fetch({
    user: newPresence.member.id,
    force: true,
  });

  if (isStreaming) {
    // they've started streaming
    log('Now streaming:', member.user.username);
    log('Member has roles:', member.roles.cache.array().map(role => role.id).toString());
    const rules = await getModels().streamer_rules.findAll({
      where: {
        guild_id: guild.id,
      },
      attributes: ['role_id', 'add'],
    });
    rules.forEach(async ({ role_id: roleId, add }) => {
      if (add !== member.roles.cache.has(roleId)) {
        if (!add) await member.roles.remove(roleId);
        else await member.roles.add(roleId);
        await getModels().streamer_rollback_roles.destroy({
          where: {
            guild_id: guild.id,
            role_id: roleId,
            user_id: member.id,
          },
        });
        await getModels().streamer_rollback_roles.create({
          guild_id: guild.id,
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
    log('Member has roles:', member.roles.cache.array().map(role => role.id).toString());
    const rollbacksQuery = {
      where: {
        guild_id: guild.id,
        user_id: member.id,
      },
      attributes: ['role_id', 'add'],
    };
    const rollbacks: {
      role_id: string;
      add: boolean;
    }[] = await getModels().streamer_rollback_roles.findAll(rollbacksQuery);
    const rolesToAdd = rollbacks.filter(rollback => rollback.add).map(rollback => rollback.role_id);
    const rolesToRemove = rollbacks.filter(rollback => !rollback.add).map(rollback => rollback.role_id);
    log('Adding roles:', rolesToAdd.toString());
    log('Removing roles:', rolesToRemove.toString());
    await Promise.all([member.roles.add(rolesToAdd), member.roles.remove(rolesToRemove)]);
    await getModels().streamer_rollback_roles.destroy(rollbacksQuery);
  }
}];

export default [StreamingEvent];
