import Sequelize, {
  CreationOptional,
  Model,
  InferAttributes,
  InferCreationAttributes,
  Op,
} from 'sequelize';
import type { ModelDefinition } from 'src/types';

export enum FavoriteVariant {
  LINK = 'LINK',
}

export class PlayerFavorites extends Model<
  InferAttributes<PlayerFavorites>, InferCreationAttributes<PlayerFavorites>
> {
  declare id: CreationOptional<number>;
  declare guild_id: string;
  declare user_id: string;
  declare custom_id: string | null;
  declare label: string | null;
  declare variant: FavoriteVariant;
  declare value: string;
}

const PlayerFavoritesDefinition: ModelDefinition = sequelize => {
  const tableName = 'player_favorites';
  PlayerFavorites.init({
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    guild_id: {
      type: Sequelize.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    user_id: {
      type: Sequelize.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    custom_id: {
      type: Sequelize.STRING,
      allowNull: true,
      validate: {
        notEmpty: true,
      },
    },
    label: {
      type: Sequelize.STRING,
      allowNull: true,
      validate: {
        notEmpty: true,
      },
    },
    variant: {
      // Sequelize has broken enums
      // https://github.com/sequelize/sequelize/issues/7649
      // type: Sequelize.ENUM,
      // values: Object.values(FavoriteVariant),
      type: Sequelize.STRING,
      allowNull: false,
      validate: {
        enumValidation(value: string) {
          // @ts-expect-error This is useless TS
          if (!Object.values(FavoriteVariant).includes(value)) {
            throw new Error(`Variant is invalid. Must be one of: ${Object.values(FavoriteVariant).toString()}`);
          }
        },
      },
    },
    value: {
      type: Sequelize.STRING,
      allowNull: false,
    },
  }, {
    sequelize,
    tableName,
    freezeTableName: true,
    indexes: [
      {
        unique: true,
        fields: ['guild_id', 'custom_id'],
        where: {
          custom_id: {
            [Op.ne]: null,
          },
        },
      },
    ],
  });
};

export default PlayerFavoritesDefinition;
