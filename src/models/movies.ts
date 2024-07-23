import type { ModelDefinition } from 'src/types';

import Sequelize, {
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  BelongsToManyGetAssociationsMixin,
  HasManyGetAssociationsMixin,
  HasManyCreateAssociationMixin,
  HasManyRemoveAssociationsMixin,
  HasManyCountAssociationsMixin,
  NonAttribute,
  BelongsToManySetAssociationsMixin,
  BelongsToManyRemoveAssociationsMixin,
  BelongsToManyRemoveAssociationMixin,
  BelongsToManyHasAssociationMixin,
} from 'sequelize';
import { MovieNotes } from './movie-notes';
import { MovieLists } from './movie-lists';

type MovieNotePrimaryKeyType = MovieNotes['id'];

export class Movies extends Model<
  InferAttributes<Movies>, InferCreationAttributes<Movies>
> {
  // https://sequelize.org/docs/v6/other-topics/typescript/
  declare getLists: BelongsToManyGetAssociationsMixin<MovieLists>;
  declare hasList: BelongsToManyHasAssociationMixin<MovieLists, MovieLists['id']>;
  declare countLists: HasManyCountAssociationsMixin;
  declare setLists: BelongsToManySetAssociationsMixin<MovieLists, MovieLists['id']>;
  declare removeList: BelongsToManyRemoveAssociationMixin<MovieLists, MovieLists['id']>;
  declare removeLists: BelongsToManyRemoveAssociationsMixin<MovieLists, MovieLists['id']>;
  declare getNotes: HasManyGetAssociationsMixin<MovieNotes>;
  declare createNote: HasManyCreateAssociationMixin<MovieNotes, 'movie_id'>;
  declare removeNote: HasManyRemoveAssociationsMixin<MovieNotes, MovieNotePrimaryKeyType>;
  declare notes?: NonAttribute<MovieNotes[]>;
  declare lists?: NonAttribute<MovieLists[]>;

  declare id: CreationOptional<string>;
  declare guild_id: string;
  declare title: string;
  declare is_favorite: boolean;
  declare was_watched: boolean;
  declare length: number | null; // in minutes
  declare actors: string | null; // comma-separated
  declare director: string | null;
  declare genre: string | null; // comma-separated
  declare year: number | null;
  declare imdb_id: string | null;
  declare imdb_rating: number | null; // 0-100
  declare metacritic_rating: number | null; // 0-100
  declare rotten_tomatoes_rating: number | null; // 0-100
  declare rating: string | null;
  declare language: string | null;
}

export type Movie = Movies;

const COMMA_SEPARATED_VALIDATION_REGEX = /^([^,]+,\s*)*[^,]+$/;

const MoviesDefinition: ModelDefinition = sequelize => {
  const tableName = 'movies';
  Movies.init({
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true,
    },
    guild_id: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    title: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    is_favorite: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
    },
    was_watched: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
    },
    length: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    actors: {
      type: Sequelize.TEXT,
      allowNull: true,
      validate: {
        is: COMMA_SEPARATED_VALIDATION_REGEX,
      },
    },
    director: {
      type: Sequelize.STRING,
      allowNull: true,
      validate: {
        is: COMMA_SEPARATED_VALIDATION_REGEX,
      },
    },
    genre: {
      type: Sequelize.TEXT,
      allowNull: true,
      validate: {
        is: COMMA_SEPARATED_VALIDATION_REGEX,
      },
    },
    year: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    imdb_id: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    imdb_rating: {
      type: Sequelize.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
        max: 100,
      },
    },
    metacritic_rating: {
      type: Sequelize.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
        max: 100,
      },
    },
    rotten_tomatoes_rating: {
      type: Sequelize.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
        max: 100,
      },
    },
    rating: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    language: {
      type: Sequelize.STRING,
      allowNull: true,
    },
  }, {
    sequelize,
    tableName,
    freezeTableName: true,
    indexes: [
      {
        unique: true,
        fields: ['guild_id', 'imdb_id'],
      },
      {
        unique: true,
        fields: ['guild_id', 'title'],
      },
    ],
  });
};

export function associate(): void {
  Movies.hasMany(MovieNotes, {
    as: 'notes',
    foreignKey: {
      name: 'movie_id',
    },
  });
}

export default MoviesDefinition;
