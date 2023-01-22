import { WhereOptions, Op } from 'sequelize';
import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ButtonStyle,
  GuildMember,
  Message,
  Guild,
  MessageCreateOptions,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ChannelType,
} from 'discord.js';
import type { Command, CommandOrModalRunMethod, AnyInteraction, GuildTextChannel } from 'src/types';
import { Chess } from 'chess.js';

import { Colors, CONFIRMATION_DEFAULT_TIMEOUT } from 'src/constants';
import get from 'lodash.get';
import { ChessGames } from 'src/models/chess-games';
import { error, log } from 'src/logging';
import { filterOutFalsy, getRandomElement } from 'src/utils';
import { getSubcommand, isGuildChannel, messageChannel, parseInput, usersHaveChannelPermission } from 'src/discord-utils';
import { emit } from 'src/api/sockets';
import { SocketEventTypes } from 'src/types/sockets';
import { client } from 'src/client';
import { getGameResponse } from 'src/api/routes/chess';

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
        .addChoices(
          { name: 'White', value: 'white' },
          { name: 'Black', value: 'black' },
          { name: 'Random', value: 'random' },
        )
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
    .setName('resign')
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

export function getRooms(game: ChessGames): string[] {
  return filterOutFalsy([game.white_user_id, game.black_user_id]);
}

function getChessImageUrl(game: Chess): string {
  return `https://fen2png.com/api/?fen=${encodeURIComponent(game.fen())}&raw=true`;
}

