import { StageChannel, VoiceChannel } from 'discord.js';
import Session from './session';

export class Sessions {
  private sessions = new Map<string, Session>();

  public create(channel: VoiceChannel | StageChannel): Session {
    const session = new Session(channel);
    this.sessions.set(channel.guild.id, session);
    return session;
  }

  public get(guildId: string): Session | undefined {
    return this.sessions.get(guildId);
  }

  public destroy(guildId: string): void {
    const session = this.get(guildId);
    if (!session) return;
    const voiceConnection = session.getVoiceConnection();
    if (voiceConnection) voiceConnection.destroy();
    this.sessions.delete(guildId);
  }
}

const sessions = new Sessions();
export default sessions;
