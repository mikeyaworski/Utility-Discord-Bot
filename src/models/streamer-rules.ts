import Sequelize, {
  Model,
  InferAttributes,
  InferCreationAttributes,
} from 'sequelize';
import type { ModelDefinition } from 'src/types';

export class StreamerRules extends Model<
  InferAttributes<StreamerRules>, InferCreationAttributes<StreamerRules>
> {
  declare guild_id: string;
  declare role_id: string;
  declare add: boolean;
}

const StreamerRulesDefinition: ModelDefinition = sequelize => {
  const tableName = 'streamer_rules';
  StreamerRules.init({
    guild_id: {
      type: Sequelize.STRING,
      primaryKey: true,
      allowNull: false,
    },
    role_id: {
      type: Sequelize.STRING,
      primaryKey: true,
      allowNull: false,
    },
    add: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
    },
  }, {
    sequelize,
    tableName,
    freezeTableName: true,
  });
};

export default StreamerRulesDefinition;
