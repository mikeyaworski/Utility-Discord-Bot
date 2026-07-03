import { Response, NextFunction } from 'express';
import { AuthRequest } from 'src/api/middlewares/auth';
import { client } from 'src/client';
import { IntentionalAny } from 'src/types';

export async function guildMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<IntentionalAny> {
  const guildId = req.params.guildId;
  if (!guildId) return res.status(400).send('guildId parameter is required.');
  const apiGuild = req.user.guilds.find(g => g.id === guildId);
  if (!apiGuild) return res.status(404).send('Could not find guild');
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return res.status(404).send('Could not find guild');
  if (!guild.members.cache.has(req.user.id)) return res.status(404).end();
  // @ts-expect-error
  req.guild = guild;
  return next();
}

export async function isInSharedGuild(req: AuthRequest, res: Response, next: NextFunction): Promise<IntentionalAny> {
  if (!req.user) return res.status(401).end();
  if (!req.user.guilds.length) return res.status(403).send('User is not in any shared guilds with the bot');
  return next();
}
