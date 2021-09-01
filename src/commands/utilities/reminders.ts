import type { CommandInteraction, TextBasedChannels, User } from 'discord.js';
import type { Command } from 'src/types';
import type { Reminder } from 'models/reminders';

import type { SlashCommandChannelOption, SlashCommandStringOption } from '@discordjs/builders';
import { SlashCommandBuilder } from '@discordjs/builders';
import { parseDate } from 'chrono-node';

import { client } from 'src/client';
import { getModels } from 'src/models';
import {
  usersHavePermission,
  getChannel,
  checkMentionsEveryone,
  getRoleMentions,
  findOptionalChannel,
} from 'src/discord-utils';
import { getTimezoneOffsetFromAbbreviation, getDateString, parseDelay, filterOutFalsy } from 'src/utils';
import { MIN_REMINDER_INTERVAL } from 'src/constants';
import { setReminder, removeReminder } from 'src/jobs/reminders';

const model = getModels().reminders;

const timeOption = ({ required }: { required: boolean }) => (option: SlashCommandStringOption) => {
  return option
    .setName('time')
    .setDescription('The time of the reminder. Examples: "2 hours" or "December 5th at 5pm"')
    .setRequired(required);
};
const timeZoneOption = (option: SlashCommandStringOption) => {
  return option
    .setName('time_zone')
    .setDescription('[Barely working]: Time zone abbreviation. Example: "UTC". Defaults to Toronto time zone.')
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
const idOption = (option: SlashCommandStringOption) => {
  return option
    .setName('reminder_id')
    .setDescription('The ID of the reminder (use "/reminders list" to find it).')
    .setRequired(true);
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
    .addStringOption(idOption)
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
    .addStringOption(idOption);
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
    });
  return subcommand;
});

async function parseReminderOptions(interaction: CommandInteraction, { editing }: { editing: boolean }) {
  const timeArg = interaction.options.getString('time', false); // Optional for editing
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

  let time: number | null | undefined;
  if (timeArg) {
    const tzOffset = getTimezoneOffsetFromAbbreviation(timeZone || '')
      || getTimezoneOffsetFromAbbreviation('EST', 'America/Toronto');
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
    time = Math.floor(date.getTime() / 1000);
  }

  return {
    message,
    time,
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

async function handleList(interaction: CommandInteraction) {
  const channelArg = interaction.options.getChannel('channel', false);
  const { channel, author } = await findOptionalChannel(interaction, channelArg);

  if (!channel) return interaction.editReply('Channel not found!');
  if (!author) return interaction.editReply('Could not find who is invoking this command.');

  const authorAndBot = filterOutFalsy([author, client.user]);

  if (!usersHavePermission(channel, authorAndBot, ['VIEW_CHANNEL', 'SEND_MESSAGES'])) {
    return interaction.editReply(`One of us does not have access to channel <#${channel.id}>!`);
  }
  const guildId = interaction.guild?.id ?? null;
  const reminders: Reminder[] = await model.findAll({
    where: {
      guild_id: guildId,
      channel_id: channel.id,
    },
  });
  if (!reminders.length) return interaction.editReply(`There are no reminders for <#${channel.id}>.`);

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

  return interaction.editReply(response);
}

async function handleUpsert(interaction: CommandInteraction) {
  const id = interaction.options.getString('reminder_id', false); // Not present in creation
  const editing = Boolean(id);
  try {
    const {
      message,
      interval,
      time,
      channel,
      author,
    } = await parseReminderOptions(interaction, { editing });

    // Throws if there is an issue
    checkReminderErrors(interaction, {
      channel,
      author,
      message,
    });

    const reminderPayload: Partial<Reminder> = {};

    if (id) {
      const existingReminder: Reminder | null = await model.findByPk(id);
      if (!existingReminder) return interaction.editReply('Reminder does not exist!');

      reminderPayload.id = id;
      reminderPayload.guild_id = existingReminder.guild_id;
      reminderPayload.channel_id = existingReminder.channel_id;
      reminderPayload.owner_id = existingReminder.owner_id;
      reminderPayload.time = existingReminder.time;
      reminderPayload.message = existingReminder.message;
      reminderPayload.interval = existingReminder.interval;
    }

    if (interaction.guild?.id) reminderPayload.guild_id = interaction.guild.id;
    if (channel?.id) reminderPayload.channel_id = channel.id;
    if (author.id) reminderPayload.owner_id = author.id;
    if (time) reminderPayload.time = time;
    if (message) reminderPayload.message = message;
    if (interval) reminderPayload.interval = interval;

    const [reminder]: [Reminder, boolean | null] = await model.upsert(reminderPayload, { returning: true });
    setReminder(reminder);

    const upsertPart = editing ? 'updated' : 'created';
    const channelPart = interaction.inGuild() ? ` in channel <#${reminder.channel_id}>` : '';

    return interaction.editReply(`Reminder (ID: ${reminder.id}) ${upsertPart} for ${getDateString(reminder.time)}${channelPart}`);
  } catch (err) {
    return interaction.editReply(err.message);
  }
}

async function handleDelete(interaction: CommandInteraction) {
  const id = interaction.options.getString('reminder_id', true);
  const reminder: Reminder | null = await model.findOne({
    where: {
      id,
    },
  });
  if (!reminder) {
    return interaction.editReply('Reminder does not exist!');
  }
  const channel = await getChannel(reminder.channel_id);
  if (!channel || !channel.isText()) {
    await removeReminder(id);
    return interaction.editReply('Reminder deleted.');
  }
  if (reminder.owner_id !== interaction.user.id && !usersHavePermission(channel, interaction.user, 'MANAGE_MESSAGES')) {
    return interaction.editReply('You cannot delete a reminder that you don\'t own.');
  }
  if (!usersHavePermission(channel, interaction.user, 'SEND_MESSAGES')) {
    return interaction.editReply(`You do not have access to send messages in <#${channel.id}>`);
  }
  await removeReminder(id);
  return interaction.editReply('Reminder deleted.');
}

const RemindersCommand: Command = {
  guildOnly: false,
  data: commandBuilder,
  run: async interaction => {
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