export function getChessBoardEmbed(game: ChessGames): EmbedBuilder {
  const chess = new Chess();
  chess.loadPgn(game.pgn, { sloppy: true });
  const moves = chess.history();
  const lastMove = moves[moves.length - 1];
  const color = chess.turn() === 'w' ? '#FFFFFF' : '#000000';
  const embed = new EmbedBuilder({
    title: ':chess_pawn: Chess Game',
    url: `${process.env.UI_ROOT}/chess`,
    description: `<@${game.white_user_id}> vs <@${game.black_user_id}>${
      lastMove ? `\nLast move: \`${lastMove}\`` : ''
    }`,
    image: { url: getChessImageUrl(chess) },
    footer: {
      text: `ID: ${game.id}`,
    },
  });
  embed.setColor(color);
  return embed;
}

export async function getChessPgnWithHeaders(game: ChessGames, guild: Guild): Promise<string> {
  const chess = new Chess();
  chess.loadPgn(game.pgn, { sloppy: true });
  const [white, black] = await Promise.all([
    game.white_user_id ? guild.members.fetch(game.white_user_id) : null,
    game.black_user_id ? guild.members.fetch(game.black_user_id) : null,
  ]);
  if (white) chess.header('White', white.user.tag);
  if (black) chess.header('Black', black.user.tag);
  chess.header('Date', new Date().toDateString());
  return chess.pgn();
}

function getTurnInfo(userId: string, game: ChessGames) {
  const chess = new Chess();
  chess.loadPgn(game.pgn, { sloppy: true });
  const currentTurnUser = chess.turn() === 'w' ? game.white_user_id : game.black_user_id;
  chess.undo();
  const lastTurnUser = chess.turn() === 'w' ? game.white_user_id : game.black_user_id;
  return {
    currentTurnUser,
    isYourTurn: currentTurnUser === userId,
    madeLastMove: lastTurnUser === userId,
  };
}

function handleResponseError(err: Error, interaction: AnyInteraction) {
  return interaction.editReply(err.message);
}

function throwGameNotFoundError(err: Error) {
  throw {
    status: 404,
    message: err.message,
  };
}

async function respond({
  gameId,
  getMessage,
}: {
  gameId: number,
  getMessage: (channel: GuildTextChannel) => Promise<string | MessageCreateOptions> | string | MessageCreateOptions,
}): Promise<Message | null> {
  const game = await ChessGames.findByPk(gameId);
  if (!game) throw new Error(`Game with ID "${gameId}" does not exist`);

  try {
    const channel = await client.channels.fetch(game.channel_id).catch(() => null);
    if (!channel || !isGuildChannel(channel)) {
      throw new Error('Channel not found.');
    }
    const thread = game.thread_id && !channel.isThread() && !channel.isVoiceBased()
      ? await channel.threads.fetch(game.thread_id).catch(() => null)
      : null;
    const msgOptions = await getMessage(channel);
    const msg = thread
      ? await thread.send(msgOptions)
      : await channel.send(msgOptions);
    return msg;
  } catch {
    await game.destroy();
    throw new Error(`Channel for game ${gameId} was not found. Game was deleted.`);
  }
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
    ephemeral: true,
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
    order: [
      ['id', 'ASC'],
    ],
  });

  if (chessGames.length === 0) {
    await interaction.editReply({
      content: noGamesMessage,
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
      await interaction.editReply({
        content: `Game with ID "${gameId}" no longer exists.`,
      });
    } else {
      await cb(game);
    }
    return;
  }
  const menu = new StringSelectMenuBuilder({
    customId: 'game',
    placeholder: 'Select a game...',
    options: options.slice(0, 25),
  });
  const row = new ActionRowBuilder<StringSelectMenuBuilder>({
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
      selectMsg.delete();
    });
    if (selectInteraction?.isStringSelectMenu()) {
      const gameId = Number(selectInteraction.values[0]);
      await interaction.editReply({
        content: 'Working...',
        components: [],
      });
      const game = await ChessGames.findByPk(gameId);
      if (!game) {
        await interaction.editReply({
          content: `Game with ID "${gameId}" no longer exists.`,
        });
      } else {
        await cb(game);
      }
    }
  } catch (err) {
    await interaction.editReply(`Error: ${get(err, 'message', 'Something went wrong.')}`);
  }
}

export async function declineChallenge({
  game,
  userId,
}: {
  game: ChessGames,
  userId: string,
}): Promise<void> {
  if (userId !== game.challenged_user_id) {
    throw {
      message: 'You cannot decline a game that you were not challenged to.',
    };
  }
  if (game.started) {
    throw {
      message: 'This game has already been accepted.',
    };
  }
  await game.destroy();
  await messageChannel({
    threadId: game.thread_id,
    channelId: game.channel_id,
    getMessage: () => ({
      content: `Your challenge was declined <@${userId}>`,
    }),
  }).catch(err => {
    throw {
      status: 404,
      message: err.message,
    };
  });
  emit({
    type: SocketEventTypes.CHESS_CHALLENGE_DECLINED,
    data: game,
  }, getRooms(game));
}

export async function acceptChallenge({
  game,
  userId,
}: {
  game: ChessGames,
  userId: string,
}): Promise<void> {
  if (userId !== game.challenged_user_id) {
    throw {
      message: 'You cannot accept a game that you were not challenged to.',
    };
  }
  if (game.started) {
    throw {
      message: 'This game has already started.',
    };
  }
  await game.update({ started: true });
  const { currentTurnUser } = getTurnInfo(userId, game);
  await respond({
    gameId: game.id,
    getMessage: () => ({
      content: [
        `Challenge accepted for game with ID: ${game.id}.`,
        `Please make the first move, <@${currentTurnUser}>.`,
        'Use `/chess play` to make a move, or `/chess help` if you don\'t know how to type a move.',
      ].join('\n'),
      embeds: [getChessBoardEmbed(game)],
    }),
  }).catch(throwGameNotFoundError);
  emit({
    type: SocketEventTypes.CHESS_CHALLENGE_ACCEPTED,
    data: await getGameResponse(game),
  }, getRooms(game));
}

async function handleAccept(interaction: AnyInteraction) {
  await handleGameSelection({
    gameStarted: false,
    noGamesMessage: 'You are not currently challenged by anyone.',
    interaction,
    cb: async game => {
      try {
        await acceptChallenge({
          game,
          userId: interaction.user.id,
        });
        await interaction.deleteReply();
      } catch (err) {
        await interaction.editReply({
          // @ts-expect-error We know the structure of this exception
          content: err.message,
        });
      }
    },
  });
}

export async function makeMove({
  userId,
  game,
  move,
}: {
  userId: string,
  game: ChessGames,
  move: string,
}): Promise<void> {
  const { isYourTurn } = getTurnInfo(userId, game);
  if (!isYourTurn) {
    throw {
      status: 400,
      message: 'It is not your turn yet.',
    };
  }

  const chess = new Chess();
  chess.loadPgn(game.pgn, { sloppy: true });

  const isValidMove = Boolean(chess.move(move, { sloppy: true }));
  if (!isValidMove) {
    throw {
      status: 400,
      message: 'That is not a valid move.',
    };
  }

  const { currentTurnUser: lastTurnUser } = getTurnInfo(userId, game);
  await game.update({ pgn: chess.pgn() });
  emit({
    type: SocketEventTypes.CHESS_GAME_UPDATED,
    data: await getGameResponse(game),
  }, getRooms(game));

  if (chess.isGameOver()) {
    let content = 'Game is over??';
    if (chess.isDraw()) {
      content = 'Game has ended in a **draw** (50-move rule or insufficient material).';
    } else if (chess.isCheckmate()) {
      content = `<@${lastTurnUser}> wins by **checkmate**.`;
    } else if (chess.isStalemate()) {
      content = 'Game has ended by **stalemate**.';
    } else if (chess.isThreefoldRepetition()) {
      content = 'Game has ended by **threefold repetition**.';
    }
    await respond({
      gameId: game.id,
      getMessage: async channel => ({
        content: `${content} <@${game.white_user_id}> <@${game.black_user_id}>\n\`\`\`${
          await getChessPgnWithHeaders(game, channel.guild)
        }\`\`\``,
        embeds: [getChessBoardEmbed(game)],
      }),
    });
    await game.destroy();
  } else {
    const { currentTurnUser } = getTurnInfo(userId, game);
    await respond({
      gameId: game.id,
      getMessage: () => ({
        content: `Make a move <@${currentTurnUser}>`,
        embeds: [getChessBoardEmbed(game)],
      }),
    });
  }
}

