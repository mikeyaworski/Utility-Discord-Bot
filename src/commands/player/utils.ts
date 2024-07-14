import Discord, { TextBasedChannel, ButtonBuilder, ButtonStyle } from 'discord.js';
import { AnyInteraction, EmbedFields, IntentionalAny, MessageResponse } from 'src/types';
import { Colors, FAST_FORWARD_BUTTON_TIME, INTERACTION_MAX_TIMEOUT, REWIND_BUTTON_TIME } from 'src/constants';
import { error, log } from 'src/logging';
import { filterOutFalsy, getClockString } from 'src/utils';
import { checkVoiceErrorsByInteraction, editLatest, getErrorMsg, isCommand, isContextMenu, removeButtons } from 'src/discord-utils';
import Session from './session';
import sessions from './sessions';
import Track, { VideoDetails } from './track';
import { handleList } from './queue';

const SHOW_QUEUE_ID = 'show-queue';

export function getPlayerButtons(session: Session, interaction?: AnyInteraction): Discord.ActionRowBuilder<ButtonBuilder>[] {
  const commandName = interaction && isCommand(interaction)
    ? `${interaction.commandName} ${interaction.options.getSubcommand(false)}`
    : interaction && isContextMenu(interaction)
      ? interaction.commandName
      : null;
  const customId = interaction && 'customId' in interaction ? interaction.customId : null;
  const showQueueButton = commandName !== 'queue list' && customId !== SHOW_QUEUE_ID;
  const firstRow = new Discord.ActionRowBuilder<ButtonBuilder>({
    components: [
      session.isPaused()
        ? new ButtonBuilder({
          customId: 'resume',
          label: 'Resume',
          style: ButtonStyle.Success,
        })
        : new ButtonBuilder({
          customId: 'pause',
          label: 'Pause',
          style: ButtonStyle.Success,
        }),
      new ButtonBuilder({
        customId: 'skip',
        label: 'Skip',
        style: ButtonStyle.Success,
      }),
      session.isLooped()
        ? new ButtonBuilder({
          customId: 'unloop',
          label: 'Unloop',
          style: ButtonStyle.Primary,
        })
        : new ButtonBuilder({
          customId: 'loop',
          label: 'Loop',
          style: ButtonStyle.Primary,
        }),
      new ButtonBuilder({
        customId: 'shuffle',
        label: 'Shuffle',
        style: ButtonStyle.Primary,
      }),
      new ButtonBuilder({
        customId: 'clear',
        label: 'Clear',
        style: ButtonStyle.Danger,
      }),
    ],
  });
  const secondRow = new Discord.ActionRowBuilder<ButtonBuilder>({
    components: filterOutFalsy([
      new ButtonBuilder({
        customId: 'refresh',
        label: 'Refresh',
        style: ButtonStyle.Secondary,
      }),
      // Seeking too quickly is super flakey, so these buttons are prone to being abused.
      // For now, they'll be left out.
      // new ButtonBuilder({
      //   customId: 'rewind',
      //   label: `⏪ ${REWIND_BUTTON_TIME / 1000}s`,
      //   style: ButtonStyle.Secondary,
      // }),
      // new ButtonBuilder({
      //   customId: 'fast-forward',
      //   label: `⏩ ${FAST_FORWARD_BUTTON_TIME / 1000}s`,
      //   style: ButtonStyle.Secondary,
      // }),
      showQueueButton && new ButtonBuilder({
        customId: SHOW_QUEUE_ID,
        label: 'Show Queue',
        style: ButtonStyle.Secondary,
      }),
    ]),
  });

  return [firstRow, secondRow];
}

type ListenForPlayerButtonsOptions = {
  cb?: () => Promise<unknown>,
  interaction?: AnyInteraction,
  message?: MessageResponse,
} & ({
  interaction: AnyInteraction,
  message?: undefined,
} | {
  message: MessageResponse,
  interaction?: AnyInteraction,
});

