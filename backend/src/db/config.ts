import { Pool } from 'pg';

export const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'pp_project_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '123',
};

export const pool = new Pool(dbConfig);

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});



