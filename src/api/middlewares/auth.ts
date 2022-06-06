import type { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import type { IntentionalAny } from 'src/types';

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
    // @ts-expect-error
    const authReq: AuthRequest = req;
    authReq.user = {
      id: userData.id,
      username: userData.username,
      discriminator: userData.discriminator,
      avatar: userData.avatar,
      guilds: guildsData.map((guild: IntentionalAny) => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
      })),
    };
    next();
  } catch (err) {
    res.status(401).end();
  }
}
