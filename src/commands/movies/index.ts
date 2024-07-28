import type { Command, IntentionalAny, AnyInteraction, CommandOrModalRunMethod } from 'src/types';

import axios from 'axios';
import { ButtonStyle } from 'discord.js';
import { SlashCommandBuilder, EmbedBuilder, SlashCommandSubcommandBuilder } from '@discordjs/builders';
import { CreationAttributes, FindOptions, InferAttributes, Op } from 'sequelize';

import { Movie, Movies } from 'src/models/movies';
import { MovieNotes } from 'src/models/movie-notes';
import { MovieLists } from 'src/models/movie-lists';
import { MOVIE_DATABASE_API_ROOT } from 'src/constants';
import {
  parseInput,
  getSubcommand,
  replyWithEmbeds,
  replyWithButtons,
  getChannel,
  isGuildRegularTextChannel,
  getResponseFromModal,
  getRateLimiterFromEnv,
} from 'src/discord-utils';
import { log } from 'src/logging';
import { getRandomElement, isNumber } from 'src/utils';
import { MovieNightConfig } from 'src/models/movie-night-config';

const rateLimiter = getRateLimiterFromEnv('MOVIES_USER_CREATE_LIMIT', 'MOVIES_GUILD_CREATE_LIMIT');

const movieApiKey = process.env.OMBD_API_KEY;

function isMovieApiSetUp(): boolean {
  return Boolean(movieApiKey);
}

function getBulletedListFromCsv(input: string): string {
  return input.split(/,\s*/g).map(line => `- ${line}`).join('\n');
}

export function getMovieEmbeds(movie: Movie): EmbedBuilder[] {
  return [
    new EmbedBuilder({
      title: `${movie.title} (${movie.year})`,
      url: `https://imdb.com/title/${movie.imdb_id}`,
      fields: [
        {
          name: 'Director',
          value: movie.director ? getBulletedListFromCsv(movie.director) : '-',
          inline: true,
        },
        {
          name: 'Actors',
          value: movie.actors ? getBulletedListFromCsv(movie.actors) : '-',
          inline: true,
        },
        {
          name: '',
          value: '',
          inline: false,
        },
        {
          name: 'Length',
          value: movie.length ? `${movie.length} minutes` : '-',
          inline: true,
        },
        {
          name: 'Favorite?',
          value: movie.is_favorite ? 'Y' : 'N',
          inline: true,
        },
        {
          name: 'Watched?',
          value: movie.was_watched ? 'Y' : 'N',
          inline: true,
        },
        {
          name: 'Ratings',
          value: '',
          inline: false,
        },
        {
          name: 'IMDb',
          value: movie.imdb_rating != null ? String(movie.imdb_rating) : '-',
          inline: true,
        },
        {
          name: 'Metacritic',
          value: movie.metacritic_rating != null ? String(movie.metacritic_rating) : '-',
          inline: true,
        },
        {
          name: 'Rotten Tomatoes',
          value: movie.rotten_tomatoes_rating != null ? String(movie.rotten_tomatoes_rating) : '-',
          inline: true,
        },
      ],
      footer: movie.imdb_id ? {
        text: `IMDb ID: ${movie.imdb_id}`,
      } : undefined,
    }),
    ...movie.notes?.map(({ note, author_id: authorId }) => new EmbedBuilder({
      title: 'Note',
      description: `<@${authorId}>:\n${note}`,
    })) || [],
  ];
}
const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('movies')
  .setDescription('Managing movie list');

commandBuilder.addSubcommand(subcommand => {
  subcommand
    .setName('create')
    .setDescription('Create a movie.')
    .addStringOption(option => option
      .setName('title')
      .setDescription('Title of the movie')
      .setRequired(false))
    .addStringOption(option => option
      .setName('imdb_id')
      .setDescription('Part of the URL. Ex: tt8801880')
      .setRequired(false))
    .addBooleanOption(option => option
      .setName('favorite')
      .setDescription('Whether this is favorited')
      .setRequired(false));
  return subcommand;
});

