require('dotenv').config();
const db = require('./utils/db');
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;

async function seed() {
    try {
        console.log('--- Starting Multi-Tenant Database Seed ---');

        // 1. Ensure Tax Slabs exist
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

        // 2. Seed Tenants
        const tenantAcme = await db.query(`
            INSERT INTO tenants (name, code) VALUES ('Acme Corp', 'acme_corp')
            ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id;
        `);
        const acmeTenantId = tenantAcme.rows[0].id;

        const tenantGlobex = await db.query(`
            INSERT INTO tenants (name, code) VALUES ('Globex Corp', 'globex_corp')
            ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id;
        `);
        const globexTenantId = tenantGlobex.rows[0].id;

        const hashedPassword = await bcrypt.hash('password123', SALT_ROUNDS);

        // 3. Create Demo Accounts
        const adminRes = await db.query(`
            INSERT INTO employees (tenant_id, first_name, last_name, email, password, role, salary, tax_slab_id, basic_salary, hra, special_allowance)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (tenant_id, email) DO UPDATE SET password = $5, role = $6
            RETURNING id;
        `, [acmeTenantId, 'John', 'Admin', 'john@example.com', hashedPassword, 'ADMIN', 120000, defaultTaxSlabId, 60000, 30000, 30000]);

        const empRes = await db.query(`
            INSERT INTO employees (tenant_id, first_name, last_name, email, password, role, salary, tax_slab_id, basic_salary, hra, special_allowance)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (tenant_id, email) DO UPDATE SET password = $5, role = $6
            RETURNING id;
        `, [acmeTenantId, 'Jane', 'Doe', 'employee@example.com', hashedPassword, 'EMPLOYEE', 80000, defaultTaxSlabId, 40000, 20000, 20000]);

        await db.query(`
            INSERT INTO employees (tenant_id, first_name, last_name, email, password, role, salary, tax_slab_id, basic_salary, hra, special_allowance)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (tenant_id, email) DO UPDATE SET password = $5, role = $6;
        `, [globexTenantId, 'Alice', 'GlobexAdmin', 'alice@globex.com', hashedPassword, 'ADMIN', 150000, defaultTaxSlabId, 75000, 37500, 37500]);

        const currentYear = new Date().getFullYear();
        if (adminRes.rows.length > 0) {
            await db.query(`
                INSERT INTO leave_balances (tenant_id, employee_id, year, sick_leave_balance, casual_leave_balance, earned_leave_balance)
                VALUES ($1, $2, $3, 12, 12, 15) ON CONFLICT (tenant_id, employee_id, year) DO NOTHING;
            `, [acmeTenantId, adminRes.rows[0].id, currentYear]);
        }
        if (empRes.rows.length > 0) {
            await db.query(`
                INSERT INTO leave_balances (tenant_id, employee_id, year, sick_leave_balance, casual_leave_balance, earned_leave_balance)
                VALUES ($1, $2, $3, 12, 12, 15) ON CONFLICT (tenant_id, employee_id, year) DO NOTHING;
            `, [acmeTenantId, empRes.rows[0].id, currentYear]);
        }

        console.log('--- Multi-Tenant Seed Complete! ---');
    } catch (err) {
        console.error('Seed Error:', err);
    } finally {
        process.exit();
    }
}

seed();
