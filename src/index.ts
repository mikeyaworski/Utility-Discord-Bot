import dotenv from 'dotenv';
import express from 'express';
import axios from 'axios';

import { WAKE_INTERVAL } from 'src/constants';

dotenv.config();

/* eslint-disable no-console */
function preventSleep() {
  const host = process.env.PING_HOST;
  console.log('Pinging', host, 'on timeout', WAKE_INTERVAL);
  setTimeout(async () => {
    // TODO
    try {
      await axios.get(host);
      console.log('Successful ping!');
    } catch (err) {
      console.error(err);
    }
    preventSleep();
  }, WAKE_INTERVAL);
}
/* eslint-enable no-console */

// endpoint for pinging the server to keep it alive
const app = express();
app.get('/', (req, res) => res.send('Healthy!'));
app.listen(process.env.PORT || 3000, preventSleep);

// TODO: initialize Discord client and create test operation.