commandBuilder.addSubcommand(subcommand => {
  subcommand
    .setName('edit')
    .setDescription('Edit a movie.')
    .addStringOption(option => option
      .setName('imdb_id')
      .setDescription('Part of the URL. Ex: tt8801880')
      .setRequired(false))
    .addStringOption(option => option
      .setName('title')
      .setDescription('Title of the movie')
      .setRequired(false))
    .addBooleanOption(option => option
      .setName('favorite')
      .setDescription('Whether this is favorited')
      .setRequired(false))
    .addBooleanOption(option => option
      .setName('watched')
      .setDescription('Whether this has been watched')
      .setRequired(false))
    .addStringOption(option => option
      .setName('actors')
      .setDescription('Actors (comma-separated)')
      .setRequired(false))
    .addStringOption(option => option
      .setName('genre')
      .setDescription('Genre (comma-separated)')
      .setRequired(false))
    .addNumberOption(option => option
      .setName('year')
      .setDescription('Year of release')
      .setRequired(false))
    .addNumberOption(option => option
      .setName('imdb_rating')
      .setDescription('IMDB rating (0-100)')
      .setRequired(false))
    .addNumberOption(option => option
      .setName('metacritic_rating')
      .setDescription('Metacritic rating (0-100)')
      .setRequired(false))
    .addNumberOption(option => option
      .setName('rotten_tomatoes_rating')
      .setDescription('Rotten Tomatoes rating (0-100)')
      .setRequired(false))
    .addStringOption(option => option
      .setName('language')
      .setDescription('Language')
      .setRequired(false));
  return subcommand;
});

commandBuilder.addSubcommand(subcommand => {
  subcommand
    .setName('delete')
    .setDescription('Delete a movie.')
    .addStringOption(option => option
      .setName('title')
      .setDescription('Title of the movie (must be exact)')
      .setRequired(false))
    .addStringOption(option => option
      .setName('imdb_id')
      .setDescription('Part of the URL. Ex: tt8801880')
      .setRequired(false));
  return subcommand;
});

function applyFilterOptions(subcommand: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
  return subcommand
    .addStringOption(option => option
      .setName('title')
      .setDescription('Title of the movie')
      .setRequired(false))
    .addStringOption(option => option
      .setName('imdb_id')
      .setDescription('Part of the URL. Ex: tt8801880')
      .setRequired(false))
    .addStringOption(option => option
      .setName('list')
      .setDescription('ID of a custom movie list.')
      .setRequired(false))
    .addNumberOption(option => option
      .setName('imdb_rating')
      .setMinValue(0)
      .setMaxValue(100)
      .setDescription('IMDb rating of movie')
      .setRequired(false))
    .addNumberOption(option => option
      .setName('rotten_tomatoes_rating')
      .setMinValue(0)
      .setMaxValue(100)
      .setDescription('Rotten Tomatoes rating of movie')
      .setRequired(false))
    .addNumberOption(option => option
      .setName('metacritic_rating')
      .setMinValue(0)
      .setMaxValue(100)
      .setDescription('Metacritic rating of movie')
      .setRequired(false))
    .addStringOption(option => option
      .setName('genre')
      .setDescription('Genre')
      .setRequired(false))
    .addStringOption(option => option
      .setName('actor')
      .setDescription('Actor')
      .setRequired(false))
    .addStringOption(option => option
      .setName('director')
      .setDescription('Director')
      .setRequired(false))
    .addBooleanOption(option => option
      .setName('is_favorite')
      .setDescription('Whether the movie is favorited')
      .setRequired(false))
    .addBooleanOption(option => option
      .setName('was_watched')
      .setDescription('Whether the movie has been watched')
      .setRequired(false))
    .addNumberOption(option => option
      .setName('movie_length_max')
      .setMinValue(0)
      .setDescription('Max length of the movie in minutes')
      .setRequired(false))
    .addStringOption(option => option
      .setName('maturity_rating')
      .setDescription('Maturity rating')
      .setRequired(false));
}

