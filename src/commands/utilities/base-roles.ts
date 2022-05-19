import type { Command, CommandOrModalRunMethod } from 'src/types';

import { CommandInteraction, MessageEmbed, ModalSubmitInteraction, Role } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

import { BaseRoles } from 'src/models/base-roles';
import { getSubcommand, handleError, parseInput } from 'src/discord-utils';
import { parseDelay, humanizeDuration } from 'src/utils';
import { APIRole } from 'discord-api-types/v9';

const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('base-roles')
  .setDescription('Adds base roles to new members.');
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('list');
  subcommand.setDescription('List the current roles being added to new members.');
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('add');
  subcommand.setDescription('Add a role which should be added to new members.');
  subcommand.addRoleOption(option => {
    return option
      .setName('role')
      .setDescription('The role')
      .setRequired(true);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('delay')
      .setDescription('Delay before role is added to a new member. Examples: a raw number in ms, or "5 mins".')
      .setRequired(false);
  });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('clear');
  subcommand.setDescription('Clear all base role configurations, or just a particular one.');
  subcommand.addRoleOption(option => {
    return option
      .setName('role')
      .setDescription('The role')
      .setRequired(false);
  });
  return subcommand;
});

async function handleList(interaction: CommandInteraction | ModalSubmitInteraction) {
  const guildId = interaction.guild!.id;
  const roles = await BaseRoles.findAll({
    where: {
      guild_id: guildId,
    },
    attributes: ['role_id', 'delay'],
  });
  if (!roles.length) return interaction.editReply('There are no base roles!');

  const embed = new MessageEmbed({
    title: 'Base Roles',
    description: roles.map(role => `<@&${
      role.role_id
    }>${
      role.delay ? ` - ${humanizeDuration(role.delay)} delay` : ''
    }`).join('\n'),
    footer: {
      text: 'These roles will be added to new members.',
    },
  });

  return interaction.editReply({
    embeds: [embed],
  });
}

async function handleAdd(interaction: CommandInteraction | ModalSubmitInteraction) {
  const inputs = await parseInput({ slashCommandData: commandBuilder, interaction });
  const role: Role | APIRole = inputs.role;
  const delay: string | null = inputs.delay;

  const guildId = interaction.guild!.id;
  const roleId = role.id;
  try {
    const delayMs = delay ? parseDelay(delay) : null;
    await BaseRoles.create({
      guild_id: guildId,
      role_id: roleId,
      delay: delayMs,
    });
    const response = `New members will now be given the <@&${roleId}> role`;
    if (!delayMs) return interaction.editReply(`${response}.`);
    return interaction.editReply(`${response} after a ${delayMs} millisecond delay.`);
  } catch (err) {
    return handleError(err, interaction);
  }
}

async function handleClear(interaction: CommandInteraction | ModalSubmitInteraction) {
  const guildId = interaction.guild!.id;
  const inputs = await parseInput({ slashCommandData: commandBuilder, interaction });
  const role: Role | APIRole | null = inputs.role;

  if (!role) {
    await BaseRoles.destroy({
      where: {
        guild_id: guildId,
      },
    });
    return interaction.editReply('All base roles were removed!');
  }
  await BaseRoles.destroy({
    where: {
      guild_id: guildId,
      role_id: role.id,
    },
  });
  return interaction.editReply(`Base role for <@&${role.id}> was removed.`);
}

const run: CommandOrModalRunMethod = async interaction => {
  await interaction.deferReply({ ephemeral: true });

  const subcommand = getSubcommand(interaction);

  switch (subcommand) {
    case 'list': {
      return handleList(interaction);
    }
    case 'add': {
      return handleAdd(interaction);
    }
    case 'clear': {
      return handleClear(interaction);
    }
    default: {
      return interaction.editReply('What??');
    }
  }
};

const BaseRolesCommand: Command = {
  guildOnly: true,
  userPermissions: 'MANAGE_ROLES',
  clientPermissions: 'MANAGE_ROLES',
  slashCommandData: commandBuilder,
  runCommand: run,
  runModal: run,
  modalLabels: {
    delay: 'Delay before role is added to a new member.',
  },
  modalPlaceholders: {
    delay: 'E.g. "5 mins"',
  },
};

export default BaseRolesCommand;
