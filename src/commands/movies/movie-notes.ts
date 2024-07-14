import type { AnyInteraction, Command } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';
import { getSubcommand, parseInput } from 'src/discord-utils';
import { MovieNotes } from 'src/models/movie-notes';
import { getMovie } from './index';

const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('movie-notes')
  .setDescription('Make notes about a movie');
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('delete');
  subcommand.setDescription('Delete your note on a movie.');
  subcommand.addStringOption(option => {
    return option
      .setName('title')
      .setDescription('The title of the movie.')
      .setRequired(false);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('imdb_id')
      .setDescription('Part of the URL. Ex: tt8801880.')
      .setRequired(false);
  });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('set');
  subcommand.setDescription('Set a note on a movie.');
  subcommand.addStringOption(option => {
    return option
      .setName('note')
      .setDescription('Your note.')
      .setRequired(true);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('title')
      .setDescription('The title of the movie.')
      .setRequired(false);
  });
  subcommand.addStringOption(option => {
    return option
      .setName('imdb_id')
      .setDescription('Part of the URL. Ex: tt8801880.')
      .setRequired(false);
  });
  return subcommand;
});

async function handleSet(interaction: AnyInteraction) {
  const guildId = interaction.guildId!;
  const { title, imdb_id: imdbId, note } = await parseInput({ interaction, slashCommandData: commandBuilder }) as {
    title?: string,
    imdb_id?: string,
    note: string,
  };
  const movie = await getMovie({
    guildId,
    title,
    imdbId,
  });
  await MovieNotes.upsert({
    movie_id: movie.id,
    author_id: interaction.user.id,
    note,
  });
  return interaction.editReply(`Movie note created on movie "${movie.title}"`);
}

async function handleDelete(interaction: AnyInteraction) {
  const guildId = interaction.guildId!;
  const { title, imdb_id: imdbId } = await parseInput({ interaction, slashCommandData: commandBuilder }) as {
    title?: string,
    imdb_id?: string,
  };
  const movie = await getMovie({
    guildId,
    title,
    imdbId,
  });
  await MovieNotes.destroy({
    where: {
      movie_id: movie.id,
      author_id: interaction.user.id,
    },
  });
  return interaction.editReply(`Any notes created by you on movie "${movie.title}" have been deleted.`);
}

const MovieNightConfigCommand: Command = {
  guildOnly: true,
  slashCommandData: commandBuilder,
  runCommand: async interaction => {
    await interaction.deferReply({ ephemeral: true });
    const subcommand = getSubcommand(interaction);
    switch (subcommand) {
      case 'set': {
        await handleSet(interaction);
        break;
      }
      case 'delete': {
        await handleDelete(interaction);
        break;
      }
      default: {
        break;
      }
    }
  },
};

export default MovieNightConfigCommand;
