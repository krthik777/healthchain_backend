const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = (requiredRoles = []) => {
    return async (req, res, next) => {
        try {
            const token = req.header('Authorization')?.replace('Bearer ', '');
            
            // if (!token) {
            //     return res.status(401).json({ error: 'Access denied. No token provided.' });
            // }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('-password');
            
            // if (!user) {
            //     return res.status(401).json({ error: 'Invalid token.' });
            // }

            if (requiredRoles.length && !requiredRoles.includes(user.role)) {
                return res.status(403).json({ error: 'Insufficient permissions.' });
            }

            req.user = user;
            next();
        } catch (error) {
            res.status(401).json({ error: 'Invalid token.' });
        }
    };
};

module.exports = auth;