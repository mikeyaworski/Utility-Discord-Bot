import axios from 'axios';
import express from 'express';
import { error } from 'src/logging';
import authMiddleware, { AuthRequest } from 'src/api/middlewares/auth';

const router = express.Router();

router.post('/login', async (req, res, next) => {
  const {
    token,
    tokenType,
    expiresIn,
  } = req.body;
  try {
    const authorization = `${tokenType} ${token}`;
    await axios.get('https://discord.com/api/users/@me', {
      headers: {
        authorization,
      },
    });
    res.cookie('auth', authorization, {
      httpOnly: true,
      secure: process.env.ENVIRONMENT === 'production',
      maxAge: expiresIn ? expiresIn * 1000 : undefined,
    });
    res.status(204).end();
  } catch (err) {
    error(err);
    res.status(401).end();
  }
});

router.post('/logout', async (req, res, next) => {
  res.clearCookie('auth');
  res.status(204).end();
});

// @ts-expect-error
router.get('/who_am_i', authMiddleware, async (req: AuthRequest, res, next) => {
  res.status(200).json(req.user);
});

export default router;
