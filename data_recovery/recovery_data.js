// Code for decentralized data recovery and redundancy
const axios = require('axios');
const { multiChainPromise } = require('../config/multichain');

class DataRecoveryService {
    constructor() {
        this.ipfsGateways = [
            'https://hospital_a_ipfs_gateway.com',
            'https://hospital_b_ipfs_gateway.com',
            'https://public.ipfs.io'
        ];
    }

    // Retrieve patient data with failover mechanism
    async retrievePatientData(patientId, scanCid) {
        let attempt = 0;
        let data = null;
        
        while (attempt < this.ipfsGateways.length && !data) {
            try {
                const gateway = this.ipfsGateways[attempt];
                const response = await axios.get(`${gateway}/ipfs/${scanCid}`, {
                    timeout: 10000
                });
                data = response.data;
            } catch (error) {
                console.warn(`Failed to retrieve from gateway ${attempt}:`, error.message);
                attempt++;
            }
        }
        
        if (!data) {
            throw new Error(`Could not retrieve data for CID: ${scanCid}`);
        }
        
        return data;
    }

    // Admin function to rebuild lost data
    async rebuildHospitalData(hospitalId) {
        // 1. Get all patient records for this hospital from blockchain
        const patientItems = await multiChainPromise('liststreamkeyitems', ['patient_basic_stream', '*']);
        
        const hospitalPatients = patientItems.filter(item => 
            item.data.json.hospitalId === hospitalId
        );
        
        // 2. For each patient, ensure data is replicated elsewhere
        const rebuildReport = {
            totalPatients: hospitalPatients.length,
            successfullyRebuilt: 0,
            failedRebuilds: 0,
            details: []
        };
        
        for (const patient of hospitalPatients) {
            try {
                const patientData = patient.data.json;
                const scanItems = await multiChainPromise('liststreamkeyitems', ['patient_scans_stream', patientData.patientId]);
                
                // 3. Verify and replicate each scan
                for (const scan of scanItems) {
                    const scanData = scan.data.json;
                    await this.ensureDataReplication(scanData.cid);
                }
                
                rebuildReport.successfullyRebuilt++;
                rebuildReport.details.push({
                    patientId: patientData.patientId,
                    status: 'rebuilt',
                    scans: scanItems.length
                });
            } catch (error) {
                rebuildReport.failedRebuilds++;
                rebuildReport.details.push({
                    patientId: patientData.patientId,
                    status: 'failed',
                    error: error.message
                });
            }
        }
        
        return rebuildReport;
    }

    async ensureDataReplication(cid) {
        // Check if data is available on at least 2 gateways
        let availableCount = 0;
        
        for (const gateway of this.ipfsGateways) {
            try {
                await axios.head(`${gateway}/ipfs/${cid}`, { timeout: 5000 });
                availableCount++;
                if (availableCount >= 2) break;
            } catch (error) {
                // Gateway doesn't have this data
            }
        }
        
        if (availableCount < 2) {
            // Replicate to secondary gateway
            await this.replicateToSecondaryGateway(cid);
        }
    }
}