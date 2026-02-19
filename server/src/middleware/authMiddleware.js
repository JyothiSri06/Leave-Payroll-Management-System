const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"

    if (!token) {
        return res.status(401).json({ error: 'Access Denied: No Token Provided' });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified; // { id, role, ... }
        next();
    } catch (err) {
        res.status(400).json({ error: 'Invalid Token' });
    }
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'ADMIN') {
        next();
    } else {
        res.status(403).json({ error: 'Access Denied: Admins Only' });
    }
};

module.exports = { verifyToken, isAdmin };
