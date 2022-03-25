import { WhereOptions, Op } from 'sequelize';
import { SlashCommandBuilder, SlashCommandStringOption, SlashCommandUserOption } from '@discordjs/builders';
import Discord, { Message, TextChannel, CommandInteraction } from 'discord.js';
import type { Command } from 'src/types';
import { Chess, ChessInstance } from 'chess.js';

import { Colors, CONFIRMATION_DEFAULT_TIMEOUT, INTERACTION_MAX_TIMEOUT } from 'src/constants';
import get from 'lodash.get';
import { getModels } from 'src/models';
import { ChessGame } from 'src/models/chess-games';
import { log } from 'src/logging';
import { getRandomElement } from 'src/utils';

const model = getModels().chess_games;

function getChessImageUrl(game: ChessInstance): string {
  return `https://fen2png.com/api/?fen=${encodeURIComponent(game.fen())}&raw=true`;
}

function getChessBoardEmbed(game: ChessGame) {
  const chess = new Chess();
  chess.load_pgn(game.pgn);
  const moves = chess.history();
  const lastMove = moves[moves.length - 1];
  const color = chess.turn() === 'w' ? '#FFFFFF' : '#000000';
  return new Discord.MessageEmbed({
    title: ':chess_pawn: Chess Game',
    color,
    description: `<@${game.white_user_id}> vs <@${game.black_user_id}>${
      lastMove ? `\nLast move: \`${lastMove}\`` : ''
    }`,
    image: { url: getChessImageUrl(chess) },
    footer: {
      text: `ID: ${game.id}`,
    },
  });
}

function getTurnInfo(interaction: CommandInteraction, game: ChessGame) {
  const chess = new Chess();
  chess.load_pgn(game.pgn);
  const currentTurnUser = chess.turn() === 'w' ? game.white_user_id : game.black_user_id;
  return {
    currentTurnUser,
    isYourTurn: currentTurnUser === interaction.user.id,
  };
}

async function followUp({
  interaction,
  gameId,
  options,
}: {
  interaction: CommandInteraction,
  gameId: number,
  options: string | Discord.MessagePayload | Discord.InteractionReplyOptions
}): Promise<Message | null> {
  const game = await model.findByPk(gameId);
  let channel: TextChannel | undefined | null;
  try {
    channel = await interaction.guild?.channels.fetch(game.channel_id) as TextChannel | null | undefined;
  } catch {
    // Intentionally empty
  }
  if (!channel) {
    await game.destroy();
    await interaction.followUp(`Channel for game ${gameId} was not found. Game was deleted.`);
    return null;
  }
  return channel.send(options);
}

async function handleGameSelection({
  noGamesMessage,
  interaction,
  cb,
  gameStarted,
}: {
  noGamesMessage: string,
  interaction: CommandInteraction,
  cb: (gameId: number) => void,
  gameStarted: boolean | null, // null indicates it doesn't matter
}) {
  await interaction.reply({
    content: 'Working...',
  });

  let where: WhereOptions = {
    [Op.or]: [
      { white_user_id: interaction.user.id },
      { black_user_id: interaction.user.id },
    ],
    guild_id: interaction.guild!.id,
  };
  if (gameStarted != null) {
    where = {
      ...where,
      started: gameStarted,
    };
  }
  const chessGames = await model.findAll({
    where,
  });

  if (chessGames.length === 0) {
    await interaction.deleteReply();
    await interaction.followUp({
      content: noGamesMessage,
      ephemeral: true,
    });
    return;
  }

  const optionPromises = chessGames.map(async (game: ChessGame) => {
    const whiteMember = await interaction.guild!.members.fetch(game.white_user_id);
    const blackMember = await interaction.guild!.members.fetch(game.black_user_id);
    const label = `${whiteMember.user.username} vs ${blackMember.user.username} - ${game.id}`;
    return {
      label,
      value: String(game.id),
    };
  });

  const options = await Promise.all(optionPromises);

  if (options.length === 1) {
    await cb(Number(options[0].value));
    await interaction.deleteReply();
    return;
  }
  const menu = new Discord.MessageSelectMenu({
    customId: 'game',
    placeholder: 'Select a game...',
    options: options.slice(0, 25),
  });
  const row = new Discord.MessageActionRow({
    components: [menu],
  });

  await interaction.editReply({
    content: 'Select a game.',
    components: [row],
  });

  try {
    const selectInteraction = await interaction.channel?.awaitMessageComponent({
      filter: i => i.message.interaction?.id === interaction.id && i.user.id === interaction.user.id,
      time: CONFIRMATION_DEFAULT_TIMEOUT,
    }).catch(() => {
      // Intentionally empty catch
    });
    if (selectInteraction?.isSelectMenu()) {
      const gameId = Number(selectInteraction.values[0]);
      await interaction.editReply({
        content: 'Working...',
        components: [],
      });
      await cb(gameId);
      await interaction.deleteReply();
    } else {
      // If we get here, then the interaction button was not clicked.
      await interaction.editReply({
        content: `Confirmation timed out after ${CONFIRMATION_DEFAULT_TIMEOUT / 1000} seconds.`,
        components: [],
      });
    }
  } catch (err) {
    await interaction.editReply(`Error: ${get(err, 'message', 'Something went wrong.')}`);
  }
}

async function handleAccept(interaction: CommandInteraction) {
  const { user } = interaction;

  await handleGameSelection({
    gameStarted: false,
    noGamesMessage: 'You are not currently challenged by anyone.',
    interaction,
    cb: async gameId => {
      const game: ChessGame = await model.findByPk(gameId);
      if (user.id !== game.challenged_user_id) {
        await interaction.followUp({
          content: 'You cannot accept a game that you were not challenged to.',
          ephemeral: true,
        });
        return;
      }

      // @ts-expect-error TODO: Fix Sequelize model typing
      await game.update({ stated: true });
      await interaction.followUp({ content: `Challenge accepted for game with ID: ${gameId}.` });

      const { currentTurnUser } = getTurnInfo(interaction, game);
      const channel = await interaction.guild?.channels.fetch(game.channel_id) as TextChannel;
      await channel.send({
        content: [
          `Please make the first move, <@${currentTurnUser}>.`,
          'Use `/chess play` to make a move and `/chess help` if you need help.',
        ].join('\n'),
        embeds: [getChessBoardEmbed(game)],
      });
    },
  });
}

async function handleMove(interaction: CommandInteraction) {
  const move = interaction.options.getString('move', true);

  await handleGameSelection({
    interaction,
    gameStarted: true,
    noGamesMessage: 'You are currently not in a game that has started yet or you are not in the correct channel.',
    cb: async gameId => {
      const game: ChessGame = await model.findByPk(gameId);

      const { isYourTurn } = getTurnInfo(interaction, game);
      if (!isYourTurn) {
        await interaction.followUp({ content: 'It is not your turn yet.', ephemeral: true });
        return;
      }

      const chess = new Chess();
      chess.load_pgn(game.pgn);

      const isValidMove = Boolean(chess.move(move, { sloppy: true }));
      if (!isValidMove) {
        await interaction.followUp({ content: 'That is not a valid move', ephemeral: true });
        return;
      }

      const { currentTurnUser: lastTurnUser } = getTurnInfo(interaction, game);
      // @ts-expect-error TODO: Fix Sequelize model typing
      await game.update({ pgn: chess.pgn() });

      if (chess.game_over()) {
        let content = 'Game is over??';
        if (chess.in_draw()) {
          content = 'Game has ended in a **draw** (50-move rule or insufficient material).';
        }
        if (chess.in_checkmate()) {
          content = `<@${lastTurnUser}> wins by **checkmate**.`;
        }
        if (chess.in_stalemate()) {
          content = 'Game has ended by **stalemate**.';
        }
        if (chess.in_threefold_repetition()) {
          content = 'Game has ended by **threefold repetition**.';
        }
        await followUp({
          gameId,
          interaction,
          options: {
            content: `${content} <@${game.white_user_id}> <@${game.black_user_id}>\n\`\`\`${chess.pgn()}\`\`\``,
            embeds: [getChessBoardEmbed(game)],
          },
        });
        // @ts-expect-error TODO: Fix Sequelize model typing
        await game.destroy();
        return;
      }
      // @ts-expect-error TODO: Fix Sequelize model typing
      await game.update({ pgn: chess.pgn() });
      const { currentTurnUser } = getTurnInfo(interaction, game);
      await followUp({
        gameId,
        interaction,
        options: {
          content: `Make a move <@${currentTurnUser}>`,
          embeds: [getChessBoardEmbed(game)],
        },
      });
    },
  });
}