commandBuilder.addSubcommand(subcommand => {
  subcommand
    .setName('pick')
    .setDescription('Picks movies based on given parameters');
  return applyFilterOptions(subcommand)
    .addBooleanOption(option => option
      .setName('ignore_list_order')
      .setDescription('List orders are used by default')
      .setRequired(false));
});

commandBuilder.addSubcommand(subcommand => {
  subcommand
    .setName('list')
    .setDescription('Filters a list of movies.');
  return applyFilterOptions(subcommand);
});

interface FilterInputs {
  title?: string,
  imdb_id?: string,
  list?: string,
  search_term?: string,
  genre?: string,
  movie_length_max?: number,
  actors?: string,
  director?: string,
  imdb_rating?: number,
  rotten_tomatoes_rating?: number,
  metacritic_rating?: number,
  maturity_rating?: string,
  is_favorite?: boolean,
  was_watched?: boolean,
}

interface MovieAttributeInputs {
  imdb_id?: string,
  title?: string,
  favorite?: boolean,
  watched?: boolean
  actors?: string,
  director?: string,
  genre?: string,
  year?: number,
  imdb_rating?: number,
  metacritic_rating?: number,
  rotten_tomatoes_rating?: number,
  language?: string,
}

export function getSetNoteButtonConfig({
  interaction,
  movie,
}: {
  interaction: AnyInteraction,
  movie: Movie,
}): Parameters<typeof replyWithButtons>[0]['buttons'][number] {
  return {
    id: 'upsert-note',
    label: 'Make A Note',
    style: ButtonStyle.Primary,
    deferResponse: false, // The input modal needs to be invoked without a deferred response
    cb: async buttonInteraction => {
      const [modalInteraction, results] = await getResponseFromModal({
        interaction: buttonInteraction,
        id: interaction.user.id + Date.now(),
        title: 'Make A Note',
        inputs: {
          note: {
            label: 'Note',
          },
        },
      });
      await modalInteraction.deferReply({ ephemeral: true });
      const authorId = modalInteraction.user.id;
      await MovieNotes.upsert({
        movie_id: movie.id,
        author_id: authorId,
        note: results.note,
      });
      await movie.reload({
        include: {
          model: MovieNotes,
          as: 'notes',
        },
      });
      await modalInteraction.editReply('Your movie note was set');
      await interaction.editReply({
        embeds: getMovieEmbeds(movie),
      });
    },
  };
}

export async function getMovie({
  title,
  imdbId,
  guildId,
}: {
  title?: string,
  imdbId?: string,
  guildId: string,
}): Promise<Movie> {
  if (!imdbId && !title) {
    throw new Error('You must provide IMDb code or title');
  }
  const query: FindOptions<InferAttributes<Movies>>['where'] = { guild_id: guildId };
  if (title) query.title = { [Op.iLike]: title };
  if (imdbId) query.imdb_id = { [Op.iLike]: imdbId };
  const movie = await Movies.findOne({ where: query });
  if (!movie) throw new Error('Movie not found');
  return movie;
}

