import type { AnyInteraction, AnyMapping, Command, CommandOrModalRunMethod, EmbedFields, IntentionalAny } from 'src/types';
import type { Reminder } from 'models/reminders';
import type { SlashCommandChannelOption, SlashCommandStringOption, SlashCommandIntegerOption } from '@discordjs/builders';

import { EmbedBuilder } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { parseDate } from 'chrono-node';
import { Op } from 'sequelize';

import { client } from 'src/client';
import { Reminders } from 'src/models/reminders';
import {
  usersHaveChannelPermission,
  getChannel,
  checkMessageErrors,
  findOptionalChannel,
  handleError,
  replyWithEmbeds,
  parseInput,
  getSubcommand,
  isText,
} from 'src/discord-utils';
import { getTimezoneOffsetFromFilter, getDateString, parseDelay, filterOutFalsy, humanizeDuration } from 'src/utils';
import { MIN_REMINDER_INTERVAL } from 'src/constants';
import { setReminder, removeReminder, getNextInvocation } from 'src/jobs/reminders';
import { error } from 'src/logging';

const timeOption = ({ required }: { required: boolean }) => (option: SlashCommandStringOption) => {
  return option
    .setName('times')
    .setDescription('The time(s) of the reminder. Examples: "2 hours" or "December 5th at 5pm". Can be comma-separated.')
    .setRequired(required);
};
const timeZoneOption = (option: SlashCommandStringOption) => {
  return option
    .setName('time_zone')
    .setDescription('Time zone name abbreviation. Examples: "America/New_York" or "EST". Defaults to America/Toronto.')
    .setRequired(false);
};
const messageOption = (option: SlashCommandStringOption) => {
  return option
    .setName('message')
    .setDescription('The message of the reminder. Defaults to "Timer is up!" if nothing provided.')
    .setRequired(false);
};
const intervalOption = (option: SlashCommandStringOption) => {
  return option
    .setName('interval')
    .setDescription('Interval to send reminder on repeat. Examples: "24 hours" or "8640000"')
    .setRequired(false);
};
const channelOption = (option: SlashCommandChannelOption) => {
  return option
    .setName('channel')
    .setDescription('The channel to send the message in. Defaults to the current one if not provided.')
    .setRequired(false);
};
const endTimeOption = (option: SlashCommandStringOption) => {
  return option
    .setName('end_time')
    .setDescription('The last possible time that the reminder is allowed to be run during an interval.')
    .setRequired(false);
};
const maxOccurrencesOption = (option: SlashCommandIntegerOption) => {
  return option
    .setName('max_occurrences')
    .setDescription('The number of times to run during interval.')
    .setRequired(false);
};

const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('reminders')
  .setDescription('Message reminders.');
commandBuilder.addSubcommand(subcommand => {
  subcommand
    .setName('create')
    .setDescription('Create a reminder or timer (timer is if there is no message).')
    .addStringOption(timeOption({ required: true }))
    .addStringOption(messageOption)
    .addStringOption(intervalOption)
    .addStringOption(endTimeOption)
    .addChannelOption(channelOption)
    .addIntegerOption(maxOccurrencesOption)
    .addStringOption(timeZoneOption);
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand
    .setName('edit')
    .setDescription('Edit an existing reminder by its ID.')
    .addStringOption(option => {
      return option
        .setName('reminder_id')
        .setDescription('The ID of the reminder (use "/reminders list" to find it).')
        .setRequired(true);
    })
    .addStringOption(timeOption({ required: false }))
    .addStringOption(messageOption)
    .addStringOption(intervalOption)
    .addStringOption(endTimeOption)
    .addChannelOption(channelOption)
    .addIntegerOption(maxOccurrencesOption)
    .addStringOption(timeZoneOption);
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand
    .setName('delete')
    .setDescription('Delete a reminder by its ID.')
    .addStringOption(option => {
      return option
        .setName('reminder_ids')
        .setDescription('The ID(s) of the reminder (use "/reminders list" to find it). Can be comma-separated.')
        .setRequired(true);
    });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('list')
    .setDescription('List upcoming reminders.')
    .addStringOption(option => {
      return option
        .setName('filter')
        .setDescription('Filter results by message content.')
        .setRequired(false);
    })
    .addChannelOption(option => {
      return option
        .setName('channel')
        .setDescription('The channel to list reminders for.')
        .setRequired(false);
    });
  return subcommand;
});

