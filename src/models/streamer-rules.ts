import type { ModelDefinition } from 'src/types';
import Sequelize from 'sequelize';

// We use snake case for database information
// since Postgres has issues with case sensitivity.
const StreamerRules: ModelDefinition = sequelize => {
  const tableName = 'streamer_rules';
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
      add: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
      },
    }),
  ];
};

export default StreamerRules;
