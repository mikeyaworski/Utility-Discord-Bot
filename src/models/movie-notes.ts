import Sequelize, {
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
  BelongsToGetAssociationMixin,
  NonAttribute,
} from 'sequelize';
import type { ModelDefinition } from 'src/types';
import { Movies } from './movies';

export class MovieNotes extends Model<
  InferAttributes<MovieNotes>, InferCreationAttributes<MovieNotes>
> {
  // https://sequelize.org/docs/v6/other-topics/typescript/
  declare getMovie: BelongsToGetAssociationMixin<Movies>;
  declare movie?: NonAttribute<Movies>;

  declare id: CreationOptional<string>;
  declare movie_id: ForeignKey<Movies['id']>;
  declare author_id: string;
  declare note: string;
}

const MovieNotesDefinition: ModelDefinition = sequelize => {
  const tableName = 'movie_notes';
  MovieNotes.init({
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true,
    },
    author_id: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    note: {
      type: Sequelize.TEXT,
      allowNull: false,
    },
  }, {
    sequelize,
    tableName,
    freezeTableName: true,
    indexes: [
      {
        unique: true,
        fields: ['author_id', 'movie_id'],
      },
    ],
  });
};

export function associate(): void {
  MovieNotes.belongsTo(Movies, {
    onDelete: 'CASCADE',
    as: 'movie',
    foreignKey: {
      name: 'movie_id',
      allowNull: false,
    },
  });
}

export default MovieNotesDefinition;
