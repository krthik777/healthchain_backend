// Code for cross-region referral system
const jwt = require('jsonwebtoken');

class ReferralSystem {
    constructor() {
        this.referralTokens = new Map();
    }

    // Initiate a referral
    async initiateReferral(referringDoctorId, patientId, receivingHospitalId, reason, accessDurationHours = 24) {
        // 1. Verify referring doctor has access to this patient
        const hasAccess = await this.verifyDoctorAccess(referringDoctorId, patientId);
        if (!hasAccess) {
            throw new Error('Doctor does not have access to this patient record');
        }

        // 2. Create referral record on blockchain
        const referralId = `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const referralData = {
            json: {
                referralId,
                referringDoctorId,
                patientId,
                receivingHospitalId,
                reason,
                accessDurationHours,
                status: 'pending',
                timestamp: new Date().toISOString(),
                accessed: false,
                accessExpiry: new Date(Date.now() + (accessDurationHours * 60 * 60 * 1000)).toISOString()
            }
        };

        await multiChainPromise('publish', ['referral_stream', referralId, referralData]);

        // 3. Generate access token (will be activated only after patient consent)
        const token = jwt.sign(
            { 
                referralId, 
                patientId, 
                receivingHospitalId,
                preAuthorized: true 
            },
            process.env.JWT_SECRET,
            { expiresIn: `${accessDurationHours}h` }
        );

        this.referralTokens.set(referralId, {
            token,
            activated: false,
            referringDoctorId,
            patientId
        });

        // 4. Notify receiving hospital and patient
        await this.notifyReceivingHospital(receivingHospitalId, referralId, referringDoctorId, reason);
        await this.notifyPatient(patientId, referralId, receivingHospitalId, reason);

        return {
            referralId,
            status: 'pending_consent',
            message: 'Waiting for patient consent'
        };
    }

    // Patient grants consent
    async grantConsent(patientId, referralId) {
        const referral = await this.getReferral(referralId);
        
        if (!referral) {
            throw new Error('Referral not found');
        }
        
        if (referral.data.json.patientId !== patientId) {
            throw new Error('Patient mismatch');
        }

        // Update referral status on blockchain
        const updatedData = {
            json: {
                ...referral.data.json,
                status: 'approved',
                consentGranted: new Date().toISOString()
            }
        };

        await multiChainPromise('publish', ['referral_stream', referralId, updatedData]);

        // Activate the access token
        if (this.referralTokens.has(referralId)) {
            const tokenInfo = this.referralTokens.get(referralId);
            tokenInfo.activated = true;
            tokenInfo.activatedAt = new Date();
        }

        // Notify both hospitals
        await this.notifyConsentUpdate(referralId, 'approved');

        return { status: 'consent_granted', referralId };
    }

    // Access referred patient data
    async accessReferredData(referralId, accessingDoctorId) {
        const referral = await this.getReferral(referralId);
        
        if (!referral || !this.referralTokens.has(referralId)) {
            throw new Error('Invalid referral');
        }

        const referralData = referral.data.json;
        const tokenInfo = this.referralTokens.get(referralId);

        // Validate access
        if (!tokenInfo.activated) {
            throw new Error('Consent not granted for this referral');
        }

        if (referralData.receivingHospitalId !== await this.getDoctorHospitalId(accessingDoctorId)) {
            throw new Error('Doctor not authorized for this referral');
        }

        if (new Date(referralData.accessExpiry) < new Date()) {
            throw new Error('Referral access has expired');
        }

        // Record access on blockchain
        await this.recordAccess(referralId, accessingDoctorId);

        // Retrieve patient data
        const patientData = await this.retrievePatientData(referralData.patientId);

        return {
            patient: patientData.basicInfo,
            medicalHistory: patientData.scans,
            accessGranted: new Date().toISOString(),
            accessingDoctorId
        };
    }

    // Verify access rights
    async verifyAccessRights(doctorId, patientId) {
        // Check if doctor has direct access
        const directAccess = await this.verifyDoctorAccess(doctorId, patientId);
        if (directAccess) return true;

        // Check if doctor has referral-based access
        const referrals = await multiChainPromise('liststreamitems', ['referral_stream']);
        const validReferral = referrals.find(item => 
            item.data.json.patientId === patientId &&
            item.data.json.receivingHospitalId === await (this.getDoctorHospitalId(doctorId)) &&
            item.data.json.status === 'approved' &&
            new Date(item.data.json.accessExpiry) > new Date()
        );

        return !!validReferral;
    }
}