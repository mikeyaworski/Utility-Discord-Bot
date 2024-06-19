import type { AnyInteraction, Command, EditReply, IntentionalAny, MessageResponse } from 'src/types';

import throttle from 'lodash.throttle';
import YouTubeSr from 'youtube-sr';
import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder, EmbedData } from 'discord.js';
import { Colors } from 'src/constants';
import { error } from 'src/logging';
import { filterOutFalsy, isRedditLink, isTwitchLivestreamLink, isTwitchVodLink, isTwitterLink, shuffleArray } from 'src/utils';
import { checkVoiceErrors, editLatest, parseInput } from 'src/discord-utils';
import sessions from './sessions';
import Track, { TrackVariant } from './track';
import Session from './session';
import {
  LinkType,
  parseSpotifyAlbum,
  parseSpotifyArtist,
  parseSpotifyLink,
  parseSpotifyPlaylist,
  parseSpotifyTrack,
} from './spotify';
import { parseYoutubePlaylist, getTracksFromQueries } from './youtube';
import { attachPlayerButtons, getTrackDurationString, getTrackDurationAndSpeed } from './utils';
import { getFavorite } from './player-favorites';
import { Query, QueryType } from './types';

function respondWithEmbed(editReply: EditReply, content: EmbedData) {
  const embed = new EmbedBuilder({
    ...content,
  });
  embed.setColor(Colors.SUCCESS);
  return editReply({
    embeds: [embed],
  });
}

async function enqueue(session: Session, tracks: Track[], pushToFront: boolean): Promise<EmbedData> {
  const wasPlayingAnything = Boolean(session.getCurrentTrack());
  await session.enqueue(tracks, pushToFront);

  try {
    const videoDetails = await tracks[0].getVideoDetails();
    if (wasPlayingAnything && tracks.length > 1) {
      return { description: `Queued ${tracks.length} tracks.` };
    }
    if (tracks.length > 1) {
      return { description: `Now playing: ${videoDetails.title}\nQueued ${tracks.length - 1} tracks.` };
    }
    if (wasPlayingAnything) {
      return { description: `Queued at position #${pushToFront ? 1 : session.queue.length}: ${videoDetails.title}` };
    }
    const duration = videoDetails.duration ? getTrackDurationString(0, videoDetails.duration) : null;
    const speed = session.getPlaybackSpeed();
    const footerText = getTrackDurationAndSpeed(duration, speed);
    return {
      author: {
        name: '🔊 Now Playing',
      },
      description: filterOutFalsy([
        videoDetails.title,
        tracks[0].link,
        tracks[0].sourceLink,
      ]).join('\n'),
      footer: footerText ? {
        text: footerText,
      } : undefined,
    };
  } catch (err) {
    error(tracks[0].link, tracks[0].variant, err);
    return {
      description: 'Could not fetch video details.'
        + ' This video probably cannot be played for some reason.'
        + ' This can happen if the video is age-restricted or region-locked.',
    };
  }
}

async function enqueueQueries(session: Session, queries: Query[], editReply: EditReply | null): Promise<IntentionalAny> {
  if (session.isShuffled()) shuffleArray(queries);
  const [firstQuery, ...restQueries] = queries;
  const [firstTrack] = await getTracksFromQueries([firstQuery]);
  const firstTrackPartialMessage = await enqueue(session, [firstTrack], false);

  function concatDescription(oldOptions: EmbedData, newDescription: string): EmbedData {
    return {
      ...oldOptions,
      description: oldOptions.description ? `${oldOptions.description}\n${newDescription}` : newDescription,
    };
  }

  if (editReply) {
    await respondWithEmbed(editReply, concatDescription(firstTrackPartialMessage, `Fetching the other ${restQueries.length} tracks from YouTube...`));
  }

  let numFetched = 0;
  const throttledMessageUpdate = throttle(async () => {
    if (!editReply) return null;
    if (numFetched === 0) {
      return respondWithEmbed(
        editReply,
        concatDescription(firstTrackPartialMessage, `Fetching the other ${restQueries.length} tracks from YouTube...`),
      );
    }
    if (numFetched < restQueries.length) {
      return respondWithEmbed(editReply, concatDescription(firstTrackPartialMessage, `Queued ${
        numFetched
      } tracks.\nFetching the other ${
        restQueries.length - numFetched
      } tracks from YouTube...`));
    }
    return respondWithEmbed(editReply, concatDescription(firstTrackPartialMessage, `Queued ${numFetched} tracks from YouTube.`));
  }, 5000);

  getTracksFromQueries(restQueries, async newTracks => {
    await session.enqueue(newTracks);
    numFetched += newTracks.length;
    if (editReply) await throttledMessageUpdate();
  });
}

