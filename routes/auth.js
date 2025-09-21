const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth'); // Import the auth middleware

const router = express.Router();

// Login Route
router.post('/login', async (req, res) => {
    const { username, password, usertype } = req.body;

    try {
        // Find user by username and role
        const user = await User.findOne({ username, role: usertype });
        if (!user) {
            console.log("Invalid Credentials");
            return res.status(400).json({ message: 'Invalid Credentials no user' });
        }

        // Compare provided password with hashed password in DB
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid Credentials password' });
        }

        // Generate JWT Token
        const payload = {
            user: {
                id: user.id,
                role: user.role
            }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '1h' }, // Token expires in 1 hour
            (err, token) => {
                if (err) throw err;
                res.json({ token });
            }
        );

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// Example of a protected route using the auth middleware
// This route would typically be in another file, but for demonstration,
// I'm including it here to show how the middleware is used.
router.get('/protected', authMiddleware(['health_department']), (req, res) => {
    res.json({ msg: `Welcome ${req.user.username}, your role is ${req.user.role}` });
});


module.exports = router;