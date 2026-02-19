const db = require('./src/utils/db');
require('dotenv').config();
const { calculatePayroll } = require('./src/services/payrollEngine');

async function runTest() {
    const client = await db.getClient();
    try {
        console.log('--- STARTING INDIAN PAYROLL VERIFICATION ---');
        await client.query('BEGIN');

        // 1. Cleanup & Setup Test Employee
        const email = 'check.payroll@india.com';
        await client.query('DELETE FROM employees WHERE email = $1', [email]);

        // Create Test Tax Slab (5%)
        const slabRes = await client.query(`
            INSERT INTO tax_configuration (min_salary, max_salary, tax_percentage, region, effective_date)
            VALUES (0, 99999999, 5.00, 'TEST', '2026-01-01')
            RETURNING id
        `);
        const slabId = slabRes.rows[0].id;

        // Create Employee with Test Slab
        console.log('Creating Test Employee...');
        const empRes = await client.query(`
            INSERT INTO employees (
                first_name, last_name, email, password_hash, role, salary, tax_slab_id, 
                basic_salary, hra, special_allowance, status
            ) VALUES (
                'Test', 'India', $1, 'hash', 'EMPLOYEE', 50000, $2,
                25000, 12500, 12500, 'ACTIVE'
            ) RETURNING *
        `, [email, slabId]);
        const employee = empRes.rows[0];
        console.log(`Employee Created: ID=${employee.id}`);

        // 2. Run Payroll
        // Date range: Full month
        const start = '2026-03-01';
        const end = '2026-03-30';

        // Mock DB for calculatePayroll (It needs query method)
        // We can pass the real client usually, but calculatePayroll expects { query: ... }
        // The service uses `db.query`.

        console.log('Calculating Payroll...');
        const payroll = await calculatePayroll(employee, start, end, client, 0);

        // 3. Verification
        console.log('\n--- VERIFICATION RESULTS ---');
        console.log(`Gross Pay: Expected 50000.00 | Actual ${payroll.gross_pay}`);
        console.log(`Basic Pay: Expected 25000.00 | Actual ${payroll.basic_pay}`);

        const expectedPF = (25000 * 0.12).toFixed(2);
        console.log(`PF Deduction (12% of Basic): Expected ${expectedPF} | Actual ${payroll.pf_deduction}`);

        const expectedPT = (200).toFixed(2); // Gross > 20000
        console.log(`PT Deduction: Expected ${expectedPT} | Actual ${payroll.professional_tax_deduction}`);

        const expectedESI = (0).toFixed(2); // Gross > 21000
        console.log(`ESI Deduction: Expected ${expectedESI} | Actual ${payroll.esi_deduction}`);

        const totalStatutory = parseFloat(payroll.pf_deduction) + parseFloat(payroll.professional_tax_deduction) + parseFloat(payroll.esi_deduction);
        const taxable = 50000 - totalStatutory;
        const expectedTax = (taxable * 0.05).toFixed(2); // 5% slab
        console.log(`Income Tax (5% of ${taxable}): Expected ${expectedTax} | Actual ${payroll.income_tax_deduction}`);

        const expectedNet = (50000 - totalStatutory - parseFloat(expectedTax)).toFixed(2);
        console.log(`Net Pay: Expected ${expectedNet} | Actual ${payroll.net_pay}`);

        // Cleanup
        await client.query('ROLLBACK');
        await client.query('DELETE FROM employees WHERE id = $1', [employee.id]);
        await client.query('DELETE FROM tax_configuration WHERE id = $1', [slabId]);

        if (payroll.gross_pay === '50000.00' && payroll.pf_deduction === '3000.00' && payroll.net_pay === expectedNet) {
            console.log('\n✅ TEST PASSED: Calculation matches Indian Payroll Structure.');
        } else {
            console.log('\n❌ TEST FAILED: Discrepancies found.');
        }

    } catch (err) {
        console.error('Test Error:', err);
    } finally {
        client.release();
        process.exit(0);
    }
}

runTest();
