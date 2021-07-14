import type { ClientType, CommandRunMethod, Mutable, CommandOperationHandler } from 'src/types';
import type { Reminder } from 'models/reminders';

import { parseDate } from 'chrono-node';
import { Command } from 'discord.js-commando';
import { TextChannel, NewsChannel } from 'discord.js';
import { getModels } from 'src/models';
import { handleError, userHasPermission, getChannel } from 'src/discord-utils';
import { getTimezoneOffsetFromAbbreviation, getDateString, parseDelay } from 'src/utils';
import { CHANNEL_ARG_REGEX, MIN_REMINDER_INTERVAL } from 'src/constants';
import { setNewReminder, removeReminder } from 'src/jobs/reminders';

const LIST_OPERATIONS = ['list', 'ls', 'l'] as const;
const ADD_OPERATIONS = ['add', 'a', 'create', 'set', 's'] as const;
const REMOVE_OPERATIONS = ['remove', 'rm', 'delete', 'del', 'd'] as const;
const OPERATIONS = [
  ...LIST_OPERATIONS,
  ...ADD_OPERATIONS,
  ...REMOVE_OPERATIONS,
] as const;

const model = getModels().reminders;

type Args = string[];

interface AddArgs {
  time: number;
  message?: string;
  channel: TextChannel | NewsChannel,
  interval?: number;
}

interface RemoveArgs {
  id: string;
}

interface ListArgs {
  channel: TextChannel | NewsChannel;
}

type AddOperationHandler = CommandOperationHandler<AddArgs>;
type RemoveOperationHandler = CommandOperationHandler<RemoveArgs>;
type ListOperationHandler = CommandOperationHandler<ListArgs>;

/**
 * !reminders add <time> [timeZone] [message] [channel] [interval]
 * !reminders remove <id>
 * !reminders list [channel]
 */
export default class RemindersCommand extends Command {
  constructor(client: ClientType) {
    super(client, {
      name: 'reminders',
      aliases: ['reminder', 'timer', 'timers'],
      group: 'utilities',
      memberName: 'reminders',
      description:
        'Creates a reminder/timer (they are the same thing).\n'
        + 'You may optionally provide a description, time zone, channel and interval.\n'
        + 'If a time zone is not provided, EST will be used by default. The time zone provided must be an abbreviation.\n'
        + 'If a channel is not provided, the message will be sent in the channel used to invoke this command.\n'
        + '!reminders add <time> [timeZone] [message] [channel] [interval]\n'
        + '!reminders remove <id>\n'
        + '!reminders list [channel]',
      examples: [
        '!reminders create "Dec 25th" "It\'s Christmas!" #holidays "365 days"',
        '!timer set "5 mins"',
        '!timer create "Saturday at 8pm" "EST" "Something is happending."',
        '!reminders delete "some-id"',
        '!reminders list',
        '!reminders list #other',
      ],
      format: 'add <time> [timeZone] [message] [channel] [interval]',
      argsType: 'multiple',
      argsCount: 6,
      argsPromptLimit: 0,
    });
  }

  static handleAdd: AddOperationHandler = async (msg, { time, message, channel, interval }) => {
    if (!userHasPermission(channel, msg.author, ['SEND_MESSAGES'])) {
      return msg.reply(`You do not have access to send messages in <#${channel.id}>`);
    }
    const guildId = msg.guild?.id;
    const reminder: Reminder = await model.create({
      guild_id: guildId,
      channel_id: channel.id,
      owner_id: msg.author.id,
      time,
      message,
      interval,
    });
    setNewReminder(reminder);
    return msg.say(`Reminder (ID: ${reminder.id}) created for ${getDateString(time)} in channel <#${channel.id}>`);
  }

  static handleRemove: RemoveOperationHandler = async (msg, { id }) => {
    const reminder: Reminder | null = await model.findOne({
      where: {
        id,
      },
    });
    if (!reminder) {
      return msg.reply('Reminder does not exist!');
    }
    const channel = await getChannel(reminder.channel_id);
    if (!channel) {
      await removeReminder(id);
      return msg.say('Reminder deleted.');
    }
    if (reminder.owner_id !== msg.author.id && !userHasPermission(channel, msg.author, ['MANAGE_MESSAGES'])) {
      return msg.reply('You cannot delete a reminder that you don\'t own.');
    }
    if (!userHasPermission(channel, msg.author, ['SEND_MESSAGES'])) {
      return msg.reply(`You do not have access to send messages in <#${channel.id}>`);
    }
    await removeReminder(id);
    return msg.say('Reminder deleted.');
  }

