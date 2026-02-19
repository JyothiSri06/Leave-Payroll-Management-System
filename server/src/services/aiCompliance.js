const natural = require('natural');
const tokenizer = new natural.WordTokenizer();

/**
 * Simple AI Compliance Bot
 * Answers questions about tax and payroll.
 */
const processQuery = async (query, db) => {
    const tokens = tokenizer.tokenize(query.toLowerCase());

    // Intent Recognition (Simple Keyword Matching)

    if (tokens.includes('tax') || tokens.includes('slab') || tokens.includes('deduction')) {
        // Fetch tax slabs
        const res = await db.query('SELECT * FROM tax_configuration ORDER BY min_salary');
        let response = "Here are the current tax slabs:\n";
        res.rows.forEach(row => {
            response += `- Income ${row.min_salary} to ${row.max_salary}: ${row.tax_percentage}% (${row.region})\n`;
        });
        return response;
    }

    if (tokens.includes('salary') || tokens.includes('net') || tokens.includes('calculate')) {
        return "Your Net Pay is calculated as: Gross Salary - Unpaid Leave Deductions - Tax - EWA withdrawals. We assume 30 days in a month for daily rate calculations.";
    }

    if (tokens.includes('leave') || tokens.includes('holiday')) {
        return "You are entitled to 2 days of paid leave per month. Any additional leave will be treated as Unpaid Leave and deducted from your salary.";
    }

    return "I'm sorry, I can only answer questions about Tax, Salary calculations, and Leave policy.";
};

module.exports = { processQuery };
