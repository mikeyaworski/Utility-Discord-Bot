import type { ModelMapping } from 'src/types';

import dotenv from 'dotenv';
import { Sequelize, Options } from 'sequelize';

// models
import StreamerRules from 'src/models/streamer-rules';
import StreamerRollbackRoles from 'src/models/streamer-rollback-roles';

dotenv.config();

const modelGetters = [
  StreamerRules,
  StreamerRollbackRoles,
];

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

const sequelize = new Sequelize(process.env.DATABASE_URL, sequelizeOpts);

let modelsMapping;
export function getModels(): ModelMapping {
  if (modelsMapping) return modelsMapping;
  modelsMapping = modelGetters.reduce((acc, modelGetter) => {
    const [modelKey, model] = modelGetter(sequelize);
    return Object.assign(acc, {
      [modelKey]: model,
    });
  }, {});
  return modelsMapping;
}

export function syncModels(): void {
  const models = getModels();
  Object.keys(models).forEach(modelKey => {
    models[modelKey].sync();
  });
}
