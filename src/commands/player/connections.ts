import { VoiceConnection } from '@discordjs/voice';
import { Guild } from 'discord.js';

interface Connection {
  guild: Guild;
  voiceConnection: VoiceConnection;
}

export const connections: Connection[] = [];

export function create(guild: Guild, voiceConnection: VoiceConnection): void {
  connections.push({
    guild,
    voiceConnection,
  });
}

export function get(guild: Guild): Connection | undefined {
  return connections.find(c => c.guild.id === guild.id);
}

export function disconnect(guild: Guild): void {
  while (get(guild)) {
    const idx = connections.findIndex(c => c.guild.id === guild.id);
    const connection = connections.splice(idx, 1);
    connection[0]?.voiceConnection.disconnect();
  }
}
