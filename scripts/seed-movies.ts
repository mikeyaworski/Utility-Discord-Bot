import dotenv from 'dotenv';
import { Sequelize } from 'sequelize';

dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL!, {
  dialect: 'postgres',
  protocol: 'postgres',
  logging: false,
});

const numMovies = 1000;
const guildId = '722978838581215253';

async function seed() {
  for (let i = 1; i <= numMovies; i++) {
    await sequelize.query(`
      INSERT INTO movies
      (id,guild_id,title,imdb_id,is_favorite, was_watched,"createdAt","updatedAt")
      VALUES
      (uuid_generate_v4(),'${guildId}','${i}', '${i}',false,false,NOW(),NOW())
      ;
    `).catch(console.error);
  }
  process.exit();
}

if (process.env.ENVIRONMENT === 'development') seed();
else console.log('Do not run this on production');
