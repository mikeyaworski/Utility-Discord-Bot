import axios from 'axios';
import express from 'express';
import { error } from 'src/logging';
import authMiddleware, {
  AuthRequest,
  getBaseCookieOptions,
  clearCache,
  logIn,
  loginCsrf,
  generateAnonymousId,
  csrf,
} from 'src/api/middlewares/auth';

const router = express.Router();

router.post('/login/csrf', async (req, res) => {
  generateAnonymousId(req, res);
  const token = loginCsrf.generateCsrfToken(req, res);
  res.status(200).json({ token });
});

router.post('/login', loginCsrf.doubleCsrfProtection, async (req, res) => {
  const { code, redirectUri } = req.body;
  if (!code || !redirectUri) {
    res.status(400).end();
    return;
  }
  try {
    const tokenRes = await axios('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'content-type': 'application/x-www-form-urlencoded',
      },
      data: new URLSearchParams({
        client_id: process.env.DISCORD_BOT_CLIENT_ID!,
        client_secret: process.env.DISCORD_BOT_CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        scope: 'identify',
      }),
    });
    const authorization = `${tokenRes.data.token_type} ${tokenRes.data.access_token}`;
    await axios.get('https://discord.com/api/users/@me', {
      headers: {
        authorization,
      },
    });
    logIn(res, tokenRes.data);
    res.status(204).end();
  } catch (err) {
    error(err);
    res.status(401).end();
  }
});

router.post('/logout', csrf.doubleCsrfProtection, async (req, res) => {
  clearCache(req.cookies.auth);
  res.clearCookie('auth', getBaseCookieOptions());
  res.clearCookie('refresh_token', getBaseCookieOptions());
  res.status(204).end();
});

// @ts-expect-error
router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  res.status(200).json(req.user);
});

export default router;
