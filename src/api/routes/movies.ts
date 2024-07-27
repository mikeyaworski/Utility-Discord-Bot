import type { IntentionalAny, Optional } from 'src/types';

import express, { NextFunction, Response } from 'express';
import Sequelize from 'sequelize';

import authMiddleware, { AuthRequest, GuildRequest } from 'src/api/middlewares/auth';
import { guildMiddleware } from 'src/api/middlewares/guild';
import { Movie, Movies } from 'src/models/movies';
import { MovieNotes } from 'src/models/movie-notes';
import { MovieLists, MovieList } from 'src/models/movie-lists';
import { createMovie, startMovie } from 'src/commands/movies';
import { error } from 'src/logging';
import { camelCaseToSnakeCase, isValidKey } from 'src/utils';
import { getErrorMsg } from 'src/discord-utils';
import { MovieListsJunction } from 'src/models/movie-lists-junction';

const router = express.Router();

/**
 * Routes
 *
 * GET /movies/:guildId
 * POST /movies/:guildId
 * PATCH /movies/:guildId/:movieId
 * DELETE /movies/:guildId/:movieId
 * PUT /movies/:guildId/:movieId/lists
 * POST /movies/:guildId/:movieId/start
 *
 * GET /movies/:guildId/lists
 * POST /movies/:guildId/lists
 * PATCH /movies/:guildId/lists/:listId
 * PUT /movies/:guildId/lists/:listId/items
 * DELETE /movies/:guildId/lists/:listId
 *
 * PUT /movies/:guildId/:movieId/notes
 * DELETE /movies/:guildId/:movieId/notes
 */

const includeOrderedMovies: Sequelize.Includeable = {
  model: Movies,
  as: 'movies',
  through: {
    attributes: [],
  },
  attributes: [
    'id',
    [Sequelize.literal('"movies->MovieListsJunction"."order"'), 'order'],
  ],
};

interface MovieRequest extends AuthRequest<GuildRequest> {
  movie: Movie,
}

async function movieMiddleware(req: Optional<MovieRequest, 'movie'>, res: Response, next: NextFunction): Promise<void> {
  const movie = await Movies.findOne({
    where: {
      id: req.params.movieId,
      guild_id: req.params.guildId,
    },
    include: {
      model: MovieLists,
      as: 'lists',
      through: {
        attributes: [],
      },
    },
  }).catch(() => null);
  if (movie) {
    req.movie = movie;
    next();
  } else {
    res.status(404).end();
  }
}

interface ListRequest extends AuthRequest<GuildRequest> {
  list: MovieList,
}

type MovieListOptions = Sequelize.FindOptions<Sequelize.InferAttributes<MovieLists>>;
const listMiddleware = (options?: MovieListOptions) => async (req: Optional<ListRequest, 'list'>, res: Response, next: NextFunction) => {
  let list = await MovieLists.findOne({
    where: {
      custom_id: req.params.listId,
      guild_id: req.params.guildId,
    },
  });
  if (!list) {
    list = await MovieLists.findOne({
      where: {
        id: req.params.listId,
        guild_id: req.params.guildId,
      },
      ...options,
    // listId may not conform to UUID syntax and therefore this may throw an error
    }).catch(() => null);
  }
  if (list) {
    req.list = list;
    next();
  } else {
    res.status(404).end();
  }
};

// @ts-expect-error
router.get('/:guildId', authMiddleware, guildMiddleware, async (req: AuthRequest<GuildRequest>, res) => {
  const data = await Movies.findAll({
    where: {
      guild_id: req.guild.id,
    },
    order: [
      ['createdAt', 'DESC'],
    ],
    include: [
      {
        model: MovieNotes,
        as: 'notes',
        attributes: ['id', 'author_id', 'note'],
      },
      {
        model: MovieLists,
        as: 'lists',
        attributes: ['id', 'custom_id', 'name'],
        through: {
          attributes: [],
        },
      },
    ],
  });
  res.status(200).json(data);
});

