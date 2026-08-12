const db = require('../utils/db');
const { logAuditEvent } = require('../utils/auditLogger');

const accrualRates = {
    SICK: 1.0,
    CASUAL: 1.0,
    EARNED: 1.25
};

/**
 * Accrues leave balances for all active employees across tenants atomically.
 * Runs on the 1st of every month.
 */
const accrueLeaveBalances = async () => {
    const year = new Date().getFullYear();
    const startTime = new Date();

    console.log(`[LeaveAccrualService] Starting multi-tenant leave accrual for year ${year}...`);

    try {
        await db.withTransaction(async (client) => {
            const employeesRes = await client.query(
                "SELECT id, tenant_id FROM employees WHERE status = 'ACTIVE'"
            );
            const employees = employeesRes.rows;

            let processed = 0;
            let initialized = 0;

            for (const emp of employees) {
                // Lock balance row if exists to prevent race conditions during concurrent leave applications
                const balanceRes = await client.query(
                    'SELECT * FROM leave_balances WHERE tenant_id = $1 AND employee_id = $2 AND year = $3 FOR UPDATE',
                    [emp.tenant_id, emp.id, year]
                );

                if (balanceRes.rows.length === 0) {
                    await client.query(`
                        INSERT INTO leave_balances (tenant_id, employee_id, year, sick_leave_balance, casual_leave_balance, earned_leave_balance)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, [emp.tenant_id, emp.id, year, accrualRates.SICK, accrualRates.CASUAL, accrualRates.EARNED]);
                    initialized++;
                } else {
                    await client.query(`
                        UPDATE leave_balances 
                        SET sick_leave_balance = sick_leave_balance + $1,
                            casual_leave_balance = casual_leave_balance + $2,
                            earned_leave_balance = earned_leave_balance + $3,
                            last_updated = CURRENT_TIMESTAMP
                        WHERE tenant_id = $4 AND employee_id = $5 AND year = $6
                    `, [accrualRates.SICK, accrualRates.CASUAL, accrualRates.EARNED, emp.tenant_id, emp.id, year]);
                }
                processed++;
            }

            await logAuditEvent({
                tenant_id: null,
                table_name: 'leave_balances',
                record_id: 'SYSTEM_BULK_ACCRUAL',
                action: 'MONTHLY_LEAVE_ACCRUAL',
                new_value: { year, processedEmployees: processed, initializedCount: initialized },
                changed_by: 'CRON_JOB'
            }, client);

            const duration = (new Date() - startTime) / 1000;
            console.log(`[LeaveAccrualService] Monthly Accrual Completed. Processed: ${processed}, Initialized: ${initialized}. Duration: ${duration}s`);
        });
    } catch (err) {
        console.error('[LeaveAccrualService] Error during accrual execution:', err);
        throw err;
    }
};

module.exports = { accrueLeaveBalances };
