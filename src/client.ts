import dotenv from 'dotenv';
import { Client } from 'discord.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';

import { log, warn, error } from 'src/logging';

import commands, { listenToCommands } from 'src/commands';
import events from 'src/events';
import type { IntentionalAny } from 'src/types';

dotenv.config();

const token = process.env.DISCORD_BOT_TOKEN || '';
const clientId = process.env.DISCORD_BOT_CLIENT_ID || '';
const isDev = process.env.ENVIRONMENT === 'development';
const slashCommandsGuildId = process.env.SLASH_COMMANDS_GUILD_ID || '';

export const client = new Client({
  partials: ['MESSAGE', 'CHANNEL', 'REACTION'],
  intents: [
    'GUILDS',
    'GUILD_BANS',
    'GUILD_MEMBERS',
    'GUILD_PRESENCES',
    'GUILD_MESSAGES',
    'GUILD_MESSAGE_REACTIONS',
    'GUILD_MESSAGE_TYPING',
    'DIRECT_MESSAGES',
    'DIRECT_MESSAGE_REACTIONS',
    'DIRECT_MESSAGE_TYPING',
  ],
});

const rest = new REST({ version: '9' }).setToken(token);

export function initClient(): Promise<IntentionalAny> {
  return Promise.all([
    new Promise<void>(resolve => {
      events.forEach(([trigger, cb]) => {
        // @ts-ignore It's really hard to enforce correct types here. Just trust that the EventTrigger type is written correctly.
        client.on(trigger, cb);
      });

      client.on('ready', () => {
        log(`Logged in as ${client.user?.tag} (${client.user?.id})`);
        resolve();
      });
      client.on('warn', warn);
      client.on('error', error);

      listenToCommands();

      client.login(token);
    }),
    (async () => {
      const body = commands.map(command => command.data.toJSON());
      if (isDev && slashCommandsGuildId) {
        await rest.put(
          Routes.applicationGuildCommands(clientId, slashCommandsGuildId),
          { body },
        );
      } else {
        await rest.put(
          Routes.applicationCommands(clientId),
          { body },
        );
      }
    })(),
  ]);
}

export function destroyClient(): void {
  log('Tearing down client connection');
  client.destroy();
}