export async function listenForPlayerButtons({
  interaction,
  message,
  cb,
}: ListenForPlayerButtonsOptions): Promise<void> {
  const time = interaction
    ? interaction.createdTimestamp + INTERACTION_MAX_TIMEOUT - Date.now()
    : undefined;
  const guildId = interaction
    ? interaction.guildId
    : message && 'guildId' in message
      ? message.guildId
      : null;
  const msgId = message ? message.id : (await interaction?.fetchReply())?.id;
  const channel = interaction
    ? interaction.channel
    : message && 'channel' in message
      ? message.channel
      : null;
  if (!channel) {
    log('Attempted to listen for player buttons, but could not find channel.', interaction, message);
  }

  try {
    const collector = channel?.createMessageComponentCollector({
      filter: i => i.message.id === msgId,
      time,
    });
    collector?.on('collect', async i => {
      await i.deferUpdate().catch(() => {
        log('Could not defer update for interaction', i.customId);
      });
      const session = guildId ? sessions.get(guildId) : null;
      if (!session) {
        await i.followUp({
          ephemeral: true,
          content: 'Session does not exist.',
        });
        return;
      }
      try {
        switch (i.customId) {
          case 'shuffle':
          case 'loop':
          case 'unloop':
          case 'clear':
          case 'skip':
          case 'pause':
          case 'resume':
          case 'rewind':
          case 'fast-forward': {
            await checkVoiceErrorsByInteraction(i);
            break;
          }
          default: break;
        }
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
            await session.skip();
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
            await session.seek(Math.max(0, (session.getCurrentTrackPlayTime() - REWIND_BUTTON_TIME) / 1000));
            if (cb) cb();
            break;
          }
          case 'fast-forward': {
            await session.seek((session.getCurrentTrackPlayTime() + FAST_FORWARD_BUTTON_TIME) / 1000);
            if (cb) cb();
            break;
          }
          case SHOW_QUEUE_ID: {
            await handleList(i, session);
            break;
          }
          default: {
            break;
          }
        }
      } catch (err) {
        error(err);
        const msg = getErrorMsg(err);
        await i.followUp({
          content: msg,
          ephemeral: true,
        });
      }
    });
    collector?.on('end', (collected, reason) => {
      log('Ended collection of message components.', 'Reason:', reason);
      removeButtons({ interaction, message }).catch(error);
    });
  } catch (err) {
    log('Entered catch block for player buttons collector.');
    removeButtons({ interaction, message }).catch(error);
  }
}

export function attachPlayerButtons(
  interaction: AnyInteraction,
  session: Session,
  message?: MessageResponse,
): void {
  async function populateButtons() {
    const rows = getPlayerButtons(session, interaction);
    await editLatest({
      interaction,
      messageId: message?.id,
      data: {
        components: rows,
      },
    });
  }
  populateButtons();
  listenForPlayerButtons({
    interaction,
    message,
    cb: async () => {
      await populateButtons();
    },
  });
}

type RunMethod = (session: Session) => Promise<{
  description?: string,
  fields?: EmbedFields,
  footerText?: string,
  title?: string,
  hideButtons?: boolean,
  link?: string,
}>;

export type ReplyWithSessionButtonsOptions = {
  session?: Session,
  run: RunMethod,
  interaction?: AnyInteraction,
  channel?: TextBasedChannel,
} & ({
  interaction: AnyInteraction,
  channel?: undefined,
} | {
  channel: TextBasedChannel,
  interaction?: undefined,
});

export async function getMessageData({
  session,
  interaction,
  run,
}: {
  session: Session,
  interaction?: AnyInteraction,
  run: RunMethod,
}): Promise<{
  embeds: Discord.EmbedBuilder[],
  content: string | undefined,
  components: ReturnType<typeof getPlayerButtons>,
}> {
  const {
    description,
    fields,
    footerText,
    title,
    hideButtons,
    link,
  } = await run(session);

  const embed = title
    ? new Discord.EmbedBuilder({
      author: {
        name: title,
      },
      description: filterOutFalsy([description, link]).join('\n'),
      fields,
    })
    : null;
  embed?.setColor(Colors.SUCCESS);
  if (footerText) {
    embed?.setFooter({
      text: footerText,
    });
  }

  const content = title ? undefined : description;
  const components = hideButtons ? [] : getPlayerButtons(session, interaction);

  return {
    embeds: filterOutFalsy([embed]),
    content,
    components,
  };
}