function getReminderEmbed(reminder: Reminder, options: {
  showChannel?: boolean,
} = {}): EmbedBuilder {
  const { showChannel = true } = options;
  const isTimer = !reminder.message;
  const fields: EmbedFields = [];
  if (reminder.message) {
    fields.push({
      name: 'Message',
      value: reminder.message,
      inline: false,
    });
  }
  const remainingTime = (reminder.time * 1000) - Date.now();
  const timeString = remainingTime > 0
    ? `${getDateString(reminder.time)}\n(${humanizeDuration(remainingTime)})`
    : getDateString(reminder.time);
  fields.push({
    name: 'Time',
    value: timeString,
    inline: true,
  });
  if (reminder.interval) {
    fields.push({
      name: 'Interval',
      value: humanizeDuration(reminder.interval * 1000),
      inline: true,
    });
    if (reminder.max_occurrences && !reminder.end_time) {
      fields.push({
        name: 'Max Occurrences',
        value: String(reminder.max_occurrences),
        inline: true,
      });
    }
    if (reminder.end_time) {
      const remainingTimeToEnd = (reminder.end_time * 1000) - Date.now();
      fields.push({
        name: 'End Time',
        value: `${getDateString(reminder.end_time)}\n(${humanizeDuration(remainingTimeToEnd)})`,
        inline: true,
      });
    }
    try {
      const nextInvocation = getNextInvocation(reminder.id);
      if (nextInvocation) {
        const remainingTime = nextInvocation - Date.now();
        if (remainingTime > 0) {
          fields.push({
            name: 'Next Run',
            value: humanizeDuration(remainingTime),
            inline: true,
          });
        }
      }
    } catch (err) {
      // An error can sometimes get thrown depending on race conditions with CronJob times in the past
      error(err);
    }
  }
  if (showChannel) {
    fields.push({
      name: 'Channel',
      value: `<#${reminder.channel_id}>`,
      inline: false,
    });
  }
  return new EmbedBuilder({
    title: isTimer ? 'Timer' : 'Reminder',
    fields,
    footer: {
      text: reminder.id,
    },
  });
}

function parseTimesArg(timesArg: string | null, timeZone: string | null): number[] {
  if (!timesArg) return [];
  const tzOffset = getTimezoneOffsetFromFilter(timeZone || '') ?? getTimezoneOffsetFromFilter('America/Toronto');
  const times = filterOutFalsy(timesArg.split(/,\s*/).map(timeArg => {
    let date = parseDate(timeArg, {
      timezone: tzOffset ?? undefined,
    });
    if (!date) {
      try {
        date = new Date(Date.now() + parseDelay(timeArg));
      } catch (err) {
        throw new Error('Could not parse reminder time!');
      }
    }
    return Math.floor(date.getTime() / 1000);
  }));
  if (!times.length) throw new Error('Could not parse reminder time!');
  return times;
}

async function parseReminderOptions({
  interaction,
  inputs,
  editing,
}: {
  inputs: AnyMapping,
  interaction: AnyInteraction,
  editing: boolean
}) {
  const time = inputs.times; // Optional for editing
  const endTime = inputs.end_time;
  const maxOccurrences = inputs.max_occurrences;
  const timeZone = inputs.time_zone;
  const { message } = inputs;
  const channelArg = inputs.channel;
  const intervalArg = inputs.interval;

  const fetchResults = await findOptionalChannel(interaction, channelArg);
  const { author } = fetchResults;

  // Don't fetch the channel if the channelArg was not provided and they're editing an existing reminder
  const channel = (editing && !channelArg) ? null : fetchResults.channel;

  if (channelArg && !channel) throw new Error('Channel not found!');
  if (!author) throw new Error('Could not find who is invoking this command.');

  let interval: number | null;
  try {
    interval = intervalArg ? Math.floor(parseDelay(intervalArg) / 1000) : null;
  } catch (err) {
    throw new Error('Could not parse interval!');
  }
  if (interval && interval < MIN_REMINDER_INTERVAL) {
    throw new Error(`Minimum interval is ${MIN_REMINDER_INTERVAL} seconds.`);
  }

  const times = parseTimesArg(time, timeZone);

  return {
    message,
    times,
    endTimes: parseTimesArg(endTime, timeZone),
    maxOccurrences,
    interval,
    channel,
    author,
  };
}

