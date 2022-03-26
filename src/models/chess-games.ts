import Sequelize, {
  CreationOptional,
  Model,
  InferAttributes,
  InferCreationAttributes,
} from 'sequelize';
import type { ModelDefinition } from 'src/types';

export class ChessGames extends Model<
  InferAttributes<ChessGames>, InferCreationAttributes<ChessGames>
> {
  declare id: CreationOptional<number>;
  declare guild_id: string;
  declare channel_id: string;
  declare white_user_id: string | null;
  declare black_user_id: string | null;
  declare owner_user_id: string;
  declare challenged_user_id: string | null;
  declare pgn: string;
  declare started: boolean;
}

const ChessGamesDefinition: ModelDefinition = sequelize => {
  const tableName = 'chess_games';
  ChessGames.init({
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
    sequelize,
    tableName,
    freezeTableName: true,
  });
};

export default ChessGamesDefinition;
