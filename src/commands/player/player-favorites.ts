import { AnyInteraction, Command, CommandOrModalRunMethod, ContextMenuTypes } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';
import { getSubcommand, interactionHasServerPermission, parseInput, replyWithEmbeds } from 'src/discord-utils';
import { FavoriteVariant, PlayerFavorites } from 'src/models/player-favorites';
import { MessageEmbed, MessageEmbedOptions, PermissionString } from 'discord.js';
import { filterOutFalsy } from 'src/utils';

export async function getFavorite(favoriteId: string, guildId: string): Promise<PlayerFavorites | null> {
  let favorite = await PlayerFavorites.findOne({
    where: {
      guild_id: guildId,
      custom_id: favoriteId,
    },
  });
  if (!favorite) {
    favorite = await PlayerFavorites.findOne({
      where: {
        guild_id: guildId,
        id: favoriteId,
      },
    // favoriteId is an arbitrary string, and may not conform to the syntax for the id
    }).catch(() => null);
  }
  return favorite;
}

const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('player-favorites')
  .setDescription('Create favorites for use on the player.');
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('remove');
  subcommand.setDescription('Remove a favorite.');
  subcommand.addStringOption(option => {
    return option
      .setName('favorite_id')
      .setDescription('The ID of favorite to remove.')
      .setRequired(true);
  });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('list');
  subcommand.setDescription('List favorites.');
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('add');
  subcommand.setDescription('Create a new favorite.');
  subcommand.addStringOption(option => {
    return option
      .setName('link')
      .setDescription('YouTube or Spotify link.')
      .setRequired(true);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('custom_id')
      .setDescription('(Optional) Custom ID to reference this favorite.')
      .setRequired(false);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('label')
      .setDescription('Label to describe what this favorite is.')
      .setRequired(false);
  });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('edit');
  subcommand.setDescription('Edit an existing favorite.');
  subcommand.addStringOption(option => {
    return option
      .setName('favorite_id')
      .setDescription('The ID of the favorite to edit.')
      .setRequired(true);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('link')
      .setDescription('YouTube or Spotify link.')
      .setRequired(false);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('new_custom_id')
      .setDescription('Custom ID to reference this favorite.')
      .setRequired(false);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('label')
      .setDescription('Label to describe what this favorite is.')
      .setRequired(false);
  });
  return subcommand;
});

function getFavoriteEmbed(favorite: PlayerFavorites): MessageEmbed {
  const id = String(favorite.custom_id || favorite.id);
  const { label, value } = favorite;

  const fields: MessageEmbedOptions['fields'] = filterOutFalsy([
    {
      name: 'Link',
      value,
      inline: false,
    },
    label && {
      name: 'Description',
      value: label,
      inline: false,
    },
  ]);
  return new MessageEmbed({
    fields,
    footer: {
      text: `ID: ${id}`,
    },
  });
}

async function handleCreate(interaction: AnyInteraction) {
  const guildId = interaction.guild!.id; // this is a guild-only command
  const inputs = await parseInput({ slashCommandData: commandBuilder, interaction });
  const link: string = inputs.link;
  const customId: string | null | undefined = inputs.custom_id;
  const label: string | null | undefined = inputs.label;
  const favorite = await PlayerFavorites.create({
    guild_id: guildId,
    user_id: interaction.user.id,
    custom_id: customId,
    label,
    value: link,
    variant: FavoriteVariant.LINK,
  });

  const embeds = [getFavoriteEmbed(favorite)];
  return interaction.editReply({
    content: 'Favorite created:',
    embeds,
  });
}

async function handleEdit(interaction: AnyInteraction) {
  const guildId = interaction.guild!.id; // this is a guild-only command
  const inputs = await parseInput({ slashCommandData: commandBuilder, interaction });
  const favoriteId: string = inputs.favorite_id;
  const link: string | null | undefined = inputs.link;
  const customId: string | null | undefined = inputs.new_custom_id;
  const label: string | null | undefined = inputs.label;
  const favorite = await getFavorite(favoriteId, guildId);

  if (!favorite) {
    return interaction.editReply(`Could not find favorite with ID "${favoriteId}"`);
  }

  await favorite.update({
    value: link || undefined,
    custom_id: customId || undefined,
    label: label || undefined,
  });

  const embeds = [getFavoriteEmbed(favorite)];
  return interaction.editReply({
    content: 'Favorite updated:',
    embeds,
  });
}

async function handleRemove(interaction: AnyInteraction) {
  const guildId = interaction.guild!.id; // this is a guild-only command
  const inputs = await parseInput({ slashCommandData: commandBuilder, interaction });
  const favoriteId: string = inputs.favorite_id;
  const favorite = await getFavorite(favoriteId, guildId);

  if (!favorite) {
    return interaction.editReply(`Could not find favorite with ID "${favoriteId}"`);
  }

  const authorizedToDelete = interaction.user.id === favorite.user_id
    || interactionHasServerPermission({
      interaction,
      permissions: ['MANAGE_MESSAGES'],
    });

  if (!authorizedToDelete) {
    return interaction.editReply('You are not allowed to delete someone else\'s favorite!');
  }

  await favorite.destroy();
  return interaction.editReply('Favorite removed.');
}

async function handleList(interaction: AnyInteraction) {
  const guildId = interaction.guild!.id; // this is a guild-only command
  const favorites = await PlayerFavorites.findAll({
    where: {
      guild_id: guildId,
    },
  });
  if (!favorites.length) {
    return interaction.editReply('There are no favorites.');
  }
  const embeds = favorites.map(favorite => getFavoriteEmbed(favorite));
  return replyWithEmbeds({
    interaction,
    embeds,
    ephemeral: true,
  });
}

const run: CommandOrModalRunMethod = async interaction => {
  await interaction.deferReply({ ephemeral: true });
  const subcommand = getSubcommand(interaction);
  switch (subcommand) {
    case 'add': {
      await handleCreate(interaction);
      break;
    }
    case 'edit': {
      await handleEdit(interaction);
      break;
    }
    case 'remove': {
      await handleRemove(interaction);
      break;
    }
    case 'list': {
      await handleList(interaction);
      break;
    }
    default: {
      break;
    }
  }
};

const PlayerFavoritesCommand: Command = {
  guildOnly: true,
  slashCommandData: commandBuilder,
  runCommand: run,
  runModal: run,
  contextMenuData: {
    type: ContextMenuTypes.USER,
    name: 'favorites list',
  },
  runContextMenu: async interaction => {
    await interaction.deferReply({ ephemeral: true });
    await handleList(interaction);
  },
};

export default PlayerFavoritesCommand;