export async function createMovie({
  userId,
  guildId,
  title,
  imdbId,
  isFavorite = false,
  wasWatched = false,
}: {
  userId: string,
  guildId: string,
  imdbId?: string,
  title?: string,
  isFavorite?: boolean,
  wasWatched?: boolean,
}): Promise<Movie> {
  if (!imdbId && !title) {
    throw new Error('You must provide IMDb code or title');
  }

  if (movieApiKey) {
    await rateLimiter.attempt({ userId, guildId });
    const url = new URL(MOVIE_DATABASE_API_ROOT);
    url.searchParams.append('apiKey', movieApiKey);
    url.searchParams.append('type', 'movie');
    if (imdbId) {
      url.searchParams.append('i', imdbId);
    } else if (title) {
      url.searchParams.append('t', title);
    }

    const res = await axios.get(url.href);
    if (res.data.Response === 'True' && res.data.Type === 'movie') {
      log('Creating movie from data', res.data);
      // Found the movie
      const attributes: CreationAttributes<Movie> = {
        guild_id: guildId,
        title: res.data.Title,
        is_favorite: isFavorite,
        was_watched: wasWatched,
        actors: res.data.Actors,
        director: res.data.Director,
        genre: res.data.Genre,
        year: Number(res.data.Year),
        imdb_id: res.data.imdbID,
        rating: res.data.Rated,
        language: res.data.Language,
      };
      const rottenTomatoesRating = res.data.Ratings.find((r: IntentionalAny) => r.Source === 'Rotten Tomatoes')?.Value?.replace('%', '');
      if (rottenTomatoesRating && isNumber(rottenTomatoesRating)) attributes.rotten_tomatoes_rating = Number(rottenTomatoesRating);
      if (isNumber(res.data.Metascore)) attributes.metacritic_rating = Number(res.data.Metascore);
      if (isNumber(res.data.imdbRating)) attributes.imdb_rating = Number(res.data.imdbRating) * 10;
      const runtime = res.data.Runtime?.replace(/[^\d]/g, '');
      if (isNumber(runtime)) attributes.length = Number(runtime);

      const [movie] = await Movies.upsert(attributes, { returning: true });
      return movie;
    }
    if (res.data.Response === 'False') {
      // Movie is not found
      throw new Error('Movie not found');
    }
    throw new Error('The API gave an unexpected response.');
  } else if (title) {
    // Upsert the movie
    const [movie] = await Movies.upsert({
      guild_id: guildId,
      title,
      is_favorite: isFavorite,
      was_watched: false,
    }, {
      returning: true,
    });
    return movie;
  } else {
    throw new Error('Movie not created. Title was not provided and the movie data could not be fetched.');
  }
}

async function handleCreate(interaction: AnyInteraction): Promise<IntentionalAny> {
  const inputs = await parseInput({
    slashCommandData: commandBuilder,
    interaction,
  }) as MovieAttributeInputs;

  const movie = await createMovie({
    userId: interaction.user.id,
    guildId: interaction.guildId!,
    title: inputs.title,
    imdbId: inputs.imdb_id,
    isFavorite: inputs.favorite,
  });
  await replyWithButtons({
    interaction,
    buttons: [
      {
        id: 'delete',
        label: 'Delete',
        style: ButtonStyle.Danger,
        cb: async () => {
          const lists = await movie.getLists();
          if (lists.length > 0) {
            await interaction.followUp({
              ephemeral: true,
              content: `You cannot delete this movie because it belongs to the following lists: ${lists.map(l => l.name).join(', ')}`,
            });
          } else {
            await movie.destroy();
            await interaction.editReply({
              content: 'Movie was created, but then deleted.',
              embeds: [],
              components: [],
            });
          }
        },
      },
      getSetNoteButtonConfig({ interaction, movie }),
    ],
    messageData: {
      content: 'Movie created',
      embeds: getMovieEmbeds(movie),
    },
  });
}

async function handleUpate(interaction: AnyInteraction): Promise<IntentionalAny> {
  const inputs = await parseInput({
    slashCommandData: commandBuilder,
    interaction,
  }) as MovieAttributeInputs;

  const movie = await getMovie({
    title: inputs.title,
    imdbId: inputs.imdb_id,
    guildId: interaction.guildId!,
  });

  const updateObject: Partial<Movie['dataValues']> = {
    guild_id: interaction.guildId!,
  };
  if (inputs.favorite != null) updateObject.is_favorite = inputs.favorite;
  if (inputs.watched != null) updateObject.was_watched = inputs.watched;
  if (inputs.actors != null) updateObject.actors = inputs.actors;
  if (inputs.director != null) updateObject.director = inputs.director;
  if (inputs.genre != null) updateObject.genre = inputs.genre;
  if (inputs.year != null) updateObject.year = inputs.year;
  if (inputs.imdb_rating != null) updateObject.imdb_rating = inputs.imdb_rating;
  if (inputs.metacritic_rating != null) updateObject.metacritic_rating = inputs.metacritic_rating;
  if (inputs.rotten_tomatoes_rating != null) updateObject.rotten_tomatoes_rating = inputs.rotten_tomatoes_rating;
  if (inputs.language != null) updateObject.language = inputs.language;

  await movie.update(updateObject);
  await replyWithButtons({
    interaction,
    messageData: {
      content: 'Movie updated',
      embeds: getMovieEmbeds(movie),
    },
    buttons: [
      getSetNoteButtonConfig({ interaction, movie }),
    ],
  });
}

