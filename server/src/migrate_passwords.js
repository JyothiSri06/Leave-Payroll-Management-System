require('dotenv').config();
const db = require('./utils/db');
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;

async function migrate() {
    try {
        console.log('--- Starting Password Migration ---');
        
        const users = await db.query('SELECT id, password FROM employees');
        
        let migratedCount = 0;
        
        for (let user of users.rows) {
            // Check if it's already a bcrypt hash (starts with $2b$, $2a$, etc.)
            if (!user.password.startsWith('$2')) {
                const hashedPassword = await bcrypt.hash(user.password, SALT_ROUNDS);
                await db.query('UPDATE employees SET password = $1 WHERE id = $2', [hashedPassword, user.id]);
                migratedCount++;
                console.log(`Migrated password for user ID: ${user.id}`);
            }
        }
        
        console.log(`--- Migration Complete! Migrated ${migratedCount} users. ---`);
    } catch (err) {
        console.error('Migration Error:', err);
    } finally {
        process.exit();
    }
}

migrate();
