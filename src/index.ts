import { WAKE_INTERVAL } from 'src/constants';
import { log, error } from 'src/logging';
import { initClient, destroyClient } from 'src/client';
import { syncModels } from 'src/models';
import { initApi } from 'src/api';
import jobs from 'src/jobs';

(async () => {
  await syncModels();
  await initClient();
  await Promise.all(jobs.map(job => job()));
  initApi();
})();

process.on('SIGTERM', destroyClient);
