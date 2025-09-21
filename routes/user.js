const express = require('express');
const mongoose = require('mongoose'); // Import mongoose
const User = require('../models/User');

const router = express.Router();

// Register User Route
router.post('/register', async (req, res) => {
    const { username, password, role, region, hospital, walletAddress } = req.body;

    try {
        // Check if user already exists
        let user = await User.findOne({ username });
        if (user) {
            return res.status(400).json({ msg: 'User already exists' });
        }

        // Generate a unique uid
        const generatedUid = Date.now().toString(36) + Math.random().toString(36).substring(2, 15);

        // Validate region and hospital if provided
        const userData = {
            username,
            password,
            role,
            walletAddress,
            uid: generatedUid
        };

        if (region) {
            if (!mongoose.Types.ObjectId.isValid(region)) {
                return res.status(400).json({ msg: 'Invalid Region ID' });
            }
            userData.region = region;
        }

        if (hospital) {
            if (!mongoose.Types.ObjectId.isValid(hospital)) {
                return res.status(400).json({ msg: 'Invalid Hospital ID' });
            }
            userData.hospital = hospital;
        }

        user = new User(userData);

        await user.save();

        res.status(201).json({ msg: 'User registered successfully', user: { id: user.id, username: user.username, role: user.role, uid: user.uid } });

    } catch (err) {
        console.error(err.message);
        if (err.name === 'ValidationError') {
            let errors = {};
            for (let field in err.errors) {
                errors[field] = err.errors[field].message;
                if (err.errors[field].kind === 'enum' && field === 'role') {
                    const allowedRoles = User.schema.path('role').enumValues;
                    errors[field] = `"${err.errors[field].value}" is not a valid role. Allowed roles are: ${allowedRoles.join(', ')}.`;
                }
            }
            return res.status(400).json({ errors });
        }
        res.status(500).send('Server Error');
    }
});

module.exports = router;