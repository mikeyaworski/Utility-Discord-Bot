import { VoiceBasedChannel } from 'discord.js';
import { PlayerSettings } from 'src/models/player-settings';
import Session from './session';

export class Sessions {
  private sessions = new Map<string, Session>();

  public async create(channel: VoiceBasedChannel): Promise<Session> {
    const playerSettings = await PlayerSettings.findByPk(channel.guildId);
    const session = new Session(channel, playerSettings?.normalize ?? false);
    this.sessions.set(channel.guild.id, session);
    return session;
  }

  public get(guildId: string): Session | undefined {
    return this.sessions.get(guildId);
  }

  public destroy(guildId: string): void {
    const session = this.get(guildId);
    if (session) {
      session.destroy();
      this.sessions.delete(guildId);
    }
  }
}

const sessions = new Sessions();
export default sessions;
