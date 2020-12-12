import type { ModelDefinition } from 'src/types';
import Sequelize from 'sequelize';

// This is for storing roles that a member needed to be added/removed once they are finished streaming.
const StreamerRollbackRoles: ModelDefinition = sequelize => {
  const tableName = 'streamer_rollback_roles';
  return [
    tableName,
    sequelize.define(tableName, {
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
    }),
  ];
};

export default StreamerRollbackRoles;
