import type { CommandInteraction } from 'discord.js';
import type { Command } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';

import { getModels } from 'src/models';
import { handleError } from 'src/discord-utils';
import { parseDelay } from 'src/utils';

const model = getModels().base_roles;

const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('base-roles')
  .setDescription('Moves a range of messages to another channel.');
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

async function handleList(interaction: CommandInteraction) {
  const guildId = interaction.guild!.id;
  const roles: {
    role_id: string;
    delay: number | null;
  }[] = await model.findAll({
    where: {
      guild_id: guildId,
    },
    attributes: ['role_id', 'delay'],
  });
  if (!roles.length) return interaction.editReply('There are no base roles!');

  const response = roles.reduce((acc, role) => {
    return `${acc}\n<@&${role.role_id}>${role.delay ? ` - ${role.delay} millisecond delay` : ''}`;
  }, 'The following roles will be added to new members:');

  return interaction.editReply(response);
}

async function handleAdd(interaction: CommandInteraction) {
  const role = interaction.options.getRole('role', true);
  const delay = interaction.options.getString('delay');

  const guildId = interaction.guild!.id;
  const roleId = role.id;
  try {
    const delayMs = delay ? parseDelay(delay) : null;
    await model.create({
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

async function handleClear(interaction: CommandInteraction) {
  const guildId = interaction.guild!.id;
  const role = interaction.options.getRole('role', false);

  if (!role) {
    await model.destroy({
      where: {
        guild_id: guildId,
      },
    });
    return interaction.editReply('All base roles were removed!');
  }
  await model.destroy({
    where: {
      guild_id: guildId,
      role_id: role.id,
    },
  });
  return interaction.editReply(`Base role for <@&${role.id}> was removed.`);
}

const BaseRolesCommand: Command = {
  guildOnly: true,
  userPermissions: 'MANAGE_ROLES',
  clientPermissions: 'MANAGE_ROLES',
  data: commandBuilder,
  run: async interaction => {
    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();
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
  },
};

export default BaseRolesCommand;
