require('dotenv').config();
const db = require('./src/utils/db');

async function test() {
    try {
        console.log('Testing DB query for login...');
        const result = await db.query('SELECT * FROM employees WHERE email = $1', ['employer@example.com']);
        console.log('Query successful. Rows:', result.rows.length);
    } catch (err) {
        console.error('DB Query Error:', err.message);
    } finally {
        process.exit(0);
    }
}

test();
