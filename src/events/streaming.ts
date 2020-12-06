import type { Presence } from 'discord.js';
import type { EventTrigger } from 'src/types';

const StreamingEvent: EventTrigger = ['presenceUpdate', (oldPresence: Presence, newPresence: Presence): void => {
  const wasStreaming = oldPresence?.activities.some(activity => activity.type === 'STREAMING');
  const isStreaming = newPresence?.activities.some(activity => activity.type === 'STREAMING');

  if (wasStreaming === isStreaming) return;

  const { member } = newPresence;

  if (!wasStreaming && isStreaming) {
    // they've started streaming
    // TODO
    console.log('Now streaming:', member.user.username); // TODO: remove
  }

  if (!isStreaming && wasStreaming) {
    // they've stopped streaming
    // TODO
    console.log('Stopped streaming:', member.user.username); // TODO: remove
  }
}];

export default StreamingEvent;
