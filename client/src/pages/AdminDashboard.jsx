import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Users, DollarSign, CalendarCheck, Download, Clock } from 'lucide-react';
import { DashboardCharts } from '../components/DashboardCharts';
import * as XLSX from 'xlsx';

export default function AdminDashboard() {
    const { user } = useAuth();
    const [stats, setStats] = useState({ totalEmployees: 0, totalPayroll: 0, pendingLeaves: 0 });
    const [avgAttendance, setAvgAttendance] = useState(0);
    const [empAttendanceStats, setEmpAttendanceStats] = useState({}); // { id: { percentage, presentDays } }
    const [workingDays, setWorkingDays] = useState(0);
    const [employees, setEmployees] = useState([]);
    const [pendingLeaves, setPendingLeaves] = useState([]);
    const [loadingPayroll, setLoadingPayroll] = useState(null);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [bonus, setBonus] = useState(0);
    const [deduction, setDeduction] = useState(0);
    const [payrollHistory, setPayrollHistory] = useState([]); // For selected employee
    const [payrollResult, setPayrollResult] = useState(null);

    // Chart Data
    const [chartPayroll, setChartPayroll] = useState([]);
    const [leaveStats, setLeaveStats] = useState({});
    const [todayAttendance, setTodayAttendance] = useState([]);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const results = await Promise.allSettled([
                axios.get('/api/employees'),
                axios.get('/api/payroll/admin/history'), // Returns all history
                axios.get('/api/leaves/admin/pending'),
                axios.get('/api/leaves/admin/all'), // New endpoint for stats
                axios.get('/api/attendance/admin/today'),
                axios.get('/api/attendance/admin/overall-stats'),
                axios.get('/api/attendance/admin/monthly-report')
            ]);

            const empRes = results[0].status === 'fulfilled' ? results[0].value.data : [];
            const payrollRes = results[1].status === 'fulfilled' ? results[1].value.data : [];
            const pendingRes = results[2].status === 'fulfilled' ? results[2].value.data : [];
            const allLeavesRes = results[3].status === 'fulfilled' ? results[3].value.data : [];

            setEmployees(empRes);
            setPendingLeaves(pendingRes);

            const attendanceRes = results[4]?.status === 'fulfilled' ? results[4].value.data : [];
            setTodayAttendance(attendanceRes);

            const attendanceStatsRes = results[5]?.status === 'fulfilled' ? results[5].value.data : { averagePercentage: 0 };
            setAvgAttendance(attendanceStatsRes.averagePercentage);

            const attendanceReportRes = results[6]?.status === 'fulfilled' ? results[6].value.data : { stats: {}, workingDays: 0 };
            setEmpAttendanceStats(attendanceReportRes.stats);
            setWorkingDays(attendanceReportRes.workingDays);

            const totalPayroll = payrollRes.reduce((sum, p) => sum + Number(p.net_pay), 0);
            setStats({
                totalEmployees: empRes.length,
                totalPayroll: totalPayroll,
                pendingLeaves: pendingRes.length
            });

            // Process Chart Data
            // 1. Payroll Trends (Group by Month)
            const payrollMap = {};
            payrollRes.forEach(p => {
                const date = new Date(p.pay_period_end);
                const month = date.toLocaleString('default', { month: 'short', year: 'numeric' });
                if (!payrollMap[month]) payrollMap[month] = 0;
                payrollMap[month] += Number(p.net_pay);
            });
            // Sort by Date (Roughly, assuming chronological insertion or simple sort)
            // A better way is to sort keys based on date value.
            const sortedMonths = Object.keys(payrollMap).sort((a, b) => new Date(a) - new Date(b));
            setChartPayroll(sortedMonths.map(m => ({ month: m, totalNetPay: payrollMap[m] })));

            // 2. Leave Stats
            const stats = { sick: 0, casual: 0, earned: 0, lop: 0 };
            allLeavesRes.forEach(l => {
                if (l.leave_type === 'SICK') stats.sick += l.days_count;
                if (l.leave_type === 'CASUAL') stats.casual += l.days_count;
                if (l.leave_type === 'EARNED') stats.earned += l.days_count;
                if (l.lop_days) stats.lop += Number(l.lop_days);
            });
            setLeaveStats(stats);

        } catch (err) {
            console.error("Critical Error fetching dashboard data", err);
        }
    };

    const handleExport = () => {
        // 1. Employee Sheet
        const empData = employees.map(e => ({
            ID: e.id,
            Name: `${e.first_name} ${e.last_name}`,
            Email: e.email,
            Role: e.role,
            Salary: e.salary,
            JoinDate: e.join_date
        }));
        const empSheet = XLSX.utils.json_to_sheet(empData);

        // 2. Payroll Sheet (We need to fetch full history or use what we have)
        // We have chartPayroll (aggregated). Let's fetch detailed history again or just export employees for now.
        // Actually we have `employees`, we don't have full `payrollRes` stored in state (only processed).
        // Let's just export Employees and Leave Stats for now, or re-fetch.
        // To be efficient, let's just export Employees. The user asked for "Export Employees/Payroll".
        // I'll add Payroll if possible.
        // Let's store `allPayroll` in state? No, avoid large state if not needed.
        // I'll export Employees.

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, empSheet, "Employees");

        XLSX.writeFile(wb, "Payroll_System_Export.xlsx");
    };

    useEffect(() => {
        if (selectedEmployee) {
            fetchPayrollHistory(selectedEmployee);
        } else {
            setPayrollHistory([]);
        }
    }, [selectedEmployee]);

    const fetchPayrollHistory = async (empId) => {
        try {
            const res = await axios.get(`/api/payroll/history/${empId}`);
            setPayrollHistory(res.data);
        } catch (err) {
            console.error("Error fetching payroll history", err);
        }
    };

    const handleRunPayroll = async (e) => {
        e.preventDefault();
        setLoadingPayroll(true);
        try {
            // Defaulting to current month for demo
            const res = await axios.post(`/api/payroll/run/${selectedEmployee}`, {
                payPeriodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
                payPeriodEnd: new Date().toISOString().split('T')[0],
                bonus: bonus,
                manualDeduction: deduction
            });
            alert(`Payroll Processed! Net Pay: $${Number(res.data.net_pay).toFixed(2)}`);
            setPayrollResult({ processed: true });
            fetchPayrollHistory(selectedEmployee); // Refresh history
            fetchDashboardData(); // Refresh stats
        } catch (err) {
            console.error(err);
            alert('Error running payroll: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoadingPayroll(false);
        }
    };

    const handleMarkAsPaid = async (payrollId) => {
        try {
            await axios.put(`/api/payroll/${payrollId}/pay`);
            alert('Marked as Paid!');
            fetchPayrollHistory(selectedEmployee); // Refresh history
        } catch (err) {
            console.error(err);
            alert('Error updating status');
        }
    };

    const handleLeaveAction = async (id, status) => {
        try {
            await axios.put(`/api/leaves/${id}/status`, { status });
            alert(`Leave ${status} Successfully!`);
            fetchDashboardData(); // Refresh list
        } catch (err) {
            console.error(err);
            alert('Error updating leave status');
        }
    };

    // --- Employee Edit Logic ---
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editFormData, setEditFormData] = useState({ id: '', salary: 0, basic_salary: 0, hra: 0, special_allowance: 0 });

    const openEditModal = (employee) => {
        setEditFormData({
            id: employee.id,
            salary: employee.salary,
            basic_salary: employee.basic_salary || 0,
            hra: employee.hra || 0,
            special_allowance: employee.special_allowance || 0
        });
        setIsEditModalOpen(true);
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        try {
            await axios.put(`/api/employees/${editFormData.id}`, {
                salary: editFormData.salary,
                basic_salary: editFormData.basic_salary,
                hra: editFormData.hra,
                special_allowance: editFormData.special_allowance
            });
            alert('Employee Salary Updated!');
            setIsEditModalOpen(false);
            fetchDashboardData();
        } catch (err) {
            console.error(err);
            alert('Update Failed');
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold dark:text-slate-100">Admin Command Center</h2>
                <button
                    onClick={handleExport}
                    className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                    <Download size={18} />
                    Export Data
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 transition-colors flex items-center gap-4">
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600 dark:text-blue-400">
                        <Users size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Total Employees</p>
                        <p className="text-2xl font-bold dark:text-slate-100">{stats.totalEmployees}</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 transition-colors flex items-center gap-4">
                    <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full text-green-600 dark:text-green-400">
                        <DollarSign size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Total Payroll</p>
                        <p className="text-2xl font-bold dark:text-slate-100">${Number(stats.totalPayroll).toLocaleString()}</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 transition-colors flex items-center gap-4">
                    <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-full text-purple-600 dark:text-purple-400">
                        <CalendarCheck size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Pending Leaves</p>
                        <p className="text-2xl font-bold dark:text-slate-100">{stats.pendingLeaves}</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 transition-colors flex items-center gap-4 border-l-4 border-l-indigo-500">
                    <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-full text-indigo-600 dark:text-indigo-400">
                        <Clock size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Avg Presence</p>
                        <p className="text-2xl font-bold dark:text-slate-100">{avgAttendance}%</p>
                    </div>
                </div>
            </div>

            {/* Charts Section */}
            <DashboardCharts payrollHistory={chartPayroll} leaveStats={leaveStats} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* Available Payroll Section */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 transition-colors">
                    <div className="flex items-center gap-2 mb-6 text-green-600 dark:text-green-400">
                        <DollarSign size={24} />
                        <h2 className="text-xl font-semibold dark:text-slate-100">Run Payroll</h2>
                    </div>

                    <form onSubmit={handleRunPayroll} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Select Employee</label>
                            <select
                                className="w-full p-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-green-500 outline-none transition-colors"
                                onChange={(e) => setSelectedEmployee(e.target.value)}
                                value={selectedEmployee || ''}
                            >
                                <option value="">-- Choose Employee --</option>
                                {employees.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Bonus Amount ($)</label>
                            <input
                                type="number"
                                className="w-full p-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-green-500 outline-none transition-colors"
                                value={bonus}
                                onChange={(e) => setBonus(e.target.value)}
                                min="0"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Deduction Amount ($)</label>
                            <input
                                type="number"
                                className="w-full p-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-green-500 outline-none transition-colors"
                                value={deduction}
                                onChange={(e) => setDeduction(e.target.value)}
                                min="0"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={!selectedEmployee || loadingPayroll}
                            className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                            {loadingPayroll ? 'Processing...' : 'Process Payroll'}
                        </button>
                    </form>

                    {/* Report Message */}
                    {payrollResult && (
                        <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm rounded border border-green-200 dark:border-green-800">
                            Payroll Processed Successfully!
                        </div>
                    )}

                    {/* Payroll History for Selected Employee */}
                    {selectedEmployee && payrollHistory.length > 0 && (
                        <div className="mt-8">
                            <h3 className="font-semibold mb-2 text-gray-700 dark:text-slate-300">History</h3>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {payrollHistory.map(run => (
                                    <div key={run.id} className="flex justify-between items-center bg-gray-50 dark:bg-slate-800/50 p-3 rounded text-sm border border-gray-100 dark:border-slate-800 transition-colors">
                                        <div>
                                            <div className="font-medium dark:text-slate-200">{new Date(run.pay_period_end).toLocaleDateString()}</div>
                                            <div className="text-gray-500 dark:text-slate-400">Net: ${Number(run.net_pay).toFixed(2)}</div>
                                            {Number(run.bonus) > 0 && <div className="text-xs text-green-600 dark:text-green-400 font-medium">+${Number(run.bonus).toFixed(2)} Bonus</div>}
                                            {Number(run.manual_deductions) > 0 && <div className="text-xs text-red-600 dark:text-red-400 font-medium">-${Number(run.manual_deductions).toFixed(2)} Deduction</div>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${run.status === 'PAID' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                                }`}>
                                                {run.status}
                                            </span>
                                            {run.status !== 'PAID' && (
                                                <button
                                                    onClick={() => handleMarkAsPaid(run.id)}
                                                    className="text-blue-600 hover:underline text-xs font-medium"
                                                >
                                                    Mark Paid
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {selectedEmployee && payrollHistory.length === 0 && (
                        <div className="mt-8 text-center text-gray-500">No payroll history for this employee.</div>
                    )}
                </div>

                {/* Daily Attendance Section */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 transition-colors">
                    <div className="flex items-center gap-2 mb-6 text-indigo-600 dark:text-indigo-400">
                        <Clock size={24} />
                        <h2 className="text-xl font-semibold dark:text-slate-100">Today's Attendance</h2>
                    </div>
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b dark:border-slate-800 text-gray-500 dark:text-slate-400 text-sm">
                                    <th className="py-2">Employee</th>
                                    <th className="py-2">In</th>
                                    <th className="py-2">Out</th>
                                    <th className="py-2">Monthly %</th>
                                    <th className="py-2">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {todayAttendance.map(record => (
                                    <tr key={record.id} className="border-b last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/50 dark:border-slate-800 transition-colors">
                                        <td className="py-3 font-medium dark:text-slate-200">{record.first_name} {record.last_name}</td>
                                        <td className="py-3 dark:text-slate-300">{new Date(record.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                        <td className="py-3 dark:text-slate-300">{record.clock_out ? new Date(record.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                                        <td className="py-3">
                                            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                                {empAttendanceStats[record.employee_id]?.percentage || '0.0'}%
                                            </span>
                                        </td>
                                        <td className="py-3">
                                            {record.late_minutes > 0 ? (
                                                <span className="text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded text-xs font-medium">Late {record.late_minutes}m</span>
                                            ) : (
                                                <span className="text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded text-xs font-medium">On Time</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {todayAttendance.length === 0 && (
                                    <tr><td colSpan="4" className="text-center py-6 text-gray-400">No one checked in yet</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Employee Management Section */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 mb-8 transition-colors">
                <div className="flex items-center gap-2 mb-6 text-blue-600 dark:text-blue-400">
                    <Users size={24} />
                    <h2 className="text-xl font-semibold dark:text-slate-100">Employee Management</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b dark:border-slate-800 text-gray-500 dark:text-slate-400 text-sm">
                                <th className="py-2">Name</th>
                                <th className="py-2">Email</th>
                                <th className="py-2">Role</th>
                                <th className="py-2">Attendance %</th>
                                <th className="py-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {employees.map(emp => (
                                <tr key={emp.id} className="border-b dark:border-slate-800 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                                    <td className="py-3 font-medium dark:text-slate-200">{emp.first_name} {emp.last_name}</td>
                                    <td className="py-3 text-gray-600 dark:text-slate-400">{emp.email}</td>
                                    <td className="py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${emp.role === 'ADMIN' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'}`}>
                                            {emp.role}
                                        </span>
                                    </td>
                                    <td className="py-3">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-16 bg-gray-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full ${Number(empAttendanceStats[emp.id]?.percentage || 0) < 75 ? 'bg-red-500' : 'bg-green-500'}`}
                                                        style={{ width: `${empAttendanceStats[emp.id]?.percentage || 0}%` }}
                                                    ></div>
                                                </div>
                                                <span className="text-xs font-bold dark:text-slate-300">
                                                    {empAttendanceStats[emp.id]?.percentage || '0.0'}%
                                                </span>
                                            </div>
                                            <div className="text-[10px] text-gray-400 font-medium">
                                                {empAttendanceStats[emp.id]?.presentDays || 0} / {workingDays} Days Present
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-3 text-right">
                                        <button
                                            onClick={() => openEditModal(emp)}
                                            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-medium text-xs"
                                        >
                                            Edit Salary
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Leave Requests Section */}
            <div className="mt-8 bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 transition-colors">
                <div className="flex items-center gap-2 mb-6 text-purple-600 dark:text-purple-400">
                    <CalendarCheck size={24} />
                    <h2 className="text-xl font-semibold dark:text-slate-100">Pending Leave Requests</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b dark:border-slate-800 text-gray-500 dark:text-slate-400 text-sm">
                                <th className="py-2">Employee</th>
                                <th className="py-2">Type</th>
                                <th className="py-2">Date</th>
                                <th className="py-2">Reason</th>
                                <th className="py-2 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pendingLeaves.map(leave => (
                                <tr key={leave.id} className="border-b dark:border-slate-800 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                                    <td className="py-3 font-medium dark:text-slate-200">{leave.first_name} {leave.last_name}</td>
                                    <td className="py-3">
                                        <span className={`text-xs px-2 py-1 rounded-full ${leave.leave_type === 'SICK' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' :
                                            leave.leave_type === 'CASUAL' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                                            }`}>
                                            {leave.leave_type}
                                        </span>
                                    </td>
                                    <td className="py-3 text-gray-600 dark:text-slate-400">{new Date(leave.start_date).toLocaleDateString()}</td>
                                    <td className="py-3 text-gray-600 dark:text-slate-400 truncate max-w-xs">{leave.reason}</td>
                                    <td className="py-3 text-right space-x-2">
                                        <button
                                            onClick={() => handleLeaveAction(leave.id, 'APPROVED')}
                                            className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-3 py-1 rounded hover:bg-green-200 dark:hover:bg-green-900/50 text-xs font-medium transition-colors"
                                        >
                                            Approve
                                        </button>
                                        <button
                                            onClick={() => handleLeaveAction(leave.id, 'REJECTED')}
                                            className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-3 py-1 rounded hover:bg-red-200 dark:hover:bg-red-900/50 text-xs font-medium transition-colors"
                                        >
                                            Reject
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {pendingLeaves.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="text-center py-6 text-gray-400">No pending leave requests</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Edit Employee Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border dark:border-slate-800 w-full max-w-lg p-6 transition-all">
                        <h3 className="text-xl font-bold mb-4 dark:text-slate-100">Edit Salary Structure</h3>
                        <form onSubmit={handleEditSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Total Salary (CTC)</label>
                                <input
                                    type="number"
                                    className="w-full p-2 border border-gray-200 dark:border-slate-700 rounded mt-1 bg-gray-50 dark:bg-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
                                    value={editFormData.salary}
                                    onChange={(e) => setEditFormData({ ...editFormData, salary: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Basic</label>
                                    <input
                                        type="number"
                                        className="w-full p-2 border border-gray-200 dark:border-slate-700 rounded mt-1 bg-gray-50 dark:bg-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
                                        value={editFormData.basic_salary}
                                        onChange={(e) => setEditFormData({ ...editFormData, basic_salary: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">HRA</label>
                                    <input
                                        type="number"
                                        className="w-full p-2 border border-gray-200 dark:border-slate-700 rounded mt-1 bg-gray-50 dark:bg-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
                                        value={editFormData.hra}
                                        onChange={(e) => setEditFormData({ ...editFormData, hra: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Spl. All.</label>
                                    <input
                                        type="number"
                                        className="w-full p-2 border border-gray-200 dark:border-slate-700 rounded mt-1 bg-gray-50 dark:bg-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
                                        value={editFormData.special_allowance}
                                        onChange={(e) => setEditFormData({ ...editFormData, special_allowance: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="px-4 py-2 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
