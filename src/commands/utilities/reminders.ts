import type { CommandInteraction } from 'discord.js';
import type { Command } from 'src/types';
import type { Reminder } from 'models/reminders';

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

const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('reminders')
  .setDescription('Creates reminders.');
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('create');
  subcommand.setDescription('Create a reminder or timer (timer is if there is no message).');
  subcommand.addStringOption(option => {
    return option
      .setName('time')
      .setDescription('The time of the reminder. Examples: "2 hours" or "December 5th at 5pm"')
      .setRequired(true);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('time_zone')
      .setDescription('[Barely working]: Time zone abbreviation. Example: "UTC". Defaults to Toronto time zone.')
      .setRequired(false);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('message')
      .setDescription('The message of the reminder. Defaults to "Timer is up!" if nothing provided.')
      .setRequired(false);
  });
  subcommand.addChannelOption(option => {
    return option
      .setName('channel')
      .setDescription('The channel to send the message in. Defaults to the current one if not provided.')
      .setRequired(false);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('interval')
      .setDescription('Interval to send reminder on repeat. Examples: "24 hours" or "8640000"')
      .setRequired(false);
  });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('delete');
  subcommand.setDescription('Delete a reminder by its ID.');
  subcommand.addStringOption(option => {
    return option
      .setName('reminder_id')
      .setDescription('The ID of the reminder (use "/reminders list" to find it).')
      .setRequired(true);
  });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('list');
  subcommand.setDescription('List upcoming reminders.');
  subcommand.addChannelOption(option => {
    return option
      .setName('channel')
      .setDescription('The channel to list reminders for.')
      .setRequired(false);
  });
  return subcommand;
});

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

async function handleCreate(interaction: CommandInteraction) {
  const timeArg = interaction.options.getString('time', true);
  const timeZone = interaction.options.getString('time_zone', false);
  const message = interaction.options.getString('message', false);
  const channelArg = interaction.options.getChannel('channel', false);
  const intervalArg = interaction.options.getString('interval', false);

  const { channel, author } = await findOptionalChannel(interaction, channelArg);
  const authorAndBot = filterOutFalsy([author, client.user]);

  if (!channel) return interaction.editReply('Channel not found!');
  if (!author) return interaction.editReply('Could not find who is invoking this command.');

  let interval: number | null;
  try {
    interval = intervalArg ? Math.floor(parseDelay(intervalArg) / 1000) : null;
    if (interval && interval < MIN_REMINDER_INTERVAL) {
      return interaction.editReply(`Minimum interval is ${MIN_REMINDER_INTERVAL} seconds.`);
    }
  } catch (err) {
    return interaction.editReply('Could not parse interval time!');
  }

  const tzOffset = getTimezoneOffsetFromAbbreviation(timeZone || '')
    || getTimezoneOffsetFromAbbreviation('EST', 'America/Toronto');
  let date = parseDate(timeArg, {
    timezone: tzOffset ?? undefined,
  });
  if (!date) {
    try {
      date = new Date(Date.now() + parseDelay(timeArg));
    } catch (err) {
      return interaction.editReply('Could not parse reminder time!');
    }
  }
  const time = Math.floor(date.getTime() / 1000);

  if (!usersHavePermission(channel, author, 'SEND_MESSAGES')) {
    return interaction.editReply(`One of us does not have permission to send messages in <#${channel.id}>`);
  }

  // TODO: Remove this comment if it's outdated with v13
  // Do not check against msg.mentions since putting the mentions like
  // @everyone or <@&786840067103653931> won't register as a mention
  // if the user does not have permission, but will register as a mention
  // when the bot (with permission) posts the reminder.

  if (message && interaction.guild) {
    if (checkMentionsEveryone(message) && !usersHavePermission(channel, authorAndBot, 'MENTION_EVERYONE')) {
      return interaction.editReply(`One of us does not have permission to mention everyone in <#${channel.id}>`);
    }

    const unmentionableRoleMention = getRoleMentions(message, interaction.guild).find(role => !role.mentionable);
    if (unmentionableRoleMention && !usersHavePermission(channel, authorAndBot, 'MENTION_EVERYONE')) {
      return interaction.editReply(`One of us does not have permission to mention the role: ${unmentionableRoleMention.name}`);
    }
  }

  const reminder: Reminder = await model.create({
    guild_id: interaction.guild?.id,
    channel_id: channel.id,
    owner_id: author.id,
    time,
    message,
    interval,
  });
  setReminder(reminder);
  return interaction.editReply(`Reminder (ID: ${reminder.id}) created for ${getDateString(time)} in channel <#${channel.id}>`);
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
      case 'create': {
        return handleCreate(interaction);
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
