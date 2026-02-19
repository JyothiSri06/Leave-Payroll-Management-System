const { accrueLeaveBalances } = require('./services/leaveAccrualService');
const db = require('./utils/db');

const testAccrual = async () => {
    try {
        console.log('--- Leave Accrual Manual Test ---');

        // 1. Get initial count
        const initialRes = await db.query('SELECT SUM(earned_leave_balance) as total FROM leave_balances WHERE year = $1', [new Date().getFullYear()]);
        const initialTotal = parseFloat(initialRes.rows[0].total || 0);
        console.log(`Initial Total Earned Leaves: ${initialTotal}`);

        // 2. Trigger Accrual
        console.log('Triggering Accrual...');
        await accrueLeaveBalances();

        // 3. Verify increment
        const finalRes = await db.query('SELECT SUM(earned_leave_balance) as total FROM leave_balances WHERE year = $1', [new Date().getFullYear()]);
        const finalTotal = parseFloat(finalRes.rows[0].total || 0);
        console.log(`Final Total Earned Leaves: ${finalTotal}`);

        const diff = finalTotal - initialTotal;
        console.log(`Difference: ${diff}`);

        // Get count of employees to verify math (Each should get +1.25 Earned Leave)
        const empCountRes = await db.query('SELECT COUNT(*) FROM employees');
        const empCount = parseInt(empCountRes.rows[0].count);
        const expectedDiff = empCount * 1.25;

        console.log(`Expected Difference (for ${empCount} employees): ${expectedDiff}`);

        if (Math.abs(diff - expectedDiff) < 0.01) {
            console.log('SUCCESS: Leave accrual verification passed!');
        } else {
            console.warn('WARNING: Difference mismatch. Check if some employees were initialized instead of incremented.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Test Failed:', err);
        process.exit(1);
    }
};

testAccrual();