/**
 * TODO: The logic in here for editing the message has gotten complicated.
 * We can potentially remove logic branches since we don't necessarily need this to send public
 * messages. It's been refactored since originally doing that, so depending on how we use this in the future,
 * we may be able to simplify this.
 */
export async function replyWithSessionButtons({
  interaction,
  channel,
  run,
}: ReplyWithSessionButtonsOptions): Promise<IntentionalAny> {
  const session = interaction?.guildId && sessions.get(interaction.guildId);
  if (!session) {
    await interaction?.editReply({
      components: [],
      embeds: [],
      content: 'Session does not exist.',
    });
    return;
  }
  let message: MessageResponse | undefined | null;
  async function runAndReply() {
    if (!session) return;
    const { content, embeds, components } = await getMessageData({
      session,
      interaction,
      run,
    });
    if (message && 'edit' in message && message.editable && !interaction) {
      // This is a channel message which we can edit
      await message.edit({
        embeds,
        components,
        content,
      });
    } else if (!interaction) {
      // This is a channel message
      // Note: We only have this optional chaining since theTS compiler complains that this
      // may be undefined, but we know that it is defined since interaction is undefined.
      message = await channel?.send({
        embeds,
        components,
        content,
      });
    } else if (message) {
      // This is editing a follow-up message (webhook.editMessage is required to do so)
      // This follow-up may or may not be the only ephemeral message in the interaction,
      // but this covers both cases (reply vs a "true" follow-up).
      await interaction.webhook.editMessage(message.id, {
        embeds,
        components,
        content,
      });
    } else {
      // Sometimes we want to reply, and sometimes we want to follow-up. It seems that we
      // can always do a follow-up and it covers both use cases.
      message = await interaction.followUp({
        ephemeral: true,
        embeds,
        components,
        content,
      });
    }
  }
  await runAndReply();
  // It's possible that we have a base interaction with a follow-up message (showing queue),
  // in which case we need to know the message of the follow-up to edit it,
  // but still need access to the interaction. It's also possible that we have just a message,
  // without an interaction, like when sending a now playing message to a channel publicly.
  if (interaction) {
    listenForPlayerButtons({
      interaction,
      message: message || undefined,
      cb: runAndReply,
    });
  } else if (message) {
    listenForPlayerButtons({
      message,
      cb: runAndReply,
    });
  }
}

export function getTrackDurationString(
  playedDuration: number,
  totalDuration: number,
): string | null {
  const totalDurationStr = getClockString(totalDuration, 2);
  const minPortions = Math.max(2, (totalDurationStr.match(/:/g) || []).length + 1);
  return `${getClockString(playedDuration, minPortions)} / ${totalDurationStr}`;
}

export async function getTrackDurationStringFromSession(
  session: Session,
): Promise<string | null> {
  const currentTrack = session.getCurrentTrack();
  if (!currentTrack) return null;
  try {
    const videoDetails = await currentTrack.getVideoDetails();
    const playedDuration = session.getCurrentTrackPlayTime();
    return videoDetails.duration ? getTrackDurationString(playedDuration, videoDetails.duration) : null;
  } catch (err) {
    error(err);
    return null;
  }
}

export function getTrackDurationAndSpeed(duration: string | null, speed: number): string {
  let text = '';
  if (duration) {
    text = duration;
  }
  if (speed !== 1) {
    text = text ? `${text} (${speed}x speed)` : `${speed}x speed`;
  }
  return text;
}

export async function getTrackDurationAndSpeedFromSession(session: Session): Promise<string> {
  const durationStr = await getTrackDurationStringFromSession(session);
  const speed = session.getPlaybackSpeed();
  return getTrackDurationAndSpeed(durationStr, speed);
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
