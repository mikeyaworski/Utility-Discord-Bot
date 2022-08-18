import type { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import NodeCache from 'node-cache';
import type { IntentionalAny } from 'src/types';
import { error } from 'src/logging';
import { client } from 'src/client';

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

export default async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.cookies.auth) {
    res.status(401).end();
    return;
  }
  try {
    // @ts-expect-error
    const authReq: AuthRequest = req;

    const cacheRes = cache.get<User>(req.cookies.auth);
    if (cacheRes) {
      authReq.user = cacheRes;
    } else {
      const [userRes, guildsRes] = await Promise.all([
        axios.get('https://discord.com/api/users/@me', {
          headers: {
            authorization: req.cookies.auth,
          },
        }),
        axios.get('https://discord.com/api/users/@me/guilds', {
          headers: {
            authorization: req.cookies.auth,
          },
        }),
      ]);
      const { data: userData } = userRes;
      const { data: guildsData } = guildsRes;
      authReq.user = {
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
      cache.set(req.cookies.auth, authReq.user);
    }
    next();
  } catch (err) {
    error(err);
    res.status(401).end();
  }
}

export function clearCache(auth: string): void {
  cache.del(auth);
}
