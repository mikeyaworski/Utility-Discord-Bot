import type { Request, Response, NextFunction, CookieOptions } from 'express';
import axios from 'axios';
import NodeCache from 'node-cache';
import get from 'lodash.get';
import type { IntentionalAny } from 'src/types';
import { log, error } from 'src/logging';
import { client } from 'src/client';
import { LONG_COOKIE_TIMEOUT } from 'src/constants';

const cache = new NodeCache({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  stdTTL: 600,
  checkperiod: 120,
});

// https://discord.com/developers/docs/resources/guild#guild-object
export interface Guild {
  id: string,
  name: string,
  icon: string,
}

// https://discord.com/developers/docs/resources/user#user-object
export interface User {
  id: string,
  username: string,
  discriminator: string,
  avatar: string,
  guilds: Guild[],
}

export type AuthRequest<T = Request> = T & {
  user: User,
}

export type GuildRequest<T = Request> = T & {
  guild: Guild,
}

// Storing promises in a global variable lets us avoid rate limiting issues if multiple
// endpoints are hit simultaneously and there is a cache miss. This ensures the Discord API
// requests will be made only once since all request handlers will await the same promise
// instead of making duplicate requests to Discord.
const discordPromises: {
  [authToken: string]: Promise<IntentionalAny>[],
} = {};
const refreshTokenPromises: {
  [refreshToken: string]: Promise<IntentionalAny>,
} = {};

export async function getUserFromAuthToken(auth: string): Promise<User> {
  const cacheRes = cache.get<User>(auth);
  if (cacheRes) return cacheRes;

  if (!discordPromises[auth]) {
    discordPromises[auth] = [
      axios.get('https://discord.com/api/users/@me', {
        headers: {
          authorization: auth,
        },
      }),
      axios.get('https://discord.com/api/users/@me/guilds', {
        headers: {
          authorization: auth,
        },
      }),
    ];
  }
  const [userRes, guildsRes] = await Promise.all(discordPromises[auth]).catch(err => {
    delete discordPromises[auth];
    throw err;
  });

  const { data: userData } = userRes;
  const { data: guildsData } = guildsRes;
  const user: User = {
    id: userData.id,
    username: userData.username,
    discriminator: userData.discriminator,
    avatar: userData.avatar,
    guilds: guildsData
      .filter((guild: IntentionalAny) => client.guilds.cache.has(guild.id))
      .map((guild: IntentionalAny) => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
      })),
  };
  cache.set(auth, user);
  delete discordPromises[auth];
  return user;
}

export function getBaseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.ENVIRONMENT === 'production',
    // Allow for aliased domains like utilitybot.ca
    sameSite: process.env.ENVIRONMENT === 'production' ? 'none' : 'lax',
  };
}

interface TokenRes {
  access_token: string,
  expires_in: number,
  refresh_token: string,
  scope: string,
  token_type: string,
}
export function logIn(res: Response, tokenRes: TokenRes): string {
  const auth = `${tokenRes.token_type} ${tokenRes.access_token}`;
  res.cookie('auth', auth, {
    ...getBaseCookieOptions(),
    maxAge: tokenRes.expires_in ? tokenRes.expires_in * 1000 : undefined,
  });
  res.cookie('refresh_token', tokenRes.refresh_token, {
    ...getBaseCookieOptions(),
    maxAge: LONG_COOKIE_TIMEOUT,
  });
  return auth;
}

export default async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // eslint-disable-next-line prefer-const
  let { auth, refresh_token: refreshToken } = req.cookies;
  if (!auth && !refreshToken) {
    res.status(401).end();
    return;
  }
  if (!auth && refreshToken) {
    try {
      if (!refreshTokenPromises[refreshToken]) {
        log('Refreshing authentication token');
        refreshTokenPromises[refreshToken] = axios('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'content-type': 'application/x-www-form-urlencoded',
          },
          data: new URLSearchParams({
            client_id: process.env.DISCORD_BOT_CLIENT_ID!,
            client_secret: process.env.DISCORD_BOT_CLIENT_SECRET!,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }),
        });
      }
      const tokenRes = await refreshTokenPromises[refreshToken];
      auth = logIn(res, tokenRes.data);
      delete refreshTokenPromises[refreshToken];
    } catch (err) {
      if (get(err, 'response.status') === 400) {
        res.clearCookie('refresh_token', getBaseCookieOptions());
      }
      error(err);
    }
  }
  try {
    // @ts-expect-error
    const authReq: AuthRequest = req;
    authReq.user = await getUserFromAuthToken(auth);
    next();
  } catch (err) {
    error(err);
    res.status(401).end();
  }
}

export function clearCache(auth: string): void {
  cache.del(auth);
}
