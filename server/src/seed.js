require('dotenv').config();
const db = require('./utils/db');
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;

async function seed() {
    try {
        console.log('--- Starting Database Seed ---');

        // 1. Ensure Tax Slabs exist
        console.log('Seeding Tax Slabs...');
        await db.query(`
            INSERT INTO tax_configuration (min_salary, max_salary, tax_percentage, region) 
            SELECT 0, 500000, 0, 'General' WHERE NOT EXISTS (SELECT 1 FROM tax_configuration WHERE min_salary = 0);
            
            INSERT INTO tax_configuration (min_salary, max_salary, tax_percentage, region) 
            SELECT 500001, 1000000, 10, 'General' WHERE NOT EXISTS (SELECT 1 FROM tax_configuration WHERE min_salary = 500001);
            
            INSERT INTO tax_configuration (min_salary, max_salary, tax_percentage, region) 
            SELECT 1000001, 99999999, 20, 'General' WHERE NOT EXISTS (SELECT 1 FROM tax_configuration WHERE min_salary = 1000001);
        `);

        const taxSlab = await db.query('SELECT id FROM tax_configuration ORDER BY min_salary ASC LIMIT 1');
        const defaultTaxSlabId = taxSlab.rows[0].id;

        // Hash the demo password
        const hashedPassword = await bcrypt.hash('password123', SALT_ROUNDS);

        // 2. Create Demo Admin
        console.log('Seeding Admin: john@example.com / password123');
        await db.query(`
            INSERT INTO employees (first_name, last_name, email, password, role, salary, tax_slab_id, basic_salary, hra, special_allowance)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (email) DO NOTHING
        `, ['John', 'Admin', 'john@example.com', hashedPassword, 'ADMIN', 120000, defaultTaxSlabId, 60000, 30000, 30000]);

        // 3. Create Demo Employee
        console.log('Seeding Employee: employee@example.com / password123');
        await db.query(`
            INSERT INTO employees (first_name, last_name, email, password, role, salary, tax_slab_id, basic_salary, hra, special_allowance)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (email) DO NOTHING
        `, ['Jane', 'Doe', 'employee@example.com', hashedPassword, 'EMPLOYEE', 80000, defaultTaxSlabId, 40000, 20000, 20000]);

        console.log('--- Seed Complete! ---');
        console.log('You can now use the One-Click Login buttons on the frontend.');
    } catch (err) {
        console.error('Seed Error:', err);
    } finally {
        process.exit();
    }
}

seed();
