import Sequelize, {
  Model,
  InferAttributes,
  InferCreationAttributes,
} from 'sequelize';
import type { ModelDefinition } from 'src/types';

export class BaseRoles extends Model<
  InferAttributes<BaseRoles>, InferCreationAttributes<BaseRoles>
> {
  declare guild_id: string;
  declare role_id: string;
  declare delay: number | null;
}

const BaseRolesDefinition: ModelDefinition = sequelize => {
  const tableName = 'base_roles';
  BaseRoles.init({
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
    delay: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
  }, {
    sequelize,
    tableName,
    freezeTableName: true,
  });
};

export default BaseRolesDefinition;
