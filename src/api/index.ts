import dotenv from 'dotenv';
import express from 'express';
import axios from 'axios';

import { WAKE_INTERVAL } from 'src/constants';
import { log, error } from 'src/logging';

// Routers
import authRouter from './auth';

dotenv.config();

function preventSleep() {
  const host = process.env.PING_HOST;
  if (!host) return;
  log('Pinging', host, 'on timeout', WAKE_INTERVAL);
  setTimeout(async () => {
    try {
      await axios.get(host);
      log('Successful ping!');
    } catch (err) {
      error(err);
    }
    preventSleep();
  }, WAKE_INTERVAL);
}

const app = express();

export function initApi(): void {
  app.get('/', (req, res) => res.send('Healthy!'));
  app.use('/auth', authRouter);
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    log('Listening on port', port);
    preventSleep();
  });
}