async function getFilteredMovies(inputs: FilterInputs): Promise<Movie[]> {
  const where: FindOptions<InferAttributes<Movies>>['where'] = {};
  const query: FindOptions<InferAttributes<Movies>> = {
    where,
  };
  if (inputs.title) {
    where.title = { [Op.iLike]: `%${inputs.title}%` };
  }
  if (inputs.imdb_id) {
    where.imdb_id = { [Op.iLike]: `${inputs.imdb_id}` };
  }
  if (inputs.search_term) {
    where.title = { [Op.iLike]: `%${inputs.search_term}%` };
  }
  if (inputs.genre) {
    where.genre = { [Op.iLike]: `%${inputs.genre}%` };
  }
  if (inputs.actors) {
    where.actors = { [Op.iLike]: `%${inputs.actors}%` };
  }
  if (inputs.director) {
    where.director = { [Op.iLike]: `%${inputs.director}%` };
  }
  if (inputs.is_favorite != null) {
    where.is_favorite = inputs.is_favorite;
  }
  if (inputs.was_watched != null) {
    where.was_watched = inputs.was_watched;
  }
  if (inputs.imdb_rating) {
    where.imdb_rating = { [Op.gte]: inputs.imdb_rating };
  }
  if (inputs.rotten_tomatoes_rating) {
    where.rotten_tomatoes_rating = { [Op.gte]: inputs.rotten_tomatoes_rating };
  }
  if (inputs.metacritic_rating) {
    where.metacritic_rating = { [Op.gte]: inputs.metacritic_rating };
  }
  if (inputs.maturity_rating) {
    where.rating = { [Op.iLike]: inputs.maturity_rating };
  }
  if (inputs.movie_length_max) {
    where.length = { [Op.lte]: inputs.movie_length_max };
  }
  if (inputs.list) {
    query.include = {
      model: MovieLists,
      as: 'lists',
      where: {
        custom_id: inputs.list,
      },
      through: {
        as: 'junction',
      },
    };
  }
  const movies = await Movies.findAll(query).catch(() => {
    // We cannot use the same query for testing both list "id" and "custom_id"
    // since an error can be thrown if the value for "id" does not conform to UUID syntax
    if (inputs.list) {
      query.include = {
        model: MovieLists,
        as: 'lists',
        where: {
          id: inputs.list,
        },
        through: {
          as: 'junction',
        },
      };
    }
    return Movies.findAll(query);
  });
  return movies.sort((a, b) => {
    if (!inputs.list) return 0;
    return a.lists![0].junction!.order - b.lists![0].junction!.order;
  });
}

async function handleList(interaction: AnyInteraction): Promise<IntentionalAny> {
  const inputs = await parseInput({
    slashCommandData: commandBuilder,
    interaction,
  }) as FilterInputs;
  const filteredMovies = await getFilteredMovies(inputs);

  if (!filteredMovies.length) {
    await interaction.editReply('No movies found');
  } else if (filteredMovies.length === 1) {
    await filteredMovies[0].reload({
      include: {
        model: MovieNotes,
        as: 'notes',
      },
    });
    await replyWithButtons({
      interaction,
      buttons: [getSetNoteButtonConfig({
        interaction,
        movie: filteredMovies[0],
      })],
      messageData: {
        embeds: getMovieEmbeds(filteredMovies[0]),
      },
    });
  } else if (filteredMovies.length <= 20) {
    const embeds = filteredMovies.map(movie => getMovieEmbeds(movie)).flat();
    await replyWithEmbeds({
      interaction,
      embeds,
      ephemeral: false,
    });
  } else {
    await interaction.editReply(`There are too many to list (${filteredMovies.length}). Please narrow your search.`);
  }
}

