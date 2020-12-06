import type { ModelGetter } from 'src/types';
import Sequelize from 'sequelize';

// We use snake case for database information
// since Postgres has issues with case sensitivity.
const StreamerRules: ModelGetter = sequelize => {
  const tableName = 'streamer_rules';
  return [
    tableName,
    sequelize.define(tableName, {
      guild_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      role_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      add: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
      },
    }, {
      indexes: [{
        name: 'streamer_rules_unique_guild_and_role',
        fields: ['guild_id', 'role_id'],
        unique: true,
      }],
    }),
  ];
};

export default StreamerRules;
