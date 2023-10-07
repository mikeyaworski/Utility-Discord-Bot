import { VoiceBasedChannel } from 'discord.js';
import Session from './session';

export class Sessions {
  private sessions = new Map<string, Session>();

  public create(channel: VoiceBasedChannel): Session {
    const session = new Session(channel);
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
