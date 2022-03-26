import Sequelize, {
  Model,
  InferAttributes,
  InferCreationAttributes,
} from 'sequelize';
import type { ModelDefinition } from 'src/types';

export class StreamerRollbackRoles extends Model<
  InferAttributes<StreamerRollbackRoles>, InferCreationAttributes<StreamerRollbackRoles>
> {
  declare guild_id: string;
  declare user_id: string;
  declare role_id: string;
  declare add: boolean;
}

const StreamerRollbackRolesDefinition: ModelDefinition = sequelize => {
  const tableName = 'streamer_rollback_roles';
  StreamerRollbackRoles.init({
    guild_id: {
      type: Sequelize.STRING,
      primaryKey: true,
      allowNull: false,
    },
    user_id: {
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

export default StreamerRollbackRolesDefinition;
