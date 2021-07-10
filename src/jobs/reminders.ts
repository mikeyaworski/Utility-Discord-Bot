import type { Reminder } from 'src/models/reminders';

import { getModels } from 'src/models';
import { log } from 'src/logging';
import { getChannel } from 'src/discord-utils';

const model = getModels().reminders;

type Timeouts = {
  [reminderId: string]: NodeJS.Timeout;
};

const timeouts: Timeouts = {};
const intervals: Timeouts = {};

export async function removeReminder(id: string): Promise<void> {
  await model.destroy({ where: { id } });
  if (timeouts[id]) clearTimeout(timeouts[id]);
  if (intervals[id]) clearInterval(intervals[id]);
}

async function handleReminder(reminder: Reminder, destroy: boolean) {
  const channel = await getChannel(reminder.channel_id);
  if (!channel) {
    log(`Could not find channel ${reminder.channel_id} in guild ${reminder.guild_id} for reminder ${reminder.id}`);
  }
  if (channel?.isText()) {
    await channel!.send(reminder.message || 'Timer is up!');
  }
  if (destroy) {
    await removeReminder(reminder.id);
  }
}

function getNextInvocationTime(time: number, interval: number | null): number {
  let timeUntilInvocation = time * 1000 - Date.now();
  if (timeUntilInvocation < 0 && interval) {
    const numIntervals = Math.ceil(Math.abs(timeUntilInvocation / interval / 1000));
    timeUntilInvocation += numIntervals * interval * 1000;
  }
  return timeUntilInvocation;
}

export function setNewReminder(reminder: Reminder): void {
  const timeUntilInvocation = getNextInvocationTime(reminder.time, reminder.interval);
  timeouts[reminder.id] = setTimeout(async () => {
    // Don't handle missed reminders if it's on an interval
    if (timeUntilInvocation >= 0 || !reminder.interval) {
      handleReminder(reminder, !reminder.interval);
    }
    if (reminder.interval) {
      intervals[reminder.id] = setInterval(() => {
        handleReminder(reminder, false);
      }, reminder.interval * 1000);
    }
  }, Math.max(0, timeUntilInvocation));
}

async function loadReminders(): Promise<void> {
  const reminders: Reminder[] = await model.findAll();
  reminders.forEach(reminder => setNewReminder(reminder));
}

export default [loadReminders];
