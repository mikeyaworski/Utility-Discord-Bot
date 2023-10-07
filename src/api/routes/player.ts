import express, { Response, NextFunction } from 'express';
import authMiddleware, { AuthRequest } from 'src/api/middlewares/auth';
import Session from 'src/commands/player/session';
import sessions from 'src/commands/player/sessions';
import { checkVoiceErrors, getErrorMsg, getRateLimiterFromEnv } from 'src/discord-utils';
import { getRateLimiterMiddleware } from 'src/api/middlewares/rate-limiter';
import { PlayerFavorites } from 'src/models/player-favorites';
import { play } from 'src/commands/player/play';
import { guildMiddleware } from '../middlewares/guild';

const rateLimiter = getRateLimiterFromEnv('PLAYER_USER_LIMIT', 'PLAYER_GUILD_LIMIT');
const rateLimiterMiddleware = getRateLimiterMiddleware(rateLimiter);

const router = express.Router();

type SessionRequest = AuthRequest & {
  playerSession: Session,
}

async function sessionPermissionMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const session = sessions.get(req.params.guildId);
  if (session) {
    try {
      await checkVoiceErrors({
        userId: req.user.id,
        guildId: req.params.guildId,
      });
    } catch (err) {
      return res.status(401).send((err as Error).message);
    }
  }
  return next();
}

async function sessionMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const session = sessions.get(req.params.guildId);
  if (!session) {
    return res.status(404).send('Player session not active on this guild');
  }
  // @ts-expect-error
  req.playerSession = session;
  return next();
}

// @ts-expect-error
router.get('/:guildId', authMiddleware, sessionPermissionMiddleware, sessionMiddleware, async (req: SessionRequest, res) => {
  const data = await req.playerSession.getPlayerStatus();
  res.status(200).json(data);
});

router.post(
  '/:guildId/resume',
  authMiddleware,
  // @ts-expect-error
  rateLimiterMiddleware,
  sessionPermissionMiddleware,
  sessionMiddleware,
  async (req: SessionRequest, res) => {
    if (req.playerSession.resume()) {
      res.status(204).end();
    } else {
      res.status(400).end();
    }
  },
);

router.post(
  '/:guildId/pause',
  authMiddleware,
  // @ts-expect-error
  rateLimiterMiddleware,
  sessionPermissionMiddleware,
  sessionMiddleware,
  async (req: SessionRequest, res) => {
    if (req.playerSession.pause()) {
      res.status(204).end();
    } else {
      res.status(400).end();
    }
  },
);

router.post(
  '/:guildId/skip',
  authMiddleware,
  // @ts-expect-error
  rateLimiterMiddleware,
  sessionPermissionMiddleware,
  sessionMiddleware,
  async (req: SessionRequest, res) => {
    await req.playerSession.skip();
    res.status(204).end();
  },
);

router.post(
  '/:guildId/queue/shuffle',
  authMiddleware,
  // @ts-expect-error
  rateLimiterMiddleware,
  sessionPermissionMiddleware,
  sessionMiddleware,
  async (req: SessionRequest, res) => {
    req.playerSession.shuffle();
    res.status(204).end();
  },
);

router.post(
  '/:guildId/queue/unshuffle',
  authMiddleware,
  // @ts-expect-error
  rateLimiterMiddleware,
  sessionPermissionMiddleware,
  sessionMiddleware,
  async (req: SessionRequest, res) => {
    req.playerSession.unshuffle();
    res.status(204).end();
  },
);

router.post(
  '/:guildId/queue/loop',
  authMiddleware,
  // @ts-expect-error
  rateLimiterMiddleware,
  sessionPermissionMiddleware,
  sessionMiddleware,
  async (req: SessionRequest, res) => {
    req.playerSession.loop();
    res.status(204).end();
  },
);

router.post(
  '/:guildId/queue/unloop',
  authMiddleware,
  // @ts-expect-error
  rateLimiterMiddleware,
  sessionPermissionMiddleware,
  sessionMiddleware,
  async (req: SessionRequest, res) => {
    req.playerSession.unloop();
    res.status(204).end();
  },
);

router.post(
  '/:guildId/queue/move',
  authMiddleware,
  // @ts-expect-error
  rateLimiterMiddleware,
  sessionPermissionMiddleware,
  sessionMiddleware,
  async (req: SessionRequest, res) => {
    if (req.body.from == null || req.body.to == null) {
      res.status(400).send('to and from indices are required.');
    } else {
      req.playerSession.move(req.body.from, req.body.to);
      res.status(204).end();
    }
  },
);

router.post(
  '/:guildId/queue/clear',
  authMiddleware,
  // @ts-expect-error
  rateLimiterMiddleware,
  sessionPermissionMiddleware,
  sessionMiddleware,
  async (req: SessionRequest, res) => {
    req.playerSession.clear();
    res.status(204).end();
  },
);

router.post(
  '/:guildId/queue/:trackId/remove',
  authMiddleware,
  // @ts-expect-error
  rateLimiterMiddleware,
  sessionPermissionMiddleware,
  sessionMiddleware,
  async (req: SessionRequest, res) => {
    req.playerSession.remove(req.params.trackId);
    res.status(204).end();
  },
);

router.post(
  '/:guildId/queue/:trackId/play_immediately',
  authMiddleware,
  // @ts-expect-error
  rateLimiterMiddleware,
  sessionPermissionMiddleware,
  sessionMiddleware,
  async (req: SessionRequest, res) => {
    const idx = req.playerSession.queue.findIndex(track => track.id === req.params.trackId);
    if (idx < 0) {
      return res.status(404).end();
    }
    req.playerSession.move(idx, 0);
    await req.playerSession.skip();
    return res.status(204).end();
  },
);

router.get(
  '/:guildId/favorites',
  authMiddleware,
  // @ts-expect-error
  guildMiddleware,
  async (req: AuthRequest, res) => {
    const favorites = await PlayerFavorites.findAll({
      where: {
        guild_id: req.params.guildId,
      },
    });
    res.status(200).json(favorites);
  },
);

router.post(
  '/:guildId/play',
  authMiddleware,
  // @ts-expect-error
  rateLimiterMiddleware,
  sessionPermissionMiddleware,
  async (req: SessionRequest, res) => {
    try {
      await play({
        invoker: {
          userId: req.user.id,
          guildId: req.params.guildId,
        },
        inputs: {
          vodLink: req.body.vodLink,
          favoriteId: req.body.favoriteId,
          streamLink: req.body.streamLink,
          queryStr: req.body.queryStr,
          pushToFront: req.body.pushToFront,
          shuffle: req.body.shuffle,
        },
      });
      res.status(204).end();
    } catch (err) {
      res.status(400).send(getErrorMsg(err));
    }
  },
);

export default router;
