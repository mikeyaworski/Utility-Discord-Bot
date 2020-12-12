import type { ModelDefinition } from 'src/types';
import Sequelize from 'sequelize';

const ReactionMessagesUnique: ModelDefinition = sequelize => {
  const tableName = 'reaction_messages_unique';
  return [
    tableName,
    sequelize.define(tableName, {
      guild_id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },
      message_id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },
      unique: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
      },
    }, {
      freezeTableName: true,
    }),
  ];
};

export default ReactionMessagesUnique;
