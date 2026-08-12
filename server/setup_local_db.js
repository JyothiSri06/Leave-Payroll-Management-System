require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

async function setup() {
    console.log('--- Setting up Local PostgreSQL Database ---');
    const systemPool = new Pool({
        host: '127.0.0.1',
        port: 5432,
        user: 'postgres',
        database: 'postgres'
    });

    try {
        await systemPool.query("ALTER USER postgres WITH PASSWORD 'postgres';");
        console.log('1. Postgres password set to postgres.');

        const dbCheck = await systemPool.query("SELECT 1 FROM pg_database WHERE datname = 'payroll_erp'");
        if (dbCheck.rows.length === 0) {
            await systemPool.query('CREATE DATABASE payroll_erp;');
            console.log('2. Created database payroll_erp.');
        } else {
            console.log('2. Database payroll_erp already exists.');
        }
    } catch (err) {
        console.error('Error with system pool:', err.message);
    } finally {
        await systemPool.end();
    }

    // Now connect to payroll_erp
    const dbPool = new Pool({
        host: '127.0.0.1',
        port: 5432,
        user: 'postgres',
        password: 'postgres',
        database: 'payroll_erp'
    });

    try {
        const schemaPath = path.join(__dirname, 'database', 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        console.log('3. Applying schema.sql to payroll_erp database...');
        await dbPool.query(schemaSql);
        console.log('Schema applied successfully.');

        // Seed demo accounts
        console.log('4. Seeding demo accounts...');
        const hashedPassword = await bcrypt.hash('password123', 10);

        const taxSlab = await dbPool.query('SELECT id FROM tax_configuration ORDER BY min_salary ASC LIMIT 1');
        const defaultTaxSlabId = taxSlab.rows.length > 0 ? taxSlab.rows[0].id : null;

        await dbPool.query(`
            INSERT INTO employees (first_name, last_name, email, password, role, salary, tax_slab_id, basic_salary, hra, special_allowance)
            VALUES ('John', 'Admin', 'john@example.com', $1, 'ADMIN', 120000, $2, 60000, 30000, 30000)
            ON CONFLICT (email) DO UPDATE SET password = $1, role = 'ADMIN';
        `, [hashedPassword, defaultTaxSlabId]);

        await dbPool.query(`
            INSERT INTO employees (first_name, last_name, email, password, role, salary, tax_slab_id, basic_salary, hra, special_allowance)
            VALUES ('Jane', 'Doe', 'employee@example.com', $1, 'EMPLOYEE', 80000, $2, 40000, 20000, 20000)
            ON CONFLICT (email) DO UPDATE SET password = $1, role = 'EMPLOYEE';
        `, [hashedPassword, defaultTaxSlabId]);

        console.log('Demo accounts created/updated successfully:');
        console.log('  Admin: john@example.com / password123');
        console.log('  Employee: employee@example.com / password123');

    } catch (err) {
        console.error('Error applying schema/seed:', err);
    } finally {
        await dbPool.end();
    }
}

setup();
