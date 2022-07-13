import Discord, { EmbedFieldData } from 'discord.js';
import { AnyInteraction, IntentionalAny } from 'src/types';
// import { eventuallyRemoveComponents } from 'src/discord-utils';
import { Colors, FAST_FORWARD_BUTTON_TIME, INTERACTION_MAX_TIMEOUT, REWIND_BUTTON_TIME } from 'src/constants';
import { error, log } from 'src/logging';
import { filterOutFalsy, getClockString } from 'src/utils';
import { getErrorMsg } from 'src/discord-utils';
import Session from './session';
import Track, { VideoDetails } from './track';
import { handleList } from './queue';

export function getPlayerButtons(session: Session, interaction: AnyInteraction): Discord.MessageActionRow[] {
  const commandName = interaction.isCommand()
    ? `${interaction.commandName} ${interaction.options.getSubcommand(false)}`
    : interaction.isContextMenu()
      ? interaction.commandName
      : null;
  const firstRow = new Discord.MessageActionRow<Discord.MessageButton>({
    components: [
      session.isPaused()
        ? new Discord.MessageButton({
          customId: 'resume',
          label: 'Resume',
          style: 'SUCCESS',
        })
        : new Discord.MessageButton({
          customId: 'pause',
          label: 'Pause',
          style: 'SUCCESS',
        }),
      new Discord.MessageButton({
        customId: 'skip',
        label: 'Skip',
        style: 'SUCCESS',
      }),
      session.isLooped()
        ? new Discord.MessageButton({
          customId: 'unloop',
          label: 'Unloop',
          style: 'PRIMARY',
        })
        : new Discord.MessageButton({
          customId: 'loop',
          label: 'Loop',
          style: 'PRIMARY',
        }),
      new Discord.MessageButton({
        customId: 'shuffle',
        label: 'Shuffle',
        style: 'PRIMARY',
      }),
      new Discord.MessageButton({
        customId: 'clear',
        label: 'Clear',
        style: 'DANGER',
      }),
    ],
  });
  const secondRow = new Discord.MessageActionRow<Discord.MessageButton>({
    components: filterOutFalsy([
      new Discord.MessageButton({
        customId: 'refresh',
        label: 'Refresh',
        style: 'SECONDARY',
      }),
      new Discord.MessageButton({
        customId: 'rewind',
        label: `⏪ ${REWIND_BUTTON_TIME / 1000}s`,
        style: 'SECONDARY',
      }),
      new Discord.MessageButton({
        customId: 'fast-forward',
        label: `⏩ ${FAST_FORWARD_BUTTON_TIME / 1000}s`,
        style: 'SECONDARY',
      }),
      commandName !== 'queue list' && new Discord.MessageButton({
        customId: 'show-queue',
        label: 'Show Queue',
        style: 'SECONDARY',
      }),
    ]),
  });

  return [firstRow, secondRow];
}

