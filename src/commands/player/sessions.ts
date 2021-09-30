import { joinVoiceChannel } from '@discordjs/voice';
import { Guild, StageChannel, VoiceChannel } from 'discord.js';
import Session from './session';

export class Sessions {
  private sessions = new Map<string, Session>();

  public create(channel: VoiceChannel | StageChannel): Session {
    const voiceConnection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
    });
    const session = new Session(channel.guild, voiceConnection);
    this.sessions.set(channel.guild.id, session);
    return session;
  }

  public get(guild: Guild): Session | undefined {
    return this.sessions.get(guild.id);
  }

  public destroy(guild: Guild): void {
    const session = this.get(guild);
    if (!session) return;
    session.voiceConnection.destroy();
    this.sessions.delete(guild.id);
  }
}

const sessions = new Sessions();
export default sessions;
