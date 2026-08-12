require('dotenv').config();
const db = require('./src/utils/db');

async function test() {
    try {
        console.log('Testing DB query for login...');
        const bcrypt = require('bcrypt');
        const result = await db.query('SELECT * FROM employees WHERE email = $1', ['john@example.com']);
        console.log('Query successful. Rows:', result.rows.length);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const isMatch = await bcrypt.compare('password123', user.password);
            console.log('User found:', user.email, 'Role:', user.role, 'Password match:', isMatch);
        }
    } catch (err) {
        console.error('DB Query Error:', err.message);
    } finally {
        process.exit(0);
    }
}

test();
