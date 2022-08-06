import express from 'express';
import authMiddleware, { AuthRequest } from 'src/api/middlewares/auth';
import { Reminders } from 'src/models/reminders';

const router = express.Router();

// @ts-expect-error
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const reminders = await Reminders.findAll({
    where: {
      owner_id: req.user.id,
    },
  });
  res.status(200).json(reminders);
});

export default router;
