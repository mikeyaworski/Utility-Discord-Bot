import type { Command, IntentionalAny } from 'src/types';

import dotenv from 'dotenv';
import axios from 'axios';
import { validateURL } from 'ytdl-core';
import { SlashCommandBuilder } from '@discordjs/builders';
import { handleError } from 'src/discord-utils';
import { MAX_YT_PLAYLIST_PAGE_FETCHES, YT_PLAYLIST_PAGE_SIZE } from 'src/constants';
import sessions from './sessions';
import Track from './track';

dotenv.config();

const youtubeApiKey = process.env.YOUTUBE_API_KEY;

async function parseYoutubePlaylist(playlistUrl: string): Promise<Track[]> {
  if (!youtubeApiKey) throw new Error('YouTube API key not configured.');

  const url = new URL(playlistUrl);
  const playlistId = url.searchParams.get('list');

  let numPagesFetched = 0;
  let nextPageToken: string | undefined;
  const tracks: Track[] = [];

  do {
    const res = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
      params: {
        playlistId,
        maxResults: YT_PLAYLIST_PAGE_SIZE,
        part: 'snippet',
        key: youtubeApiKey,
        pageToken: nextPageToken,
      },
    });
    numPagesFetched += 1;
    nextPageToken = res.data.nextPageToken;
    const youtubeLinks: string[] = res.data.items
      .filter((item: IntentionalAny) => item.snippet?.resourceId?.kind === 'youtube#video')
      .map((item: IntentionalAny) => `https://youtube.com/watch?v=${item.snippet?.resourceId.videoId}`);
    tracks.push(...youtubeLinks.map(youtubeLink => new Track(youtubeLink)));
  } while (nextPageToken && numPagesFetched < MAX_YT_PLAYLIST_PAGE_FETCHES);

  return tracks;
}

const PlayCommand: Command = {
  guildOnly: true,
  slashCommandData: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Plays audio into a voice channel.')
    .addStringOption(option => option.setName('youtube').setDescription('YouTube Link (video or playlist)').setRequired(false)),
  // .addStringOption(option => option.setName('spotify').setDescription('Spotify Link').setRequired(false)),
  // .addStringOption(option => option.setName('query').setDescription('Generic query for YouTube').setRequired(false)),

  runCommand: async interaction => {
    await interaction.deferReply({ ephemeral: true });
    const youtubeLink = interaction.options.getString('youtube');
    const query = interaction.options.getString('query');

    // Assert guild since this is a guild-only command
    const guild = interaction.guild!;
    let session = sessions.get(guild);

    if (session) session.resume();

    if (!youtubeLink && !query && !session) {
      return interaction.editReply('You must provide at least one argument.');
    }

    if (youtubeLink) {
      // TODO: Improve validation
      if (!validateURL(youtubeLink) && !youtubeLink.includes('youtube.com/playlist')) {
        return interaction.editReply('Invalid YouTube link.');
      }
      const { user } = interaction;
      if (!user) {
        return interaction.editReply('Could not resolve user invoking command.');
      }
      try {
        const resolvedMember = await guild.members.fetch(user.id);
        const { channel } = resolvedMember.voice;

        if (!channel) {
          return interaction.editReply('You must be connected to a voice channel.');
        }

        if (!channel.joinable) {
          return interaction.editReply('I don\'t have permission to connect to your voice channel.');
        }

        if (!session) session = sessions.create(channel);

        const wasPlayingAnything = Boolean(session.getCurrentTrack());
        const tracks = youtubeLink.includes('/playlist')
          ? (await parseYoutubePlaylist(youtubeLink))
          : [new Track(youtubeLink)];
        await session.enqueue(tracks);

        const videoDetails = await tracks[0].getVideoDetails();
        if (wasPlayingAnything && tracks.length > 1) {
          return interaction.editReply(`Queued ${tracks.length} tracks.`);
        }
        if (tracks.length > 1) {
          return interaction.editReply(`Now playing: ${videoDetails.title}\nQueued ${tracks.length - 1} tracks.`);
        }
        if (wasPlayingAnything) {
          return interaction.editReply(`Queued at position #${session.queue.length}: ${videoDetails.title}`);
        }
        return interaction.editReply(`Now playing: ${videoDetails.title}`);
      } catch (err) {
        return handleError(err, interaction);
      }
    } else if (query) {
      // TODO: Finish
      return interaction.editReply(`TODO: ${query}`);
    }
    return interaction.editReply('Resumed.');
  },
};

export default PlayCommand;
