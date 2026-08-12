const db = require('./db');

/**
 * Sanitizes object data before storing in audit logs to ensure sensitive PII / security tokens are never recorded.
 */
const sanitizePayload = (payload) => {
    if (!payload || typeof payload !== 'object') return payload;
    const sanitized = { ...payload };
    const sensitiveFields = ['password', 'token', 'reset_password_token', 'reset_password_expires', 'jwt'];
    
    for (const field of sensitiveFields) {
        if (field in sanitized) {
            sanitized[field] = '[REDACTED]';
        }
    }
    return sanitized;
};

/**
 * Write structured, tenant-aware audit trail log into PostgreSQL audit_logs table.
 */
const logAuditEvent = async ({ tenant_id, table_name, record_id, action, old_value = null, new_value = null, changed_by = 'SYSTEM' }, client = db) => {
    try {
        const cleanOld = sanitizePayload(old_value);
        const cleanNew = sanitizePayload(new_value);

        await client.query(
            `INSERT INTO audit_logs (tenant_id, table_name, record_id, action, old_value, new_value, changed_by, changed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
            [
                tenant_id || null,
                table_name,
                record_id,
                action,
                cleanOld ? JSON.stringify(cleanOld) : null,
                cleanNew ? JSON.stringify(cleanNew) : null,
                changed_by
            ]
        );
    } catch (err) {
        console.error(`Audit logging failed for action ${action} on ${table_name}:`, err.message);
        // Non-blocking for primary transaction unless required by strict compliance
    }
};

module.exports = {
    logAuditEvent,
    sanitizePayload
};
