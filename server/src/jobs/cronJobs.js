const cron = require('node-cron');
const { accrueLeaveBalances } = require('../services/leaveAccrualService');

/**
 * Initializes all cron jobs for the application.
 */
const initCronJobs = () => {
    console.log('[CronSystem] Initializing scheduled jobs...');

    // Schedule: 1st day of every month at midnight (00:00)
    // Format: minute hour day-of-month month day-of-week
    cron.schedule('0 0 1 * *', async () => {
        console.log('[CronSystem] Running Monthly Leave Accrual Job...');
        try {
            await accrueLeaveBalances();
            console.log('[CronSystem] Monthly Leave Accrual Job completed successfully.');
        } catch (err) {
            console.error('[CronSystem] Monthly Leave Accrual Job failed:', err);
        }
    });

    console.log('[CronSystem] Jobs scheduled: [Monthly Leave Accrual]');
};

module.exports = { initCronJobs };
