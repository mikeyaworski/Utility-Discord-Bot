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
  declare interval: number | null;
  declare message: string | null;
}

export type Reminder = {
  id: string,
  guild_id: string | null,
  channel_id: string,
  owner_id: string,
  time: number,
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
    sequelize,
    tableName,
    freezeTableName: true,
  });
};

export default RemindersDefinition;
