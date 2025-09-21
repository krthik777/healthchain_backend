// routes/hospital.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const util = require('util');
const crypto = require('crypto');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const dotenv = require('dotenv');

dotenv.config();

const unlinkAsync = util.promisify(fs.unlink);

// replace with your actual multichain import
const { multiChainPromise } = require('../config/multichain');
// auth middleware that sets req.user and controls access
const auth = require('../middleware/auth');

// === Config ===
const TMP_UPLOAD_DIR = path.resolve(process.cwd(), 'tmp', 'uploads');
if (!fs.existsSync(TMP_UPLOAD_DIR)) fs.mkdirSync(TMP_UPLOAD_DIR, { recursive: true });

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB per file
const MAX_FILES = 10;

// Multer storage config (disk)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TMP_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safeName = path.basename(file.originalname).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
    const ext = path.extname(file.originalname) || '';
    cb(null, `${file.fieldname}-${unique}-${safeName}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    // Optional: enforce allowed file extensions (uncomment and adjust if desired)
    // const allowed = ['.dcm', '.zip', '.jpg', '.jpeg', '.png'];
    // if (!allowed.includes(path.extname(file.originalname).toLowerCase())) {
    //   return cb(new Error('Unsupported file type'), false);
    // }
    cb(null, true);
  }
});

// Helper: compute SHA256 hash of a file (streamed)
function fileHashSHA256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const rs = fs.createReadStream(filePath);
    rs.on('error', reject);
    rs.on('data', (chunk) => hash.update(chunk));
    rs.on('end', () => resolve(hash.digest('hex')));
  });
}

// Helper: upload a local file to Pinata via axios+form-data (Node-safe)
async function uploadFileToPinataViaAxios(filePath, originalName, metadata = {}) {
  const url = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
  const form = new FormData();

  form.append('file', fs.createReadStream(filePath), { filename: originalName });

  if (metadata && Object.keys(metadata).length) {
    const pinataMetadata = {
      name: originalName,
      keyvalues: metadata
    };
    form.append('pinataMetadata', JSON.stringify(pinataMetadata));
  }

  const pinOptions = { cidVersion: 1 };
  form.append('pinataOptions', JSON.stringify(pinOptions));

  const headers = {
    Authorization: `Bearer ${process.env.PINATA_JWT}`,
    ...form.getHeaders()
  };

  const resp = await axios.post(url, form, {
    headers,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 10 * 60 * 1000 // 10 minutes, adjust based on expected file sizes
  });

  return resp.data; // typically contains IpfsHash
}

// === Route: Add Scan ===
router.post(
  '/add-scan',
//   auth(['receptionist', 'hospital_admin']), // enable for production
  upload.array('files', MAX_FILES),
  async (req, res) => {
    try {
      // Basic auth presence check
    //   if (!req.user) return res.status(401).json({ error: 'Authentication required' });

      // Fields extraction & validation
      const patientName = typeof req.body.patientName === 'string' ? req.body.patientName.trim() : '';
      const patientId = typeof req.body.patientId === 'string' ? req.body.patientId.trim() : '';
      const scanType = typeof req.body.type === 'string' ? req.body.type.trim() : '';
      const organ = typeof req.body.organ === 'string' ? req.body.organ.trim() : '';
      const condition = typeof req.body.condition === 'string' ? req.body.condition.trim() : '';
      const severityIndex = typeof req.body.severityIndex === 'string'
        ? req.body.severityIndex.trim()
        : (req.body.severityIndex != null ? String(req.body.severityIndex) : '');

      if (!patientId) return res.status(400).json({ error: 'patientId is required' });
      if (!scanType) return res.status(400).json({ error: 'type (scan type) is required' });
      if (!organ) return res.status(400).json({ error: 'organ is required' });
      if (!condition) return res.status(400).json({ error: 'condition is required' });
      if (!severityIndex) return res.status(400).json({ error: 'severityIndex is required' });

      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({ error: 'At least one file is required (files[])' });
      }

      // Prepare storage for processed files
      const processedFiles = [];

      // Upload each file to Pinata and collect metadata
      for (const f of req.files) {
        const filePath = f.path;
        const originalName = f.originalname;
        const size = f.size;

        // Compute sha256
        let sha256;
        try {
          sha256 = await fileHashSHA256(filePath);
        } catch (hashErr) {
          // cleanup immediate file and abort
          try { await unlinkAsync(filePath); } catch(_) {}
          return res.status(500).json({ error: `Failed to hash ${originalName}: ${hashErr.message || hashErr}` });
        }

        // Metadata for Pinata keyvalues
        const metadata = {
            fileName: originalName,
        fileSize: String(size),
        fileSha256: sha256,
        scanType,
        organ,
        condition,
        severityIndex,
          patientId,
        //   uploadedBy: req.user._id ? String(req.user._id) : 'unknown'
        };

        // Upload to Pinata (axios+form-data helper)
        let uploadResponse;
        try {
          uploadResponse = await uploadFileToPinataViaAxios(filePath, originalName, metadata);
        } catch (pinErr) {
          console.error('Pinata upload failed for file', originalName, pinErr && (pinErr.response?.data || pinErr.message || pinErr));
          // Try to cleanup file before responding
          try { await unlinkAsync(filePath); } catch(_) {}
          return res.status(500).json({ error: `Failed to upload ${originalName} to Pinata: ${pinErr?.message || JSON.stringify(pinErr)}` });
        }

        // Typical Pinata response contains IpfsHash
        const cid = uploadResponse?.IpfsHash || uploadResponse?.cid || uploadResponse?.hash || null;
        if (!cid) {
          console.error('Pinata returned no CID for file', originalName, uploadResponse);
          try { await unlinkAsync(filePath); } catch(_) {}
          return res.status(500).json({ error: `Pinata did not return CID for ${originalName}` });
        }

        processedFiles.push({
          originalName,
          storagePath: filePath, // temporary local path (we'll remove later)
          size,
          sha256,
          cid
        });
      }

      // Build scanData for MultiChain
      const scanData = {
        json: {
          patientId,
          patientName,
          scanType,
          type: scanType,
          organ,
          condition,
          severityIndex,
          files: processedFiles.map(pf => ({
            originalName: pf.originalName,
            size: pf.size,
            sha256: pf.sha256,
            cid: pf.cid
          })),
        //   hospitalId: req.user.hospital || null,
        //   uploadedBy: req.user._id || null,
          timestamp: new Date().toISOString()
        }
      };

      // Publish to MultiChain
      let txId;
      try {
        txId = await multiChainPromise('publish', ['patient_scans_stream', patientId, scanData]);
      } catch (mcErr) {
        console.error('MultiChain publish failed', mcErr);
        // If publishing fails, consider whether to keep or delete pinned files on Pinata.
        // For now, attempt cleanup of temp files and return error.
        for (const f of req.files) {
          try { await unlinkAsync(f.path); } catch (_) {}
        }
        return res.status(500).json({ error: `Failed to publish to MultiChain: ${mcErr.message || mcErr}` });
      }

      // Cleanup temp files after success
      for (const f of req.files) {
        try {
          await unlinkAsync(f.path);
        } catch (cleanupErr) {
          console.warn('Failed to delete temp file', f.path, cleanupErr && cleanupErr.message);
        }
      }

      return res.status(201).json({
        message: 'Scan added successfully',
        transactionId: txId,
        files: scanData.json.files
      });
    } catch (err) {
      console.error('add-scan error', err && (err.stack || err));
      return res.status(500).json({ error: err && err.message ? err.message : 'Server error' });
    }
  }
);

router.post('/create-patient', auth(['receptionist']), async (req, res) => {
  try {
    const { patientId, name, age, dob, gender, address, bloodGroup } = req.body;

    const patientData = {
      json: {
        patientId,
        name,
        age,
        dob,
        gender,
        address,
        bloodGroup,
        // hospitalId: req.user.hospital,
        // createdBy: req.user._id,
        timestamp: new Date().toISOString()
      }
    };

    const result = await multiChainPromise('publish',
      ['patient_basic_stream', patientId, patientData]);

    res.status(201).json({
      message: 'Patient created successfully',
      transactionId: result
    });
  } catch (error) {
    console.error('create-patient error', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

module.exports = router;
