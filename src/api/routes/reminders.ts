import express from 'express';
import { Op } from 'sequelize';
import authMiddleware, { AuthRequest } from 'src/api/middlewares/auth';
import { client } from 'src/client';
import {
  isChannelInSameGuild,
  userCanManageReminder,
  userCanViewReminder,
  checkMessageErrors,
  isText,
} from 'src/discord-utils';
import { getNextInvocation, removeReminder, setReminder } from 'src/jobs/reminders';
import { error } from 'src/logging';
import { Reminder, Reminders } from 'src/models/reminders';
import { ReminderResponse } from 'src/types';
import { SocketEventTypes } from 'src/types/sockets';
import { emit, getManageReminderRooms } from 'src/api/sockets';

const router = express.Router();

export function getReminderResponse(reminder: Reminder): ReminderResponse {
  try {
    return {
      model: reminder,
      nextRun: getNextInvocation(reminder.id),
    };
  } catch (err) {
    error(err);
    return {
      model: reminder,
      nextRun: null,
    };
  }
}

// @ts-expect-error
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const guildIds: (string | null)[] = [];
  if (typeof req.query.guild_id === 'string') guildIds.push(req.query.guild_id);
  else if (Array.isArray(req.query.guild_id)) {
    req.query.guild_id.forEach(guildId => {
      if (typeof guildId === 'string') guildIds.push(guildId);
    });
  }
  if (!guildIds.length) guildIds.push(null);

  const reminders = await Reminders.findAll({
    where: {
      [Op.or]: [
        ...guildIds.map(guildId => ({
          guild_id: guildId,
        })),
      ],
    },
  });
  const canView = await Promise.all(reminders.map(reminder => userCanManageReminder(reminder, req.user.id)));
  const json = reminders
    .filter((reminder, i) => canView[i])
    .map(getReminderResponse);
  res.status(200).json(json);
});

// @ts-expect-error
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const reminder = await Reminders.findOne({
      where: {
        id: req.params.id,
      },
    });
    if (!reminder) return res.status(404).end();
    if (!userCanViewReminder(reminder, req.user.id)) return res.status(401).send('You do not have permission to change this reminder.');
    return res.status(200).json(getReminderResponse(reminder));
  } catch (err) {
    error(err);
    return res.status(400).end();
  }
});

// @ts-expect-error
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const reminder = await Reminders.findOne({
      where: {
        id: req.params.id,
      },
    });
    if (!reminder) return res.status(404).end();
    if (!userCanManageReminder(reminder, req.user.id)) return res.status(401).send('You do not have permission to change this reminder.');
    await removeReminder(reminder.id);
    return res.status(204).end();
  } catch (err) {
    error(err);
    return res.status(400).end();
  }
});

// @ts-expect-error
router.put('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const reminder = await Reminders.findOne({
      where: {
        id: req.params.id,
      },
    });
    if (!reminder) return res.status(404).end();
    if (!userCanManageReminder(reminder, req.user.id)) {
      return res.status(401).send('You do not have permission to change this reminder.');
    }
    const body: Reminder = req.body;
    if (!isChannelInSameGuild(reminder, body.channel_id)) {
      return res.status(400).send('You cannot move the reminder to another guild.');
    }
    const channel = await client.channels.fetch(body.channel_id);
    if (!channel || !isText(channel)) {
      return res.status(404).send('Channel does not exist');
    }
    checkMessageErrors({
      message: body.message,
      channel,
      author: req.user.id,
    });
    await reminder.update(body);
    const reminderResponse = getReminderResponse(reminder);
    emit({
      type: SocketEventTypes.REMINDER_UPDATED,
      data: reminderResponse,
    }, getManageReminderRooms(reminder));
    setReminder(reminder);
    return res.status(200).json(reminderResponse);
  } catch (err) {
    error(err);
    return res.status(400).send(err);
  }
});

// @ts-expect-error
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    type Payload = Omit<Reminder, 'id' | 'guild_id' | 'owner_id'>;
    const body: Payload = req.body;
    const channel = await client.channels.fetch(body.channel_id);
    if (!channel || !isText(channel)) {
      return res.status(404).send('Channel does not exist');
    }
    checkMessageErrors({
      message: body.message,
      channel,
      author: req.user.id,
    });
    const reminder = await Reminders.create({
      ...body,
      owner_id: req.user.id,
      guild_id: channel.isDMBased() ? null : channel.guildId,
    });
    const reminderResponse = getReminderResponse(reminder);
    emit({
      type: SocketEventTypes.REMINDER_CREATED,
      data: reminderResponse,
    }, getManageReminderRooms(reminder));
    setReminder(reminder);
    return res.status(200).json(reminderResponse);
  } catch (err) {
    error(err);
    return res.status(400).end();
  }
});

export default router;
