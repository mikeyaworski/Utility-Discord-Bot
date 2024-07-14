import Sequelize, {
  Model,
  InferAttributes,
  InferCreationAttributes,
} from 'sequelize';
import type { ModelDefinition } from 'src/types';

export class MovieNightConfig extends Model<
  InferAttributes<MovieNightConfig>, InferCreationAttributes<MovieNightConfig>
> {
  declare guild_id: string;
  declare channel_id: string;
  declare role_id: string;
}

const MovieNightConfigDefinition: ModelDefinition = sequelize => {
  const tableName = 'movie_night_config';
  MovieNightConfig.init({
    guild_id: {
      type: Sequelize.STRING,
      primaryKey: true,
      allowNull: false,
    },
    channel_id: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    role_id: {
      type: Sequelize.STRING,
      allowNull: false,
    },
  }, {
    sequelize,
    tableName,
    freezeTableName: true,
  });
};

export default MovieNightConfigDefinition;
