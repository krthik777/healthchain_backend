// models/Referral.js
const mongoose = require('mongoose');

const ReferralSchema = new mongoose.Schema({
    referralId: {
        type: String,
        required: true,
        unique: true
    },
    referringDoctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    patient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Patient',
        required: true
    },
    receivingHospital: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'expired'],
        default: 'pending'
    },
    accessExpiry: {
        type: Date,
        required: true
    },
    consentGranted: {
        type: Date
    },
    accessed: {
        type: Boolean,
        default: false
    },
    accessedBy: [{
        doctor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        accessedAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Referral', ReferralSchema);