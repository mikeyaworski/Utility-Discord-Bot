import type { ModelDefinition } from 'src/types';
import Sequelize from 'sequelize';

const ReactionRoles: ModelDefinition = sequelize => {
  const tableName = 'reaction_roles';
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
    }),
  ];
};

export default ReactionRoles;
