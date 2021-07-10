import type { ModelDefinition } from 'src/types';

import Sequelize from 'sequelize';
import { MIN_REMINDER_INTERVAL } from 'src/constants';

export interface Reminder {
  id: string;
  guild_id: string;
  channel_id: string;
  time: number;
  interval: number | null;
  message: string | null;
}

const Reminders: ModelDefinition = sequelize => {
  const tableName = 'reminders';
  return [
    tableName,
    sequelize.define(tableName, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      guild_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      channel_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      time: {
        // Epoch time in seconds
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      interval: {
        // In seconds
        type: Sequelize.INTEGER,
        validate: {
          min: MIN_REMINDER_INTERVAL,
        },
      },
      message: {
        type: Sequelize.STRING,
      },
    }, {
      freezeTableName: true,
    }),
  ];
};

export default Reminders;
