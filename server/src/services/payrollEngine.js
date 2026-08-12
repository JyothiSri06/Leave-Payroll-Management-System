/**
 * Automated Payroll Engine Service
 * Calculates Net Pay based on Basic Salary, HRA, Special Allowance, Unpaid Leaves (LOP),
 * Attendance (Late deductions & Overtime pay), Tax Slabs (TDS), PF, PT, ESI, and Bonuses/Deductions.
 */

const calculatePayroll = async (employee, payPeriodStart, payPeriodEnd, dbClient, bonus = 0, manualDeduction = 0) => {
    const tenantId = employee.tenant_id;

    // 1. Fetch Tax Configuration
    const taxSlabRes = await dbClient.query('SELECT * FROM tax_configuration WHERE id = $1', [employee.tax_slab_id || 1]);
    let taxSlab = taxSlabRes.rows[0];

    if (!taxSlab) {
        // Fallback default tax slab if configuration is missing
        taxSlab = { min_salary: 0, max_salary: 1000000, tax_percentage: 10 };
    }

    // 2. Fetch Approved Leaves for Employee within Pay Period (Tenant Isolated)
    const leavesRes = await dbClient.query(`
        SELECT * FROM leave_ledger 
        WHERE tenant_id = $1
        AND employee_id = $2 
        AND status = 'APPROVED'
        AND start_date >= $3 
        AND end_date <= $4
    `, [tenantId, employee.id, payPeriodStart, payPeriodEnd]);

    const leaves = leavesRes.rows;
    let totalLopDays = leaves.reduce((acc, leave) => acc + (parseFloat(leave.lop_days) || 0), 0);

    // 3. Fetch Attendance Records for Employee within Pay Period (Tenant Isolated)
    const attendanceRes = await dbClient.query(`
        SELECT * FROM attendance 
        WHERE tenant_id = $1
        AND employee_id = $2 
        AND date >= $3 
        AND date <= $4
    `, [tenantId, employee.id, payPeriodStart, payPeriodEnd]);

    const attendanceRecords = attendanceRes.rows;
    let totalOvertimeHours = 0;
    let lateCount = 0;

    attendanceRecords.forEach(record => {
        totalOvertimeHours += parseFloat(record.overtime_hours || 0);
        if (record.late_minutes > 15) { // 15 mins grace period
            lateCount++;
        }
    });

    // 4. Calculations - Standardized Indian Payroll Model (30-day month)
    const daysInMonth = 30;

    const basicSalary = parseFloat(employee.basic_salary) || 0;
    const hra = parseFloat(employee.hra) || 0;
    const specialAllowance = parseFloat(employee.special_allowance) || 0;

    let monthlyFixedPay = basicSalary + hra + specialAllowance;
    if (monthlyFixedPay === 0) {
        monthlyFixedPay = parseFloat(employee.salary) || 50000;
    }

    const perDayPay = monthlyFixedPay / daysInMonth;
    const hourlyRate = perDayPay / 8;

    // Late Deduction Rule: 3 lates = 1 day pay deduction
    const lateDeductionDays = Math.floor(lateCount / 3);
    const lateDeductionAmount = lateDeductionDays * perDayPay;

    // Overtime Pay: 1.5x hourly rate
    const overtimePay = totalOvertimeHours * hourlyRate * 1.5;

    // LOP (Loss of Pay) Deduction
    const leaveDeduction = totalLopDays * perDayPay;

    // Gross Pay
    const grossPay = monthlyFixedPay + overtimePay + parseFloat(bonus || 0);

    // Statutory Deductions
    const pfDeduction = basicSalary * 0.12;

    let ptDeduction = 0;
    if (grossPay > 20000) {
        ptDeduction = 200;
    } else if (grossPay > 15000) {
        ptDeduction = 150;
    }

    let esiDeduction = 0;
    if (grossPay <= 21000) {
        esiDeduction = grossPay * 0.0075;
    }

    const totalDeductionsWithoutTax = leaveDeduction + lateDeductionAmount + pfDeduction + ptDeduction + esiDeduction + parseFloat(manualDeduction || 0);
    const taxableIncome = grossPay - totalDeductionsWithoutTax;

    const taxAmount = (taxableIncome > 0 ? taxableIncome : 0) * (parseFloat(taxSlab.tax_percentage) / 100);
    const ewaDeduction = 0;

    const totalDeductions = totalDeductionsWithoutTax + taxAmount + ewaDeduction;
    const netPay = Math.max(0, grossPay - totalDeductions);

    return {
        tenant_id: tenantId,
        employee_id: employee.id,
        gross_pay: grossPay.toFixed(2),
        deductions: totalDeductions.toFixed(2),
        tax_deducted: taxAmount.toFixed(2),
        ewa_deductions: ewaDeduction.toFixed(2),
        net_pay: netPay.toFixed(2),
        pay_period_start: payPeriodStart,
        pay_period_end: payPeriodEnd,
        bonus: parseFloat(bonus || 0).toFixed(2),
        manual_deductions: parseFloat(manualDeduction || 0).toFixed(2),

        basic_pay: basicSalary.toFixed(2),
        hra_pay: hra.toFixed(2),
        special_allowance_pay: specialAllowance.toFixed(2),
        pf_deduction: pfDeduction.toFixed(2),
        professional_tax_deduction: ptDeduction.toFixed(2),
        esi_deduction: esiDeduction.toFixed(2),
        income_tax_deduction: taxAmount.toFixed(2),

        details: {
            lop_days: totalLopDays,
            late_days_deduction: lateDeductionDays,
            overtime_hours: totalOvertimeHours,
            overtime_pay: overtimePay.toFixed(2),
            bonus: parseFloat(bonus || 0).toFixed(2),
            manual_deduction: parseFloat(manualDeduction || 0).toFixed(2),
            pf: pfDeduction.toFixed(2),
            pt: ptDeduction.toFixed(2),
            esi: esiDeduction.toFixed(2)
        }
    };
};

module.exports = { calculatePayroll };
