// routes/referral.js
const express = require('express');
const auth = require('../middleware/auth');
const ReferralSystem = require('../services/ReferralSystem');
const router = express.Router();

const referralSystem = new ReferralSystem();

// Initiate referral
router.post('/initiate', auth(['doctor']), async (req, res) => {
    try {
        const { patientId, receivingHospitalId, reason, accessDurationHours } = req.body;
        
        const result = await referralSystem.initiateReferral(
            req.user.id, 
            patientId, 
            receivingHospitalId, 
            reason, 
            accessDurationHours
        );
        
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Patient grants consent
router.post('/consent/:referralId', auth(['patient']), async (req, res) => {
    try {
        const { referralId } = req.params;
        const result = await referralSystem.grantConsent(req.user.id, referralId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Access referred data
router.get('/access/:referralId', auth(['doctor']), async (req, res) => {
    try {
        const { referralId } = req.params;
        const data = await referralSystem.accessReferredData(referralId, req.user.id);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get patient referrals
router.get('/patient/:patientId', auth(['patient', 'doctor']), async (req, res) => {
    try {
        const { patientId } = req.params;
        
        // Verify access rights
        if (req.user.role === 'doctor' && !await referralSystem.verifyAccessRights(req.user.id, patientId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const referrals = await multiChainPromise('liststreamitems', ['referral_stream']);
        const patientReferrals = referrals.filter(item => 
            item.data.json.patientId === patientId
        );
        
        res.json(patientReferrals.map(item => item.data.json));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;