// @ts-expect-error
router.post('/:guildId', authMiddleware, guildMiddleware, async (req: AuthRequest<GuildRequest>, res) => {
  const {
    title,
    imdbId,
    isFavorite,
    wasWatched,
  } = req.body;
  if (!title && !imdbId) return res.status(400).end();
  if (title && typeof title !== 'string') return res.status(400).end();
  if (imdbId && typeof imdbId !== 'string') return res.status(400).end();
  if (isFavorite != null && typeof isFavorite !== 'boolean') return res.status(400).end();
  if (wasWatched != null && typeof wasWatched !== 'boolean') return res.status(400).end();

  try {
    const movie = await createMovie({
      title,
      imdbId,
      userId: req.user.id,
      guildId: req.guild.id,
      isFavorite,
      wasWatched,
    });
    await movie.reload({
      include: {
        model: MovieLists,
        as: 'lists',
        through: {
          attributes: [],
        },
      },
    });
    return res.status(200).json(movie);
  } catch (err) {
    error(err);
    return res.status(400).send(getErrorMsg(err));
  }
});

// @ts-expect-error
router.patch('/:guildId/:movieId', authMiddleware, guildMiddleware, movieMiddleware, async (req: MovieRequest, res) => {
  const { movie } = req;
  try {
    Object.entries(req.body).forEach(([key, value]) => {
      key = camelCaseToSnakeCase(key);
      if (isValidKey(movie.dataValues, key)) {
        // @ts-expect-error
        movie[key] = value;
      }
    });
    await movie.save();
    return res.status(200).json(movie);
  } catch (err) {
    error(err);
    return res.status(400).send(getErrorMsg(err));
  }
});

// @ts-expect-error
router.put('/:guildId/:movieId/lists', authMiddleware, guildMiddleware, movieMiddleware, async (req: MovieRequest, res) => {
  const { movie } = req;
  try {
    const isInvalid = !Array.isArray(req.body) || req.body.some(item => typeof item !== 'string');
    if (isInvalid) return res.status(400).end();

    const listIds: string[] = req.body;
    const newListsIds = listIds.filter(listId => !movie.lists?.some(l => l.id === listId));

    await MovieListsJunction.destroy({
      where: {
        movie_id: movie.id,
        list_id: {
          [Sequelize.Op.notIn]: listIds,
        },
      },
    });
    const maxOrders = await MovieListsJunction.findAll({
      attributes: [
        'list_id',
        [Sequelize.fn('MAX', Sequelize.col('order')), 'order'],
      ],
      where: {
        list_id: newListsIds,
      },
      group: ['list_id'],
    });
    await MovieListsJunction.bulkCreate(newListsIds.map(listId => ({
      movie_id: movie.id,
      list_id: listId,
      order: (maxOrders.find(l => l.list_id === listId)?.order || 0) + 1,
    })));

    await movie.reload();
    return res.status(200).json(movie);
  } catch (err) {
    error(err);
    return res.status(400).send(getErrorMsg(err));
  }
});

// @ts-expect-error
router.post('/:guildId/:movieId/start', authMiddleware, guildMiddleware, movieMiddleware, async (req: MovieRequest, res) => {
  const { movie } = req;
  await startMovie(movie);
  res.status(204).end();
});

// @ts-expect-error
router.delete('/:guildId/:movieId', authMiddleware, guildMiddleware, movieMiddleware, async (req: MovieRequest, res) => {
  const { movie } = req;
  const lists = await movie.getLists();
  if (lists.length > 0) {
    return res.status(400).send(`This movie cannot be deleted since it belongs to the following lists: ${lists.map(l => l.name).join(', ')}`);
  }
  await movie.destroy();
  return res.status(204).end();
});

// @ts-expect-error
router.get('/:guildId/lists', authMiddleware, guildMiddleware, async (req: AuthRequest<GuildRequest>, res) => {
  const data = await MovieLists.findAll({
    where: {
      guild_id: req.guild.id,
    },
    order: [
      ['createdAt', 'ASC'],
    ],
    include: includeOrderedMovies,
  });
  res.status(200).json(data);
});

