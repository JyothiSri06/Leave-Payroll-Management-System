const db = require('./utils/db');

const migrate = async () => {
    try {
        console.log('Starting Leave Balance Migration...');

        // 1. Create Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS leave_balances (
                id SERIAL PRIMARY KEY,
                employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
                year INT NOT NULL,
                sick_leave_balance INT DEFAULT 12,
                casual_leave_balance INT DEFAULT 12,
                earned_leave_balance INT DEFAULT 15,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(employee_id, year)
            );
        `);
        console.log('leave_balances table created.');

        // 2. Seed Balances for Existing Employees
        const employees = await db.query('SELECT id FROM employees');
        const currentYear = new Date().getFullYear();

        for (const emp of employees.rows) {
            await db.query(`
                INSERT INTO leave_balances (employee_id, year, sick_leave_balance, casual_leave_balance, earned_leave_balance)
                VALUES ($1, $2, 12, 12, 15)
                ON CONFLICT (employee_id, year) DO NOTHING;
            `, [emp.id, currentYear]);
        }
        console.log(`Seeded balances for ${employees.rows.length} employees.`);

        console.log('Migration Complete.');
        process.exit(0);
    } catch (err) {
        console.error('Migration Failed:', err);
        process.exit(1);
    }
};

migrate();
