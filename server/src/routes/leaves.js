const express = require('express');
const router = express.Router();
const db = require('../utils/db');

// Create Leave Request
router.post('/', async (req, res) => {
    const { employee_id, leave_type, start_date, end_date, days_count, reason } = req.body;

    try {
        const result = await db.query(`
      INSERT INTO leave_ledger (employee_id, leave_type, start_date, end_date, days_count, reason, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
      RETURNING *
    `, [employee_id, leave_type, start_date, end_date, days_count, reason]);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Leaves for Employee
router.get('/:employeeId', async (req, res) => {
    const { employeeId } = req.params;
    try {
        const result = await db.query(
            'SELECT * FROM leave_ledger WHERE employee_id = $1 ORDER BY created_at DESC',
            [employeeId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Pending Leaves (Admin)
router.get('/admin/pending', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT l.*, e.first_name, e.last_name 
            FROM leave_ledger l
            JOIN employees e ON l.employee_id = e.id
            WHERE l.status = 'PENDING'
            ORDER BY l.created_at ASC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get All Leaves (Admin) - For Analytics
router.get('/admin/all', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT l.*, e.first_name, e.last_name 
            FROM leave_ledger l
            JOIN employees e ON l.employee_id = e.id
            ORDER BY l.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Leave Balance
router.get('/balance/:employeeId', async (req, res) => {
    const { employeeId } = req.params;
    const year = new Date().getFullYear();
    try {
        let result = await db.query(
            'SELECT * FROM leave_balances WHERE employee_id = $1 AND year = $2',
            [employeeId, year]
        );

        if (result.rows.length === 0) {
            // If no balance record, create one (fallback)
            result = await db.query(`
                INSERT INTO leave_balances (employee_id, year, sick_leave_balance, casual_leave_balance, earned_leave_balance)
                VALUES ($1, $2, 12, 12, 15)
                RETURNING *
            `, [employeeId, year]);
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Update Leave Status (Approve/Reject)
router.put('/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // APPROVED or REJECTED

    if (!['APPROVED', 'REJECTED'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        // 1. Update Status
        const leaveRes = await db.query(
            "UPDATE leave_ledger SET status = $1 WHERE id = $2 RETURNING *",
            [status, id]
        );

        if (leaveRes.rows.length === 0) return res.status(404).json({ error: 'Leave not found' });
        const leave = leaveRes.rows[0];

        // 2. If Approved, Deduct Balance and Calculate LOP
        if (status === 'APPROVED') {
            const year = new Date().getFullYear();
            let column = '';
            if (leave.leave_type === 'SICK') column = 'sick_leave_balance';
            else if (leave.leave_type === 'CASUAL') column = 'casual_leave_balance';
            else if (leave.leave_type === 'EARNED') column = 'earned_leave_balance';

            if (column) {
                // Fetch current balance first to check for LOP
                const balanceRes = await db.query(
                    `SELECT ${column} as balance FROM leave_balances WHERE employee_id = $1 AND year = $2`,
                    [leave.employee_id, year]
                );

                let currentBalance = 0;
                if (balanceRes.rows.length > 0) {
                    currentBalance = parseFloat(balanceRes.rows[0].balance);
                } else {
                    // Create balance if not exists (defensive coding)
                    await db.query(`
                        INSERT INTO leave_balances (employee_id, year, sick_leave_balance, casual_leave_balance, earned_leave_balance)
                        VALUES ($1, $2, 12, 12, 15)
                    `, [leave.employee_id, year]);
                    currentBalance = (leave.leave_type === 'EARNED' ? 15 : 12);
                }

                let lopDays = 0;
                const daysRequested = leave.days_count;

                if (daysRequested > currentBalance) {
                    lopDays = daysRequested - currentBalance;
                    // Deduct validation: Balance becomes 0
                    await db.query(`
                        UPDATE leave_balances 
                        SET ${column} = 0 
                        WHERE employee_id = $1 AND year = $2
                    `, [leave.employee_id, year]);
                } else {
                    // Sufficient balance
                    await db.query(`
                        UPDATE leave_balances 
                        SET ${column} = ${column} - $1 
                        WHERE employee_id = $2 AND year = $3
                    `, [daysRequested, leave.employee_id, year]);
                }

                // Update LOP days in ledger
                if (lopDays > 0) {
                    await db.query(
                        'UPDATE leave_ledger SET lop_days = $1 WHERE id = $2',
                        [lopDays, id]
                    );
                    leave.lop_days = lopDays; // return updated info
                }
            }
        }

        res.json(leave);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
