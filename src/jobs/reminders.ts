import type { Reminder } from 'src/models/reminders';

import { CronJob } from 'cron';
import { Reminders } from 'src/models/reminders';
import { log } from 'src/logging';
import { getChannel, isText } from 'src/discord-utils';
import { MIN_REMINDER_INTERVAL } from 'src/constants';

type Timeouts = {
  [reminderId: string]: CronJob;
};
const timeouts: Timeouts = {};

export function getNextInvocation(id: string): number | undefined {
  const job = timeouts[id];
  if (!job) return undefined;
  return job.nextDate().unix() * 1000;
}

export async function removeReminder(id: string): Promise<void> {
  await Reminders.destroy({ where: { id } });
  if (timeouts[id]) {
    timeouts[id].stop();
    delete timeouts[id];
  }
}

async function handleReminder(reminder: Reminder, destroy: boolean) {
  const channel = await getChannel(reminder.channel_id);
  if (!channel) {
    log(`Could not find channel ${reminder.channel_id} in guild ${reminder.guild_id} for reminder ${reminder.id}`);
    await removeReminder(reminder.id);
    return;
  }
  if (isText(channel)) {
    await channel.send(reminder.message || 'Timer is up!');
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
  // Add a 1 second buffer so we don't schedule something in the past for edge cases.
  // The CronJob has problems where create a job at precisely the same time it's scheduled for,
  // then the job will break and never fire.
  // This 1 second buffer is tolerable since reminders cannot be scheduled more frequently than this.
  const buffer = 1000;

  const timeDiff = time * 1000 - Date.now();
  // Time is in the past and there is no interval, so execute immediately
  if (timeDiff < 0 && !interval) {
    return null;
  }
  // Time is in the past, but there is an interval, so add intervals until we reach some time in the future
  if (timeDiff < 0 && interval) {
    const numIntervals = Math.ceil(Math.abs(timeDiff / interval / 1000));
    return new Date(
      time * 1000 + numIntervals * interval * 1000 + buffer,
    );
  }
  // Initial time is in the future, so return that date
  return new Date(time * 1000 + buffer);
}

function hasReminderExpired(reminder: Reminder): boolean {
  if (!reminder.interval) {
    // A reminder without an interval cannot expire (end_time and max_occurrences have no effect)
    return false;
  }
  // Use MIN_REMINDER_INTERVAL as a buffer since messages may be slightly delayed,
  // and since the interval length has that minimum,
  // we know that another reminder will not be invoked during the buffer
  const bufferTime = (MIN_REMINDER_INTERVAL / 2) * 1000;
  const endDate = reminder.end_time
    ? new Date(reminder.end_time * 1000)
    : reminder.max_occurrences
      ? new Date((reminder.time + reminder.interval * (reminder.max_occurrences - 1)) * 1000 + bufferTime)
      : null;
  const nextInvocationDate = getNextInvocationDate(reminder.time, reminder.interval);
  if (endDate == null) return false;
  if (nextInvocationDate == null) return true; // This can't actually happen
  return endDate < nextInvocationDate;
}

export function setReminder(reminder: Reminder): void {
  if (timeouts[reminder.id]) timeouts[reminder.id].stop();

  if (hasReminderExpired(reminder)) {
    removeReminder(reminder.id);
    return;
  }

  async function handleFirst() {
    handleReminder(reminder, !reminder.interval);
    if (reminder.interval) {
      (function interval() {
        const nextIntervalInvocationDate = getNextInvocationDate(reminder.time, reminder.interval);
        if (hasReminderExpired(reminder) || !nextIntervalInvocationDate) {
          removeReminder(reminder.id);
        } else {
          timeouts[reminder.id] = new CronJob({
            cronTime: nextIntervalInvocationDate,
            start: true,
            unrefTimeout: true,
            onTick: () => {
              handleReminder(reminder, false);
              interval();
            },
          });
        }
      }());
    }
  }

  const nextInvocationDate = getNextInvocationDate(reminder.time, reminder.interval);
  if (nextInvocationDate == null) {
    handleFirst();
  } else {
    timeouts[reminder.id] = new CronJob({
      cronTime: nextInvocationDate,
      start: true,
      unrefTimeout: true,
      onTick: handleFirst,
    });
  }
}

async function loadReminders(): Promise<void> {
  const reminders = await Reminders.findAll();
  reminders.forEach(reminder => setReminder(reminder));
}

export default [loadReminders];
