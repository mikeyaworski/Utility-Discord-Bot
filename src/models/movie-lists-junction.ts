import Sequelize, {
  Model,
  InferAttributes,
  InferCreationAttributes,
  ForeignKey,
} from 'sequelize';
import type { ModelDefinition } from 'src/types';
import { Movies } from './movies';
import { MovieLists } from './movie-lists';

export class MovieListsJunction extends Model<
  InferAttributes<MovieListsJunction>, InferCreationAttributes<MovieListsJunction>
> {
  declare movie_id: ForeignKey<Movies['id']>;
  declare list_id: ForeignKey<MovieLists['id']>;
  declare order: number;
}

const MovieListsJunctionDefinition: ModelDefinition = sequelize => {
  const tableName = 'movie_lists_junction';
  MovieListsJunction.init({
    movie_id: {
      type: Sequelize.UUID,
      primaryKey: true,
      references: {
        model: Movies,
        key: 'id',
      },
    },
    list_id: {
      type: Sequelize.UUID,
      primaryKey: true,
      references: {
        model: MovieLists,
        key: 'id',
      },
    },
    // All movies in the list will need to be updated when the order changes.
    // The tradeoff is performance for simplicity.
    // This is fine since the expected list size is small.
    order: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
  }, {
    sequelize,
    tableName,
    freezeTableName: true,
  });
};

export function associate(): void {
  // We can make this a "super many-to-many association" by assocating Movies/MovieLists to MovieListsJunction directly as well
  // eslint-disable-next-line max-len
  // https://sequelize.org/docs/v6/advanced-association-concepts/advanced-many-to-many/#through-tables-versus-normal-tables-and-the-super-many-to-many-association
  MovieLists.belongsToMany(Movies, {
    through: MovieListsJunction,
    as: 'movies',
    foreignKey: 'list_id',
    otherKey: 'movie_id',
  });
  Movies.belongsToMany(MovieLists, {
    through: MovieListsJunction,
    as: 'lists',
    foreignKey: 'movie_id',
    otherKey: 'list_id',
  });
}

export default MovieListsJunctionDefinition;
