import Sequelize, {
  Model,
  InferAttributes,
  InferCreationAttributes,
} from 'sequelize';
import type { ModelDefinition } from 'src/types';

export class PlayerUpdates extends Model<
  InferAttributes<PlayerUpdates>, InferCreationAttributes<PlayerUpdates>
> {
  declare guild_id: string;
  declare channel_id: string;
}

const PlayerUpdatesDefinition: ModelDefinition = sequelize => {
  const tableName = 'player_updates';
  PlayerUpdates.init({
    guild_id: {
      type: Sequelize.STRING,
      primaryKey: true,
      allowNull: false,
    },
    channel_id: {
      type: Sequelize.STRING,
      allowNull: false,
    },
  }, {
    sequelize,
    tableName,
    freezeTableName: true,
  });
};

export default PlayerUpdatesDefinition;
