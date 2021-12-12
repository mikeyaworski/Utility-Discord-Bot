import type { Command, IntentionalAny } from 'src/types';

import dotenv from 'dotenv';
import throttle from 'lodash.throttle';
import { validateURL } from 'ytdl-core';
import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, MessageEmbed } from 'discord.js';
import { Colors } from 'src/constants';
import { error } from 'src/logging';
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
import { attachPlayerButtons } from './utils';

dotenv.config();

function respondWithEmbed(interaction: CommandInteraction, message: string) {
  return interaction.editReply({
    embeds: [new MessageEmbed({
      color: Colors.SUCCESS,
      description: message,
    })],
  });
}

async function enqueue(session: Session, tracks: Track[], pushToFront: boolean): Promise<string> {
  const wasPlayingAnything = Boolean(session.getCurrentTrack());
  await session.enqueue(tracks, pushToFront);

  try {
    const videoDetails = await tracks[0].getVideoDetails();
    if (wasPlayingAnything && tracks.length > 1) {
      return `Queued ${tracks.length} tracks.`;
    }
    if (tracks.length > 1) {
      return `Now playing: ${videoDetails.title}\nQueued ${tracks.length - 1} tracks.`;
    }
    if (wasPlayingAnything) {
      return `Queued at position #${pushToFront ? 1 : session.queue.length}: ${videoDetails.title}`;
    }
    return `🔊 **Now playing**: ${videoDetails.title}`;
  } catch (err) {
    error(tracks[0].link, tracks[0].variant, err);
    return 'Could not fetch video details.'
    + ' This video probably cannot be played for some reason.'
    + ' This can happen if the video is age-restricted or region-locked.';
  }
}

async function enqueueQueries(session: Session, queries: string[], interaction: CommandInteraction): Promise<IntentionalAny> {
  const [firstQuery, ...restQueries] = queries;
  const [firstTrack] = await getTracksFromQueries([firstQuery]);
  const firstTrackPartialMessage = await enqueue(session, [firstTrack], false);
  await respondWithEmbed(interaction, `${firstTrackPartialMessage}\nFetching the other ${restQueries.length} tracks from YouTube...`);

  let numFetched = 0;
  const throttledMessageUpdate = throttle(async () => {
    if (numFetched === 0) {
      return respondWithEmbed(interaction, `${firstTrackPartialMessage}\nFetching the other ${restQueries.length} tracks from YouTube...`);
    }
    if (numFetched < restQueries.length) {
      return respondWithEmbed(interaction, `${firstTrackPartialMessage}\nQueued ${
        numFetched
      } tracks.\nFetching the other ${
        restQueries.length - numFetched
      } tracks from YouTube...`);
    }
    return respondWithEmbed(interaction, `${firstTrackPartialMessage}\nQueued ${numFetched} tracks from YouTube.`);
  }, 5000);

  getTracksFromQueries(restQueries, async newTracks => {
    await session.enqueue(newTracks);
    numFetched += newTracks.length;
    await throttledMessageUpdate();
  });
}

const PlayCommand: Command = {
  guildOnly: true,
  slashCommandData: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Plays audio into a voice channel.')
    .addStringOption(option => option.setName('youtube').setDescription('YouTube Link (video or playlist)').setRequired(false))
    .addStringOption(option => option.setName('spotify').setDescription('Spotify Link (video, album or playlist)').setRequired(false))
    .addStringOption(option => option.setName('query').setDescription('Generic query for YouTube').setRequired(false))
    .addBooleanOption(option => option.setName('front').setDescription('Push song (singular) to the front of the queue.').setRequired(false)),

  runCommand: async interaction => {
    await interaction.deferReply({ ephemeral: true });
    const youtubeLink = interaction.options.getString('youtube');
    const spotifyLink = interaction.options.getString('spotify');
    const queryStr = interaction.options.getString('query');
    const pushToFront = interaction.options.getBoolean('front') ?? false;

    const numArgs = [youtubeLink, spotifyLink, queryStr].filter(Boolean).length;

    // Assert guild since this is a guild-only command
    const guild = interaction.guild!;

    const { user } = interaction;
    if (!user) {
      return interaction.editReply('Could not resolve user invoking command.');
    }
    const resolvedMember = await guild.members.fetch(user.id);
    const { channel } = resolvedMember.voice;
    if (!channel) {
      return interaction.editReply('You must be connected to a voice channel.');
    }
    if (!channel.joinable) {
      return interaction.editReply('I don\'t have permission to connect to your voice channel.');
    }

    let session = sessions.get(guild);
    if (session) session.resume();

    if (numArgs === 0 && !session) {
      return interaction.editReply('You must provide at least one argument.');
    }

    if (!session) session = sessions.create(channel);

    if (youtubeLink) {
      // TODO: Improve validation
      if (!validateURL(youtubeLink) && !youtubeLink.includes('youtube.com/playlist')) {
        return interaction.editReply('Invalid YouTube link.');
      }

      const tracks = youtubeLink.includes('/playlist')
        ? (await parseYoutubePlaylist(youtubeLink))
        : [new Track(youtubeLink, TrackVariant.YOUTUBE)];

      const responseMessage = await enqueue(session, tracks, pushToFront);
      await respondWithEmbed(interaction, responseMessage);
      return attachPlayerButtons(interaction, session);
    }
    if (spotifyLink) {
      const { type, id } = parseSpotifyLink(spotifyLink);
      switch (type) {
        case LinkType.PLAYLIST: {
          const queries = await parseSpotifyPlaylist(id);
          if (queries.length > 1) {
            await enqueueQueries(session, queries, interaction);
            return attachPlayerButtons(interaction, session);
          }
          const tracks = await getTracksFromQueries(queries);
          const responseMessage = await enqueue(session, tracks, pushToFront);
          await respondWithEmbed(interaction, responseMessage);
          return attachPlayerButtons(interaction, session);
        }
        case LinkType.ALBUM: {
          const queries = await parseSpotifyAlbum(id);
          if (queries.length > 1) {
            return enqueueQueries(session, queries, interaction);
          }
          const tracks = await getTracksFromQueries(queries);
          const responseMessage = await enqueue(session, tracks, pushToFront);
          await respondWithEmbed(interaction, responseMessage);
          return attachPlayerButtons(interaction, session);
        }
        case LinkType.TRACK: {
          const query = await parseSpotifyTrack(id);
          const tracks = await getTracksFromQueries([query]);
          const responseMessage = await enqueue(session, tracks, pushToFront);
          await respondWithEmbed(interaction, responseMessage);
          return attachPlayerButtons(interaction, session);
        }
        default: {
          throw new Error('Could not parse Spotify link.');
        }
      }
    }
    if (queryStr) {
      const tracks = await getTracksFromQueries([queryStr]);
      const responseMessage = await enqueue(session, tracks, pushToFront);
      await respondWithEmbed(interaction, responseMessage);
      return attachPlayerButtons(interaction, session);
    }
    await interaction.editReply('Resumed.');
    return attachPlayerButtons(interaction, session);
  },
};

export default PlayCommand;
