import express, { Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import authMiddleware, { AuthRequest } from 'src/api/middlewares/auth';
import { error } from 'src/logging';
import { ChessGames } from 'src/models/chess-games';
import { acceptChallenge, challengeUser, declineChallenge, forfeitGame, makeMove, undoMove } from 'src/commands/chess';
import { client } from 'src/client';
import { ChessGameResponse } from 'src/types';

const router = express.Router();

type GameRequest = AuthRequest & {
  game: ChessGames,
}

async function gameMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const game = await ChessGames.findOne({
      where: {
        id: req.params.id,
        [Op.or]: [
          { white_user_id: req.user.id },
          { black_user_id: req.user.id },
        ],
      },
    });
    if (!game) return res.status(404).send('Could not find chess game');
    // @ts-expect-error
    req.game = game;
    return next();
  } catch (err) {
    error(err);
    return res.status(400).end();
  }
}

function handleError(err: unknown, res: Response) {
  // @ts-expect-error We know this function throws a literal of this structure
  res.status(err.status || 400).send(err.message);
}

export async function getGameResponse(game: ChessGames): Promise<ChessGameResponse> {
  const guild = await client.guilds.fetch(game.guild_id);
  if (!guild) {
    throw {
      status: 404,
      message: 'Could not find guild',
    };
  }
  const [white, black] = await Promise.all([
    game.white_user_id ? guild.members.fetch(game.white_user_id) : null,
    game.black_user_id ? guild.members.fetch(game.black_user_id) : null,
  ]);
  return {
    model: game,
    label: `${white?.user.tag} vs ${black?.user.tag}`,
  };
}

async function refetchGameAndRespond(gameId: ChessGames['id'], res: Response): Promise<void> {
  const refetchedGame = await ChessGames.findByPk(gameId);
  if (!refetchedGame) res.status(204).end();
  else res.status(200).json(await getGameResponse(refetchedGame));
}

// @ts-expect-error
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const games = await ChessGames.findAll({
    where: {
      [Op.or]: [
        { white_user_id: req.user.id },
        { black_user_id: req.user.id },
      ],
    },
  });
  const response = await Promise.all(games.map(getGameResponse));
  res.status(200).json(response);
});

// @ts-expect-error
router.get('/:id', authMiddleware, gameMiddleware, async (req: GameRequest, res) => {
  res.status(200).json(await getGameResponse(req.game));
});

// @ts-expect-error
router.post('/:id/forfeit', authMiddleware, gameMiddleware, async (req: GameRequest, res) => {
  const { game } = req;
  try {
    await forfeitGame({
      game,
      userId: req.user.id,
    });
    res.status(204).end();
  } catch (err) {
    handleError(err, res);
  }
});

// @ts-expect-error
router.post('/:id/undo', authMiddleware, gameMiddleware, async (req: GameRequest, res) => {
  const { game } = req;
  try {
    await undoMove({
      game,
      userId: req.user.id,
    });
    await refetchGameAndRespond(game.id, res);
  } catch (err) {
    handleError(err, res);
  }
});

// @ts-expect-error
router.post('/:id/accept', authMiddleware, gameMiddleware, async (req: GameRequest, res) => {
  const { game } = req;
  try {
    await acceptChallenge({
      game,
      userId: req.user.id,
    });
    await refetchGameAndRespond(game.id, res);
  } catch (err) {
    handleError(err, res);
  }
});

// @ts-expect-error
router.post('/:id/decline', authMiddleware, gameMiddleware, async (req: GameRequest, res) => {
  const { game } = req;
  try {
    await declineChallenge({
      game,
      userId: req.user.id,
    });
    res.status(204).end();
  } catch (err) {
    handleError(err, res);
  }
});

// @ts-expect-error
router.post('/:id/move', authMiddleware, gameMiddleware, async (req: GameRequest, res) => {
  const { game } = req;
  const { move } = req.body;
  if (!move) return res.status(400).send('move is required');
  try {
    await makeMove({
      game,
      userId: req.user.id,
      move: req.body.move,
    });
    return refetchGameAndRespond(game.id, res);
  } catch (err) {
    return handleError(err, res);
  }
});

// @ts-expect-error
router.post('/challenge', authMiddleware, async (req: AuthRequest, res) => {
  const {
    guildId,
    channelId,
    challengedUserId,
    color = null,
    startingPosition = null,
  } = req.body;
  if (!guildId) return res.status(400).send('guildId is required');
  if (!channelId) return res.status(400).send('channelId is required');
  if (!challengedUserId) return res.status(400).send('challengedUserId is required');
  try {
    const game = await challengeUser({
      userId: req.user.id,
      guildId,
      channelId,
      challengedUserId,
      color,
      startingPosition,
    });
    return res.status(200).json(await getGameResponse(game));
  } catch (err) {
    return handleError(err, res);
  }
});

export default router;
