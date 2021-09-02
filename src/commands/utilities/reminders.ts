import type { CommandInteraction, TextBasedChannels, User } from 'discord.js';
import type { Command } from 'src/types';
import type { Reminder } from 'models/reminders';
import type { SlashCommandChannelOption, SlashCommandStringOption } from '@discordjs/builders';

import { SlashCommandBuilder } from '@discordjs/builders';
import { parseDate } from 'chrono-node';
import { Op } from 'sequelize';

import { client } from 'src/client';
import { getModels } from 'src/models';
import {
  usersHavePermission,
  getChannel,
  checkMentionsEveryone,
  getRoleMentions,
  findOptionalChannel,
} from 'src/discord-utils';
import { getTimezoneOffsetFromFilter, getDateString, parseDelay, filterOutFalsy } from 'src/utils';
import { MIN_REMINDER_INTERVAL } from 'src/constants';
import { setReminder, removeReminder } from 'src/jobs/reminders';

const model = getModels().reminders;

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
const channelOption = (option: SlashCommandChannelOption) => {
  return option
    .setName('channel')
    .setDescription('The channel to send the message in. Defaults to the current one if not provided.')
    .setRequired(false);
};
const intervalOption = (option: SlashCommandStringOption) => {
  return option
    .setName('interval')
    .setDescription('Interval to send reminder on repeat. Examples: "24 hours" or "8640000"')
    .setRequired(false);
};

const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('reminders')
  .setDescription('Creates reminders.');
commandBuilder.addSubcommand(subcommand => {
  subcommand
    .setName('create')
    .setDescription('Create a reminder or timer (timer is if there is no message).')
    .addStringOption(timeOption({ required: true }))
    .addStringOption(timeZoneOption)
    .addStringOption(messageOption)
    .addChannelOption(channelOption)
    .addStringOption(intervalOption);
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
    .addStringOption(timeZoneOption)
    .addStringOption(messageOption)
    .addChannelOption(channelOption)
    .addStringOption(intervalOption);
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
    .addChannelOption(option => {
      return option
        .setName('channel')
        .setDescription('The channel to list reminders for.')
        .setRequired(false);
    })
    .addStringOption(option => {
      return option
        .setName('filter')
        .setDescription('Filter results by message content.')
        .setRequired(false);
    });
  return subcommand;
});

