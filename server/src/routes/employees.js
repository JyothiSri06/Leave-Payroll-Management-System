const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const cache = require('../utils/cache');

// Get Employee by ID with Caching
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const cacheKey = `employee:${id}`;

    try {
        // 1. Check Cache
        const cachedData = await cache.get(cacheKey);
        if (cachedData) {
            console.log('Cache Hit');
            return res.json(JSON.parse(cachedData));
        }

        // 2. Query DB
        console.log('Cache Miss');
        const result = await db.query('SELECT * FROM employees WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        const employee = result.rows[0];

        // 3. Set Cache (Expire in 1 hour)
        await cache.set(cacheKey, JSON.stringify(employee), { EX: 3600 });

        res.json(employee);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Create Employee
router.post('/', async (req, res) => {
    const { first_name, last_name, email, phone, salary, tax_slab_id, basic_salary, hra, special_allowance } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO employees (first_name, last_name, email, phone, salary, tax_slab_id, basic_salary, hra, special_allowance) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
            [first_name, last_name, email, phone, salary, tax_slab_id, basic_salary || 0, hra || 0, special_allowance || 0]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get All Employees
router.get('/', async (req, res) => {
    try {
        // Cache key changed to force refresh after checking filtering
        const cached = await cache.get('employee_list_v2');
        if (cached) return res.json(JSON.parse(cached));

        // Schema does not have created_at, using join_date and id for sorting
        // Filter out ADMINs so only employees are shown
        const result = await db.query("SELECT id, first_name, last_name, email, role, salary, status FROM employees WHERE role != 'ADMIN' ORDER BY join_date DESC, id DESC");

        await cache.set('employee_list_v2', JSON.stringify(result.rows), 3600);
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching employees:", err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Update Employee (Invalidate Cache)
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { salary, basic_salary, hra, special_allowance } = req.body;

    try {
        // 1. Fetch current data for history
        const currentRes = await db.query('SELECT salary, basic_salary FROM employees WHERE id = $1', [id]);
        if (currentRes.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const current = currentRes.rows[0];

        // 2. Update Employee
        const result = await db.query(
            'UPDATE employees SET salary = $1, basic_salary = $2, hra = $3, special_allowance = $4 WHERE id = $5 RETURNING *',
            [salary, basic_salary || 0, hra || 0, special_allowance || 0, id]
        );

        const updated = result.rows[0];

        // 3. Log Revision if Salary Changed
        if (parseFloat(current.salary) !== parseFloat(salary)) {
            await db.query(`
                INSERT INTO salary_revisions (employee_id, old_salary, new_salary, changed_by)
                VALUES ($1, $2, $3, $4)
            `, [id, current.salary, salary, req.user ? req.user.id : null]);
        }

        // Invalidate Cache
        await cache.del(`employee:${id}`);
        await cache.del('employee_list_v2'); // Also clear list cache

        res.json(updated);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Salary History
router.get('/:id/salary-history', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(
            'SELECT * FROM salary_revisions WHERE employee_id = $1 ORDER BY change_date DESC',
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
