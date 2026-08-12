const jwt = require('jsonwebtoken');

/**
 * JWT Authentication Middleware
 * Verifies JWT token and attaches user payload (id, role, email, tenant_id) to req.user.
 */
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"

    if (!token) {
        return res.status(401).json({ error: 'Access Denied: No Token Provided' });
    }

    try {
        const secret = process.env.JWT_SECRET || 'fallback_jwt_secret_for_dev_env';
        const verified = jwt.verify(token, secret);
        req.user = verified; // { id, role, email, tenant_id }
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token Expired' });
        }
        return res.status(401).json({ error: 'Invalid Token' });
    }
};

/**
 * Multi-Tenancy Middleware
 * Ensures user has an assigned tenant_id for data isolation.
 */
const requireTenant = (req, res, next) => {
    if (!req.user || !req.user.tenant_id) {
        return res.status(403).json({ error: 'Access Denied: Missing Tenant Identification' });
    }
    next();
};

/**
 * Role-Based Access Control (RBAC) Middleware
 * @param {Array<string>} roles Allowed roles e.g. ['ADMIN'] or ['ADMIN', 'EMPLOYEE']
 */
const requireRole = (roles = []) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Access Denied: Insufficient Permissions' });
        }
        next();
    };
};

const isAdmin = requireRole(['ADMIN']);

/**
 * Self or Admin Authorization Middleware
 * Prevents non-admin employees from viewing/modifying another employee's PII or payroll.
 */
const requireSelfOrAdmin = (paramKey = 'id') => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const targetEmployeeId = req.params[paramKey] || req.body[paramKey] || req.query[paramKey];
        if (req.user.role === 'ADMIN' || req.user.id === targetEmployeeId) {
            return next();
        }
        return res.status(403).json({ error: 'Access Denied: Cannot access another employee\'s private records' });
    };
};

module.exports = {
    verifyToken,
    requireTenant,
    requireRole,
    isAdmin,
    requireSelfOrAdmin
};
