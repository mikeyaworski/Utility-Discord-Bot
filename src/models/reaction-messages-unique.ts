import Sequelize, {
  Model,
  InferAttributes,
  InferCreationAttributes,
} from 'sequelize';
import type { ModelDefinition } from 'src/types';

export class ReactionMessagesUnique extends Model<
  InferAttributes<ReactionMessagesUnique>, InferCreationAttributes<ReactionMessagesUnique>
> {
  declare guild_id: string;
  declare message_id: string;
  declare unique: boolean;
}

const ReactionMessagesUniqueDefinition: ModelDefinition = sequelize => {
  const tableName = 'reaction_messages_unique';
  ReactionMessagesUnique.init({
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
    sequelize,
    tableName,
    freezeTableName: true,
  });
};

export default ReactionMessagesUniqueDefinition;
