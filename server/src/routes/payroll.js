const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { calculatePayroll } = require('../services/payrollEngine');
const { processQuery } = require('../services/aiCompliance');

// Run Payroll for an Employee
router.post('/run/:employeeId', async (req, res) => {
    const { employeeId } = req.params;
    const { payPeriodStart, payPeriodEnd, bonus = 0, manualDeduction = 0 } = req.body;

    try {
        // 1. Fetch Employee
        const empRes = await db.query('SELECT * FROM employees WHERE id = $1', [employeeId]);
        const employee = empRes.rows[0];

        if (!employee) return res.status(404).json({ error: 'Employee not found' });

        // 2. Calculate
        const payrollData = await calculatePayroll(employee, payPeriodStart, payPeriodEnd, db, bonus, manualDeduction);

        // 3. Save to DB
        const result = await db.query(`
      INSERT INTO payroll_runs (
        employee_id, pay_period_start, pay_period_end, 
        gross_pay, deductions, net_pay, tax_deducted, ewa_deductions, status, bonus,
        basic_pay, hra_pay, special_allowance_pay, pf_deduction, professional_tax_deduction, income_tax_deduction, esi_deduction,
        manual_deductions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PROCESSED', $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `, [
            payrollData.employee_id, payrollData.pay_period_start, payrollData.pay_period_end,
            payrollData.gross_pay, payrollData.deductions, payrollData.net_pay,
            payrollData.tax_deducted, payrollData.ewa_deductions, payrollData.bonus,
            payrollData.basic_pay, payrollData.hra_pay, payrollData.special_allowance_pay,
            payrollData.pf_deduction, payrollData.professional_tax_deduction, payrollData.income_tax_deduction, payrollData.esi_deduction,
            payrollData.manual_deductions
        ]);

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message, receivedBody: req.body });
    }
});

// Get All Payroll History (Admin)
router.get('/admin/history', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM payroll_runs ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Get Payroll History for Employee
router.get('/history/:employeeId', async (req, res) => {
    const { employeeId } = req.params;
    try {
        const result = await db.query('SELECT * FROM payroll_runs WHERE employee_id = $1 ORDER BY created_at DESC', [employeeId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Mark as Paid
router.put('/:id/pay', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(`
            UPDATE payroll_runs
            SET status = 'PAID', payment_date = NOW()
            WHERE id = $1
            RETURNING *
        `, [id]);

        if (result.rows.length === 0) return res.status(404).json({ error: 'Payroll record not found' });

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Latest Payslip
router.get('/latest/:employeeId', async (req, res) => {
    const { employeeId } = req.params;
    try {
        const result = await db.query('SELECT * FROM payroll_runs WHERE employee_id = $1 ORDER BY created_at DESC LIMIT 1', [employeeId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'No payslips found' }); // Return 404 cleanly
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// AI Chat Endpoint
router.post('/chat', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });

    try {
        const answer = await processQuery(query, db);
        res.json({ answer });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'AI Error' });
    }
});

module.exports = router;
