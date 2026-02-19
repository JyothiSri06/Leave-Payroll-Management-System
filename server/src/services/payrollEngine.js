/**
 * Payroll Engine
 * Calculates Net Pay based on Gross Salary, Unpaid Leaves, Tax Slabs, and EWA.
 */

const calculatePayroll = async (employee, payPeriodStart, payPeriodEnd, db, bonus = 0, manualDeduction = 0) => {
    // 1. Fetch Tax Configuration
    const taxSlabRes = await db.query('SELECT * FROM tax_configuration WHERE id = $1', [employee.tax_slab_id]);
    const taxSlab = taxSlabRes.rows[0];

    if (!taxSlab) {
        throw new Error('Tax Slab not found for employee');
    }

    // 2. Fetch Approved Leaves in this period
    const leavesRes = await db.query(`
    SELECT * FROM leave_ledger 
    WHERE employee_id = $1 
    AND status = 'APPROVED'
    AND start_date >= $2 
    AND end_date <= $3
  `, [employee.id, payPeriodStart, payPeriodEnd]);

    const leaves = leavesRes.rows;

    // Logic: Sum up 'lop_days' from all approved leaves in this period
    let totalLopDays = leaves.reduce((acc, leave) => acc + (parseFloat(leave.lop_days) || 0), 0);

    // 3. Fetch Attendance Records
    const attendanceRes = await db.query(`
        SELECT * FROM attendance 
        WHERE employee_id = $1 
        AND date >= $2 
        AND date <= $3
    `, [employee.id, payPeriodStart, payPeriodEnd]);

    const attendanceRecords = attendanceRes.rows;

    let totalOvertimeHours = 0;
    let lateCount = 0;

    attendanceRecords.forEach(record => {
        totalOvertimeHours += parseFloat(record.overtime_hours || 0);
        if (record.late_minutes > 15) { // 15 mins grace period
            lateCount++;
        }
    });

    // 4. Calculation
    // 4. Calculation - Indian Payroll Structure
    const daysInMonth = 30; // Standardize

    // Salary Components
    const basicSalary = parseFloat(employee.basic_salary) || 0;
    const hra = parseFloat(employee.hra) || 0;
    const specialAllowance = parseFloat(employee.special_allowance) || 0;

    // Fallback: If no components set, use legacy salary as Basic (or Gross)
    let monthlyFixedPay = basicSalary + hra + specialAllowance;
    if (monthlyFixedPay === 0) {
        monthlyFixedPay = parseFloat(employee.salary) || 0;
    }

    const perDayPay = monthlyFixedPay / daysInMonth;
    const hourlyRate = perDayPay / 8; // Assuming 8 hour work day

    // Late Deduction Rule: 3 lates = 1 day pay cut
    const lateDeductionDays = Math.floor(lateCount / 3);
    const lateDeductionAmount = lateDeductionDays * perDayPay;

    // Overtime Pay: 1.5x hourly rate
    const overtimePay = totalOvertimeHours * hourlyRate * 1.5;

    // LOP Deduction
    const leaveDeduction = totalLopDays * perDayPay;

    // Gross Pay Calculation
    // Gross = Fixed Components + Overtime + Bonus
    const grossPay = monthlyFixedPay + overtimePay + parseFloat(bonus);

    // --- Deductions ---

    // 1. Provident Fund (PF): 12% of Basic Salary
    const pfDeduction = basicSalary * 0.12;

    // 2. Professional Tax (PT): Slab based on Gross
    let ptDeduction = 0;
    if (grossPay > 20000) {
        ptDeduction = 200;
    } else if (grossPay > 15000) {
        ptDeduction = 150;
    }

    // 3. ESI: 0.75% of Gross if Gross <= 21000
    let esiDeduction = 0;
    if (grossPay <= 21000) {
        esiDeduction = grossPay * 0.0075;
    }

    // Total Statutory Deductions + LOP/Late + Manual Deduction
    const totalDeductionsWithoutTax = leaveDeduction + lateDeductionAmount + pfDeduction + ptDeduction + esiDeduction + parseFloat(manualDeduction);

    const taxableIncome = grossPay - totalDeductionsWithoutTax;

    // 4. TDS (Income Tax)
    // Simplified: (Taxable * Slab %) / 100
    const taxAmount = (taxableIncome > 0 ? taxableIncome : 0) * (parseFloat(taxSlab.tax_percentage) / 100);

    // 5. Fetch EWA (Earned Wage Access)
    const ewaDeduction = 0;

    const totalDeductions = totalDeductionsWithoutTax + taxAmount + ewaDeduction;
    const netPay = grossPay - totalDeductions;

    return {
        employee_id: employee.id,
        gross_pay: grossPay.toFixed(2),
        deductions: totalDeductions.toFixed(2),
        tax_deducted: taxAmount.toFixed(2),
        ewa_deductions: ewaDeduction.toFixed(2),
        net_pay: netPay.toFixed(2),
        pay_period_start: payPeriodStart,
        pay_period_end: payPeriodEnd,
        bonus: parseFloat(bonus).toFixed(2),
        manual_deductions: parseFloat(manualDeduction).toFixed(2),

        // Detailed Breakdown for Payroll Run Table
        basic_pay: basicSalary.toFixed(2),
        hra_pay: hra.toFixed(2),
        special_allowance_pay: specialAllowance.toFixed(2),
        pf_deduction: pfDeduction.toFixed(2),
        professional_tax_deduction: ptDeduction.toFixed(2),
        esi_deduction: esiDeduction.toFixed(2),
        income_tax_deduction: taxAmount.toFixed(2), // Same as tax_deducted

        details: {
            lop_days: totalLopDays,
            late_days_deduction: lateDeductionDays,
            overtime_hours: totalOvertimeHours,
            overtime_pay: overtimePay.toFixed(2),
            bonus: parseFloat(bonus).toFixed(2),
            manual_deduction: parseFloat(manualDeduction).toFixed(2),
            pf: pfDeduction.toFixed(2),
            pt: ptDeduction.toFixed(2),
            esi: esiDeduction.toFixed(2)
        }
    };
};

module.exports = { calculatePayroll };
