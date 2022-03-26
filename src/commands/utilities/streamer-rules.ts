import { CommandInteraction, MessageEmbed } from 'discord.js';
import type { Command } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';

import { getModels } from 'src/models';
import { handleError } from 'src/discord-utils';

const model = getModels().streamer_rules;

const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('streamer-rules')
  .setDescription('Adds/removes roles for members who are currently streaming.');
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('list');
  subcommand.setDescription('List the roles that get added/removed from streamers.');
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('add');
  subcommand.setDescription('Specify a role that should be added to streamers.');
  subcommand.addRoleOption(option => {
    return option
      .setName('role')
      .setDescription('The role')
      .setRequired(true);
  });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('remove');
  subcommand.setDescription('Specify a role that should be removed from streamers.');
  subcommand.addRoleOption(option => {
    return option
      .setName('role')
      .setDescription('The role')
      .setRequired(true);
  });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('clear');
  subcommand.setDescription(
    'Clears ALL streamer role configurations, or just a particular role.',
  );
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
  const rules = await model.findAll({
    where: {
      guild_id: guildId,
    },
    attributes: ['role_id', 'add'],
  });
  if (!rules.length) return interaction.editReply('There are no streamer roles being added or removed!');

  const rolesToAdd = rules.filter(row => row.add).map(row => row.role_id);
  const rolesToRemove = rules.filter(row => !row.add).map(row => row.role_id);

  const embed = new MessageEmbed({
    title: 'Streamer Rules',
    description: 'These roles will be added or removed from members who are streaming',
    fields: [
      {
        name: 'Added',
        value: rolesToAdd.length
          ? rolesToAdd.map(roleId => `<@&${roleId}>`).join('\n')
          : 'There are no roles being added to members who are streaming.',
        inline: false,
      },
      {
        name: 'Removed',
        value: rolesToRemove.length
          ? rolesToRemove.map(roleId => `<@&${roleId}>`).join('\n')
          : 'There are no roles being removed from members who are streaming.',
        inline: false,
      },
    ],
  });

  return interaction.editReply({
    embeds: [embed],
  });
}

async function handleCreate(interaction: CommandInteraction, { remove }: { remove: boolean }) {
  const role = interaction.options.getRole('role', true);
  const guildId = interaction.guild!.id;
  try {
    await model.create({
      guild_id: guildId,
      role_id: role.id,
      add: !remove,
    });
    const reply = remove
      ? `Users who are streaming will now have the <@&${role.id}> role removed.`
      : `Users who are streaming will now be given the <@&${role.id}> role.`;
    return interaction.editReply(reply);
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
    return interaction.editReply('All streaming role relationships were removed!');
  }
  await model.destroy({
    where: {
      guild_id: guildId,
      role_id: role.id,
    },
  });
  return interaction.editReply(`Streaming role relationship for <@&${role.id}> was removed.`);
}

const StreamerRulesCommand: Command = {
  guildOnly: true,
  userPermissions: 'MANAGE_ROLES',
  clientPermissions: 'MANAGE_ROLES',
  slashCommandData: commandBuilder,
  runCommand: async interaction => {
    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
      case 'list': {
        return handleList(interaction);
      }
      case 'add': {
        return handleCreate(interaction, { remove: false });
      }
      case 'remove': {
        return handleCreate(interaction, { remove: true });
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

export default StreamerRulesCommand;