export async function startMovie(movie: Movie): Promise<void> {
  await movie.update({ was_watched: true });
  const movieNightConfig = await MovieNightConfig.findByPk(movie.guild_id);
  if (movieNightConfig) {
    const channel = await getChannel(movieNightConfig.channel_id);
    if (channel && isGuildRegularTextChannel(channel)) {
      const thread = await channel.threads.create({
        name: movie.title,
        invitable: true,
      });
      await thread.send({
        content: `<@&${movieNightConfig.role_id}>`,
        embeds: getMovieEmbeds(movie),
      });
    }
  }
}

async function handlePick(interaction: AnyInteraction): Promise<IntentionalAny> {
  const inputs = await parseInput({
    slashCommandData: commandBuilder,
    interaction,
  }) as FilterInputs & {
    ignore_list_order?: boolean,
  };

  const filteredMovies = await getFilteredMovies(inputs);

  if (!filteredMovies.length) {
    await interaction.editReply('Could not find a movie that matches your filters.');
    return;
  }

  const pickedMovie = !inputs.list || inputs.ignore_list_order
    ? getRandomElement(filteredMovies)
    : filteredMovies[0];
  await pickedMovie.reload({
    include: {
      model: MovieNotes,
      as: 'notes',
    },
  });

  await replyWithButtons({
    messageData: {
      embeds: getMovieEmbeds(pickedMovie),
    },
    interaction,
    buttons: [{
      id: 'start',
      label: 'Start',
      style: ButtonStyle.Success,
      cb: () => startMovie(pickedMovie),
    }],
    cleanupCb: async () => {
      await interaction.editReply({
        components: [],
      });
      await interaction.followUp({
        ephemeral: true,
        content: `Movie "${pickedMovie.title}" has started!`,
      });
    },
  });
}

async function handleDelete(interaction: AnyInteraction): Promise<IntentionalAny> {
  const inputs = await parseInput({
    slashCommandData: commandBuilder,
    interaction,
  }) as {
    title?: string,
    imdb_id?: string,
  };

  const { title, imdb_id: imdbId } = inputs;

  if (!imdbId && !title) throw new Error('title or imdb_id is required');

  const movie = await getMovie({
    title,
    imdbId,
    guildId: interaction.guildId!,
  });

  const lists = await movie.getLists();
  if (lists.length > 0) {
    await interaction.editReply(`You cannot delete this movie because it belongs to the following lists: ${lists.map(l => l.name).join(', ')}`);
  } else {
    await movie.destroy();
    await interaction.editReply('Movie deleted.');
  }
}

const run: CommandOrModalRunMethod = async interaction => {
  if (!isMovieApiSetUp()) {
    log('OMDb API is not configured');
  }

  const subcommand = getSubcommand(interaction);
  const isEphemeral = Boolean(subcommand && ['edit', 'delete'].includes(subcommand));
  await interaction.deferReply({ ephemeral: isEphemeral });

  switch (subcommand) {
    case 'list': {
      await handleList(interaction);
      break;
    }
    case 'edit': {
      await handleUpate(interaction);
      break;
    }
    case 'create': {
      await handleCreate(interaction);
      break;
    }
    case 'delete': {
      await handleDelete(interaction);
      break;
    }
    case 'pick': {
      await handlePick(interaction);
      break;
    }
    default: {
      await interaction.editReply('What??');
      break;
    }
  }
};

const MovieCommand: Command = {
  guildOnly: true,
  slashCommandData: commandBuilder,
  showModalWithNoArgs: true,
  runCommand: run,
  runModal: run,
  modalPlaceholders: {
    favorite: 'yes/no',
  },
};

export default MovieCommand;
