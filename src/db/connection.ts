import 'dotenv/config';
import mysql from 'mysql2/promise';

const baseConfig = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  ssl: {
    rejectUnauthorized: false,
  },
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
  queueLimit: 0,
} as const;

export const rootPool = mysql.createPool(baseConfig);

export const pool = mysql.createPool({
  ...baseConfig,
  database: process.env.DB_NAME ?? 'sdr_crm_db',
});

export default pool;
