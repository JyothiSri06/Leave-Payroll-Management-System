const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { logAuditEvent } = require('../utils/auditLogger');
const { requireTenant, isAdmin, requireSelfOrAdmin } = require('../middleware/authMiddleware');

// Create Leave Request (Tenant isolated, self or admin)
router.post('/', requireTenant, async (req, res) => {
    const { leave_type, start_date, end_date, days_count, reason } = req.body;
    const tenantId = req.user.tenant_id;
    // Allow admin to specify employee_id or default to logged-in user
    const employeeId = (req.user.role === 'ADMIN' && req.body.employee_id) ? req.body.employee_id : req.user.id;

    try {
        await db.withTransaction(async (client) => {
            const result = await client.query(`
                INSERT INTO leave_ledger (tenant_id, employee_id, leave_type, start_date, end_date, days_count, reason, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
                RETURNING *
            `, [tenantId, employeeId, leave_type, start_date, end_date, days_count, reason]);

            const leave = result.rows[0];

            await logAuditEvent({
                tenant_id: tenantId,
                table_name: 'leave_ledger',
                record_id: leave.id,
                action: 'APPLY_LEAVE',
                new_value: leave,
                changed_by: req.user.email
            }, client);

            res.status(201).json(leave);
        });
    } catch (err) {
        if (res.headersSent) return;
        console.error('Error applying for leave:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Leaves for Employee (Tenant isolated & owner/admin checked)
router.get('/:employeeId', requireTenant, requireSelfOrAdmin('employeeId'), async (req, res) => {
    const { employeeId } = req.params;
    const tenantId = req.user.tenant_id;

    try {
        const result = await db.query(
            `SELECT * FROM leave_ledger 
             WHERE tenant_id = $1 AND employee_id = $2 
             ORDER BY created_at DESC`,
            [tenantId, employeeId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching employee leaves:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Pending Leaves for Organization (Admin only, tenant isolated)
router.get('/admin/pending', requireTenant, isAdmin, async (req, res) => {
    const tenantId = req.user.tenant_id;

    try {
        const result = await db.query(`
            SELECT l.*, e.first_name, e.last_name, e.email 
            FROM leave_ledger l
            JOIN employees e ON l.employee_id = e.id
            WHERE l.tenant_id = $1 AND l.status = 'PENDING'
            ORDER BY l.created_at ASC
        `, [tenantId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching pending leaves:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get All Leaves for Organization (Admin only, tenant isolated)
router.get('/admin/all', requireTenant, isAdmin, async (req, res) => {
    const tenantId = req.user.tenant_id;

    try {
        const result = await db.query(`
            SELECT l.*, e.first_name, e.last_name, e.email 
            FROM leave_ledger l
            JOIN employees e ON l.employee_id = e.id
            WHERE l.tenant_id = $1
            ORDER BY l.created_at DESC
        `, [tenantId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all leaves:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Leave Balance (Tenant isolated, self or admin)
router.get('/balance/:employeeId', requireTenant, requireSelfOrAdmin('employeeId'), async (req, res) => {
    const { employeeId } = req.params;
    const tenantId = req.user.tenant_id;
    const year = new Date().getFullYear();

    try {
        let result = await db.query(
            'SELECT * FROM leave_balances WHERE tenant_id = $1 AND employee_id = $2 AND year = $3',
            [tenantId, employeeId, year]
        );

        if (result.rows.length === 0) {
            result = await db.query(`
                INSERT INTO leave_balances (tenant_id, employee_id, year, sick_leave_balance, casual_leave_balance, earned_leave_balance)
                VALUES ($1, $2, $3, 12.00, 12.00, 15.00)
                ON CONFLICT (tenant_id, employee_id, year) DO UPDATE SET last_updated = CURRENT_TIMESTAMP
                RETURNING *
            `, [tenantId, employeeId, year]);
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching leave balance:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Update Leave Status with ACID Transactions & Row-Level Locking (Resume Claim #6, #7, #14)
router.put('/:id/status', requireTenant, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // APPROVED or REJECTED
    const tenantId = req.user.tenant_id;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        await db.withTransaction(async (client) => {
            // 1. Fetch leave request inside transaction
            const leaveRes = await client.query(
                `SELECT * FROM leave_ledger WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
                [id, tenantId]
            );

            if (leaveRes.rows.length === 0) {
                return res.status(404).json({ error: 'Leave request not found' });
            }

            const leave = leaveRes.rows[0];

            if (leave.status !== 'PENDING') {
                return res.status(400).json({ error: `Leave request has already been ${leave.status.toLowerCase()}` });
            }

            // Update Status
            const updateRes = await client.query(
                `UPDATE leave_ledger SET status = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *`,
                [status, id, tenantId]
            );
            const updatedLeave = updateRes.rows[0];

            // 2. Deduct Balance & Calculate LOP if APPROVED
            if (status === 'APPROVED') {
                const year = new Date(leave.start_date).getFullYear();
                let column = '';
                if (leave.leave_type === 'SICK') column = 'sick_leave_balance';
                else if (leave.leave_type === 'CASUAL') column = 'casual_leave_balance';
                else if (leave.leave_type === 'EARNED') column = 'earned_leave_balance';

                if (column) {
                    // Row-level Lock (FOR UPDATE) to prevent concurrent balance overdraft race condition!
                    let balanceRes = await client.query(
                        `SELECT ${column} as balance FROM leave_balances 
                         WHERE tenant_id = $1 AND employee_id = $2 AND year = $3 FOR UPDATE`,
                        [tenantId, leave.employee_id, year]
                    );

                    if (balanceRes.rows.length === 0) {
                        await client.query(`
                            INSERT INTO leave_balances (tenant_id, employee_id, year, sick_leave_balance, casual_leave_balance, earned_leave_balance)
                            VALUES ($1, $2, $3, 12.00, 12.00, 15.00)
                        `, [tenantId, leave.employee_id, year]);

                        balanceRes = await client.query(
                            `SELECT ${column} as balance FROM leave_balances 
                             WHERE tenant_id = $1 AND employee_id = $2 AND year = $3 FOR UPDATE`,
                            [tenantId, leave.employee_id, year]
                        );
                    }

                    const currentBalance = parseFloat(balanceRes.rows[0].balance || 0);
                    let lopDays = 0;
                    const daysRequested = parseInt(leave.days_count, 10);

                    if (daysRequested > currentBalance) {
                        lopDays = daysRequested - currentBalance;
                        await client.query(
                            `UPDATE leave_balances SET ${column} = 0, last_updated = CURRENT_TIMESTAMP 
                             WHERE tenant_id = $1 AND employee_id = $2 AND year = $3`,
                            [tenantId, leave.employee_id, year]
                        );
                    } else {
                        await client.query(
                            `UPDATE leave_balances SET ${column} = ${column} - $1, last_updated = CURRENT_TIMESTAMP 
                             WHERE tenant_id = $2 AND employee_id = $3 AND year = $4`,
                            [daysRequested, tenantId, leave.employee_id, year]
                        );
                    }

                    if (lopDays > 0) {
                        await client.query(
                            `UPDATE leave_ledger SET lop_days = $1 WHERE id = $2 AND tenant_id = $3`,
                            [lopDays, id, tenantId]
                        );
                        updatedLeave.lop_days = lopDays;
                    }
                }
            }

            await logAuditEvent({
                tenant_id: tenantId,
                table_name: 'leave_ledger',
                record_id: id,
                action: `LEAVE_${status}`,
                old_value: { status: leave.status },
                new_value: { status: updatedLeave.status, lop_days: updatedLeave.lop_days },
                changed_by: req.user.email
            }, client);

            res.json(updatedLeave);
        });

    } catch (err) {
        if (res.headersSent) return;
        console.error('Error updating leave status:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