interface PlayInputs {
  vodLink?: string | null,
  favoriteId?: string | null,
  streamLink?: string | null,
  queryStr?: string | null,
  pushToFront?: boolean,
  shuffle?: boolean,
}

type PlayArguments = {
  interaction: AnyInteraction,
  invoker?: undefined,
  message?: MessageResponse,
  inputs: PlayInputs,
} | {
  interaction?: undefined,
  message?: undefined,
  invoker: {
    userId: string,
    guildId: string,
  },
  inputs: PlayInputs,
}

export async function play({
  interaction,
  message,
  invoker,
  inputs: {
    favoriteId,
    vodLink,
    streamLink,
    queryStr,
    pushToFront = false,
    shuffle = false,
  },
}: PlayArguments): Promise<unknown> {
  const messageId = message?.id;
  const editReply: EditReply | null = interaction
    ? data => editLatest({ interaction, messageId, data })
    : null;
  const editReplyOrThrow = (message: string) => {
    if (editReply) editReply(message);
    else throw new Error(message);
  };

  // Assert guild since this is a guild-only command
  const guildId = interaction ? interaction.guild!.id : invoker.guildId;
  const userId = interaction ? interaction.user.id : invoker.userId;

  if (favoriteId) {
    const favorite = await getFavorite(favoriteId, guildId);
    if (favorite) {
      vodLink = favorite.value;
    } else {
      return editReplyOrThrow('Favorite could not be found.');
    }
  }
  const numArgs = [vodLink, streamLink, queryStr].filter(Boolean).length;

  const channel = await checkVoiceErrors({ userId, guildId });

  let session = sessions.get(guildId);
  if (session) session.resume();

  if (numArgs === 0 && !session) {
    return editReplyOrThrow('You must provide at least one argument.');
  }

  if (!session) session = await sessions.create(channel);

  if (shuffle) session.shuffle();

  if (vodLink) {
    if (isTwitchVodLink(vodLink)
      || isTwitchLivestreamLink(vodLink)
      || isTwitterLink(vodLink)
      || isRedditLink(vodLink)
    ) {
      let variant: TrackVariant = TrackVariant.ARBITRARY;
      if (isTwitchVodLink(vodLink)) variant = TrackVariant.TWITCH_VOD;
      else if (isTwitchLivestreamLink(vodLink)) variant = TrackVariant.TWITCH_LIVESTREAM;
      else if (isTwitterLink(vodLink)) variant = TrackVariant.TWITTER;
      else if (isRedditLink(vodLink)) variant = TrackVariant.REDDIT;

      const track = new Track({ link: vodLink, variant });
      const responseMessage = await enqueue(session, [track], pushToFront);
      if (editReply) await respondWithEmbed(editReply, responseMessage);
      return interaction && attachPlayerButtons(interaction, session, message);
    }

    if (YouTubeSr.validate(vodLink, 'VIDEO') || YouTubeSr.validate(vodLink, 'PLAYLIST')) {
      const tracks = YouTubeSr.isPlaylist(vodLink)
        ? (await parseYoutubePlaylist(vodLink))
        : [new Track({ link: vodLink, variant: TrackVariant.YOUTUBE_VOD })];
      const responseMessage = await enqueue(session, tracks, pushToFront);
      if (editReply) await respondWithEmbed(editReply, responseMessage);
      return interaction && attachPlayerButtons(interaction, session, message);
    }

    const { type } = await parseSpotifyLink(vodLink);
    const queries: Query[] = [];
    switch (type) {
      case LinkType.PLAYLIST: {
        queries.push(...await parseSpotifyPlaylist(vodLink));
        break;
      }
      case LinkType.ALBUM: {
        queries.push(...await parseSpotifyAlbum(vodLink));
        break;
      }
      case LinkType.ARTIST: {
        queries.push(...await parseSpotifyArtist(vodLink));
        break;
      }
      case LinkType.TRACK: {
        queries.push(await parseSpotifyTrack(vodLink));
        break;
      }
      default: {
        throw new Error('Could not parse Spotify link.');
      }
    }
    if (queries.length > 1) {
      await enqueueQueries(session, queries, editReply);
      return interaction && attachPlayerButtons(interaction, session, message);
    }
    const tracks = await getTracksFromQueries(queries);
    const responseMessage = await enqueue(session, tracks, pushToFront);
    if (editReply) await respondWithEmbed(editReply, responseMessage);
    return interaction && attachPlayerButtons(interaction, session, message);
  }
  if (streamLink) {
    if (!YouTubeSr.validate(streamLink, 'VIDEO')) {
      return editReplyOrThrow('Invalid YouTube link.');
    }
    const tracks = [new Track({ link: streamLink, variant: TrackVariant.YOUTUBE_LIVESTREAM })];
    const responseMessage = await enqueue(session, tracks, pushToFront);
    if (editReply) await respondWithEmbed(editReply, responseMessage);
    return interaction && attachPlayerButtons(interaction, session, message);
  }
  if (queryStr) {
    const tracks = await getTracksFromQueries([{
      query: queryStr,
      type: QueryType.DIRECT_QUERY,
    }]);
    const responseMessage = await enqueue(session, tracks, pushToFront);
    if (editReply) await respondWithEmbed(editReply, responseMessage);
    return interaction && attachPlayerButtons(interaction, session, message);
  }
  if (interaction) await interaction.editReply('Resumed.');
  return interaction && attachPlayerButtons(interaction, session, message);
}

