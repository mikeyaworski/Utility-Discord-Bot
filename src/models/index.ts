import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Sequelize, Options } from 'sequelize';

dotenv.config();

const sequelizeOpts: Options = {
  dialect: 'postgres',
  protocol: 'postgres',
  logging: false,
};

if (process.env.ENVIRONMENT === 'production') {
  Object.assign(sequelizeOpts, {
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false, // https://stackoverflow.com/a/61350416/2554605
      },
    },
  });
}

const sequelize = new Sequelize(process.env.DATABASE_URL!, sequelizeOpts);

fs
  .readdirSync(__dirname)
  .filter(file => file.endsWith('.ts') && file !== 'index.ts')
  .map(file => {
    // eslint-disable-next-line global-require, import/no-dynamic-require, @typescript-eslint/no-var-requires
    return require(path.join(__dirname, file)).default(sequelize);
  });

export function syncModels(): void {
  sequelize.sync();
}
