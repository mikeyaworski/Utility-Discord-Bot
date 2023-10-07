import express from 'express';
import authMiddleware, { AuthRequest } from 'src/api/middlewares/auth';
import { ChannelType } from 'src/api/types';
import { isText, usersHaveChannelPermission } from 'src/discord-utils';
import { Guild } from 'discord.js';
import { guildMiddleware } from 'src/api/middlewares/guild';

const router = express.Router();

interface ChannelResponse {
  id: string,
  name: string,
  type: ChannelType,
  parent: null | {
    id: string,
    name: string,
  },
}

interface RoleResponse {
  id: string,
  name: string,
  mentionable: boolean,
}

interface MemberResponse {
  id: string,
  userId: string,
  name: string,
  avatar: string | null,
}

type GuildRequest = AuthRequest & {
  guild: Guild,
}

// @ts-expect-error
router.get('/:guildId/channels', authMiddleware, guildMiddleware, async (req: GuildRequest, res) => {
  const channels: ChannelResponse[] = req.guild.channels.cache
    .filter(channel => isText(channel))
    .filter(channel => usersHaveChannelPermission({
      users: req.user.id,
      channel,
      permissions: 'ViewChannel',
    }))
    .map(c => ({
      id: c.id,
      name: c.name,
      type: c.isVoiceBased()
        ? ChannelType.VOICE
        : c.isDMBased()
          ? ChannelType.DM
          : c.isTextBased()
            ? ChannelType.TEXT
            : c.isThread()
              ? ChannelType.THREAD
              : ChannelType.OTHER,
      parent: c.parent ? {
        id: c.parent.id,
        name: c.parent.name,
      } : null,
    }));
  return res.status(200).json(channels);
});

// @ts-expect-error
router.get('/:guildId/roles', authMiddleware, guildMiddleware, async (req: GuildRequest, res) => {
  const roles: RoleResponse[] = req.guild.roles.cache
    .map(role => ({
      id: role.id,
      name: role.name,
      mentionable: role.mentionable,
    }));
  return res.status(200).json(roles);
});

// @ts-expect-error
router.get('/:guildId/members', authMiddleware, guildMiddleware, async (req: GuildRequest, res) => {
  const members: MemberResponse[] = req.guild.members.cache
    .map(member => ({
      id: member.id,
      userId: member.user.id,
      name: member.displayName,
      avatar: member.displayAvatarURL(),
    }));
  return res.status(200).json(members);
});

export default router;
