import React from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
);

import { useTheme } from '../context/ThemeContext';

export const DashboardCharts = ({ payrollHistory, leaveStats }) => {
    const { isDarkMode } = useTheme();

    const textColor = isDarkMode ? '#e2e8f0' : '#1e293b';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    const commonOptions = {
        responsive: true,
        plugins: {
            legend: {
                labels: { color: textColor }
            },
        },
        scales: {
            x: {
                ticks: { color: textColor },
                grid: { color: gridColor }
            },
            y: {
                ticks: { color: textColor },
                grid: { color: gridColor }
            }
        }
    };

    // Payroll Trends Data (Last 6 Months)
    const payrollLabels = payrollHistory.map(p => p.month); // Assuming payrollHistory is sorted
    const payrollData = {
        labels: payrollLabels,
        datasets: [
            {
                label: 'Total Net Pay',
                data: payrollHistory.map(p => p.totalNetPay),
                backgroundColor: 'rgba(53, 162, 235, 0.5)',
            },
        ],
    };

    // Leave Stats Data
    const leaveData = {
        labels: ['Sick', 'Casual', 'Earned', 'LOP'],
        datasets: [
            {
                label: '# of Days',
                data: [
                    leaveStats.sick || 0,
                    leaveStats.casual || 0,
                    leaveStats.earned || 0,
                    leaveStats.lop || 0,
                ],
                backgroundColor: [
                    'rgba(255, 99, 132, 0.2)',
                    'rgba(54, 162, 235, 0.2)',
                    'rgba(255, 206, 86, 0.2)',
                    'rgba(75, 192, 192, 0.2)',
                ],
                borderColor: [
                    'rgba(255, 99, 132, 1)',
                    'rgba(54, 162, 235, 1)',
                    'rgba(255, 206, 86, 1)',
                    'rgba(75, 192, 192, 1)',
                ],
                borderWidth: 1,
            },
        ],
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-md border border-gray-100 dark:border-slate-800 transition-colors">
                <h3 className="text-lg font-bold mb-4 dark:text-slate-100">Payroll Trends</h3>
                <Bar options={commonOptions} data={payrollData} />
            </div>
            <div className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-md border border-gray-100 dark:border-slate-800 transition-colors">
                <h3 className="text-lg font-bold mb-4 dark:text-slate-100">Leave Distribution</h3>
                <Pie options={{
                    responsive: true,
                    plugins: {
                        legend: {
                            labels: { color: textColor }
                        }
                    }
                }} data={leaveData} />
            </div>
        </div>
    );
};
