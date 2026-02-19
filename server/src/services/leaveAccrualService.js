const db = require('../utils/db');

const accrualRates = {
    SICK: 1.0,
    CASUAL: 1.0,
    EARNED: 1.25
};

/**
 * Accrues leave balances for all active employees.
 * This should run on the 1st of every month.
 */
const accrueLeaveBalances = async () => {
    const year = new Date().getFullYear();
    const startTime = new Date();

    console.log(`[LeaveAccrualService] Starting accrual for year ${year}...`);

    try {
        // We only want to accrual for active employees
        // Fetch employees and their current year balances
        // If an employee doesn't have a balance for this year, we should initialize it

        const employeesRes = await db.query('SELECT id FROM employees');
        const employees = employeesRes.rows;

        let processed = 0;
        let initialized = 0;

        for (const emp of employees) {
            // Check if balance exists for current year
            const balanceRes = await db.query(
                'SELECT * FROM leave_balances WHERE employee_id = $1 AND year = $2',
                [emp.id, year]
            );

            if (balanceRes.rows.length === 0) {
                // Initialize balance (first accrual of the year)
                await db.query(`
                    INSERT INTO leave_balances (employee_id, year, sick_leave_balance, casual_leave_balance, earned_leave_balance)
                    VALUES ($1, $2, $3, $4, $5)
                `, [emp.id, year, accrualRates.SICK, accrualRates.CASUAL, accrualRates.EARNED]);
                initialized++;
            } else {
                // Increment existing balance
                await db.query(`
                    UPDATE leave_balances 
                    SET sick_leave_balance = sick_leave_balance + $1,
                        casual_leave_balance = casual_leave_balance + $2,
                        earned_leave_balance = earned_leave_balance + $3
                    WHERE employee_id = $4 AND year = $5
                `, [accrualRates.SICK, accrualRates.CASUAL, accrualRates.EARNED, emp.id, year]);
            }
            processed++;
        }

        const endTime = new Date();
        const duration = (endTime - startTime) / 1000;
        console.log(`[LeaveAccrualService] Finished. Processed: ${processed}, Initialized: ${initialized}. Duration: ${duration}s`);

    } catch (err) {
        console.error('[LeaveAccrualService] Critical error during accrual:', err);
        throw err;
    }
};

module.exports = { accrueLeaveBalances };
