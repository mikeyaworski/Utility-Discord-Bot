import type { AnyInteraction, Command } from 'src/types';
import type { FindOptions, InferAttributes } from 'sequelize';

import { EmbedBuilder, SlashCommandBuilder } from '@discordjs/builders';
import { ButtonStyle } from 'discord.js';
import { getSubcommand, parseInput, replyWithButtons, replyWithEmbeds } from 'src/discord-utils';
import { MovieLists, MovieList } from 'src/models/movie-lists';
import { Movies } from 'src/models/movies';
import { MovieListsJunction } from 'src/models/movie-lists-junction';
import { createMovie, getMovie, getMovieEmbeds, getSetNoteButtonConfig } from './index';

const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('movie-lists')
  .setDescription('Custom lists of movies.');
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('create');
  subcommand.setDescription('Create a custom movie list.');
  subcommand.addStringOption(option => {
    return option
      .setName('name')
      .setDescription('Name of the list.')
      .setRequired(true);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('custom_id')
      .setDescription('Custom ID to reference the list.')
      .setRequired(false);
  });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('edit');
  subcommand.setDescription('Edits a custom movie list.');
  subcommand.addStringOption(option => {
    return option
      .setName('id')
      .setDescription('ID of the list (custom or default).')
      .setRequired(true);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('name')
      .setDescription('Name of the list.')
      .setRequired(false);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('custom_id')
      .setDescription('Custom ID to reference the list.')
      .setRequired(false);
  });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('delete');
  subcommand.setDescription('Delete an entire list.');
  subcommand.addStringOption(option => {
    return option
      .setName('id')
      .setDescription('ID of the list (custom or default).')
      .setRequired(true);
  });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('add-movie');
  subcommand.setDescription('Add a movie to the list.');
  subcommand.addStringOption(option => {
    return option
      .setName('id')
      .setDescription('ID of the list (custom or default).')
      .setRequired(true);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('title')
      .setDescription('Title of the movie')
      .setRequired(false);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('imdb_id')
      .setDescription('Part of the URL. Ex: tt8801880')
      .setRequired(false);
  });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('remove-movie');
  subcommand.setDescription('Removes a movie from the list.');
  subcommand.addStringOption(option => {
    return option
      .setName('id')
      .setDescription('ID of the list (custom or default).')
      .setRequired(true);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('title')
      .setDescription('Title of the movie')
      .setRequired(false);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('imdb_id')
      .setDescription('Part of the URL. Ex: tt8801880')
      .setRequired(false);
  });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('show');
  subcommand.setDescription('Shows a specific movie list, or all of them.');
  subcommand.addStringOption(option => {
    return option
      .setName('id')
      .setDescription('ID of the list (custom or default).')
      .setRequired(false);
  });
  return subcommand;
});

async function getList({
  listId,
  guildId,
  options,
}: {
  listId: string,
  guildId: string,
  options?: FindOptions<InferAttributes<MovieLists>>,
}): Promise<MovieList> {
  let list = await MovieLists.findOne({
    where: {
      guild_id: guildId,
      custom_id: listId,
    },
    ...options,
  });
  if (!list) {
    list = await MovieLists.findOne({
      where: {
        guild_id: guildId,
        id: listId,
      },
      ...options,
    // listId is an arbitrary string, and may not conform to the syntax for the id
    }).catch(() => null);
  }
  if (!list) throw new Error(`Could not find list with ID "${listId}"`);
  return list;
}

async function handleCreate(interaction: AnyInteraction) {
  const guildId = interaction.guildId!;
  const { name, custom_id: customId } = await parseInput({ interaction, slashCommandData: commandBuilder }) as {
    name: string,
    custom_id?: string,
  };
  await MovieLists.create({
    guild_id: guildId,
    name,
    custom_id: customId,
  });
  return interaction.editReply('Custom list was created');
}

async function handleEdit(interaction: AnyInteraction) {
  const guildId = interaction.guildId!;
  const { id, custom_id: customId, name } = await parseInput({ interaction, slashCommandData: commandBuilder }) as {
    id: string,
    name?: string,
    custom_id?: string,
  };
  const list = await getList({ listId: id, guildId });
  const oldListName = list.name;
  await list.update({
    name,
    custom_id: customId,
  });
  return interaction.editReply(`List "${oldListName}" was edited`);
}

async function handleDelete(interaction: AnyInteraction) {
  const guildId = interaction.guildId!;
  const { id } = await parseInput({ interaction, slashCommandData: commandBuilder }) as {
    id: string,
  };
  const list = await getList({ listId: id, guildId });
  await list.destroy();
  return interaction.editReply('List was deleted.');
}

