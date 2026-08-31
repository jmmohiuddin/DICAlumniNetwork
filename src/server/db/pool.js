/* PostgreSQL connection pool.
 *
 * Supports both a connection string (Neon, Supabase, Render — anything that
 * hands out a DATABASE_URL) and discrete PG* variables for a local server.
 * Behaviour is unchanged from the original db.js; the .env parsing that used
 * to live here now sits in config/env.js, which this module pulls in first so
 * DATABASE_URL is populated before the pool is configured.
 */
require('../config/env');

const { Pool } = require('pg');
const fs = require('fs');
const { SCHEMA_SQL, SEED_SQL } = require('../config/paths');

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

const poolConfig = connectionString
  ? {
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 10000,
    }
  : {
      host: process.env.PGHOST || '127.0.0.1',
      port: parseInt(process.env.PGPORT || '5432'),
      database: process.env.PGDATABASE || 'dic_alumni_db',
      user: process.env.PGUSER || process.env.USER || 'mohiuddin',
      password: process.env.PGPASSWORD || '',
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 5000,
    };

let pool = null;
try {
  pool = new Pool(poolConfig);
  pool.on('error', (err) => {
    console.warn('PostgreSQL Pool Connection Warning:', err.message);
  });
} catch (e) {
  console.warn('PostgreSQL Pool Initialization Warning:', e.message);
}

/** Applies schema.sql then seed.sql. Used by the /api/seed-db endpoint. */
async function initDbSchemaAndSeed() {
  if (!pool) throw new Error('Database pool unavailable');
  try {
    if (fs.existsSync(SCHEMA_SQL)) {
      await pool.query(fs.readFileSync(SCHEMA_SQL, 'utf8'));
      console.log('⚡ Schema tables verified / initialized successfully.');
    }
    if (fs.existsSync(SEED_SQL)) {
      await pool.query(fs.readFileSync(SEED_SQL, 'utf8'));
      console.log('🌱 Seed dummy data uploaded successfully.');
    }
    return { success: true, message: 'Database schema & seed data uploaded successfully.' };
  } catch (err) {
    console.error('Error initializing database schema/seed:', err.message);
    throw err;
  }
}

module.exports = {
  query: async (text, params) => {
    if (!pool) throw new Error('Database pool unavailable');
    return await pool.query(text, params);
  },
  pool,
  initDbSchemaAndSeed,
  isCloud: !!connectionString || process.env.PGSSL === 'true',
};
