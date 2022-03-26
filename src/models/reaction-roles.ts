import Sequelize, {
  Model,
  InferAttributes,
  InferCreationAttributes,
} from 'sequelize';
import type { ModelDefinition } from 'src/types';

export class ReactionRoles extends Model<
  InferAttributes<ReactionRoles>, InferCreationAttributes<ReactionRoles>
> {
  declare guild_id: string;
  declare role_id: string;
  declare emoji: string;
  declare message_id: string;
}

const ReactionRolesDefinition: ModelDefinition = sequelize => {
  const tableName = 'reaction_roles';
  ReactionRoles.init({
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
    emoji: {
      type: Sequelize.STRING,
      primaryKey: true,
      allowNull: false,
    },
    message_id: {
      type: Sequelize.STRING,
      primaryKey: true,
      allowNull: false,
    },
  }, {
    sequelize,
    tableName,
    freezeTableName: true,
  });
};

export default ReactionRolesDefinition;
