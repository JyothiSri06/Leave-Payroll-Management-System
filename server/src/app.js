const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const employeesRouter = require('./routes/employees');
const payrollRouter = require('./routes/payroll');
const leavesRouter = require('./routes/leaves');
const authRouter = require('./routes/auth');
const attendanceRouter = require('./routes/attendance');

const { initCronJobs } = require('./jobs/cronJobs');

const app = express();

// Initialize Cron Jobs
initCronJobs();

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());

const { verifyToken } = require('./middleware/authMiddleware');

// Routes
app.use('/api/auth', authRouter); // Public

// Protected Routes
app.use('/api/employees', verifyToken, employeesRouter);
app.use('/api/payroll', verifyToken, payrollRouter);
app.use('/api/leaves', verifyToken, leavesRouter);
app.use('/api/attendance', verifyToken, attendanceRouter);

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date() });
});

// Error Handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
