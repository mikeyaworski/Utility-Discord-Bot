import Discord, { EmbedFieldData, Message, TextBasedChannel, GuildCacheMessage, CacheType } from 'discord.js';
import { AnyInteraction, ApiMessage, IntentionalAny } from 'src/types';
import { Colors, FAST_FORWARD_BUTTON_TIME, INTERACTION_MAX_TIMEOUT, REWIND_BUTTON_TIME } from 'src/constants';
import { error, log } from 'src/logging';
import { filterOutFalsy, getClockString } from 'src/utils';
import { getErrorMsg } from 'src/discord-utils';
import { MessageType } from 'discord-api-types/v9';
import Session from './session';
import Track, { VideoDetails } from './track';
import { handleList } from './queue';

const SHOW_QUEUE_ID = 'show-queue';

export function getPlayerButtons(session: Session, interaction?: AnyInteraction): Discord.MessageActionRow[] {
  const commandName = interaction?.isCommand()
    ? `${interaction.commandName} ${interaction.options.getSubcommand(false)}`
    : interaction?.isContextMenu()
      ? interaction.commandName
      : null;
  const customId = interaction && 'customId' in interaction ? interaction.customId : null;
  const showQueueButton = commandName !== 'queue list' && customId !== SHOW_QUEUE_ID;
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
      showQueueButton && new Discord.MessageButton({
        customId: SHOW_QUEUE_ID,
        label: 'Show Queue',
        style: 'SECONDARY',
      }),
    ]),
  });

  return [firstRow, secondRow];
}

type ListenForPlayerButtonsOptions = {
  session: Session,
  cb?: () => Promise<unknown>,
  interaction?: AnyInteraction,
  message?: Message | ApiMessage,
} & ({
  interaction: AnyInteraction,
  message?: undefined,
} | {
  message: Message | ApiMessage,
  interaction?: AnyInteraction,
});

export async function listenForPlayerButtons({
  session,
  interaction,
  message,
  cb,
}: ListenForPlayerButtonsOptions): Promise<void> {
  const time = interaction
    ? interaction.createdTimestamp + INTERACTION_MAX_TIMEOUT - Date.now()
    : undefined;
  const msgId = message ? message.id : (await interaction?.fetchReply())?.id;
  const channel = interaction
    ? interaction.channel
    : message && 'channel' in message
      ? message.channel
      : null;
  if (!channel) {
    log('Attempted to listen for player buttons, but could not find channel.', interaction, message);
  }

  async function removeButtons() {
    if (!interaction && message && 'edit' in message && message.editable && message.type === 'DEFAULT') {
      // This is a channel message (outside of an interaction)
      // Note: Message collectors for non-ephemeral messages like this should probably never stop,
      // but this code is here in the event that they do, for whatever reason.
      await message.edit({
        components: [],
      });
    } else if (interaction && message) {
      // This is a follow-up message to an interaction. We need to use webhook.editMessage to edit the
      // follow-up message as opposed to the first message in the interaction.
      await interaction.webhook.editMessage(message.id, {
        components: [],
      });
    } else if (interaction) {
      await interaction.editReply({
        components: [],
      });
    }
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
            await i.followUp({
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
            await i.followUp({
              content: msg,
              ephemeral: true,
            });
          }
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
    });
    collector?.on('end', (collected, reason) => {
      log('Ended collection of message components.', 'Reason:', reason);
      removeButtons().catch(error);
    });
  } catch (err) {
    log('Entered catch block for player buttons collector.');
    removeButtons().catch(error);
  }
}

export function attachPlayerButtons(
  interaction: AnyInteraction,
  session: Session,
): void {
  async function populateButtons() {
    const rows = getPlayerButtons(session, interaction);
    await interaction.editReply({
      components: rows,
    });
  }
  populateButtons();
  listenForPlayerButtons({
    interaction,
    session,
    cb: async () => {
      await populateButtons();
    },
  });
}

type RunMethod = (session: Session) => Promise<{
  description?: string,
  fields?: EmbedFieldData[],
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
  embeds: Discord.MessageEmbed[],
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
  const embeds = title ? [new Discord.MessageEmbed({
    author: {
      name: title,
    },
    color: Colors.SUCCESS,
    description: filterOutFalsy([description, link]).join('\n'),
    footer: {
      text: footerText,
    },
    fields,
  })] : [];
  const content = title ? undefined : description;
  const components = hideButtons ? [] : getPlayerButtons(session, interaction);

  return {
    embeds,
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
  session,
  run,
}: ReplyWithSessionButtonsOptions): Promise<IntentionalAny> {
  if (!session) {
    await interaction?.editReply({
      components: [],
      embeds: [],
      content: 'Session does not exist.',
    });
    return;
  }
  let message: Message<boolean> | ApiMessage | undefined | null;
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
      session,
      cb: runAndReply,
    });
  } else if (message) {
    listenForPlayerButtons({
      message,
      session,
      cb: runAndReply,
    });
  }
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
