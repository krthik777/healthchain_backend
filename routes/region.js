const express = require('express');
const Hospital = require('../models/Hospital');
const User = require('../models/User');
const { multiChainPromise } = require('../config/multichain');
const auth = require('../middleware/auth');
const router = express.Router();

// Create Hospital
router.post('/create-hospital', 
    // auth(['region_admin']), 
    async (req, res) => {
    try {
        const { name, address } = req.body;

        // Create hospital in database
        const hospital = new Hospital({
            name,
            address,
            region: req.user.region
        });
        await hospital.save();

        // Publish to MultiChain registry stream
        const hospitalData = {
            json: {
                name,
                address,
                regionId: req.user.region.toString(),
                timestamp: new Date().toISOString()
            }
        };

        await multiChainPromise('publish', ['registry_stream', name, hospitalData]);

        res.status(201).json({ 
            message: 'Hospital created successfully',
            hospital: { id: hospital._id, name: hospital.name }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create Hospital Admin
router.post('/create-hospital-admin', auth(['region_admin']), async (req, res) => {
    try {
        const { username, password, hospitalId } = req.body;

        const hospital = await Hospital.findById(hospitalId);
        if (!hospital) {
            return res.status(404).json({ error: 'Hospital not found' });
        }

        const user = new User({
            username,
            password,
            role: 'hospital_admin',
            region: req.user.region,
            hospital: hospitalId
        });
        await user.save();

        // Generate wallet address and grant permissions
        const address = await multiChainPromise('getnewaddress');
        user.walletAddress = address;
        await user.save();

        await multiChainPromise('grant', [address, 'connect,send,receive']);
        await multiChainPromise('grant', [address, 'patient_basic_stream.write']);
        await multiChainPromise('grant', [address, 'patient_scans_stream.write']);

        res.status(201).json({ 
            message: 'Hospital admin created successfully',
            user: { id: user._id, username: user.username }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;