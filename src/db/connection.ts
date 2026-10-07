import 'dotenv/config';
import mysql from 'mysql2/promise';

const baseConfig = {
  host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
  port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
  user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
  ssl: {
    rejectUnauthorized: false,
  },
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
} as const;

export const rootPool = mysql.createPool(baseConfig);

export const pool = mysql.createPool({
  ...baseConfig,
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'crm',
});

export default pool;
