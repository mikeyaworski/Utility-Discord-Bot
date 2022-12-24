import dotenv from 'dotenv';
import express from 'express';
import { Server as SocketIoServer } from 'socket.io';
import Http from 'http';
import axios from 'axios';
import cookieParser from 'cookie-parser';
import cors from 'cors';

// Routers
import authRouter from 'src/api/routes/auth';
import remindersRouter from 'src/api/routes/reminders';
import guildsRouter from 'src/api/routes/guilds';
import dmsRouter from 'src/api/routes/dms';
import chessRouter from 'src/api/routes/chess';
import webhooksRouter from 'src/api/routes/webhooks';

import { WAKE_INTERVAL } from 'src/constants';
import { log, error } from 'src/logging';

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

const corsOptions = Object.freeze({
  credentials: true,
  origin: process.env.ENVIRONMENT === 'production'
    ? [
      /^https:\/\/utilitydiscordbot\.com$/,
      /^https:\/\/utilitybot\.ca$/,
    ] : [
      /^https?:\/\/localhost(:\d+)?$/,
    ],
});

const app = express();
const httpServer = Http.createServer(app);
export const socketIoServer = new SocketIoServer(httpServer, {
  cors: corsOptions,
});

export function initApi(): void {
  app.get('/', (req, res) => res.send('Healthy!'));
  app.use(cors(corsOptions));
  app.use(cookieParser());
  app.use(express.json());
  app.use('/auth', authRouter);
  app.use('/reminders', remindersRouter);
  app.use('/guilds', guildsRouter);
  app.use('/dms', dmsRouter);
  app.use('/chess', chessRouter);
  app.use('/webhooks', webhooksRouter);
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  httpServer.listen(port, () => {
    log('Listening on port', port);
    preventSleep();
  });
}
