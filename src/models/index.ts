import type { ModelMapping } from 'src/types';

import dotenv from 'dotenv';
import { Sequelize } from 'sequelize';

// models
import StreamerRules from 'src/models/streamer-rules';
import StreamerRollbackRoles from 'src/models/streamer-rollback-roles';

dotenv.config();

const modelGetters = [
  StreamerRules,
  StreamerRollbackRoles,
];

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  protocol: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false, // https://stackoverflow.com/a/61350416/2554605
    },
  },
  logging: false,
});

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