// @ts-expect-error
router.get('/:guildId/lists/:listId', authMiddleware, guildMiddleware, listMiddleware({
  include: includeOrderedMovies,
}), (req: ListRequest, res) => {
  res.status(200).json(req.list);
});

// @ts-expect-error
router.post('/:guildId/lists', authMiddleware, guildMiddleware, async (req: MovieRequest, res) => {
  const { name, customId } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).end();
  if (customId && typeof customId !== 'string') return res.status(400).end();
  try {
    const list = await MovieLists.create({
      guild_id: req.guild.id,
      name: name.trim(),
      custom_id: customId?.trim() || null,
    });
    // This will be empty, but it's important for the frontend to always have the "movies" association populated, even if empty.
    await list.reload({
      include: {
        model: Movies,
        as: 'movies',
        through: {
          attributes: [],
        },
      },
    });
    return res.status(200).json(list);
  } catch (err) {
    error(err);
    return res.status(400).send(getErrorMsg(err));
  }
});

// @ts-expect-error
router.patch('/:guildId/lists/:listId', authMiddleware, guildMiddleware, listMiddleware(), async (req: ListRequest, res) => {
  const { list } = req;
  let { name, customId } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).end();
  if (customId && typeof customId !== 'string') return res.status(400).end();
  try {
    name = name?.trim();
    customId = customId?.trim();
    await list.update({
      name,
      custom_id: customId === '' ? null : customId,
    });
    return res.status(200).json(list);
  } catch (err) {
    error(err);
    return res.status(400).send(getErrorMsg(err));
  }
});

// @ts-expect-error
router.put('/:guildId/lists/:listId/items', authMiddleware, guildMiddleware, listMiddleware(), async (req: ListRequest, res) => {
  const { list } = req;
  try {
    const isInvalid = req.body.some((item: IntentionalAny) => !('movieId' in item) || !('order' in item));
    if (isInvalid) return res.status(400).end();
    // TODO: Is there really no better way to do this?
    // The obvious downside is that if adding a movie fails, all the associations have already been removed
    // https://github.com/sequelize/sequelize/issues/9061
    await list.setMovies([]);
    await Promise.all(req.body.map(({ movieId, order }: { movieId: IntentionalAny, order: IntentionalAny }) => list.addMovie(movieId, {
      through: {
        order,
      },
    }).catch(error)));
    await list.reload({
      include: [
        {
          model: Movies,
          as: 'movies',
          through: {
            attributes: [],
          },
          attributes: [
            'id',
            [Sequelize.literal('"movies->MovieListsJunction"."order"'), 'order'],
          ],
        },
      ],
    });
    return res.status(200).json(list);
  } catch (err) {
    error(err);
    return res.status(400).send(getErrorMsg(err));
  }
});

// @ts-expect-error
router.delete('/:guildId/lists/:listId', authMiddleware, guildMiddleware, listMiddleware(), async (req: ListRequest, res) => {
  await req.list.destroy();
  return res.status(204).end();
});

// @ts-expect-error
router.put('/:guildId/:movieId/notes', authMiddleware, guildMiddleware, movieMiddleware, async (req: MovieRequest, res) => {
  const { movie } = req;
  const { note } = req.body;
  if (!note || typeof note !== 'string') return res.status(400).end();
  try {
    const [movieNote] = await MovieNotes.upsert({
      movie_id: movie.id,
      author_id: req.user.id,
      note,
    }, { returning: true });
    return res.status(200).json(movieNote);
  } catch (err) {
    error(err);
    return res.status(400).send(getErrorMsg(err));
  }
});

// @ts-expect-error
router.delete('/:guildId/:movieId/notes', authMiddleware, guildMiddleware, movieMiddleware, async (req: MovieRequest, res) => {
  const { movie } = req;
  await MovieNotes.destroy({
    where: {
      movie_id: movie.id,
      author_id: req.user.id,
    },
  });
  res.status(204).end();
});

export default router;
