const db = require('./utils/db');

const migrate = async () => {
    try {
        console.log('Starting Leave Balance Numeric Migration...');

        // 1. Alter Columns to NUMERIC(5,2)
        await db.query(`
            ALTER TABLE leave_balances 
            ALTER COLUMN sick_leave_balance TYPE NUMERIC(5,2),
            ALTER COLUMN casual_leave_balance TYPE NUMERIC(5,2),
            ALTER COLUMN earned_leave_balance TYPE NUMERIC(5,2);
        `);
        console.log('leave_balances table columns changed to NUMERIC(5,2).');

        console.log('Migration Complete.');
        process.exit(0);
    } catch (err) {
        console.error('Migration Failed:', err);
        process.exit(1);
    }
};

migrate();
