import type { ModelDefinition } from 'src/types';

import Sequelize, {
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  BelongsToManyGetAssociationsMixin,
  BelongsToManyAddAssociationMixin,
  BelongsToManyRemoveAssociationMixin,
  BelongsToManyRemoveAssociationsMixin,
  BelongsToManySetAssociationsMixin,
  BelongsToManyHasAssociationMixin,
  NonAttribute,
} from 'sequelize';
import { notUuidValidator } from 'src/utils';
import { Movies } from './movies';
import { MovieListsJunction } from './movie-lists-junction';

export class MovieLists extends Model<
  InferAttributes<MovieLists>, InferCreationAttributes<MovieLists>
> {
  // https://sequelize.org/docs/v6/other-topics/typescript/
  declare getMovies: BelongsToManyGetAssociationsMixin<Movies>;
  declare addMovie: BelongsToManyAddAssociationMixin<Movies, Movies['id']>;
  declare removeMovie: BelongsToManyRemoveAssociationMixin<Movies, Movies['id']>;
  declare removeMovies: BelongsToManyRemoveAssociationsMixin<Movies, Movies['id']>;
  declare setMovies: BelongsToManySetAssociationsMixin<Movies, Movies['id']>;
  declare hasMovie: BelongsToManyHasAssociationMixin<Movies, Movies['id']>;
  declare movies?: NonAttribute<Movies[]>;
  declare junction?: NonAttribute<MovieListsJunction>;

  declare id: CreationOptional<string>;
  declare guild_id: string;
  declare name: string;
  declare custom_id: string | null;
}

export type MovieList = MovieLists;

const MovieListsDefinition: ModelDefinition = sequelize => {
  const tableName = 'movie_lists';
  MovieLists.init({
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true,
    },
    guild_id: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    name: {
      type: Sequelize.TEXT,
      allowNull: false,
    },
    custom_id: {
      type: Sequelize.STRING,
      allowNull: true,
      validate: {
        notEmpty: true,
        notUuidValidator,
      },
    },
  }, {
    sequelize,
    tableName,
    freezeTableName: true,
    indexes: [
      {
        unique: true,
        fields: ['guild_id', 'name'],
      },
      {
        unique: true,
        fields: ['guild_id', 'custom_id'],
      },
    ],
  });
};

export default MovieListsDefinition;