export async function handleUpsert(
  interaction: AnyInteraction,
  // used by TimerCommand since it has a different set of options that need to be parsed differently by our util
  slashCommandData?: Command['slashCommandData'],
): Promise<IntentionalAny> {
  const inputs = await parseInput({
    slashCommandData: slashCommandData || commandBuilder,
    interaction,
  });
  const id: string | null = inputs.reminder_id; // Not present in creation
  const editing = Boolean(id);
  try {
    const {
      message,
      interval,
      times,
      endTimes,
      maxOccurrences,
      channel,
      author,
    } = await parseReminderOptions({ interaction, inputs, editing });

    // Throws if there is an issue
    checkMessageErrors(interaction, {
      channel,
      author,
      message,
    });

    const existingReminder = id ? await Reminders.findByPk(id) : null;
    if (id && !existingReminder) return interaction.editReply('Reminder does not exist!');

    if (existingReminder
      && channel
      && existingReminder.owner_id !== interaction.user.id
      && !usersHaveChannelPermission({ channel, users: interaction.user, permissions: 'ManageMessages' })
    ) {
      return interaction.editReply('You cannot edit a reminder that you don\'t own.');
    }

    const timeIsInPast = times.some(time => time < Date.now() / 1000);
    if (timeIsInPast && !interval && !existingReminder?.interval) {
      return interaction.editReply('You cannot create a reminder in the past.');
    }

    if (existingReminder && !times.length) times.push(existingReminder.time);

    interface TimePair {
      time: number,
      endTime?: number | null,
    }
    const timePairs: TimePair[] = times.map((time, i) => {
      if (endTimes[i] != null) return { time, endTime: endTimes[i] };
      if (endTimes.length) return { time, endTime: endTimes[endTimes.length - 1] };
      return { time, endTime: null };
    });
    const endTimeEarlier = timePairs.some(({ time, endTime }) => endTime != null && endTime < time);
    if (endTimeEarlier) {
      return interaction.editReply('The end time must be later than the initial time.');
    }

    const reminderPayloads: Partial<Reminder>[] = timePairs.map(({ time, endTime }) => {
      const reminderPayload: Partial<Reminder> = {
        guild_id: existingReminder?.guild_id,
        channel_id: existingReminder?.channel_id,
        owner_id: existingReminder?.owner_id,
        time: existingReminder?.time,
        end_time: existingReminder?.end_time,
        max_occurrences: existingReminder?.max_occurrences,
        message: existingReminder?.message,
        interval: existingReminder?.interval,
      };
      if (interaction.guild?.id) reminderPayload.guild_id = interaction.guild.id;
      if (channel?.id) reminderPayload.channel_id = channel.id;
      if (author.id) reminderPayload.owner_id = author.id;
      if (time) reminderPayload.time = time;
      if (endTime) reminderPayload.end_time = endTime;
      if (maxOccurrences) reminderPayload.max_occurrences = maxOccurrences;
      if (message) reminderPayload.message = message;
      if (interval) reminderPayload.interval = interval;
      return reminderPayload;
    });
    if (id) reminderPayloads[0].id = id;

    const reminders = await Promise.all(reminderPayloads.map(async reminderPayload => {
      const [reminder] = await Reminders.upsert(reminderPayload as Reminder, { returning: true });
      setReminder(reminder);
      return reminder;
    }));
    const content = editing ? (
      reminders.length > 1 ? 'Reminders updated:' : 'Reminder updated:'
    ) : (
      reminders.length > 1 ? 'Reminders created:' : 'Reminder created:'
    );
    const embeds = reminders.map(reminder => getReminderEmbed(reminder, { showChannel: interaction.inGuild() }));
    return replyWithEmbeds({
      interaction,
      embeds,
      messageArgs: {
        content,
      },
      ephemeral: true,
    });
  } catch (err) {
    return handleError(err, interaction);
  }
}