export async function listenForPlayerButtons(
  interaction: AnyInteraction,
  session: Session,
  cb?: () => Promise<unknown>,
): Promise<void> {
  try {
    const msg = await interaction.fetchReply();
    const collector = interaction.channel?.createMessageComponentCollector({
      filter: i => i.message.id === msg.id,
      time: interaction.createdTimestamp + INTERACTION_MAX_TIMEOUT - Date.now(),
    });
    collector?.on('collect', async i => {
      i.deferUpdate().catch(() => {
        log('Could not defer update for interaction', i.customId);
      });
      switch (i.customId) {
        case 'shuffle': {
          session.shuffle();
          if (cb) cb();
          break;
        }
        case 'loop': {
          session.loop();
          if (cb) cb();
          break;
        }
        case 'unloop': {
          session.unloop();
          if (cb) cb();
          break;
        }
        case 'clear': {
          session.clear();
          if (cb) cb();
          break;
        }
        case 'skip': {
          session.skip();
          if (cb) cb();
          break;
        }
        case 'pause': {
          session.pause();
          if (cb) cb();
          break;
        }
        case 'resume': {
          session.resume();
          if (cb) cb();
          break;
        }
        case 'refresh': {
          if (cb) cb();
          break;
        }
        case 'rewind': {
          try {
            await session.seek(Math.max(0, (session.getCurrentTrackPlayTime() - REWIND_BUTTON_TIME) / 1000));
            if (cb) cb();
          } catch (err) {
            error(err);
            const msg = getErrorMsg(err);
            await interaction.followUp({
              content: msg,
              ephemeral: true,
            });
          }
          break;
        }
        case 'fast-forward': {
          try {
            await session.seek((session.getCurrentTrackPlayTime() + FAST_FORWARD_BUTTON_TIME) / 1000);
            if (cb) cb();
          } catch (err) {
            error(err);
            const msg = getErrorMsg(err);
            await interaction.followUp({
              content: msg,
              ephemeral: true,
            });
          }
          break;
        }
        case 'show-queue': {
          await handleList(interaction, session);
          collector.stop('show-queue');
          break;
        }
        default: {
          break;
        }
      }
    });
    collector?.on('end', (collected, reason) => {
      log('Ended collection of message components.');
      if (reason !== 'show-queue') {
        interaction.editReply({
          components: [],
        });
      }
    });
  } catch (err) {
    log('Entered catch block for player buttons collector.');
    interaction.editReply({
      components: [],
    });
  }
}

export function attachPlayerButtons(
  interaction: AnyInteraction,
  session: Session,
): void {
  // eventuallyRemoveComponents(interaction);
  async function populateButtons() {
    const rows = getPlayerButtons(session, interaction);
    await interaction.editReply({
      components: rows,
    });
  }
  populateButtons();
  listenForPlayerButtons(interaction, session, async () => {
    await populateButtons();
  });
}

export async function replyWithSessionButtons({
  interaction,
  session,
  run,
}: {
  interaction: AnyInteraction,
  session?: Session,
  run: (session: Session) => Promise<{
    message?: string,
    fields?: EmbedFieldData[],
    footerText?: string,
    title?: string,
    hideButtons?: boolean,
    link?: string,
  }>,
}): Promise<IntentionalAny> {
  if (!session) {
    await interaction.editReply({
      components: [],
      embeds: [],
      content: 'Session does not exist.',
    });
    return;
  }
  // eventuallyRemoveComponents(interaction);
  async function runAndReply() {
    if (!session) return;
    const {
      message,
      fields,
      footerText,
      title,
      hideButtons,
      link,
    } = await run(session);
    const embeds = title ? [new Discord.MessageEmbed({
      author: {
        name: title,
      },
      color: Colors.SUCCESS,
      description: filterOutFalsy([message, link]).join('\n'),
      footer: {
        text: footerText,
      },
      fields,
    })] : [];
    const content = title ? undefined : message;
    const components = hideButtons ? [] : getPlayerButtons(session, interaction);
    await interaction.editReply({
      embeds,
      components,
      content,
    });
  }
  runAndReply();
  listenForPlayerButtons(interaction, session, async () => {
    await runAndReply();
  });
}

export function getFractionalDuration(
  playedDuration: number,
  videoDetails: VideoDetails,
): string | null {
  if (!videoDetails.duration) return null;
  const totalDuration = getClockString(videoDetails.duration);
  const minPortions = (totalDuration.match(/:/g) || []).length + 1;
  return `${getClockString(playedDuration, minPortions)} / ${totalDuration}`;
}

export async function getTrackDurationString(
  session: Session,
): Promise<string | null> {
  const currentTrack = session.getCurrentTrack();
  if (!currentTrack) return null;
  try {
    const videoDetails = await currentTrack.getVideoDetails();
    const playedDuration = session.getCurrentTrackPlayTime();
    return getFractionalDuration(playedDuration, videoDetails);
  } catch (err) {
    error(err);
    return null;
  }
}

export async function getVideoDetailsWithFallback(track: Track): Promise<VideoDetails> {
  try {
    const videoDetails = await track.getVideoDetails();
    return videoDetails;
  } catch (err) {
    error(err);
    return {
      title: 'Unknown Title',
    };
  }
}
