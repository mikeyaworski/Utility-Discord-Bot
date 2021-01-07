import type { ModelDefinition } from 'src/types';
import Sequelize from 'sequelize';

const BaseRoles: ModelDefinition = sequelize => {
  const tableName = 'base_roles';
  return [
    tableName,
    sequelize.define(tableName, {
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
    }),
  ];
};

export default BaseRoles;
