const express = require('express');
const router = express.Router();
const db = require('../utils/db');

// Check In
router.post('/checkin', async (req, res) => {
    const { employeeId } = req.body;
    const now = new Date();
    const today = getLocalDateString(now);

    try {
        // Check if already checked in
        const existing = await db.query(
            'SELECT * FROM attendance WHERE employee_id = $1 AND date = $2',
            [employeeId, today]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Already checked in for today' });
        }

        // Late Logic: After 9:30 AM
        // We need to compare time. simple way: get hours/minutes
        let lateMinutes = 0;
        const workStartHour = 9;
        const workStartMinute = 30;

        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        if (currentHour > workStartHour || (currentHour === workStartHour && currentMinute > workStartMinute)) {
            lateMinutes = (currentHour - workStartHour) * 60 + (currentMinute - workStartMinute);
        }

        const result = await db.query(`
            INSERT INTO attendance (employee_id, date, clock_in, status, late_minutes)
            VALUES ($1, $2, $3, 'PRESENT', $4)
            RETURNING *
        `, [employeeId, today, now, lateMinutes]);

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Check Out
router.post('/checkout', async (req, res) => {
    const { employeeId } = req.body;
    const now = new Date();
    const today = getLocalDateString(now);

    try {
        const record = await db.query(
            'SELECT * FROM attendance WHERE employee_id = $1 AND date = $2',
            [employeeId, today]
        );

        if (record.rows.length === 0) {
            return res.status(404).json({ error: 'No check-in record found for today' });
        }

        const clockInTime = new Date(record.rows[0].clock_in);
        const durationMs = now - clockInTime;
        const durationHours = durationMs / (1000 * 60 * 60);

        let overtimeHours = 0;
        if (durationHours > 9) {
            overtimeHours = durationHours - 9;
        }

        const result = await db.query(`
            UPDATE attendance
            SET clock_out = $1, overtime_hours = $2
            WHERE id = $3
            RETURNING *
        `, [now, overtimeHours, record.rows[0].id]);

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Today's Attendance (Admin)
router.get('/admin/today', async (req, res) => {
    const today = getLocalDateString(new Date());
    try {
        const result = await db.query(`
            SELECT a.*, e.first_name, e.last_name 
            FROM attendance a 
            JOIN employees e ON a.employee_id = e.id 
            WHERE a.date = $1
            ORDER BY a.clock_in DESC
        `, [today]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Attendance History for Employee
router.get('/:employeeId', async (req, res) => {
    const { employeeId } = req.params;
    try {
        const result = await db.query(
            'SELECT * FROM attendance WHERE employee_id = $1 ORDER BY date DESC',
            [employeeId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Status for Today (to show correct button)
router.get('/status/:employeeId', async (req, res) => {
    const { employeeId } = req.params;
    const today = new Date().toISOString().split('T')[0];
    try {
        const result = await db.query(
            'SELECT * FROM attendance WHERE employee_id = $1 AND date = $2',
            [employeeId, today]
        );
        if (result.rows.length === 0) return res.json({ status: 'NOT_CHECKED_IN' });
        if (result.rows[0].clock_out) return res.json({ status: 'CHECKED_OUT', data: result.rows[0] });
        return res.json({ status: 'CHECKED_IN', data: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Helper to get YYYY-MM-DD for local date
const getLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Helper to get working days elapsed in current month (excluding Sundays)
const getWorkingDaysElapsed = () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let count = 0;
    // Iterate from start of month to today
    const d = new Date(startOfMonth);
    while (d <= now) {
        if (d.getDay() !== 0) count++; // 0 = Sunday
        d.setDate(d.getDate() + 1);
    }
    return count;
};

// Get Attendance Stats for Employee (Current Month %)
router.get('/stats/:employeeId', async (req, res) => {
    const { employeeId } = req.params;
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfMonth = getLocalDateString(firstOfMonth);

    try {
        const workingDays = getWorkingDaysElapsed();

        const presentCountRes = await db.query(`
            SELECT COUNT(*) 
            FROM attendance 
            WHERE employee_id = $1 
            AND date >= $2 
            AND status = 'PRESENT'
        `, [employeeId, startOfMonth]);

        const presentDays = parseInt(presentCountRes.rows[0].count);
        const percentage = workingDays > 0 ? (presentDays / workingDays) * 100 : 0;

        res.json({
            presentDays,
            workingDays,
            percentage: Math.min(100, percentage).toFixed(1)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Overall Monthly Report for All Employees (Admin)
router.get('/admin/monthly-report', async (req, res) => {
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
            WHERE date >= $1 
            AND status = 'PRESENT'
            GROUP BY employee_id
        `, [startOfMonth]);

        const statsMap = {};
        result.rows.forEach(row => {
            const percentage = workingDays > 0 ? (parseInt(row.present_days) / workingDays) * 100 : 0;
            statsMap[row.employee_id] = {
                percentage: Math.min(100, percentage).toFixed(1),
                presentDays: parseInt(row.present_days)
            };
        });

        res.json({
            workingDays,
            stats: statsMap
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Overall Attendance Stats (Admin)
router.get('/admin/overall-stats', async (req, res) => {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfMonth = getLocalDateString(firstOfMonth);

    try {
        const workingDays = getWorkingDaysElapsed();

        // 1. Get total active employees
        const empCountRes = await db.query('SELECT COUNT(*) FROM employees');
        const empCount = parseInt(empCountRes.rows[0].count);

        // 2. Get total attendance records for this month
        const totalPresentRes = await db.query(`
            SELECT COUNT(*) 
            FROM attendance 
            WHERE date >= $1 
            AND status = 'PRESENT'
        `, [startOfMonth]);

        const totalPresent = parseInt(totalPresentRes.rows[0].count);

        // Calculate average percentage
        const totalPossibleDays = empCount * workingDays;
        const averagePercentage = totalPossibleDays > 0 ? (totalPresent / totalPossibleDays) * 100 : 0;

        res.json({
            totalEmployees: empCount,
            workingDays,
            totalPresent,
            averagePercentage: Math.min(100, averagePercentage).toFixed(1)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
