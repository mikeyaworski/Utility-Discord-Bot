import type { ModelDefinition } from 'src/types';

import Sequelize from 'sequelize';

export interface ChessGame {
  id: number,
  guild_id: string,
  channel_id: string,
  white_user_id: string,
  black_user_id: string,
  owner_user_id: string,
  challenged_user_id: string,
  pgn: string,
  started: boolean,
}

const ChessGames: ModelDefinition = sequelize => {
  const tableName = 'chess_games';
  return [
    tableName,
    sequelize.define(tableName, {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      guild_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      channel_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      white_user_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      black_user_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      owner_user_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      challenged_user_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      pgn: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      started: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
      },
    }, {
      freezeTableName: true,
    }),
  ];
};

export default ChessGames;
