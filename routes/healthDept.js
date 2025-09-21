const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Region = require('../models/Region');
const { multiChainPromise } = require('../config/multichain');
const auth = require('../middleware/auth');
const router = express.Router();

// Initialize blockchain streams (run once)
router.post('/init-blockchain', auth(['health_department']), async (req, res) => {
    try {
        // Create streams for different data types
        await multiChainPromise('create', ['registry_stream', 'true']);
        await multiChainPromise('create', ['patient_basic_stream', 'true']);
        await multiChainPromise('create', ['patient_scans_stream', 'true']);
        await multiChainPromise('create', ['staff_stream', 'true']);

        res.json({ message: 'Blockchain streams initialized successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create Region Admin
router.post('/create-region-admin', auth(['health_department']), async (req, res) => {
    try {
        const { username, password, regionName } = req.body;

        // Create region
        const region = new Region({ name: regionName });
        await region.save();

        // Create user
        const user = new User({
            username,
            password,
            role: 'region_admin',
            region: region._id
        });
        await user.save();

        // Generate wallet address for the region admin
        const address = await multiChainPromise('getnewaddress');
        user.walletAddress = address;
        await user.save();

        // Grant permissions on MultiChain
        await multiChainPromise('grant', [address, 'connect']);
        await multiChainPromise('grant', [address, 'send']);
        await multiChainPromise('grant', [address, 'receive']);
        await multiChainPromise('grant', [address, 'registry_stream.write']);

        res.status(201).json({ 
            message: 'Region admin created successfully',
            user: { id: user._id, username: user.username },
            region: { id: region._id, name: region.name },
            walletAddress: address
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;