async function handleChallenge(interaction: CommandInteraction) {
  // This is a guild-only command
  const guildId = interaction.guild!.id;

  const challengedUser = interaction.options.getUser('user', true);
  const startingPosition = interaction.options.getString('starting-position');
  const targetId = challengedUser.id;
  const { user } = interaction;
  const { channelId } = interaction;

  const color = interaction.options.getString('color')?.toLowerCase();
  const authorColor: 'white' | 'black' = !color || !['white', 'black'].includes(color)
    ? getRandomElement(['white', 'black'])
    : color as 'white' | 'black';
  const challengedUserColor = authorColor === 'black' ? 'white' : 'black';

  const buttonActionRow = new Discord.MessageActionRow({
    components: [
      new Discord.MessageButton({
        customId: 'accept',
        label: 'Accept',
        style: 'SUCCESS',
      }),
      new Discord.MessageButton({
        customId: 'decline',
        label: 'Decline',
        style: 'DANGER',
      }),
    ],
  });

  const whiteUserId = authorColor === 'white' ? user.id : targetId;
  const blackUserId = authorColor === 'white' ? targetId : user.id;

  await interaction.reply({
    content: 'Working...',
  });

  const chess = new Chess();
  if (startingPosition) chess.load_pgn(startingPosition);
  chess.header('White', authorColor === 'white' ? user.username : challengedUser.username);
  chess.header('Black', authorColor === 'black' ? user.username : challengedUser.username);
  chess.header('Date Started', new Date().toDateString());

  const game = await model.create({
    guild_id: guildId,
    channel_id: channelId,
    white_user_id: whiteUserId,
    black_user_id: blackUserId,
    owner_user_id: user.id,
    challenged_user_id: targetId,
    pgn: chess.pgn(),
    started: false,
  });

  const challengeEmbed = new Discord.MessageEmbed({
    title: ':chess_pawn: Chess Challenge!',
    color: Colors.SUCCESS,
    description: `<@${user.id}> challenges <@${targetId}> to a game of chess!`,
    fields: [
      {
        name: 'Accept',
        value: 'Click a button within 15 mins, or use `/chess accept` to accept the challenge if 15 mins have passed.',
        inline: false,
      },
      {
        name: 'White',
        value: `<@${whiteUserId}>`,
        inline: true,
      },
      {
        name: 'Black',
        value: `<@${blackUserId}>`,
        inline: true,
      },
    ],
    footer: {
      text: `ID: ${game.id}`,
    },
  });

  const challengeMsg = await followUp({
    interaction,
    gameId: game.id,
    options: {
      content: `<@${user.id}> <@${targetId}>`,
      embeds: [challengeEmbed],
      components: [buttonActionRow],
    },
  });

  await interaction.deleteReply();
  if (!challengeMsg) return;

  try {
    const buttonInteraction = await interaction.channel?.awaitMessageComponent({
      filter: i => i.message.id === challengeMsg.id && i.user.id === targetId,
      time: INTERACTION_MAX_TIMEOUT,
    }).catch(() => {
      // Intentionally empty catch
    });
    switch (buttonInteraction?.customId) {
      case 'accept': {
        await buttonInteraction.reply('Accepting...');
        await challengeMsg.edit({ components: [] });
        await game.update({
          started: true,
        });
        const { currentTurnUser } = getTurnInfo(interaction, game);
        await followUp({
          gameId: game.id,
          interaction,
          options: {
            content: [
              `Challenge accepted: <@${user.id}> vs <@${targetId}>`,
              `Please make the first move, <@${currentTurnUser}>.`,
              'Use `/chess play` to make a move and `/chess help` if you need help.',
            ].join('\n'),
            components: [],
            embeds: [getChessBoardEmbed(game)],
          },
        });
        await buttonInteraction.deleteReply();
        await challengeMsg.delete();
        break;
      }
      case 'decline': {
        await challengeMsg.edit({
          components: [],
        });
        await challengeMsg.reply({
          content: `Your challenge was declined <@${user.id}>`,
        });
        break;
      }
      default: {
        // If we get here, then the interaction button was not clicked.
        await challengeMsg.edit({ components: [] }).catch(() => {
          // Assume the message was already deleted, so do nothing
          log('Chess challenge message already deleted');
        });
        break;
      }
    }
  } catch (err) {
    await interaction.followUp({
      content: `Error: ${get(err, 'message', 'Something went wrong.')}`,
      ephemeral: true,
    });
  }
}

