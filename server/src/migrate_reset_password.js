const db = require('./utils/db');

async function migrate() {
    try {
        console.log('Adding reset password columns to employees table...');

        await db.query(`
            ALTER TABLE employees 
            ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(255),
            ADD COLUMN IF NOT EXISTS reset_password_expires BIGINT
        `);

        console.log('Migration successful');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        process.exit();
    }
}

migrate();
