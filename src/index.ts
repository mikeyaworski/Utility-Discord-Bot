import dotenv from 'dotenv';
import express from 'express';
import axios from 'axios';

import { WAKE_INTERVAL } from 'src/constants';
import { log, error } from 'src/logging';
import { initClient, destroyClient } from 'src/client';
import { syncModels } from 'src/models';
import jobs from 'src/jobs';

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

// endpoint for pinging the server to keep it alive
const app = express();
app.get('/', (req, res) => res.send('Healthy!'));
const port = process.env.PORT || 3000;
app.listen(port, () => {
  log('Listening on port', port);
  preventSleep();
});

(async () => {
  await syncModels();
  await initClient();
  await Promise.all(jobs.map(job => job()));
})();

process.on('SIGTERM', destroyClient);