async function handleAddMovie(interaction: AnyInteraction) {
  const guildId = interaction.guildId!;
  const { id, title, imdb_id: imdbId } = await parseInput({ interaction, slashCommandData: commandBuilder }) as {
    id: string,
    title?: string,
    imdb_id?: string,
  };
  const [list, movie] = await Promise.all([
    getList({ listId: id, guildId }),
    getMovie({
      title,
      imdbId,
      guildId,
    }).catch(() => null),
  ]);

  const maxOrder = await MovieListsJunction.max<number, MovieListsJunction>('order', {
    where: {
      list_id: list.id,
    },
  });

  if (movie) {
    await list.addMovie(movie, {
      through: {
        order: maxOrder + 1,
      },
    });
    return interaction.editReply(`Movie was added to list "${list.name}"`);
  }
  const newMovie = await createMovie({
    guildId,
    title,
    imdbId,
  });
  await list.addMovie(newMovie, {
    through: {
      order: maxOrder + 1,
    },
  });
  await replyWithButtons({
    interaction,
    buttons: [
      {
        id: 'delete',
        label: 'Delete',
        style: ButtonStyle.Danger,
        cb: async () => {
          await newMovie.destroy();
        },
      },
      getSetNoteButtonConfig({ interaction, movie: newMovie }),
    ],
    cleanupCb: async () => {
      await interaction.editReply({
        content: 'Movie was created, but then deleted.',
        embeds: [],
        components: [],
      });
    },
    messageData: {
      content: 'Movie created',
      embeds: getMovieEmbeds(newMovie),
    },
  });
  return interaction.editReply({
    content: `Movie was created and added to list "${list.name}"`,
    embeds: getMovieEmbeds(newMovie),
  });
}

async function handleRemoveMovie(interaction: AnyInteraction) {
  const guildId = interaction.guildId!;
  const { id, title, imdb_id: imdbId } = await parseInput({ interaction, slashCommandData: commandBuilder }) as {
    id: string,
    title?: string,
    imdb_id: string,
  };
  const list = await getList({ listId: id, guildId });
  const movie = await getMovie({
    guildId,
    title,
    imdbId,
  });
  await list.removeMovie(movie);
  return interaction.editReply(`Movie "${movie.title}" was removed from list "${list.name}"`);
}

async function handleShow(interaction: AnyInteraction) {
  const guildId = interaction.guildId!;
  const { id } = await parseInput({ interaction, slashCommandData: commandBuilder }) as {
    id?: string,
  };
  if (id) {
    const list = await getList({
      listId: id,
      guildId,
      options: {
        include: {
          model: Movies,
          as: 'movies',
        },
        order: [
          [{ model: Movies, as: 'movies' }, MovieListsJunction, 'order', 'ASC'],
        ],
      },
    });
    const { movies = [] } = list;
    await replyWithEmbeds({
      interaction,
      embeds: [
        new EmbedBuilder({
          title: list.name,
          description: movies.length === 0
            ? 'There are no movies in this list'
            : movies.length === 1
              ? `There is ${movies.length} movie in this list`
              : `There are ${movies.length} movies in this list`,
          footer: {
            text: `ID: ${list.custom_id || list.id}`,
          },
        }),
        ...movies.map(movie => getMovieEmbeds(movie)).flat(),
      ],
    });
  } else {
    const lists = await MovieLists.findAll({
      where: {
        guild_id: guildId,
      },
    });
    const embed = new EmbedBuilder({
      title: 'Movie Lists',
      description: [
        lists.length === 0
          ? 'There are no lists'
          : lists.length === 1
            ? `There is ${lists.length} list:`
            : `There are ${lists.length} lists:`,
        ...lists.map(list => `- ${list.name} (${list.custom_id || list.id})`),
      ].join('\n'),
    });
    await interaction.editReply({
      embeds: [embed],
    });
  }
}

const MovieNightConfigCommand: Command = {
  guildOnly: true,
  slashCommandData: commandBuilder,
  runCommand: async interaction => {
    const subcommand = getSubcommand(interaction);
    const isEphemeral = Boolean(subcommand && !['show'].includes(subcommand));
    await interaction.deferReply({ ephemeral: isEphemeral });
    switch (subcommand) {
      case 'create': {
        await handleCreate(interaction);
        break;
      }
      case 'edit': {
        await handleEdit(interaction);
        break;
      }
      case 'delete': {
        await handleDelete(interaction);
        break;
      }
      case 'add-movie': {
        await handleAddMovie(interaction);
        break;
      }
      case 'remove-movie': {
        await handleRemoveMovie(interaction);
        break;
      }
      case 'show': {
        await handleShow(interaction);
        break;
      }
      default: {
        break;
      }
    }
  },
};

export default MovieNightConfigCommand;
