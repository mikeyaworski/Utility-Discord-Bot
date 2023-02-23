import cookie from 'cookie';

import { getDmChannel } from 'src/api/routes/dms';
import { SocketEvent } from 'src/types/sockets';
import { error } from 'src/logging';
import { getUserFromAuthToken } from 'src/api/middlewares/auth';
import { client } from 'src/client';
import { isGuildChannel, userCanManageChannel, userCanViewChannel } from 'src/discord-utils';
import { socketIoServer } from 'src/api';
import { Reminder } from 'src/models/reminders';

export function emit(event: SocketEvent, rooms?: string[]): void {
  let broadcastOperator: ReturnType<typeof socketIoServer['to']> | undefined;
  rooms?.forEach(room => {
    broadcastOperator = broadcastOperator?.to(room) || socketIoServer.to(room);
  });
  if (broadcastOperator) {
    broadcastOperator.emit(event.type, event.data);
  } else if (!rooms) {
    socketIoServer.emit(event.type, event.data);
  }
}

export function getManageReminderRooms(reminder: Reminder): string[] {
  const baseRooms = [reminder.owner_id, reminder.channel_id];
  if (!reminder.guild_id) return baseRooms;
  return baseRooms.concat(`${reminder.guild_id}_${reminder.channel_id}_MANAGE`);
}

socketIoServer.on('connection', async socket => {
  const cookies = cookie.parse(socket.handshake.headers.cookie || '');
  const authCookie = cookies.auth;
  if (!authCookie) return;
  try {
    const user = await getUserFromAuthToken(authCookie);
    socket.join(user.id);
    getDmChannel(user.id).then(dmChannel => {
      if (dmChannel) socket.join(dmChannel.id);
    }).catch(error);
    client.channels.cache.forEach(async channel => {
      if (!isGuildChannel(channel)) return;
      userCanViewChannel({ userId: user.id, channelId: channel.id }).then(canViewChannel => {
        if (canViewChannel) socket.join(`${channel.guildId}_${channel.id}_VIEW`);
      });
      userCanManageChannel({ userId: user.id, channelId: channel.id }).then(canManageChannel => {
        if (canManageChannel) socket.join(`${channel.guildId}_${channel.id}_MANAGE`);
      });
    });
  } catch (err) {
    error('Error during socket connection', err);
  }
});