async function handleMove(interaction: AnyInteraction) {
  const inputs = await parseInput({ slashCommandData: commandBuilder, interaction });
  const move: string = inputs.move;

  await handleGameSelection({
    interaction,
    gameStarted: true,
    noGamesMessage: 'You are currently not in a game that has started yet or you are not in the correct channel.',
    cb: async game => {
      try {
        await makeMove({
          userId: interaction.user.id,
          game,
          move,
        });
        await interaction.deleteReply();
      } catch (err) {
        await interaction.editReply({
          // @ts-expect-error We know the structure of this exception
          content: err.message,
        });
      }
    },
  });
}

export async function challengeUser({
  guildId,
  channelId,
  userId,
  challengedUserId,
  color,
  startingPosition,
}: {
  userId: string,
  guildId: string,
  channelId: string,
  challengedUserId: string,
  color: string | null,
  startingPosition: string | null,
}): Promise<ChessGames> {
  const guild = await client.guilds.fetch(guildId);
  if (!guild) {
    throw {
      status: 404,
      message: 'Could not find guild',
    };
  }
  const channel = await guild.channels.fetch(channelId);
  if (!channel) {
    throw {
      status: 404,
      message: 'Could not find channel',
    };
  }
  if (!isGuildChannel(channel)) {
    throw {
      status: 400,
      message: 'Channel must be in a guild',
    };
  }
  if (!usersHaveChannelPermission({
    channel,
    users: filterOutFalsy([userId, client.user?.id, challengedUserId]),
    permissions: ['SendMessages', 'ViewChannel'],
  })) {
    throw {
      status: 401,
      message: 'One of the users or myself do not have access to this channel',
    };
  }

  const authorColor: 'white' | 'black' = !color || !['white', 'black'].includes(color.toLowerCase())
    ? getRandomElement(['white', 'black'])
    : color.toLowerCase() as 'white' | 'black';

  const buttonActionRow = new ActionRowBuilder<ButtonBuilder>({
    components: [
      new ButtonBuilder({
        customId: 'accept',
        label: 'Accept',
        style: ButtonStyle.Success,
      }),
      new ButtonBuilder({
        customId: 'decline',
        label: 'Decline',
        style: ButtonStyle.Danger,
      }),
    ],
  });

  const whiteUserId = authorColor === 'white' ? userId : challengedUserId;
  const blackUserId = authorColor === 'white' ? challengedUserId : userId;
  const [white, black] = await Promise.all([
    whiteUserId ? guild.members.fetch(whiteUserId) : null,
    blackUserId ? guild.members.fetch(blackUserId) : null,
  ]);

  const canCreateThread = usersHaveChannelPermission({
    channel,
    users: filterOutFalsy([client.user?.id]),
    permissions: ['CreatePublicThreads'],
  }) && !channel.isVoiceBased() && channel.type === ChannelType.GuildText;
  const thread = canCreateThread ? (
    await channel.threads.create({
      name: `Chess Game - ${white?.user.username} vs ${black?.user.username}`,
      type: ChannelType.PublicThread,
      invitable: true,
    })
  ) : null;
  const messagingChannel = thread || channel;

  const chess = new Chess();

  // Note: We need to load sloppy PGNs to support situations like the following:
  // chess.js version 0.12.0 creates a PGN that it cannot load (this is a bug).
  // 1. Nc3 Nc6 2. Ne4 Nb8 3. Ng5 Nc6 4. e3 g6 5. Ke2 Bh6 6. Kf3 Nb8 7. Kf4 Nc6 8. N1f3
  // Move 8 should be Nf3 since the other knight is in an absolute pin.
  // N1f3 is in the generated PGN, but that move will not be loaded unless we specify the sloppy option.
  if (startingPosition) chess.loadPgn(startingPosition, { sloppy: true });

  const game = await ChessGames.create({
    guild_id: guildId,
    channel_id: channelId,
    thread_id: thread?.id || null,
    white_user_id: whiteUserId,
    black_user_id: blackUserId,
    owner_user_id: userId,
    challenged_user_id: challengedUserId,
    pgn: chess.pgn(),
    started: false,
  });

  const challengeEmbed = new EmbedBuilder({
    title: ':chess_pawn: Chess Challenge!',
    description: `<@${userId}> challenges <@${challengedUserId}> to a game of chess!`,
    fields: [
      {
        name: 'Accept',
        value: 'Click a button, or use `/chess accept` to accept the challenge.',
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
  challengeEmbed.setColor(Colors.SUCCESS);

  const challengeMsg = await messagingChannel.send({
    content: `<@${userId}> <@${challengedUserId}>`,
    embeds: [challengeEmbed],
    components: [buttonActionRow],
  });

  if (!challengeMsg) return game;

  messagingChannel.awaitMessageComponent({
    filter: i => i.message.id === challengeMsg.id && i.user.id === challengedUserId,
  }).then(async buttonInteraction => {
    await buttonInteraction.reply({ content: 'Working...', ephemeral: true });
    switch (buttonInteraction?.customId) {
      case 'accept': {
        await challengeMsg.edit({ components: [] });
        // Refetch the game since the game could have been accepted/declined before this interaction occurs
        const refetchedGame = await ChessGames.findByPk(game.id);
        if (!refetchedGame) {
          await buttonInteraction.editReply({
            content: 'This game has already been completed or the challenge was declined.',
          });
        } else {
          try {
            await acceptChallenge({
              game: refetchedGame,
              userId: buttonInteraction.user.id,
            });
            await buttonInteraction.deleteReply();
            await challengeMsg.delete();
          } catch (err) {
            await buttonInteraction.editReply({
              // @ts-expect-error We know the structure of this exception
              content: err.message,
            });
          }
        }
        break;
      }
      case 'decline': {
        await challengeMsg.edit({ components: [] });
        // Refetch the game since the game could have been accepted/declined before this interaction occurs
        const refetchedGame = await ChessGames.findByPk(game.id);
        if (!refetchedGame) {
          await buttonInteraction.editReply({
            content: 'This game has already been completed or the challenge was declined.',
          });
        } else {
          try {
            await declineChallenge({
              game: refetchedGame,
              userId,
            });
            await buttonInteraction.deleteReply();
          } catch (err) {
            await buttonInteraction.editReply({
              // @ts-expect-error We know the structure of this exception
              content: err.message,
            });
          }
        }
        break;
      }
      default: {
        // If we get here, then the interaction button was not clicked.
        await challengeMsg.edit({ components: [] }).catch(() => {
          // Assume the message was already deleted, so do nothing
          log('Chess challenge message already deleted');
        });
        await buttonInteraction.deleteReply();
        break;
      }
    }
  }).catch(err => {
    error(err);
  });

  emit({
    type: SocketEventTypes.CHESS_CHALLENGED,
    data: await getGameResponse(game),
  }, [challengedUserId]);

  return game;
}

async function handleChallenge(interaction: AnyInteraction) {
  if (!interaction.guild || !interaction.channelId) throw new Error('Challenge must be made in a guild channel');

  const guildId = interaction.guild.id;
  const inputs = await parseInput({ slashCommandData: commandBuilder, interaction });
  const challengedUser: GuildMember = inputs.user;
  const startingPosition: string | null = inputs.starting_position;
  const color: string | null = inputs.color?.toLowerCase();

  try {
    await interaction.reply({
      content: 'Working...',
      ephemeral: true,
    });
    await challengeUser({
      guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      challengedUserId: challengedUser.id,
      color,
      startingPosition,
    });
    await interaction.deleteReply();
  } catch (err) {
    await interaction.editReply({
      // @ts-expect-error We know this is the structure of the exception
      content: err.message,
    });
  }
}

export async function resignGame({
  game,
  userId,
}: {
  game: ChessGames,
  userId: string,
}): Promise<void> {
  const chess = new Chess();
  chess.loadPgn(game.pgn, { sloppy: true });
  const hasMoves = chess.history().length > 0;
  await respond({
    gameId: game.id,
    getMessage: async channel => ({
      content: `<@${userId}> resigned game with ID: ${game.id}. <@${game.white_user_id}> <@${game.black_user_id}>${
        hasMoves ? `\n\`\`\`${await getChessPgnWithHeaders(game, channel.guild)}\`\`\`` : ''
      }`,
      embeds: hasMoves ? [getChessBoardEmbed(game)] : undefined,
    }),
  }).catch(throwGameNotFoundError);
  await game.destroy();
  emit({
    type: SocketEventTypes.CHESS_GAME_RESIGNED,
    data: { id: game.id, resigner: userId },
  }, getRooms(game));
}

async function handleResign(interaction: AnyInteraction) {
  await handleGameSelection({
    interaction,
    gameStarted: null,
    noGamesMessage: 'You do not have any games to resign.',
    cb: async game => {
      try {
        await resignGame({
          game,
          userId: interaction.user.id,
        });
        await interaction.deleteReply();
      } catch (err) {
        // @ts-expect-error We know that this function throws a literal
        await interaction.editReply(err.message);
      }
    },
  });
}

async function handleShow(interaction: AnyInteraction) {
  await handleGameSelection({
    interaction,
    gameStarted: true,
    noGamesMessage: 'You do not have any games to show.',
    cb: async game => {
      const { currentTurnUser } = getTurnInfo(interaction.user.id, game);
      try {
        await respond({
          gameId: game.id,
          getMessage: () => ({
            content: `Make a move <@${currentTurnUser}>`,
            embeds: [getChessBoardEmbed(game)],
          }),
        });
        await interaction.deleteReply();
      } catch (err) {
        // @ts-ignore We don't care
        handleResponseError(err, interaction);
      }
    },
  });
}

export async function undoMove({
  game,
  userId,
}: {
  game: ChessGames,
  userId: string,
}): Promise<void> {
  // TODO: Have this propose a takeback where the other person has to accept
  const { madeLastMove } = getTurnInfo(userId, game);
  if (!madeLastMove) {
    throw {
      message: 'You cannot take back a move unless you made the last move.',
    };
  }

  const chess = new Chess();
  chess.loadPgn(game.pgn, { sloppy: true });
  const takeback = chess.undo();

  if (takeback == null) {
    throw {
      message: 'You cannot take back this move.',
    };
  }

  await game.update({ pgn: chess.pgn() });
  const { currentTurnUser } = getTurnInfo(userId, game);
  await respond({
    gameId: game.id,
    getMessage: () => ({
      content: `<@${userId}> takes back their last move. Make a move <@${currentTurnUser}>.`,
      embeds: [getChessBoardEmbed(game)],
    }),
  }).catch(throwGameNotFoundError);
  emit({
    type: SocketEventTypes.CHESS_GAME_UPDATED,
    data: await getGameResponse(game),
  }, getRooms(game));
}

async function handleUndo(interaction: AnyInteraction) {
  await handleGameSelection({
    interaction,
    gameStarted: true,
    noGamesMessage: 'You are not playing any games.',
    cb: async game => {
      try {
        await undoMove({
          game,
          userId: interaction.user.id,
        });
        await interaction.deleteReply();
      } catch (err) {
        await interaction.editReply({
          // @ts-expect-error We know the structure of this exception
          content: err.message,
        });
      }
    },
  });
}

async function handleHelp(interaction: AnyInteraction) {
  const acceptEmbed = new EmbedBuilder({
    title: 'Accept game',
    description: [
      'Click the Accept button within 15 mins of being challenged.',
      'Or, type `/chess accept` if 15 mins have passed.',
    ].join('\n'),
  });
  acceptEmbed.setColor(Colors.SUCCESS);
  const playEmbed = new EmbedBuilder({
    title: 'Make a move',
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
  playEmbed.setColor(Colors.SUCCESS);
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
    case 'resign': {
      await handleResign(interaction);
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