function parseTimesArg(timesArg: string | null, timeZone: string | null): number[] {
  if (!timesArg) return [];
  const tzOffset = getTimezoneOffsetFromFilter(timeZone || '') || getTimezoneOffsetFromFilter('America/Toronto');
  const times = filterOutFalsy(timesArg.split(/,\s+/).map(timeArg => {
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

async function parseReminderOptions(interaction: CommandInteraction, { editing }: { editing: boolean }) {
  const time = interaction.options.getString('times', false); // Optional for editing
  const timeZone = interaction.options.getString('time_zone', false);
  const message = interaction.options.getString('message', false);
  const channelArg = interaction.options.getChannel('channel', false);
  const intervalArg = interaction.options.getString('interval', false);

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
    interval,
    channel,
    author,
  };
}

function checkReminderErrors(interaction: CommandInteraction, {
  message,
  channel,
  author,
}: {
  message: string | null,
  channel: TextBasedChannels | null | undefined,
  author: User,
}) {
  const authorAndBot = filterOutFalsy([author, client.user]);

  if (channel && !usersHavePermission(channel, authorAndBot, 'SEND_MESSAGES')) {
    throw new Error(`One of us does not have permission to send messages in <#${channel.id}>`);
  }

  // TODO: Remove this comment if it's outdated with v13
  // Do not check against msg.mentions since putting the mentions like
  // @everyone or <@&786840067103653931> won't register as a mention
  // if the user does not have permission, but will register as a mention
  // when the bot (with permission) posts the reminder.

  if (message && channel && interaction.guild) {
    if (checkMentionsEveryone(message) && !usersHavePermission(channel, authorAndBot, 'MENTION_EVERYONE')) {
      throw new Error(`One of us does not have permission to mention everyone in <#${channel.id}>`);
    }

    const unmentionableRoleMention = getRoleMentions(message, interaction.guild).find(role => !role.mentionable);
    if (unmentionableRoleMention && !usersHavePermission(channel, authorAndBot, 'MENTION_EVERYONE')) {
      throw new Error(`One of us does not have permission to mention the role: ${unmentionableRoleMention.name}`);
    }
  }
}

async function handleUpsert(interaction: CommandInteraction) {
  const id = interaction.options.getString('reminder_id', false); // Not present in creation
  const editing = Boolean(id);
  try {
    const {
      message,
      interval,
      times,
      channel,
      author,
    } = await parseReminderOptions(interaction, { editing });

    // Throws if there is an issue
    checkReminderErrors(interaction, {
      channel,
      author,
      message,
    });

    const existingReminder = id ? await model.findByPk(id) : null;
    if (id && !existingReminder) return interaction.editReply('Reminder does not exist!');

    const reminderPayloads: Partial<Reminder>[] = times.map(time => {
      const reminderPayload: Partial<Reminder> = {
        guild_id: existingReminder?.guild_id,
        channel_id: existingReminder?.channel_id,
        owner_id: existingReminder?.owner_id,
        time: existingReminder?.time,
        message: existingReminder?.message,
        interval: existingReminder?.interval,
      };
      if (interaction.guild?.id) reminderPayload.guild_id = interaction.guild.id;
      if (channel?.id) reminderPayload.channel_id = channel.id;
      if (author.id) reminderPayload.owner_id = author.id;
      if (time) reminderPayload.time = time;
      if (message) reminderPayload.message = message;
      if (interval) reminderPayload.interval = interval;
      return reminderPayload;
    });
    if (id) reminderPayloads[0].id = id;

    const reminders = await Promise.all(reminderPayloads.map(async reminderPayload => {
      const [reminder]: [Reminder, boolean | null] = await model.upsert(reminderPayload, { returning: true });
      setReminder(reminder);
      return reminder;
    }));
    const response = reminders.reduce((acc, reminder) => {
      const upsertPart = reminder.id === id ? 'updated' : 'created';
      const channelPart = interaction.inGuild() ? ` in channel <#${reminder.channel_id}>` : '';
      const newlinePart = acc ? '\n' : '';
      return `${acc}${newlinePart}Reminder (ID: ${reminder.id}) ${upsertPart} for ${getDateString(reminder.time)}${channelPart}`;
    }, '');
    return interaction.editReply(response);
  } catch (err) {
    return interaction.editReply(err.message);
  }
}

async function handleDelete(interaction: CommandInteraction) {
  const idsArg = interaction.options.getString('reminder_ids', true);
  const ids = idsArg.split(/[\s,]+/);
  const reminders: Reminder[] = await model.findAll({
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
      !channel || !channel.isText()
      || reminder.owner_id === interaction.user.id
      || usersHavePermission(channel, interaction.user, 'MANAGE_MESSAGES')
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

async function handleList(interaction: CommandInteraction) {
  const channelArg = interaction.options.getChannel('channel', false);
  const filter = interaction.options.getString('filter', false);
  const { channel, author } = await findOptionalChannel(interaction, channelArg);

  if (!channel) return interaction.editReply('Channel not found!');
  if (!author) return interaction.editReply('Could not find who is invoking this command.');

  const authorAndBot = filterOutFalsy([author, client.user]);

  if (!usersHavePermission(channel, authorAndBot, 'VIEW_CHANNEL')) {
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
  const reminders: Reminder[] = await model.findAll({ where });
  if (!reminders.length) {
    const filterPart = filter ? ' containing that message content.' : '.';
    return interaction.editReply(`There are no reminders for <#${channel.id}>${filterPart}`);
  }

  const filterPart = filter ? ` (using filter **${filter}**)` : '';
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
  }, `__Reminders for <#${channel.id}>__${filterPart}\n`);

  return interaction.editReply(response);
}

const RemindersCommand: Command = {
  guildOnly: false,
  slashCommandData: commandBuilder,
  runCommand: async interaction => {
    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();
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
  },
};

export default RemindersCommand;
