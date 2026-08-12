const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { requireTenant, isAdmin, requireSelfOrAdmin } = require('../middleware/authMiddleware');

const getLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getWorkingDaysElapsed = () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let count = 0;
    const d = new Date(startOfMonth);
    while (d <= now) {
        if (d.getDay() !== 0) count++; // Exclude Sundays
        d.setDate(d.getDate() + 1);
    }
    return count;
};

// Check In (Tenant isolated)
router.post('/checkin', requireTenant, async (req, res) => {
    const tenantId = req.user.tenant_id;
    const employeeId = req.body.employeeId || req.user.id;
    const now = new Date();
    const today = getLocalDateString(now);

    try {
        await db.withTransaction(async (client) => {
            const existing = await client.query(
                'SELECT * FROM attendance WHERE tenant_id = $1 AND employee_id = $2 AND date = $3 FOR UPDATE',
                [tenantId, employeeId, today]
            );

            if (existing.rows.length > 0) {
                return res.status(400).json({ error: 'Already checked in for today' });
            }

            let lateMinutes = 0;
            const workStartHour = 9;
            const workStartMinute = 30;
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();

            if (currentHour > workStartHour || (currentHour === workStartHour && currentMinute > workStartMinute)) {
                lateMinutes = (currentHour - workStartHour) * 60 + (currentMinute - workStartMinute);
            }

            const result = await client.query(`
                INSERT INTO attendance (tenant_id, employee_id, date, clock_in, status, late_minutes)
                VALUES ($1, $2, $3, $4, 'PRESENT', $5)
                RETURNING *
            `, [tenantId, employeeId, today, now, lateMinutes]);

            res.json(result.rows[0]);
        });
    } catch (err) {
        if (res.headersSent) return;
        console.error('Error during checkin:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Check Out (Tenant isolated)
router.post('/checkout', requireTenant, async (req, res) => {
    const tenantId = req.user.tenant_id;
    const employeeId = req.body.employeeId || req.user.id;
    const now = new Date();
    const today = getLocalDateString(now);

    try {
        await db.withTransaction(async (client) => {
            const record = await client.query(
                'SELECT * FROM attendance WHERE tenant_id = $1 AND employee_id = $2 AND date = $3 FOR UPDATE',
                [tenantId, employeeId, today]
            );

            if (record.rows.length === 0) {
                return res.status(404).json({ error: 'No check-in record found for today' });
            }

            const clockInTime = new Date(record.rows[0].clock_in);
            const durationMs = now - clockInTime;
            const durationHours = durationMs / (1000 * 60 * 60);

            let overtimeHours = 0;
            if (durationHours > 9) {
                overtimeHours = parseFloat((durationHours - 9).toFixed(2));
            }

            const result = await client.query(`
                UPDATE attendance
                SET clock_out = $1, overtime_hours = $2
                WHERE id = $3 AND tenant_id = $4
                RETURNING *
            `, [now, overtimeHours, record.rows[0].id, tenantId]);

            res.json(result.rows[0]);
        });
    } catch (err) {
        if (res.headersSent) return;
        console.error('Error during checkout:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Today's Attendance for Tenant (Admin only)
router.get('/admin/today', requireTenant, isAdmin, async (req, res) => {
    const tenantId = req.user.tenant_id;
    const today = getLocalDateString(new Date());
    try {
        const result = await db.query(`
            SELECT a.*, e.first_name, e.last_name, e.email 
            FROM attendance a 
            JOIN employees e ON a.employee_id = e.id 
            WHERE a.tenant_id = $1 AND a.date = $2
            ORDER BY a.clock_in DESC
        `, [tenantId, today]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching admin today attendance:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Attendance History for Employee (Tenant isolated, self or admin)
router.get('/:employeeId', requireTenant, requireSelfOrAdmin('employeeId'), async (req, res) => {
    const { employeeId } = req.params;
    const tenantId = req.user.tenant_id;

    try {
        const result = await db.query(
            'SELECT * FROM attendance WHERE tenant_id = $1 AND employee_id = $2 ORDER BY date DESC',
            [tenantId, employeeId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching attendance history:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Status for Today (Tenant isolated, self or admin)
router.get('/status/:employeeId', requireTenant, requireSelfOrAdmin('employeeId'), async (req, res) => {
    const { employeeId } = req.params;
    const tenantId = req.user.tenant_id;
    const today = getLocalDateString(new Date());

    try {
        const result = await db.query(
            'SELECT * FROM attendance WHERE tenant_id = $1 AND employee_id = $2 AND date = $3',
            [tenantId, employeeId, today]
        );
        if (result.rows.length === 0) return res.json({ status: 'NOT_CHECKED_IN' });
        if (result.rows[0].clock_out) return res.json({ status: 'CHECKED_OUT', data: result.rows[0] });
        return res.json({ status: 'CHECKED_IN', data: result.rows[0] });
    } catch (err) {
        console.error('Error fetching today status:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Attendance Stats for Employee (Tenant isolated)
router.get('/stats/:employeeId', requireTenant, requireSelfOrAdmin('employeeId'), async (req, res) => {
    const { employeeId } = req.params;
    const tenantId = req.user.tenant_id;
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfMonth = getLocalDateString(firstOfMonth);

    try {
        const workingDays = getWorkingDaysElapsed();

        const presentCountRes = await db.query(`
            SELECT COUNT(*) 
            FROM attendance 
            WHERE tenant_id = $1 
            AND employee_id = $2 
            AND date >= $3 
            AND status = 'PRESENT'
        `, [tenantId, employeeId, startOfMonth]);

        const presentDays = parseInt(presentCountRes.rows[0].count, 10);
        const percentage = workingDays > 0 ? (presentDays / workingDays) * 100 : 0;

        res.json({
            presentDays,
            workingDays,
            percentage: Math.min(100, percentage).toFixed(1)
        });
    } catch (err) {
        console.error('Error fetching employee attendance stats:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Overall Monthly Report for Tenant (Admin only)
router.get('/admin/monthly-report', requireTenant, isAdmin, async (req, res) => {
    const tenantId = req.user.tenant_id;
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfMonth = getLocalDateString(firstOfMonth);

    try {
        const workingDays = getWorkingDaysElapsed();

        const result = await db.query(`
            SELECT 
                employee_id, 
                COUNT(*) as present_days
            FROM attendance 
            WHERE tenant_id = $1 
            AND date >= $2 
            AND status = 'PRESENT'
            GROUP BY employee_id
        `, [tenantId, startOfMonth]);

        const statsMap = {};
        result.rows.forEach(row => {
            const percentage = workingDays > 0 ? (parseInt(row.present_days, 10) / workingDays) * 100 : 0;
            statsMap[row.employee_id] = {
                percentage: Math.min(100, percentage).toFixed(1),
                presentDays: parseInt(row.present_days, 10)
            };
        });

        res.json({
            workingDays,
            stats: statsMap
        });
    } catch (err) {
        console.error('Error fetching monthly report:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Overall Attendance Stats for Tenant (Admin only)
router.get('/admin/overall-stats', requireTenant, isAdmin, async (req, res) => {
    const tenantId = req.user.tenant_id;
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfMonth = getLocalDateString(firstOfMonth);

    try {
        const workingDays = getWorkingDaysElapsed();

        const empCountRes = await db.query(
            "SELECT COUNT(*) FROM employees WHERE tenant_id = $1 AND role != 'ADMIN'", 
            [tenantId]
        );
        const empCount = parseInt(empCountRes.rows[0].count, 10);

        const totalPresentRes = await db.query(`
            SELECT COUNT(*) 
            FROM attendance 
            WHERE tenant_id = $1 
            AND date >= $2 
            AND status = 'PRESENT'
        `, [tenantId, startOfMonth]);

        const totalPresent = parseInt(totalPresentRes.rows[0].count, 10);
        const totalPossibleDays = empCount * workingDays;
        const averagePercentage = totalPossibleDays > 0 ? (totalPresent / totalPossibleDays) * 100 : 0;

        res.json({
            totalEmployees: empCount,
            workingDays,
            totalPresent,
            averagePercentage: Math.min(100, averagePercentage).toFixed(1)
        });
    } catch (err) {
        console.error('Error fetching overall stats:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
