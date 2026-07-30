/* ============================================================
   DAFFODIL INTERNATIONAL COLLEGE (DIC) ALUMNI PLATFORM
   PostgreSQL Database Connection Pool & Serverless Fallback Layer
   ============================================================ */

const { Pool } = require('pg');

let pool = null;

try {
  pool = new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: process.env.PGPORT || 5432,
    database: process.env.PGDATABASE || 'dic_alumni_db',
    user: process.env.PGUSER || process.env.USER || 'mohiuddin',
    password: process.env.PGPASSWORD || '',
    max: 10,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 1000, // Quick timeout to prevent Vercel serverless hanging
  });

  pool.on('error', (err) => {
    console.warn('PostgreSQL Pool Connection Warning:', err.message);
  });
} catch (e) {
  console.warn('PostgreSQL Pool Initialization Warning:', e.message);
}

module.exports = {
  query: async (text, params) => {
    if (!pool) throw new Error('Database pool unavailable');
    return await pool.query(text, params);
  },
  pool
};
