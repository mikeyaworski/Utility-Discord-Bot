import Sequelize, {
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from 'sequelize';
import type { ModelDefinition } from 'src/types';

export class PlayerSettings extends Model<
  InferAttributes<PlayerSettings>, InferCreationAttributes<PlayerSettings>
> {
  declare guild_id: string;
  declare updates_channel_id: CreationOptional<string | null>;
  declare normalize: CreationOptional<boolean>;
}

const PlayerSettingsDefinition: ModelDefinition = sequelize => {
  const tableName = 'player_settings';
  PlayerSettings.init({
    guild_id: {
      type: Sequelize.STRING,
      primaryKey: true,
      allowNull: false,
    },
    updates_channel_id: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    normalize: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  }, {
    sequelize,
    tableName,
    freezeTableName: true,
  });
};

export default PlayerSettingsDefinition;
