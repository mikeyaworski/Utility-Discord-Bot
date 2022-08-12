import express from 'express';
import authMiddleware, { AuthRequest } from 'src/api/middlewares/auth';
import { getNextInvocation, removeReminder, setReminder } from 'src/jobs/reminders';
import { error } from 'src/logging';
import { Reminder, Reminders } from 'src/models/reminders';

const router = express.Router();

// TODO: For all of these, support reminders that you don't necessarily own, but that you have access to
// Export a util that checks if the user can manage messages in the channel where this exists in
// or they own it
// Make sure that the channel ID they change it to exists and is in the same guild as the previous channel

interface ReminderResponse {
  model: Reminder,
  nextRun: number | null | undefined,
}

function getReminderResponse(reminder: Reminder): ReminderResponse {
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
  const reminders = await Reminders.findAll({
    where: {
      owner_id: req.user.id,
    },
  });
  const json = reminders.map(getReminderResponse);
  res.status(200).json(json);
});

// @ts-expect-error
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const reminder = await Reminders.findOne({
      where: {
        id: req.params.id,
        owner_id: req.user.id,
      },
    });
    if (!reminder) return res.status(404).end();
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
        owner_id: req.user.id,
      },
    });
    if (!reminder) return res.status(404).end();
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
        owner_id: req.user.id,
      },
    });
    if (!reminder) return res.status(404).end();
    await reminder.update(req.body);
    setReminder(reminder);
    return res.status(200).json(getReminderResponse(reminder));
  } catch (err) {
    error(err);
    return res.status(400).end();
  }
});

// @ts-expect-error
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const reminder = await Reminders.create(req.body);
    setReminder(reminder);
    return res.status(200).json(getReminderResponse(reminder));
  } catch (err) {
    error(err);
    return res.status(400).end();
  }
});

export default router;
