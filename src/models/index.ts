import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Sequelize, Options } from 'sequelize';
import { IntentionalAny } from 'src/types';
import { log } from 'src/logging';

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

export async function syncModels(): Promise<IntentionalAny> {
  // TODO: Add proper migrations instead of allowing the tables to be altered
  await sequelize.sync({ alter: true });
  log('Enabling Row Level Security (RLS) on every public table...');
  // Enable Row Level Security on all public tables since Supabase exposes these tables to anonymous users via a REST API
  // https://supabase.com/docs/guides/database/postgres/row-level-security
  // https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0013_rls_disabled_in_public
  await Promise.all(Object.values(sequelize.models).map(async model => {
    await sequelize.query(`ALTER TABLE ${model.getTableName()} ENABLE ROW LEVEL SECURITY;`);
  }));
  log('Finished enabling RLS on every public table.');
}
