import dotenv from 'dotenv';
import express from 'express';
import axios from 'axios';

import { WAKE_INTERVAL } from 'src/constants';
import { log, error } from 'src/logging';
import { initClient } from './client';

dotenv.config();

function preventSleep() {
  const host = process.env.PING_HOST;
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

// endpoint for pinging the server to keep it alive
const app = express();
app.get('/', (req, res) => res.send('Healthy!'));
app.listen(process.env.PORT || 3000, preventSleep);

initClient();
