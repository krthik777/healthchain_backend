const express = require('express');
const Reception = require('../models/Reception');
const auth = require('../middleware/auth');
const router = express.Router();

// Endpoint for Triage Queue (trainingQueue data)
router.get('/triagequeue', async (req, res) => {
    try {
        const reception = await Reception.findOne();
        if (!reception) {
            return res.status(404).json({ message: 'No data found' });
        }
        res.json(reception.trainingQueue);
    } catch (error) {
        console.error('Error fetching triage queue:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint for Patient Status Board (patientStatusBoard data)
router.get('/patient-status-board', async (req, res) => {
    try {
        const reception = await Reception.findOne();
        if (!reception) {
            return res.status(404).json({ message: 'No data found' });
        }
        res.json(reception.patientStatusBoard);
    } catch (error) {
        console.error('Error fetching patient status board:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;