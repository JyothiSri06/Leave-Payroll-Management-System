const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production' || process.env.DATABASE_URL.includes('render') || process.env.DATABASE_URL.includes('supabase');

const connectionString = process.env.DATABASE_URL || '';

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1') || connectionString.includes('sslmode=disable');

const pool = new Pool({
    connectionString,
    ssl: isLocal || connectionString.includes('pooler.supabase.com:5432') ? false : {
        rejectUnauthorized: false
    }
});


pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    getClient: () => pool.connect(),
};
