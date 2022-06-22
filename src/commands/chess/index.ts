import { WhereOptions, Op } from 'sequelize';
import { SlashCommandBuilder } from '@discordjs/builders';
import Discord, { GuildMember, Message, TextChannel } from 'discord.js';
import type { Command, CommandOrModalRunMethod, AnyInteraction } from 'src/types';
import { Chess, ChessInstance } from 'chess.js';

import { Colors, CONFIRMATION_DEFAULT_TIMEOUT, INTERACTION_MAX_TIMEOUT } from 'src/constants';
import get from 'lodash.get';
import { ChessGames } from 'src/models/chess-games';
import { log } from 'src/logging';
import { getRandomElement } from 'src/utils';
import { getSubcommand, parseInput } from 'src/discord-utils';

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
        .setName('starting_position')
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

function getChessImageUrl(game: ChessInstance): string {
  return `https://fen2png.com/api/?fen=${encodeURIComponent(game.fen())}&raw=true`;
}

function getChessBoardEmbed(game: ChessGames) {
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

async function getChessPgnWithHeaders(game: ChessGames, guild: Discord.Guild) {
  const chess = new Chess();
  chess.load_pgn(game.pgn);
  const [white, black] = await Promise.all([
    game.white_user_id ? guild.members.fetch(game.white_user_id) : null,
    game.black_user_id ? guild.members.fetch(game.black_user_id) : null,
  ]);
  if (white) chess.header('White', white.user.tag);
  if (black) chess.header('Black', black.user.tag);
  chess.header('Date', new Date().toDateString());
  return chess.pgn();
}

function getTurnInfo(interaction: AnyInteraction, game: ChessGames) {
  const chess = new Chess();
  chess.load_pgn(game.pgn);
  const currentTurnUser = chess.turn() === 'w' ? game.white_user_id : game.black_user_id;
  chess.undo();
  const lastTurnUser = chess.turn() === 'w' ? game.white_user_id : game.black_user_id;
  return {
    currentTurnUser,
    isYourTurn: currentTurnUser === interaction.user.id,
    madeLastMove: lastTurnUser === interaction.user.id,
  };
}

async function followUp({
  interaction,
  gameId,
  options,
}: {
  interaction: AnyInteraction,
  gameId: number,
  options: string | Discord.MessageOptions
}): Promise<Message | null> {
  const game = await ChessGames.findByPk(gameId);
  if (!game) {
    await interaction.followUp(`Game with ID "${gameId}" does not exist`);
    return null;
  }

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
  interaction: AnyInteraction,
  cb: (game: ChessGames) => void,
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
  const chessGames = await ChessGames.findAll({
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

  const optionPromises = chessGames.map(async (game: ChessGames) => {
    const whiteMember = game.white_user_id ? await interaction.guild!.members.fetch(game.white_user_id) : null;
    const blackMember = game.black_user_id ? await interaction.guild!.members.fetch(game.black_user_id) : null;
    const label = `${whiteMember?.user.username || 'TBD'} vs ${blackMember?.user.username || 'TBD'} - ${game.id}`;
    return {
      label,
      value: String(game.id),
    };
  });

  const options = await Promise.all(optionPromises);

  if (options.length === 1) {
    const gameId = Number(options[0].value);
    const game = await ChessGames.findByPk(gameId);
    if (!game) {
      await interaction.followUp({
        content: `Game with ID "${gameId}" no longer exists.`,
        ephemeral: true,
      });
    } else {
      await cb(game);
    }
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

  const selectMsg = await interaction.editReply({
    content: 'Select a game.',
    components: [row],
  });

  try {
    const selectInteraction = await interaction.channel?.awaitMessageComponent({
      filter: i => i.message.id === selectMsg.id && i.user.id === interaction.user.id,
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
      const game = await ChessGames.findByPk(gameId);
      if (!game) {
        await interaction.followUp({
          content: `Game with ID "${gameId}" no longer exists.`,
          ephemeral: true,
        });
      } else {
        await cb(game);
      }
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

async function handleAccept(interaction: AnyInteraction) {
  const { user } = interaction;

  await handleGameSelection({
    gameStarted: false,
    noGamesMessage: 'You are not currently challenged by anyone.',
    interaction,
    cb: async game => {
      if (user.id !== game.challenged_user_id) {
        await interaction.followUp({
          content: 'You cannot accept a game that you were not challenged to.',
          ephemeral: true,
        });
        return;
      }

      if (game.started) {
        await interaction.followUp({
          content: 'This game has already started.',
          ephemeral: true,
        });
        return;
      }

      await game.update({ started: true });
      await interaction.followUp({ content: `Challenge accepted for game with ID: ${game.id}.` });

      const { currentTurnUser } = getTurnInfo(interaction, game);
      const channel = await interaction.guild?.channels.fetch(game.channel_id) as TextChannel;
      await channel.send({
        content: [
          `Please make the first move, <@${currentTurnUser}>.`,
          'Use `/chess play` to make a move, or `/chess help` if you don\'t know how to type a move.',
        ].join('\n'),
        embeds: [getChessBoardEmbed(game)],
      });
    },
  });
}

async function handleMove(interaction: AnyInteraction) {
  const inputs = await parseInput({ slashCommandData: commandBuilder, interaction });
  const move: string = inputs.move;

  await handleGameSelection({
    interaction,
    gameStarted: true,
    noGamesMessage: 'You are currently not in a game that has started yet or you are not in the correct channel.',
    cb: async game => {
      const { isYourTurn } = getTurnInfo(interaction, game);
      if (!isYourTurn) {
        await interaction.followUp({
          content: 'It is not your turn yet.',
          ephemeral: true,
        });
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
          gameId: game.id,
          interaction,
          options: {
            content: `${content} <@${game.white_user_id}> <@${game.black_user_id}>\n\`\`\`${
              await getChessPgnWithHeaders(game, interaction.guild!)
            }\`\`\``,
            embeds: [getChessBoardEmbed(game)],
          },
        });
        await game.destroy();
        return;
      }
      await game.update({ pgn: chess.pgn() });
      const { currentTurnUser } = getTurnInfo(interaction, game);
      await followUp({
        gameId: game.id,
        interaction,
        options: {
          content: `Make a move <@${currentTurnUser}>`,
          embeds: [getChessBoardEmbed(game)],
        },
      });
    },
  });
}

async function handleChallenge(interaction: AnyInteraction) {
  // This is a guild-only command
  const guildId = interaction.guild!.id;

  const inputs = await parseInput({ slashCommandData: commandBuilder, interaction });
  const challengedUser: GuildMember = inputs.user;
  const startingPosition: string | null = inputs.starting_position;
  const targetId = challengedUser.id;
  const { user, channelId } = interaction;

  if (!channelId) throw new Error('Cannot create a channel from outside of a channel');

  const color: string | null = inputs.color?.toLowerCase();
  const authorColor: 'white' | 'black' = !color || !['white', 'black'].includes(color)
    ? getRandomElement(['white', 'black'])
    : color as 'white' | 'black';

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

  const game = await ChessGames.create({
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

        // Refetch the game since the game could have been accepted/declined before this interaction occurs
        const refetchedGame = await ChessGames.findByPk(game.id);
        if (!refetchedGame) {
          await buttonInteraction.followUp({
            content: 'This game has already been completed or the challenge was declined.',
            ephemeral: true,
          });
        } else if (refetchedGame.started) {
          await buttonInteraction.followUp({
            content: 'This game has already been accepted.',
            ephemeral: true,
          });
        } else {
          await refetchedGame.update({
            started: true,
          });
          const { currentTurnUser } = getTurnInfo(interaction, refetchedGame);
          await followUp({
            gameId: refetchedGame.id,
            interaction,
            options: {
              content: [
                `Challenge accepted: <@${user.id}> vs <@${targetId}>`,
                `Please make the first move, <@${currentTurnUser}>.`,
                'Use `/chess play` to make a move, or `/chess help` if you don\'t know how to type a move.',
              ].join('\n'),
              components: [],
              embeds: [getChessBoardEmbed(refetchedGame)],
            },
          });
        }

        await buttonInteraction.deleteReply();
        await challengeMsg.delete();
        break;
      }
      case 'decline': {
        await challengeMsg.edit({
          components: [],
        });
        // Refetch the game since the game could have been accepted/declined before this interaction occurs
        const refetchedGame = await ChessGames.findByPk(game.id);
        if (!refetchedGame) {
          await buttonInteraction.reply({
            content: 'This game has already been completed or the challenge was declined.',
            ephemeral: true,
          });
        } else if (refetchedGame.started) {
          await buttonInteraction.reply({
            content: 'This game has already been accepted.',
            ephemeral: true,
          });
        } else {
          await challengeMsg.reply({
            content: `Your challenge was declined <@${user.id}>`,
          });
          await refetchedGame.destroy();
        }
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

async function handleForfeit(interaction: AnyInteraction) {
  const { user } = interaction;
  await handleGameSelection({
    interaction,
    gameStarted: null,
    noGamesMessage: 'You do not have any games to forfeit.',
    cb: async game => {
      const chess = new Chess();
      chess.load_pgn(game.pgn);
      const hasMoves = chess.history().length > 0;
      await followUp({
        gameId: game.id,
        interaction,
        options: {
          content: `<@${user.id}> forfeited game with ID: ${game.id}. <@${game.white_user_id}> <@${game.black_user_id}>${
            hasMoves ? `\n\`\`\`${await getChessPgnWithHeaders(game, interaction.guild!)}\`\`\`` : ''
          }`,
          embeds: hasMoves ? [getChessBoardEmbed(game)] : undefined,
        },
      });
      await ChessGames.destroy({
        where: { id: game.id },
      });
    },
  });
}

async function handleShow(interaction: AnyInteraction) {
  await handleGameSelection({
    interaction,
    gameStarted: true,
    noGamesMessage: 'You do not have any games to show.',
    cb: async game => {
      const { currentTurnUser } = getTurnInfo(interaction, game);
      await followUp({
        gameId: game.id,
        interaction,
        options: {
          content: `Make a move <@${currentTurnUser}>.`,
          embeds: [getChessBoardEmbed(game)],
        },
      });
    },
  });
}

async function handleUndo(interaction: AnyInteraction) {
  const { user } = interaction;

  await handleGameSelection({
    interaction,
    gameStarted: true,
    noGamesMessage: 'You are not playing any games.',
    cb: async game => {
      // TODO: Have this propose a takeback where the other person has to accept
      const { madeLastMove } = getTurnInfo(interaction, game);
      if (!madeLastMove) {
        await interaction.followUp({
          content: 'You cannot take back a move unless you made the last move.',
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

      await game.update({ pgn: chess.pgn() });
      const { currentTurnUser } = getTurnInfo(interaction, game);
      await followUp({
        gameId: game.id,
        interaction,
        options: {
          content: `<@${user.id}> takes back their last move. Make a move <@${currentTurnUser}>.`,
          embeds: [getChessBoardEmbed(game)],
        },
      });
    },
  });
}

async function handleHelp(interaction: AnyInteraction) {
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

const run: CommandOrModalRunMethod = async interaction => {
  const subcommand = getSubcommand(interaction);
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
};

const ChessCommmand: Command = {
  guildOnly: true,
  slashCommandData: commandBuilder,
  runCommand: run,
  runModal: run,
  modalLabels: {
    user: 'User you want to challenge.',
    move: 'Make a move in Standard Algebraic Notation.',
    starting_position: 'PGN for starting position.',
  },
  modalPlaceholders: {
    move: 'E.g. e4, e2e4, Nf3, Nxf4, Nbe7, O-O',
    color: '"Black" or "White"',
    starting_position: 'FEN is NOT supported.',
  },
};

export default ChessCommmand;
