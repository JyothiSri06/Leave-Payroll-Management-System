require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

async function setup() {
    console.log('--- Setting up Local PostgreSQL Multi-Tenant Database ---');
    const systemPool = new Pool({
        host: '127.0.0.1',
        port: 5432,
        user: 'postgres',
        database: 'postgres'
    });

    try {
        await systemPool.query("ALTER USER postgres WITH PASSWORD 'postgres';");
        console.log('1. Postgres password verified/set to postgres.');

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

    const dbPool = new Pool({
        host: '127.0.0.1',
        port: 5432,
        user: 'postgres',
        password: 'postgres',
        database: 'payroll_erp'
    });

    try {
        console.log('3. Re-building tables with multi-tenant schema...');
        await dbPool.query(`
            DROP TABLE IF EXISTS audit_logs, salary_revisions, payroll_runs, attendance, leave_ledger, leave_balances, employees, tenants, tax_configuration CASCADE;
        `);

        const schemaPath = path.join(__dirname, 'database', 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await dbPool.query(schemaSql);
        console.log('Multi-tenant schema applied successfully.');

        // Seed Tenants
        console.log('4. Seeding Tenants...');
        const tenantAcme = await dbPool.query(`
            INSERT INTO tenants (name, code)
            VALUES ('Acme Corp', 'acme_corp')
            ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
            RETURNING id;
        `);
        const acmeTenantId = tenantAcme.rows[0].id;

        const tenantGlobex = await dbPool.query(`
            INSERT INTO tenants (name, code)
            VALUES ('Globex Corp', 'globex_corp')
            ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
            RETURNING id;
        `);
        const globexTenantId = tenantGlobex.rows[0].id;

        console.log('5. Seeding demo accounts across tenants...');
        const hashedPassword = await bcrypt.hash('password123', 10);
        const taxSlab = await dbPool.query('SELECT id FROM tax_configuration ORDER BY min_salary ASC LIMIT 1');
        const defaultTaxSlabId = taxSlab.rows.length > 0 ? taxSlab.rows[0].id : null;

        // Acme Admin
        const acmeAdmin = await dbPool.query(`
            INSERT INTO employees (tenant_id, first_name, last_name, email, password, role, salary, tax_slab_id, basic_salary, hra, special_allowance)
            VALUES ($1, 'John', 'Admin', 'john@example.com', $2, 'ADMIN', 120000, $3, 60000, 30000, 30000)
            ON CONFLICT (tenant_id, email) DO UPDATE SET password = $2, role = 'ADMIN'
            RETURNING id;
        `, [acmeTenantId, hashedPassword, defaultTaxSlabId]);

        // Acme Employee
        const acmeEmp = await dbPool.query(`
            INSERT INTO employees (tenant_id, first_name, last_name, email, password, role, salary, tax_slab_id, basic_salary, hra, special_allowance)
            VALUES ($1, 'Jane', 'Doe', 'employee@example.com', $2, 'EMPLOYEE', 80000, $3, 40000, 20000, 20000)
            ON CONFLICT (tenant_id, email) DO UPDATE SET password = $2, role = 'EMPLOYEE'
            RETURNING id;
        `, [acmeTenantId, hashedPassword, defaultTaxSlabId]);

        // Globex Admin (Tenant B isolation testing)
        await dbPool.query(`
            INSERT INTO employees (tenant_id, first_name, last_name, email, password, role, salary, tax_slab_id, basic_salary, hra, special_allowance)
            VALUES ($1, 'Alice', 'GlobexAdmin', 'alice@globex.com', $2, 'ADMIN', 150000, $3, 75000, 37500, 37500)
            ON CONFLICT (tenant_id, email) DO UPDATE SET password = $2, role = 'ADMIN';
        `, [globexTenantId, hashedPassword, defaultTaxSlabId]);

        const currentYear = new Date().getFullYear();
        if (acmeAdmin.rows.length > 0) {
            await dbPool.query(`
                INSERT INTO leave_balances (tenant_id, employee_id, year, sick_leave_balance, casual_leave_balance, earned_leave_balance)
                VALUES ($1, $2, $3, 12, 12, 15) ON CONFLICT (tenant_id, employee_id, year) DO NOTHING;
            `, [acmeTenantId, acmeAdmin.rows[0].id, currentYear]);
        }

        if (acmeEmp.rows.length > 0) {
            await dbPool.query(`
                INSERT INTO leave_balances (tenant_id, employee_id, year, sick_leave_balance, casual_leave_balance, earned_leave_balance)
                VALUES ($1, $2, $3, 12, 12, 15) ON CONFLICT (tenant_id, employee_id, year) DO NOTHING;
            `, [acmeTenantId, acmeEmp.rows[0].id, currentYear]);
        }

        console.log('Demo accounts created/updated successfully:');
        console.log('  Acme Admin   : john@example.com / password123 (Tenant: Acme Corp)');
        console.log('  Acme Employee: employee@example.com / password123 (Tenant: Acme Corp)');
        console.log('  Globex Admin : alice@globex.com / password123 (Tenant: Globex Corp)');

    } catch (err) {
        console.error('Error applying schema/seed:', err);
    } finally {
        await dbPool.end();
    }
}

setup();