async function handleForfeit(interaction: CommandInteraction) {
  const { user } = interaction;
  await handleGameSelection({
    interaction,
    gameStarted: null,
    noGamesMessage: 'You do not have any games to forfeit.',
    cb: async gameId => {
      const game: ChessGame = await model.findByPk(gameId);
      const chess = new Chess();
      chess.load_pgn(game.pgn);
      const hasMoves = chess.history().length > 0;
      await followUp({
        gameId,
        interaction,
        options: {
          content: `<@${user.id}> forfeited game with ID: ${gameId}. <@${game.white_user_id}> <@${game.black_user_id}>${
            hasMoves ? `\n\`\`\`${game.pgn}\`\`\`` : ''
          }`,
          embeds: hasMoves ? [getChessBoardEmbed(game)] : undefined,
        },
      });
      await model.destroy({
        where: { id: gameId },
      });
    },
  });
}

async function handleShow(interaction: CommandInteraction) {
  await handleGameSelection({
    interaction,
    gameStarted: true,
    noGamesMessage: 'You do not have any games to show.',
    cb: async gameId => {
      const game: ChessGame = await model.findByPk(gameId);
      const { currentTurnUser } = getTurnInfo(interaction, game);
      await followUp({
        gameId,
        interaction,
        options: {
          content: `Make a move <@${currentTurnUser}>.`,
          embeds: [getChessBoardEmbed(game)],
        },
      });
    },
  });
}

async function handleUndo(interaction: CommandInteraction) {
  const { user } = interaction;

  await handleGameSelection({
    interaction,
    gameStarted: true,
    noGamesMessage: 'You are not playing any games.',
    cb: async gameId => {
      const game: ChessGame = await model.findByPk(gameId);

      // TODO: Have this propose a takeback where the other person has to accept
      const { isYourTurn } = getTurnInfo(interaction, game);
      if (isYourTurn) {
        await interaction.followUp({
          content: 'You cannot take back your move when it is not your turn.',
          ephemeral: true,
        });
        return;
      }

      const chess = new Chess();
      chess.load_pgn(game.pgn);
      const takeback = chess.undo();

      if (takeback == null) {
        await interaction.followUp({
          content: 'You cannot take back this move.',
          ephemeral: true,
        });
        return;
      }

      // @ts-expect-error TODO: Fix Sequelize model typing
      await game.update({ pgn: chess.pgn() });
      const { currentTurnUser } = getTurnInfo(interaction, game);
      await followUp({
        gameId,
        interaction,
        options: {
          content: `<@${user.id}> takes back their last move. Make a move <@${currentTurnUser}>.`,
          embeds: [getChessBoardEmbed(game)],
        },
      });
    },
  });
}

async function handleHelp(interaction: CommandInteraction) {
  const acceptEmbed = new Discord.MessageEmbed({
    title: 'Accept game',
    color: Colors.SUCCESS,
    description: [
      'Click the Accept button within 15 mins of being challenged.',
      'Or, type `/chess accept` if 15 mins have passed.',
    ].join('\n'),
  });
  const playEmbed = new Discord.MessageEmbed({
    title: 'Make a move',
    color: Colors.SUCCESS,
    description: 'Type `/chess move` and then provide the move in Standard Algebraic Notation.',
    fields: [
      {
        name: '**Nooby Examples**',
        value: [
          'To move a piece, you can simply specify the starting square and the ending square:',
          '`e2e4`: Your pawn moves from e2 to e4',
          '`b1c3`: Your knight on b1 moves to c3',
        ].join('\n'),
      },
      {
        name: '**Advanced Examples**',
        value: [
          '`e4`: Your pawn moves to e4',
          '`exd5`: Your pawn on the e file takes their pawn on d5',
          '`Nxe5`: Your knight takes their piece on e5',
          '`Ke5`: Your king moves to e5',
          '`Be5`: Your queen moves to e5',
          '`Qe5`: Your bishop moves to e5',
          '`O-O`: Castle kingside',
          '`O-O-O`: Castle queenside',
          '`Rd1`: Your rook moves to d1',
          '`Rad1`: Your rook from the a file moves to d1 (specification is needed if it\'s possible for a different rook to move to d1)',
          '`e8=Q`: Promotes your pawn to a Queen',
        ].join('\n'),
      },
    ],
  });
  await interaction.reply({
    content: 'Type `/chess` to see all of the chess commands you can make.',
    embeds: [acceptEmbed, playEmbed],
  });
}

const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('chess')
  .setDescription('Play a game of chess with someone.');
commandBuilder.addSubcommand(subcommand => {
  subcommand
    .setName('challenge')
    .setDescription('Challenge a user.')
    .addUserOption(option => {
      return option
        .setName('user')
        .setDescription('Mention the user you want to challenge.')
        .setRequired(true);
    })
    .addStringOption(option => {
      return option
        .setName('color')
        .setDescription('Choose your color.')
        .addChoices([
          ['White', 'white'],
          ['Black', 'black'],
          ['Random', 'random'],
        ])
        .setRequired(false);
    })
    .addStringOption(option => {
      return option
        .setName('starting-position')
        .setDescription('PGN for starting position. Note: FEN is NOT supported.')
        .setRequired(false);
    });
  return subcommand;
});

commandBuilder.addSubcommand(subcommand => {
  subcommand
    .setName('play')
    .setDescription('Make the next move.')
    .addStringOption(option => {
      return option
        .setName('move')
        .setDescription('Make a move in Standard Algebraic Notation. E.g. e5, Nf3, Nxf4, Nbe7, O-O')
        .setRequired(true);
    });
  return subcommand;
});

commandBuilder.addSubcommand(subcommand => {
  subcommand
    .setName('accept')
    .setDescription('Accept a challenge. A select box will appear to choose the game.');
  return subcommand;
});

commandBuilder.addSubcommand(subcommand => {
  subcommand
    .setName('forfeit')
    .setDescription('Forfeit the game. A select box will appear to choose the game.');
  return subcommand;
});

commandBuilder.addSubcommand(subcommand => {
  subcommand
    .setName('show')
    .setDescription('Shows a game. A select box will appear to choose the game.');
  return subcommand;
});

commandBuilder.addSubcommand(subcommand => {
  subcommand
    .setName('undo')
    .setDescription('Undo the last half-move (yours).');
  return subcommand;
});

commandBuilder.addSubcommand(subcommand => {
  subcommand
    .setName('help')
    .setDescription('Info on how to make moves and accept games.');
  return subcommand;
});

const ChessCommmand: Command = {
  guildOnly: true,
  slashCommandData: commandBuilder,
  runCommand: async interaction => {
    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
      case 'play': {
        await handleMove(interaction);
        return;
      }
      case 'show': {
        await handleShow(interaction);
        return;
      }
      case 'challenge': {
        await handleChallenge(interaction);
        return;
      }
      case 'accept': {
        await handleAccept(interaction);
        return;
      }
      case 'forfeit': {
        await handleForfeit(interaction);
        return;
      }
      case 'undo': {
        await handleUndo(interaction);
        return;
      }
      case 'help': {
        await handleHelp(interaction);
        return;
      }
      default: {
        await interaction.editReply('What??');
      }
    }
  },
};

export default ChessCommmand;
