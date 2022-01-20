import type { Reminder } from 'src/models/reminders';

import { CronJob } from 'cron';
import { getModels } from 'src/models';
import { log } from 'src/logging';
import { getChannel } from 'src/discord-utils';

const model = getModels().reminders;

type Timeouts = {
  [reminderId: string]: CronJob;
};
const timeouts: Timeouts = {};

export async function removeReminder(id: string): Promise<void> {
  await model.destroy({ where: { id } });
  if (timeouts[id]) {
    timeouts[id].stop();
    delete timeouts[id];
  }
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

/**
 * Returns a Date if the invocation is at some point in the future,
 * or null if it should be executed immediately.
 */
function getNextInvocationDate(time: number, interval: number | null): Date | null {
  const timeDiff = time * 1000 - Date.now();
  // Time is in the past and there is no interval, so execute immediately
  if (timeDiff < 0 && !interval) {
    return null;
  }
  // Time is in the past but there is an interval, so add intervals until we reach some time in the future
  if (timeDiff < 0 && interval) {
    const numIntervals = Math.ceil(Math.abs(timeDiff / interval / 1000));
    return new Date(
      time * 1000 + numIntervals * interval * 1000,
    );
  }
  // Initial time is in the future, so return that date
  return new Date(time * 1000);
}

export function setReminder(reminder: Reminder): void {
  const nextInvocationDate = getNextInvocationDate(reminder.time, reminder.interval);
  if (timeouts[reminder.id]) timeouts[reminder.id].stop();
  timeouts[reminder.id] = new CronJob({
    cronTime: nextInvocationDate || new Date(),
    start: true,
    unrefTimeout: true,
    onTick: () => {
      if (nextInvocationDate || !reminder.interval) {
        handleReminder(reminder, !reminder.interval);
      }
      if (reminder.interval) {
        // This recursive interval approach can certainly lead to time drifting.
        // E.g. If the timing is late for whatever reason, all subsequent jobs in the interval will be at least as late.
        // This lateness is cumulative and will never reset.
        // But the server gets torn down and recreated at least once a day in practice,
        // so this is fine for the use case.
        (function interval() {
          timeouts[reminder.id] = new CronJob({
            cronTime: new Date(Date.now() + reminder.interval * 1000),
            start: true,
            unrefTimeout: true,
            onTick: () => {
              handleReminder(reminder, false);
              interval();
            },
          });
        }());
      }
    },
  });
}

async function loadReminders(): Promise<void> {
  const reminders: Reminder[] = await model.findAll();
  reminders.forEach(reminder => setReminder(reminder));
}

export default [loadReminders];
