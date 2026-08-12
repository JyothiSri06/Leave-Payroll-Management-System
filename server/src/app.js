const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const db = require('./utils/db');
const cache = require('./utils/cache');

const employeesRouter = require('./routes/employees');
const payrollRouter = require('./routes/payroll');
const leavesRouter = require('./routes/leaves');
const authRouter = require('./routes/auth');
const attendanceRouter = require('./routes/attendance');

const { initCronJobs } = require('./jobs/cronJobs');

const app = express();

// Initialize Automated Pipeline Cron Jobs (Skip during test runs)
if (process.env.NODE_ENV !== 'test') {
    initCronJobs();
}

// Security & Logging Middleware
app.use(helmet());
app.use(cors({
    origin: (origin, callback) => {
        const allowed = [
            process.env.FRONTEND_URL,
            'http://localhost:5173'
        ].filter(Boolean);

        if (!origin || allowed.includes(origin) || origin.endsWith('.vercel.app')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

if (process.env.NODE_ENV !== 'test') {
    app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

app.use(express.json());

const { verifyToken } = require('./middleware/authMiddleware');

// Public Auth Endpoints
app.use('/api/auth', authRouter);

// Protected Multi-Tenant API Routes
app.use('/api/employees', verifyToken, employeesRouter);
app.use('/api/payroll', verifyToken, payrollRouter);
app.use('/api/leaves', verifyToken, leavesRouter);
app.use('/api/attendance', verifyToken, attendanceRouter);

// Enhanced Service Health & Reliability Monitoring Endpoint (Resume Claim #4)
app.get('/health', async (req, res) => {
    const healthStatus = {
        status: 'UP',
        timestamp: new Date().toISOString(),
        uptimeSeconds: process.uptime(),
        services: {
            database: 'UNKNOWN',
            cache: cache.isReady() ? 'CONNECTED' : 'FALLBACK_IN_MEMORY'
        }
    };

    try {
        const dbRes = await db.query('SELECT 1 as alive');
        if (dbRes.rows[0].alive === 1) {
            healthStatus.services.database = 'CONNECTED';
        }
    } catch (err) {
        healthStatus.services.database = 'DISCONNECTED';
        healthStatus.status = 'DEGRADED';
    }

    const httpCode = healthStatus.status === 'UP' ? 200 : 503;
    res.status(httpCode).json(healthStatus);
});

// Centralized Structured Error Handler
app.use((err, req, res, next) => {
    console.error(`[UnhandledError] ${err.name}: ${err.message}`, err.stack);
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        error: statusCode === 500 ? 'Internal Server Error' : err.message,
        timestamp: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 5000;

let server;
if (require.main === module && process.env.NODE_ENV !== 'test') {
    server = app.listen(PORT, () => {
        console.log(`[Server] Leave & Payroll System ERP running on port ${PORT}`);
    });

    const gracefulShutdown = (signal) => {
        console.log(`[Server] ${signal} signal received. Starting graceful shutdown...`);
        server.close(async () => {
            console.log('[Server] Closed out remaining HTTP connections.');
            try {
                if (db.pool) {
                    await db.pool.end();
                    console.log('[Server] PostgreSQL connection pool closed.');
                }
            } catch (err) {
                console.error('[Server] Error closing database pool:', err);
            }
            process.exit(0);
        });

        setTimeout(() => {
            console.error('[Server] Could not close connections in time, forcefully shutting down');
            process.exit(1);
        }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

module.exports = app;