const commandBuilder = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Plays audio into a voice channel.')
  .addStringOption(option => option.setName('link').setDescription('YouTube, Spotify, Twitch. No livestreams.').setRequired(false))
  .addStringOption(option => option.setName('query').setDescription('Generic query for YouTube.').setRequired(false))
  .addStringOption(option => option.setName('favorite').setDescription('Favorite ID.').setRequired(false))
  // .addStringOption(option => option.setName('stream').setDescription('YouTube livestream. Twitch is not currently supported.').setRequired(false))
  .addBooleanOption(option => option.setName('front').setDescription('Push song (one) to the front of the queue.').setRequired(false))
  .addBooleanOption(option => option.setName('shuffle').setDescription('Shuffle the queue.').setRequired(false));

const PlayCommand: Command = {
  guildOnly: true,
  showModalWithNoArgs: true,
  slashCommandData: commandBuilder,

  modalLabels: {
    stream: 'YouTube livestream. (Not Twitch).',
    favorite: 'Favorite ID.',
  },
  modalPlaceholders: {
    link: 'https://...',
    query: 'A song',
    favorite: '123 or my-custom-id',
    stream: 'https://...',
    front: 'yes/no',
    shuffle: 'yes/no',
  },

  runModal: async interaction => {
    await interaction.deferReply({ ephemeral: true });
    const inputs = await parseInput({
      slashCommandData: commandBuilder,
      interaction,
    });
    await play({
      interaction,
      inputs: {
        vodLink: inputs.link,
        favoriteId: inputs.favorite,
        streamLink: null, // inputs.stream,
        queryStr: inputs.query,
        pushToFront: inputs.front,
        shuffle: inputs.shuffle,
      },
    });
  },

  runCommand: async interaction => {
    await interaction.deferReply({ ephemeral: true });
    const vodLink = interaction.options.getString('link');
    const favoriteId = interaction.options.getString('favorite');
    // const streamLink = interaction.options.getString('stream');
    const queryStr = interaction.options.getString('query');
    const pushToFront = interaction.options.getBoolean('front') ?? false;
    const shuffle = interaction.options.getBoolean('shuffle') ?? false;

    await play({
      interaction,
      inputs: {
        vodLink,
        favoriteId,
        streamLink: null,
        queryStr,
        pushToFront,
        shuffle,
      },
    });
  },
};

export default PlayCommand;