async function handleDelete(interaction: AnyInteraction) {
  const inputs = await parseInput({ slashCommandData: commandBuilder, interaction });
  const idsArg: string = inputs.reminder_ids;
  const ids = idsArg.split(/[\s,]+/);
  const reminders = await Reminders.findAll({
    where: {
      id: ids,
    },
  });
  if (!reminders.length) return interaction.editReply('Reminder does not exist!');

  const messageResponse = await reminders.reduce(async (accPromise, reminder) => {
    const acc = await accPromise;
    const channel = await getChannel(reminder.channel_id);
    let res: string;
    if (
      !channel || !isText(channel)
      || reminder.owner_id === interaction.user.id
      || usersHaveChannelPermission({ channel, users: interaction.user, permissions: 'ManageMessages' })
    ) {
      await removeReminder(reminder.id);
      res = `Reminder deleted: ${reminder.id}`;
    } else {
      res = `You cannot delete a reminder that you don't own: ${reminder.id}`;
    }
    return acc ? `${acc}\n${res}` : res;
  }, Promise.resolve(''));

  return interaction.editReply(messageResponse);
}

async function handleList(interaction: AnyInteraction) {
  const inputs = await parseInput({ slashCommandData: commandBuilder, interaction });
  const channelArg = inputs.channel;
  const filter: string | null = inputs.filter;
  const { channel, author } = await findOptionalChannel(interaction, channelArg);

  if (!channel) return interaction.editReply('Channel not found!');
  if (!author) return interaction.editReply('Could not find who is invoking this command.');

  const authorAndBot = filterOutFalsy([author, client.user]);

  if (!usersHaveChannelPermission({ channel, users: authorAndBot, permissions: 'ViewChannel' })) {
    return interaction.editReply(`One of us does not have access to channel <#${channel.id}>!`);
  }

  const guildId = interaction.guild?.id ?? null;
  const where: {
    guild_id: string | null;
    channel_id: string
    message?: {
      [Op.iLike]: `%${string}%`,
    };
  } = {
    guild_id: guildId,
    channel_id: channel.id,
  };
  if (filter) {
    where.message = {
      [Op.iLike]: `%${filter}%`,
    };
  }
  const reminders = await Reminders.findAll({ where });
  if (!reminders.length) {
    const filterPart = filter ? ' containing that message content.' : '.';
    return interaction.editReply(`There are no reminders for <#${channel.id}>${filterPart}`);
  }

  const embeds = reminders.map(reminder => getReminderEmbed(reminder, { showChannel: interaction.inGuild() }));
  return replyWithEmbeds({
    interaction,
    embeds,
    messageArgs: {
      content: filter ? `Using filter: **${filter}**` : undefined,
    },
    ephemeral: true,
  });
}

const run: CommandOrModalRunMethod = async interaction => {
  await interaction.deferReply({ ephemeral: true });

  const subcommand = getSubcommand(interaction);
  switch (subcommand) {
    case 'list': {
      return handleList(interaction);
    }
    case 'edit':
    case 'create': {
      return handleUpsert(interaction);
    }
    case 'delete': {
      return handleDelete(interaction);
    }
    default: {
      return interaction.editReply('What??');
    }
  }
};

const RemindersCommand: Command = {
  guildOnly: false,
  slashCommandData: commandBuilder,
  runCommand: run,
  runModal: run,
  modalLabels: {
    times: 'Time of reminder. Commas for multiple.',
    end_time: 'The last possible time that it can run.',
    max_occurrences: 'The number of times to run during interval.',
    channel: 'The channel to send the message in.',
    interval: 'Interval to repeat.',
    reminder_id: 'The ID of the reminder.',
    reminder_ids: 'The ID(s) of the reminder (can use commas).',
    message: 'The message of the reminder.',
    time_zone: 'Time zone name abbreviation.',
  },
  modalPlaceholders: {
    times: 'E.g. "5 mins" or "5 mins, 10 mins"',
    end_time: 'E.g. "5 mins" or "Friday at 2pm"',
    channel: 'Defaults to current one',
    interval: 'E.g. "24 hours" or "8640000"',
    reminder_id: 'Use "/reminders list" to find IDs',
    reminder_ids: 'Use "/reminders list" to find IDs',
    message: 'Defaults to "Time is up!"',
    time_zone: 'E.g. "America/New_York" or "EST". Defaults to Toronto.',
  },
};

export default RemindersCommand;
