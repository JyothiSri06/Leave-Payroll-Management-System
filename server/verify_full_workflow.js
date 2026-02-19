const db = require('./src/utils/db');
require('dotenv').config();

// Configuration
const API_URL = 'http://127.0.0.1:5002/api';
const EMP_EMAIL = 'workflow.test@example.com';
const ADMIN_EMAIL = 'admin.workflow@example.com';

async function runTest() {
    const client = await db.getClient();
    try {
        console.log('--- STARTING FULL WORKFLOW VERIFICATION ---');

        // 1. Cleanup
        await client.query('BEGIN');
        await client.query('DELETE FROM employees WHERE email IN ($1, $2)', [EMP_EMAIL, ADMIN_EMAIL]);

        // 2. Create Test Employee & Admin
        console.log('Creating Users...');
        // Employee: 50k Salary (Basic 25k)
        // Tax Slab: 1 (0%) or create logic? Let's assume slab 1 exists.
        // We will insert a temporary tax slab to be sure or rely on existing.
        // Let's use the same tax slab logic as previous test to be safe.
        const slabRes = await client.query(`
            INSERT INTO tax_configuration (min_salary, max_salary, tax_percentage, region, effective_date)
            VALUES (0, 99999999, 0.00, 'WORKFLOW_TEST', '2026-01-01')
            RETURNING id
        `);
        const slabId = slabRes.rows[0].id;

        const empRes = await client.query(`
            INSERT INTO employees (first_name, last_name, email, password_hash, role, salary, tax_slab_id, basic_salary, hra, special_allowance, status)
            VALUES ('Flow', 'Emp', $1, 'hash', 'EMPLOYEE', 60000, $2, 30000, 15000, 15000, 'ACTIVE')
            RETURNING id
        `, [EMP_EMAIL, slabId]);
        const empId = empRes.rows[0].id;

        const adminRes = await client.query(`
            INSERT INTO employees (first_name, last_name, email, password_hash, role, salary, tax_slab_id, status)
            VALUES ('Flow', 'Admin', $1, 'hash', 'ADMIN', 100000, $2, 'ACTIVE')
            RETURNING id
        `, [ADMIN_EMAIL, slabId]);
        const adminId = adminRes.rows[0].id;

        await client.query('COMMIT'); // Commit create so API can see them

        // 4. Setup Leave Scenario: 0 Balance, Request 2 days -> Should be LOP
        console.log('Setting up Leave Scenario (0 Balance)...');
        // Create Balance entry with 0
        const year = new Date().getFullYear();
        await client.query(`
            INSERT INTO leave_balances (employee_id, year, sick_leave_balance, casual_leave_balance, earned_leave_balance)
            VALUES ($1, $2, 0, 0, 0)
        `, [empId, year]);

        // Create Pending Leave Request
        const leaveRes = await client.query(`
            INSERT INTO leave_ledger (employee_id, leave_type, start_date, end_date, days_count, reason, status)
            VALUES ($1, 'CASUAL', '2026-04-01', '2026-04-02', 2, 'Workflow Test', 'PENDING')
            RETURNING id
        `, [empId]);
        const leaveId = leaveRes.rows[0].id;

        await client.query('COMMIT');
        client.release(); // Release client to free up pool/locks

        // 5. Action: Admin Approves Leave (via API)
        console.log('Action: Admin Approves Leave (via API)...');
        const approveRes = await fetch(`${API_URL}/leaves/${leaveId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'APPROVED' })
        });

        if (!approveRes.ok) {
            const err = await approveRes.text();
            throw new Error(`API Approval Failed: ${err}`);
        }
        const approvedLeave = await approveRes.json();
        console.log(`Leave Approved. LOP Days returned: ${approvedLeave.lop_days}`);

        if (Number(approvedLeave.lop_days) !== 2) {
            console.error('❌ LOP Logic Failed: Expected 2 LOP days.');
        } else {
            console.log('✅ LOP Logic Verified on Approval.');
        }

        // 6. Action: Run Payroll (via API)
        console.log('Action: Run Payroll (via API)...');
        // Period covers April 1-2
        const payrollRes = await fetch(`${API_URL}/payroll/run/${empId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                payPeriodStart: '2026-04-01',
                payPeriodEnd: '2026-04-30',
                bonus: 0
            })
        });

        if (!payrollRes.ok) {
            const err = await payrollRes.text();
            throw new Error(`API Payroll Run Failed: ${err}`);
        }
        const payrollData = await payrollRes.json();

        // 7. Verification
        console.log('--- PAYROLL RESULT ---');
        console.log(`Gross Pay: ${payrollData.gross_pay} (Expected 60000)`);

        // Per day = 60000 / 30 = 2000
        // LOP Deduction = 2 * 2000 = 4000
        // PF (12% of 30000) = 3600
        // PT (Gross > 20k) = 200
        // Tax (0%) = 0
        // Total Deductions = 4000 (LOP) + 3600 (PF) + 200 (PT) = 7800
        // Net Pay = 60000 - 7800 = 52200

        const expectedNet = (60000 - 4000 - 3600 - 200).toFixed(2);
        console.log(`Net Pay: ${payrollData.net_pay} (Expected ${expectedNet})`);

        // Clean up
        const cleanClient = await db.getClient();
        await cleanClient.query('DELETE FROM employees WHERE email IN ($1, $2)', [EMP_EMAIL, ADMIN_EMAIL]);
        await cleanClient.query('DELETE FROM tax_configuration WHERE id = $1', [slabId]);
        cleanClient.release();

        if (payrollData.net_pay === expectedNet) {
            console.log('✅ FULL WORKFLOW VERIFIED SUCCESS!');
        } else {
            console.log('❌ WORKFLOW VERIFICATION FAILED - Mismatch.');
        }

    } catch (err) {
        console.error('Workflow Test Error:', err);
    } finally {
        process.exit(0);
    }
}

runTest();
