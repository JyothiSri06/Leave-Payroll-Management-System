const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { calculatePayroll } = require('../services/payrollEngine');
const { processQuery } = require('../services/aiCompliance');
const { logAuditEvent } = require('../utils/auditLogger');
const { requireTenant, isAdmin, requireSelfOrAdmin } = require('../middleware/authMiddleware');

// Run Payroll for an Employee (Admin only, tenant isolated, idempotent via UNIQUE constraint)
router.post('/run/:employeeId', requireTenant, isAdmin, async (req, res) => {
    const { employeeId } = req.params;
    const tenantId = req.user.tenant_id;
    const { payPeriodStart, payPeriodEnd, bonus = 0, manualDeduction = 0 } = req.body;

    try {
        await db.withTransaction(async (client) => {
            // 1. Fetch Employee inside tenant
            const empRes = await client.query(
                'SELECT * FROM employees WHERE id = $1 AND tenant_id = $2',
                [employeeId, tenantId]
            );
            const employee = empRes.rows[0];

            if (!employee) return res.status(404).json({ error: 'Employee not found in your tenant organization' });

            // 2. Calculate Payroll
            const payrollData = await calculatePayroll(employee, payPeriodStart, payPeriodEnd, client, bonus, manualDeduction);

            // 3. Save to DB with Idempotency UPSERT handling (Resume Claim #5 & #7)
            const result = await client.query(`
                INSERT INTO payroll_runs (
                    tenant_id, employee_id, pay_period_start, pay_period_end, 
                    gross_pay, deductions, net_pay, tax_deducted, ewa_deductions, status, bonus,
                    basic_pay, hra_pay, special_allowance_pay, pf_deduction, professional_tax_deduction, income_tax_deduction, esi_deduction,
                    manual_deductions
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PROCESSED', $10, $11, $12, $13, $14, $15, $16, $17, $18)
                ON CONFLICT (tenant_id, employee_id, pay_period_start, pay_period_end) 
                DO UPDATE SET 
                    gross_pay = EXCLUDED.gross_pay,
                    deductions = EXCLUDED.deductions,
                    net_pay = EXCLUDED.net_pay,
                    tax_deducted = EXCLUDED.tax_deducted,
                    bonus = EXCLUDED.bonus,
                    manual_deductions = EXCLUDED.manual_deductions,
                    status = 'PROCESSED',
                    created_at = CURRENT_TIMESTAMP
                RETURNING *
            `, [
                tenantId, payrollData.employee_id, payrollData.pay_period_start, payrollData.pay_period_end,
                payrollData.gross_pay, payrollData.deductions, payrollData.net_pay,
                payrollData.tax_deducted, payrollData.ewa_deductions, payrollData.bonus,
                payrollData.basic_pay, payrollData.hra_pay, payrollData.special_allowance_pay,
                payrollData.pf_deduction, payrollData.professional_tax_deduction, payrollData.income_tax_deduction, payrollData.esi_deduction,
                payrollData.manual_deductions
            ]);

            const payrollRun = result.rows[0];

            await logAuditEvent({
                tenant_id: tenantId,
                table_name: 'payroll_runs',
                record_id: payrollRun.id,
                action: 'RUN_PAYROLL',
                new_value: { employee_id: employeeId, net_pay: payrollRun.net_pay, pay_period_start: payPeriodStart },
                changed_by: req.user.email
            }, client);

            res.json(payrollRun);
        });
    } catch (err) {
        if (res.headersSent) return;
        console.error('Error running payroll:', err);
        res.status(500).json({ error: err.message, receivedBody: req.body });
    }
});

// Get All Payroll History for Tenant (Admin only)
router.get('/admin/history', requireTenant, isAdmin, async (req, res) => {
    const tenantId = req.user.tenant_id;
    try {
        const result = await db.query(
            `SELECT p.*, e.first_name, e.last_name, e.email 
             FROM payroll_runs p
             JOIN employees e ON p.employee_id = e.id
             WHERE p.tenant_id = $1 
             ORDER BY p.created_at DESC`,
            [tenantId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching admin payroll history:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get Payroll History for Employee (Tenant isolated, self or admin)
router.get('/history/:employeeId', requireTenant, requireSelfOrAdmin('employeeId'), async (req, res) => {
    const { employeeId } = req.params;
    const tenantId = req.user.tenant_id;

    try {
        const result = await db.query(
            'SELECT * FROM payroll_runs WHERE tenant_id = $1 AND employee_id = $2 ORDER BY created_at DESC',
            [tenantId, employeeId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching employee payroll history:', err);
        res.status(500).json({ error: err.message });
    }
});

// Mark Payroll Record as Paid (Admin only, tenant isolated)
router.put('/:id/pay', requireTenant, isAdmin, async (req, res) => {
    const { id } = req.params;
    const tenantId = req.user.tenant_id;

    try {
        await db.withTransaction(async (client) => {
            const result = await client.query(`
                UPDATE payroll_runs
                SET status = 'PAID', payment_date = CURRENT_TIMESTAMP
                WHERE id = $1 AND tenant_id = $2
                RETURNING *
            `, [id, tenantId]);

            if (result.rows.length === 0) return res.status(404).json({ error: 'Payroll record not found' });

            const updated = result.rows[0];

            await logAuditEvent({
                tenant_id: tenantId,
                table_name: 'payroll_runs',
                record_id: id,
                action: 'MARK_PAYROLL_PAID',
                new_value: { status: 'PAID' },
                changed_by: req.user.email
            }, client);

            res.json(updated);
        });
    } catch (err) {
        if (res.headersSent) return;
        console.error('Error marking payroll as paid:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Latest Payslip for Employee (Tenant isolated, self or admin)
router.get('/latest/:employeeId', requireTenant, requireSelfOrAdmin('employeeId'), async (req, res) => {
    const { employeeId } = req.params;
    const tenantId = req.user.tenant_id;

    try {
        const result = await db.query(
            'SELECT * FROM payroll_runs WHERE tenant_id = $1 AND employee_id = $2 ORDER BY created_at DESC LIMIT 1',
            [tenantId, employeeId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'No payslips found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching latest payslip:', err);
        res.status(500).json({ error: err.message });
    }
});

// Gemini AI HR Compliance Assistant Endpoint
router.post('/chat', requireTenant, async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });

    try {
        const answer = await processQuery(query, db);
        res.json({ answer });
    } catch (err) {
        console.error('AI Processing Error:', err);
        res.status(500).json({ error: 'AI HR Compliance Error' });
    }
});

module.exports = router;
