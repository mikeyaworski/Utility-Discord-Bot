import type { AnyInteraction, Command, EditReply, IntentionalAny, MessageResponse } from 'src/types';

import throttle from 'lodash.throttle';
import YouTubeSr from 'youtube-sr';
import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder, EmbedData } from 'discord.js';
import { Colors } from 'src/constants';
import { error } from 'src/logging';
import { isTwitchVodLink, shuffleArray } from 'src/utils';
import { editLatest, parseInput } from 'src/discord-utils';
import sessions from './sessions';
import Track, { TrackVariant } from './track';
import Session from './session';
import {
  LinkType,
  parseSpotifyAlbum,
  parseSpotifyLink,
  parseSpotifyPlaylist,
  parseSpotifyTrack,
} from './spotify';
import { parseYoutubePlaylist, getTracksFromQueries } from './youtube';
import { attachPlayerButtons, getFractionalDuration } from './utils';
import { getFavorite } from './player-favorites';

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
    const footerText = getFractionalDuration(0, videoDetails);
    return {
      author: {
        name: '🔊 Now Playing',
      },
      description: videoDetails.title,
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

async function enqueueQueries(session: Session, queries: string[], editReply: EditReply): Promise<IntentionalAny> {
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

  await respondWithEmbed(editReply, concatDescription(firstTrackPartialMessage, `Fetching the other ${restQueries.length} tracks from YouTube...`));

  let numFetched = 0;
  const throttledMessageUpdate = throttle(async () => {
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
    await throttledMessageUpdate();
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

export async function play({
  interaction,
  message,
  inputs: {
    favoriteId,
    vodLink,
    streamLink,
    queryStr,
    pushToFront = false,
    shuffle = false,
  },
}: {
  interaction: AnyInteraction,
  message?: MessageResponse,
  inputs: PlayInputs,
}): Promise<unknown> {
  const messageId = message?.id;
  const editReply: EditReply = data => editLatest({ interaction, messageId, data });

  // Assert guild since this is a guild-only command
  const guild = interaction.guild!;

  if (favoriteId) {
    const favorite = await getFavorite(favoriteId, guild.id);
    if (favorite) {
      vodLink = favorite.value;
    }
  }
  const numArgs = [vodLink, streamLink, queryStr].filter(Boolean).length;

  const { user } = interaction;
  if (!user) {
    return editReply('Could not resolve user invoking command.');
  }
  const resolvedMember = await guild.members.fetch(user.id);
  const { channel } = resolvedMember.voice;
  if (!channel) {
    return editReply('You must be connected to a voice channel.');
  }
  if (!channel.joinable) {
    return editReply('I don\'t have permission to connect to your voice channel.');
  }

  let session = sessions.get(guild);
  if (session) session.resume();

  if (numArgs === 0 && !session) {
    return editReply('You must provide at least one argument. If you provided a favorite, then the favorite could not be found.');
  }

  if (!session) session = sessions.create(channel);

  if (shuffle) session.shuffle();

  if (vodLink) {
    if (isTwitchVodLink(vodLink)) {
      const track = new Track(vodLink, TrackVariant.TWITCH_VOD);
      const responseMessage = await enqueue(session, [track], pushToFront);
      await respondWithEmbed(editReply, responseMessage);
      return attachPlayerButtons(interaction, session, message);
    }

    if (YouTubeSr.validate(vodLink, 'VIDEO') || YouTubeSr.validate(vodLink, 'PLAYLIST')) {
      const tracks = YouTubeSr.isPlaylist(vodLink)
        ? (await parseYoutubePlaylist(vodLink))
        : [new Track(vodLink, TrackVariant.YOUTUBE_VOD)];
      const responseMessage = await enqueue(session, tracks, pushToFront);
      await respondWithEmbed(editReply, responseMessage);
      return attachPlayerButtons(interaction, session, message);
    }

    const { type } = parseSpotifyLink(vodLink);
    switch (type) {
      case LinkType.PLAYLIST: {
        const queries = await parseSpotifyPlaylist(vodLink);
        if (queries.length > 1) {
          await enqueueQueries(session, queries, editReply);
          return attachPlayerButtons(interaction, session, message);
        }
        const tracks = await getTracksFromQueries(queries);
        const responseMessage = await enqueue(session, tracks, pushToFront);
        await respondWithEmbed(editReply, responseMessage);
        return attachPlayerButtons(interaction, session, message);
      }
      case LinkType.ALBUM: {
        const queries = await parseSpotifyAlbum(vodLink);
        if (queries.length > 1) {
          return enqueueQueries(session, queries, editReply);
        }
        const tracks = await getTracksFromQueries(queries);
        const responseMessage = await enqueue(session, tracks, pushToFront);
        await respondWithEmbed(editReply, responseMessage);
        return attachPlayerButtons(interaction, session, message);
      }
      case LinkType.TRACK: {
        const query = await parseSpotifyTrack(vodLink);
        const tracks = await getTracksFromQueries([query]);
        const responseMessage = await enqueue(session, tracks, pushToFront);
        await respondWithEmbed(editReply, responseMessage);
        return attachPlayerButtons(interaction, session, message);
      }
      default: {
        throw new Error('Could not parse Spotify link.');
      }
    }
  }
  if (streamLink) {
    if (!YouTubeSr.validate(streamLink, 'VIDEO')) {
      return editReply('Invalid YouTube link.');
    }
    const tracks = [new Track(streamLink, TrackVariant.YOUTUBE_LIVESTREAM)];
    const responseMessage = await enqueue(session, tracks, pushToFront);
    await respondWithEmbed(editReply, responseMessage);
    return attachPlayerButtons(interaction, session, message);
  }
  if (queryStr) {
    const tracks = await getTracksFromQueries([queryStr]);
    const responseMessage = await enqueue(session, tracks, pushToFront);
    await respondWithEmbed(editReply, responseMessage);
    return attachPlayerButtons(interaction, session, message);
  }
  await interaction.editReply('Resumed.');
  return attachPlayerButtons(interaction, session, message);
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
