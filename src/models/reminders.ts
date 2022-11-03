import Sequelize, {
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from 'sequelize';
import type { ModelDefinition } from 'src/types';
import { MIN_REMINDER_INTERVAL } from 'src/constants';

export class Reminders extends Model<
  InferAttributes<Reminders>, InferCreationAttributes<Reminders>
> {
  declare id: CreationOptional<string>;
  declare guild_id: string | null;
  declare channel_id: string;
  declare owner_id: string;
  declare time: number;
  declare end_time: number | null;
  declare max_occurrences: number | null;
  declare interval: number | null;
  declare message: string | null;
}

export type Reminder = {
  id: string,
  guild_id: string | null,
  channel_id: string,
  owner_id: string,
  time: number,
  end_time: number | null,
  max_occurrences: number | null,
  interval: number | null,
  message: string | null,
};

const RemindersDefinition: ModelDefinition = sequelize => {
  const tableName = 'reminders';
  Reminders.init({
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true,
    },
    guild_id: {
      type: Sequelize.STRING,
      // Null if DM conversation
      allowNull: true,
    },
    channel_id: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    owner_id: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    time: {
      // Epoch time in seconds
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    end_time: {
      // Epoch time in seconds
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    max_occurrences: {
      type: Sequelize.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
      },
    },
    interval: {
      // In seconds
      type: Sequelize.INTEGER,
      validate: {
        min: MIN_REMINDER_INTERVAL,
      },
    },
    message: {
      type: Sequelize.TEXT,
      validate: {
        len: {
          msg: 'Reminder message must be 1024 characters or less',
          args: [0, 1024],
        },
      },
    },
  }, {
    sequelize,
    tableName,
    freezeTableName: true,
    validate: {
      isEndTimeLaterThanInitialTime() {
        if (this.end_time != null && (this.end_time as number) < (this.time as number)) {
          throw new Error('End time must be later than initial time');
        }
      },
    },
  });
};

export default RemindersDefinition;