  static handleList: ListOperationHandler = async (msg, { channel }) => {
    if (!userHasPermission(channel, msg.author, ['VIEW_CHANNEL'])) {
      return msg.reply('You do not have permission to view that channel!');
    }
    const guildId = msg.guild?.id ?? null;
    const reminders: Reminder[] = await model.findAll({
      where: {
        guild_id: guildId,
        channel_id: channel.id,
      },
    });
    if (!reminders.length) return msg.say(`There are no reminders for <#${channel.id}>.`);

    const response = reminders.reduce((acc, reminder) => {
      return (
        // eslint-disable-next-line prefer-template
        `${acc}\n`
        + `ID: ${reminder.id}\n`
        + `Time: ${getDateString(reminder.time)}\n`
        + (reminder.interval ? `Interval: ${reminder.interval} seconds\n` : '')
        + (reminder.message ? `Message: ${reminder.message}` : '')
        + '\n'
      );
    }, `__Reminders for <#${channel.id}>__\n`);

    return msg.say(response);
  }

  run: CommandRunMethod<Args> = async (msg, args) => {
    if (args.length === 0) {
      return msg.reply('You must specify an operation: add/remove/list.');
    }
    const [operation, timeOrIdOrChannel, ...restArgs] = args;

    // @ts-expect-error These TS errors are useless. Same goes for rest of ts-expect-errors below.
    if (!timeOrIdOrChannel && ADD_OPERATIONS.includes(operation)) return msg.reply('You must specify a time for the reminder.');
    // @ts-expect-error
    if (!timeOrIdOrChannel && REMOVE_OPERATIONS.includes(operation)) return msg.reply('You must specify a reminder ID.');

    try {
      // @ts-expect-error
      if (ADD_OPERATIONS.includes(operation)) {
        let channel: TextChannel | NewsChannel | undefined;
        let interval: number | undefined;
        let message: string | undefined;
        const potentialTimeZone = restArgs[0];
        const foundTzOffset = getTimezoneOffsetFromAbbreviation(potentialTimeZone || '');
        if (foundTzOffset) restArgs.shift();
        const tzOffset = foundTzOffset
          || getTimezoneOffsetFromAbbreviation('EST', 'America/Toronto');
        let date = parseDate(timeOrIdOrChannel, {
          timezone: tzOffset ?? undefined,
        });
        if (!date) {
          try {
            date = new Date(Date.now() + parseDelay(timeOrIdOrChannel));
          } catch (err) {
            return msg.reply('Could not parse reminder time');
          }
        }
        for (let i = 0; i < restArgs.length; i++) {
          const arg = restArgs[i];
          if (!message && !CHANNEL_ARG_REGEX.test(arg)) {
            message = arg;
          }
          if (!channel && CHANNEL_ARG_REGEX.test(arg)) {
            const resolvedChannel = await getChannel(arg);
            if (resolvedChannel && resolvedChannel.isText()) {
              channel = resolvedChannel as TextChannel;
            }
          }
          try {
            if (!interval) {
              interval = Math.floor(parseDelay(arg) / 1000);
            }
          } catch (err) {
            // Do nothing
          }
        }
        if (interval && interval < MIN_REMINDER_INTERVAL) {
          await msg.reply(`Minimum interval is ${MIN_REMINDER_INTERVAL} seconds.`);
          return null;
        }
        await RemindersCommand.handleAdd(msg, {
          time: Math.floor(date.getTime() / 1000),
          message,
          channel: channel ?? msg.channel as TextChannel | NewsChannel,
          interval,
        });
        return null;
      }
      // @ts-expect-error
      if (REMOVE_OPERATIONS.includes(operation)) {
        await RemindersCommand.handleRemove(msg, {
          id: timeOrIdOrChannel,
        });
        return null;
      }
      // @ts-expect-error
      if (LIST_OPERATIONS.includes(operation)) {
        let channel = msg.channel as TextChannel | NewsChannel;
        if (timeOrIdOrChannel) {
          const resolvedChannel = await getChannel(timeOrIdOrChannel);
          if (resolvedChannel && resolvedChannel.isText()) {
            channel = resolvedChannel as TextChannel;
          }
        }
        await RemindersCommand.handleList(msg, { channel });
        return null;
      }
    } catch (err) {
      return handleError(err, msg);
    }

    return msg.reply('What?');
  }
}
