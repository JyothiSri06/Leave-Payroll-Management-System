import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Calendar, FileText, MessageCircle, Clock } from 'lucide-react';

export default function EmployeePortal() {
    const { user } = useAuth();
    const [payslip, setPayslip] = useState(null);
    const [balances, setBalances] = useState({ sick_leave_balance: 0, casual_leave_balance: 0, earned_leave_balance: 0 });
    const [leaveHistory, setLeaveHistory] = useState([]);
    const [chatQuery, setChatQuery] = useState('');
    const [chatResponse, setChatResponse] = useState('');
    const [leaveReason, setLeaveReason] = useState('');

    // Attendance State
    const [attendanceStatus, setAttendanceStatus] = useState('LOADING'); // NOT_CHECKED_IN, CHECKED_IN, CHECKED_OUT
    const [attendanceData, setAttendanceData] = useState(null);
    const [attendanceHistory, setAttendanceHistory] = useState([]);
    const [attendanceStats, setAttendanceStats] = useState({ percentage: 0, presentDays: 0, workingDays: 0 });

    React.useEffect(() => {
        if (user) {
            fetchEmployeeData();
        }
    }, [user]);

    const fetchEmployeeData = () => {
        // Get Payslip
        axios.get(`/api/payroll/latest/${user.id}`)
            .then(res => setPayslip(res.data))
            .catch(err => setPayslip(null));

        // Get Leave Balance
        axios.get(`/api/leaves/balance/${user.id}`)
            .then(res => setBalances(res.data))
            .catch(err => console.error(err));

        // Get Leave History
        axios.get(`/api/leaves/${user.id}`)
            .then(res => setLeaveHistory(res.data))
            .catch(err => console.error(err));

        // Get Attendance Status
        axios.get(`/api/attendance/status/${user.id}`)
            .then(res => {
                setAttendanceStatus(res.data.status);
                setAttendanceData(res.data.data);
            })
            .catch(err => console.error(err));

        // Get Attendance History
        axios.get(`/api/attendance/${user.id}`)
            .then(res => setAttendanceHistory(res.data))
            .catch(err => console.error(err));

        // Get Attendance Statistics
        axios.get(`/api/attendance/stats/${user.id}`)
            .then(res => setAttendanceStats(res.data))
            .catch(err => console.error(err));
    };

    const handleChat = async (e) => {
        e.preventDefault();
        if (!chatQuery) return;

        try {
            const res = await axios.post('/api/payroll/chat', { query: chatQuery });
            setChatResponse(res.data.answer);
        } catch (err) {
            console.error(err);
            setChatResponse("Error connecting to AI bot.");
        }
    };

    const handleLeaveRequest = async (type) => {
        if (!leaveReason) {
            alert('Please provide a reason');
            return;
        }

        try {
            await axios.post('/api/leaves', {
                employee_id: user.id, // Use Logged-in User ID
                leave_type: type === 'Sick' ? 'SICK' : 'CASUAL',
                start_date: new Date().toISOString().split('T')[0],
                end_date: new Date().toISOString().split('T')[0],
                days_count: 1,
                reason: leaveReason
            });
            alert(`${type} Leave Requested Successfully!`);
            setLeaveReason('');
            // Refresh history
            axios.get(`/api/leaves/${user.id}`).then(res => setLeaveHistory(res.data));
        } catch (err) {
            console.error(err);
            alert('Error requesting leave');
        }
    };

    const handleClockIn = async () => {
        try {
            const res = await axios.post('/api/attendance/checkin', { employeeId: user.id });
            setAttendanceData(res.data);
            setAttendanceStatus('CHECKED_IN');
            fetchEmployeeData(); // Refresh history
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.error || 'Error checking in');
        }
    };

    const handleClockOut = async () => {
        try {
            const res = await axios.post('/api/attendance/checkout', { employeeId: user.id });
            setAttendanceData(res.data);
            setAttendanceStatus('CHECKED_OUT');
            fetchEmployeeData(); // Refresh history
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.error || 'Error checking out');
        }
    };

    return (
        <div className="p-4 max-w-md mx-auto md:max-w-4xl">
            <h2 className="text-2xl font-bold mb-6">My Portal</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                <div className="space-y-6">
                    {/* Attendance Card */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 transition-colors">
                        <div className="flex items-center gap-2 mb-4 text-indigo-600 dark:text-indigo-400">
                            <Clock size={20} />
                            <h3 className="font-semibold">Today's Attendance</h3>
                        </div>
                        <div className="text-center">
                            {attendanceStatus === 'NOT_CHECKED_IN' && (
                                <button
                                    onClick={handleClockIn}
                                    className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold shadow-lg hover:bg-indigo-700 transition"
                                >
                                    Clock In
                                </button>
                            )}
                            {attendanceStatus === 'CHECKED_IN' && (
                                <div className="space-y-3">
                                    <div className="text-gray-500 dark:text-gray-400">You clocked in at:</div>
                                    <div className="text-2xl font-bold text-gray-800 dark:text-slate-100">
                                        {new Date(attendanceData?.clock_in).toLocaleTimeString()}
                                    </div>
                                    <button
                                        onClick={handleClockOut}
                                        className="w-full bg-red-500 text-white py-3 rounded-lg font-bold shadow-lg hover:bg-red-600 transition"
                                    >
                                        Clock Out
                                    </button>
                                </div>
                            )}
                            {attendanceStatus === 'CHECKED_OUT' && (
                                <div className="space-y-2">
                                    <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 p-3 rounded-lg font-medium">
                                        Attendance Completed
                                    </div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400 flex justify-between px-4">
                                        <span>In: {new Date(attendanceData?.clock_in).toLocaleTimeString()}</span>
                                        <span>Out: {new Date(attendanceData?.clock_out).toLocaleTimeString()}</span>
                                    </div>
                                    {attendanceData?.late_minutes > 0 && (
                                        <div className="text-xs text-red-500">Late by {attendanceData.late_minutes} mins</div>
                                    )}
                                    {Number(attendanceData?.overtime_hours) > 0 && (
                                        <div className="text-xs text-green-500">Overtime: {Number(attendanceData.overtime_hours).toFixed(2)} hrs</div>
                                    )}
                                </div>
                            )}
                            {attendanceStatus === 'LOADING' && <div className="text-gray-400">Loading status...</div>}
                        </div>

                        {/* Attendance Percentage Metric */}
                        <div className="mt-6 pt-6 border-t dark:border-slate-800">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm text-gray-500 dark:text-slate-400 font-medium">Monthly Presence</span>
                                <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{attendanceStats.percentage}%</span>
                            </div>
                            <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                                <div
                                    className="bg-indigo-600 h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(79,70,229,0.3)]"
                                    style={{ width: `${attendanceStats.percentage}%` }}
                                ></div>
                            </div>
                            <div className="flex justify-between mt-2 text-[10px] text-gray-400 uppercase tracking-wider">
                                <span>{attendanceStats.presentDays} Days Present</span>
                                <span>{attendanceStats.workingDays} Work Days</span>
                            </div>
                        </div>
                    </div>

                    {/* Leave Balances */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 transition-colors">
                        <div className="flex items-center gap-2 mb-4 text-purple-600 dark:text-purple-400">
                            <Calendar size={20} />
                            <h3 className="font-semibold">Leave Balances</h3>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-purple-50 p-2 rounded">
                                <div className="text-xl font-bold text-purple-700">{balances.sick_leave_balance}</div>
                                <div className="text-xs text-purple-500">Sick</div>
                            </div>
                            <div className="bg-blue-50 p-2 rounded">
                                <div className="text-xl font-bold text-blue-700">{balances.casual_leave_balance}</div>
                                <div className="text-xs text-blue-500">Casual</div>
                            </div>
                            <div className="bg-orange-50 p-2 rounded">
                                <div className="text-xl font-bold text-orange-700">{balances.earned_leave_balance}</div>
                                <div className="text-xs text-orange-500">Earned</div>
                            </div>
                        </div>
                    </div>

                    {/* Leave Request Card */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 transition-colors">
                        <div className="flex items-center gap-2 mb-4 text-orange-600 dark:text-orange-400">
                            <Calendar size={20} />
                            <h3 className="font-semibold">Request Leave</h3>
                        </div>
                        <textarea
                            className="w-full p-2 border rounded-lg mb-3 bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-slate-100"
                            placeholder="Reason for leave..."
                            value={leaveReason}
                            onChange={(e) => setLeaveReason(e.target.value)}
                        />
                        <div className="flex gap-2">
                            <button onClick={() => handleLeaveRequest('Sick')} className="flex-1 bg-orange-100 text-orange-700 py-2 rounded-lg font-medium hover:bg-orange-200">Sick Leave</button>
                            <button onClick={() => handleLeaveRequest('Casual')} className="flex-1 bg-blue-100 text-blue-700 py-2 rounded-lg font-medium hover:bg-blue-200">Casual Leave</button>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    {/* Payslip Card */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 transition-colors">
                        <div className="flex items-center gap-2 mb-4 text-green-600 dark:text-green-400">
                            <FileText size={20} />
                            <h3 className="font-semibold">Recent Payslip</h3>
                        </div>
                        {payslip ? (
                            <>
                                <div className="space-y-3" id="printable-payslip">
                                    <div className="flex justify-between border-b dark:border-slate-700 pb-2">
                                        <span className="text-gray-600 dark:text-slate-400">Period Ends</span>
                                        <span className="font-medium dark:text-slate-100">{new Date(payslip.pay_period_end).toLocaleDateString()}</span>
                                    </div>

                                    {/* Earnings */}
                                    <div className="border-b pb-2 space-y-1">
                                        <div className="text-xs font-semibold text-gray-500 uppercase">Earnings</div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">Basic Salary</span>
                                            <span>${Number(payslip.basic_pay || 0).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">HRA</span>
                                            <span>${Number(payslip.hra_pay || 0).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">Special Allowance</span>
                                            <span>${Number(payslip.special_allowance_pay || 0).toFixed(2)}</span>
                                        </div>
                                        {Number(payslip.bonus) > 0 && (
                                            <div className="flex justify-between text-green-600 font-medium text-sm">
                                                <span>Bonus</span>
                                                <span>+${Number(payslip.bonus).toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between font-medium pt-1 border-t border-dashed dark:border-slate-700">
                                            <span className="dark:text-slate-100">Gross Pay</span>
                                            <span className="dark:text-slate-100">${Number(payslip.gross_pay).toFixed(2)}</span>
                                        </div>
                                    </div>

                                    {/* Deductions */}
                                    <div className="border-b pb-2 space-y-1">
                                        <div className="text-xs font-semibold text-gray-500 uppercase">Deductions</div>
                                        <div className="flex justify-between text-red-500 text-sm">
                                            <span>Provident Fund (PF)</span>
                                            <span>-${Number(payslip.pf_deduction || 0).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-red-500 text-sm">
                                            <span>Professional Tax</span>
                                            <span>-${Number(payslip.professional_tax_deduction || 0).toFixed(2)}</span>
                                        </div>
                                        {Number(payslip.esi_deduction) > 0 && (
                                            <div className="flex justify-between text-red-500 text-sm">
                                                <span>ESI</span>
                                                <span>-${Number(payslip.esi_deduction).toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between text-red-500 text-sm">
                                            <span>Income Tax (TDS)</span>
                                            <span>-${Number(payslip.income_tax_deduction || payslip.tax_deducted || 0).toFixed(2)}</span>
                                        </div>
                                        {Number(payslip.manual_deductions) > 0 && (
                                            <div className="flex justify-between text-red-500 font-medium text-sm">
                                                <span>Other Deductions</span>
                                                <span>-${Number(payslip.manual_deductions).toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between text-red-600 font-medium pt-1 border-t border-dashed">
                                            <span>Total Deductions</span>
                                            <span>-${Number(payslip.deductions).toFixed(2)}</span>
                                        </div>
                                    </div>

                                    <div className="flex justify-between pt-2 font-bold text-lg">
                                        <span>Net Pay</span>
                                        <span>${Number(payslip.net_pay).toFixed(2)}</span>
                                    </div>
                                    <div className={`mt-2 p-2 text-center rounded text-sm font-medium ${payslip.status === 'PAID' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                        }`}>
                                        Status: {payslip.status}
                                    </div>
                                </div>
                                <button
                                    onClick={() => window.print()}
                                    className="w-full mt-4 border border-green-600 text-green-600 dark:text-green-400 dark:border-green-400 py-2 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition"
                                >
                                    Download / Print
                                </button>
                            </>
                        ) : (
                            <div className="text-center py-8 text-gray-500">
                                No recent payslip found.
                            </div>
                        )}
                    </div>

                    {/* AI Chat Widget */}
                    <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-xl border border-blue-100 dark:border-blue-900/30 transition-colors">
                        <div className="flex items-center gap-2 mb-4 text-blue-700 dark:text-blue-400">
                            <MessageCircle size={20} />
                            <h3 className="font-semibold">AI Assistant</h3>
                        </div>
                        <form onSubmit={handleChat} className="flex gap-2 mb-4">
                            <input
                                type="text"
                                className="flex-1 p-2 rounded-lg border border-blue-200"
                                placeholder="Ask about tax, salary..."
                                value={chatQuery}
                                onChange={(e) => setChatQuery(e.target.value)}
                            />
                            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg">Ask</button>
                        </form>
                        {chatResponse && (
                            <div className="bg-white dark:bg-slate-800 p-3 rounded-lg text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap border dark:border-slate-700">
                                {chatResponse}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Attendance History */}
            <div className="mt-8 bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 transition-colors">
                <h3 className="font-semibold mb-4 text-gray-700 dark:text-slate-200">Attendance History</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b dark:border-slate-800 text-gray-500 dark:text-slate-400">
                                <th className="pb-2">Date</th>
                                <th className="pb-2">In</th>
                                <th className="pb-2">Out</th>
                                <th className="pb-2">Late</th>
                                <th className="pb-2">Overtime</th>
                            </tr>
                        </thead>
                        <tbody>
                            {attendanceHistory.map(record => (
                                <tr key={record.id} className="border-b last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/50 dark:border-slate-800">
                                    <td className="py-2 dark:text-slate-300">{new Date(record.date).toLocaleDateString()}</td>
                                    <td className="py-2 dark:text-slate-300">{new Date(record.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                    <td className="py-2 dark:text-slate-300">{record.clock_out ? new Date(record.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                                    <td className="py-2">
                                        {record.late_minutes > 0 ? (
                                            <span className="text-red-500 font-medium">{record.late_minutes}m</span>
                                        ) : '-'}
                                    </td>
                                    <td className="py-2">
                                        {Number(record.overtime_hours) > 0 ? (
                                            <span className="text-green-500 font-medium">{Number(record.overtime_hours).toFixed(1)}h</span>
                                        ) : '-'}
                                    </td>
                                </tr>
                            ))}
                            {attendanceHistory.length === 0 && (
                                <tr><td colSpan="5" className="text-center py-4 text-gray-500">No attendance history</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
