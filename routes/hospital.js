// routes/hospital.js
const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const util = require("util");
const crypto = require("crypto");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const dotenv = require("dotenv");

const Scan = require('../models/scan');
const User = require("../models/User");
const Patient = require("../models/Patient");

dotenv.config();

const unlinkAsync = util.promisify(fs.unlink);

// replace with your actual multichain import
const { multiChainPromise } = require("../config/multichain");
// auth middleware that sets req.user and controls access
const auth = require("../middleware/auth");
const { type } = require("os");

// === Config ===
const TMP_UPLOAD_DIR = path.resolve(process.cwd(), "tmp", "uploads");
if (!fs.existsSync(TMP_UPLOAD_DIR))
  fs.mkdirSync(TMP_UPLOAD_DIR, { recursive: true });

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB per file
const MAX_FILES = 10;

// FastAPI encryption service URL
const ENCRYPTION_SERVICE_URL = "http://localhost:8000";

// Multer storage config (disk)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TMP_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safeName = path
      .basename(file.originalname)
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_.-]/g, "");
    const ext = path.extname(file.originalname) || "";
    cb(null, `${file.fieldname}-${unique}-${safeName}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    cb(null, true);
  },
});

// Helper: compute SHA256 hash of a file (streamed)
function fileHashSHA256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const rs = fs.createReadStream(filePath);
    rs.on("error", reject);
    rs.on("data", (chunk) => hash.update(chunk));
    rs.on("end", () => resolve(hash.digest("hex")));
  });
}

// Helper: upload a local file to Pinata via axios+form-data (Node-safe)
async function uploadFileToPinataViaAxios(
  filePath,
  originalName,
  metadata = {}
) {
  const url = "https://api.pinata.cloud/pinning/pinFileToIPFS";
  const form = new FormData();

  form.append("file", fs.createReadStream(filePath), {
    filename: originalName,
  });

  if (metadata && Object.keys(metadata).length) {
    const pinataMetadata = {
      name: originalName,
      keyvalues: metadata,
    };
    form.append("pinataMetadata", JSON.stringify(pinataMetadata));
  }

  const pinOptions = { cidVersion: 1 };
  form.append("pinataOptions", JSON.stringify(pinOptions));

  const headers = {
    Authorization: `Bearer ${process.env.PINATA_JWT}`,
    ...form.getHeaders(),
  };

  const resp = await axios.post(url, form, {
    headers,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 10 * 60 * 1000,
  });

  return resp.data; // typically contains IpfsHash
}

// Helper function to call FastAPI encryption service
async function encryptImageWithFastAPI(filePath, originalName, mimetype, metadata) {
  const encryptFormData = new FormData();

  // Add the image file
  encryptFormData.append("file", fs.createReadStream(filePath), {
    filename: originalName,
    contentType: mimetype,
  });

  // Add ALL required metadata fields for encryption (matching FastAPI expectations)
  encryptFormData.append("CaseID", metadata.patientId || "");
  encryptFormData.append("Modality", metadata.scanType || "");
  encryptFormData.append("Organ", metadata.organ || "");
  encryptFormData.append("Disease", metadata.condition || "");
  encryptFormData.append("SeverityIndex", metadata.severityIndex || "");
  encryptFormData.append("UrgencyZone", metadata.urgencyZone || "Normal");
  encryptFormData.append("Description", metadata.description || `${metadata.scanType} scan of ${metadata.organ} for ${metadata.condition}`);

  console.log(`Sending encryption request for file: ${originalName}`);
  try {
    const encryptResponse = await axios.post(
      `${ENCRYPTION_SERVICE_URL}/encrypt/`,
      encryptFormData,
      {
        headers: {
          ...encryptFormData.getHeaders(),
        },
        responseType: "arraybuffer",
        timeout: 60000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );

    const encryptionKey = encryptResponse.headers["x-encryption-key"];
    if (!encryptionKey) {
      throw new Error("No encryption key received from encryption service");
    }

    const encryptedImageBuffer = Buffer.from(encryptResponse.data);
    
    return {
      encryptedImageBuffer,
      encryptionKey
    };

  } catch (error) {
    console.error(`FastAPI encryption failed for file: ${originalName}`, error?.message || error);
    if (error.response) {
      console.error("Response status:", error.response.status);
      try {
        if (Buffer.isBuffer(error.response.data)) {
          console.error("Response data:", error.response.data.toString());
        } else {
          console.error("Response data:", error.response.data);
        }
      } catch (e) {}
    }
    throw error;
  }
}

// POST /api/hospital/scans (helpful direct route - kept)
router.post('/scans', async (req, res) => {
  try {
    const { patientId, files, createdBy } = req.body;
    if (!patientId) return res.status(400).json({ error: 'patientId is required' });
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files array is required' });
    }

    const docs = files.map((f) => ({
      patientId,
      originalName: f.originalName,
      encryptedName: f.encryptedName,
      type: f.type,
      cid: f.cid,
      encryptionKey: f.encryptionKey,
      isEncrypted: f.isEncrypted !== undefined ? !!f.isEncrypted : true,
      timestamp: new Date()
    }));

    const inserted = await Scan.insertMany(docs, { ordered: false });

    res.status(201).json({
      message: 'Scans persisted',
      insertedCount: inserted.length,
      insertedIds: inserted.map(d => d._id)
    });
  } catch (err) {
    console.error('Failed to persist scans', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

router.post(
  "/add-scan",
  //   auth(['receptionist', 'hospital_admin']), // enable for production
  upload.array("files", MAX_FILES),
  async (req, res) => {
    try {
      // Fields extraction & validation
      const patientName =
        typeof req.body.patientName === "string"
          ? req.body.patientName.trim()
          : "";
      const patientId =
        typeof req.body.patientId === "string" ? req.body.patientId.trim() : "";
      const scanType =
        typeof req.body.type === "string" ? req.body.type.trim() : "";
      const organ =
        typeof req.body.organ === "string" ? req.body.organ.trim() : "";
      const condition =
        typeof req.body.condition === "string" ? req.body.condition.trim() : "";
      const severityIndex =
        typeof req.body.severityIndex === "string"
          ? req.body.severityIndex.trim()
          : req.body.severityIndex != null
          ? String(req.body.severityIndex)
          : "";

      // Additional metadata fields for encryption (with defaults)
      const urgencyZone = req.body.urgencyZone || "Normal";
      const description = req.body.description || `${scanType} scan of ${organ} for ${condition}`;

      console.log('Processing scan upload:', {
        patientName,
        patientId,
        scanType,
        organ,
        condition,
        severityIndex,
        filesCount: (req.files || []).length
      });

      if (!patientId)
        return res.status(400).json({ error: "patientId is required" });
      if (!scanType)
        return res.status(400).json({ error: "type (scan type) is required" });
      if (!organ) return res.status(400).json({ error: "organ is required" });
      if (!condition)
        return res.status(400).json({ error: "condition is required" });
      if (!severityIndex)
        return res.status(400).json({ error: "severityIndex is required" });

      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return res
          .status(400)
          .json({ error: "At least one file is required (files[])" });
      }

      // Prepare storage for processed files
      const processedFiles = [];

      // Process each file through encryption service
      for (const f of req.files) {
        const filePath = f.path;
        const originalName = f.originalname;
        const size = f.size;

        console.log(`Processing file: ${originalName} (${size} bytes)`);

        try {
          // Step 1: Encrypt image using FastAPI service
          const encryptionResult = await encryptImageWithFastAPI(
            filePath, 
            originalName, 
            f.mimetype, 
            {
              patientId,
              scanType,
              organ,
              condition,
              severityIndex,
              urgencyZone,
              description
            }
          );

          const { encryptedImageBuffer, encryptionKey } = encryptionResult;

          // Step 2: Save encrypted image temporarily for Pinata upload
          const encryptedFileName = `encrypted_${Date.now()}_${originalName.replace(
            /\.[^/.]+$/,
            ""
          )}.png`;
          const encryptedFilePath = path.join(path.dirname(filePath), encryptedFileName);
          fs.writeFileSync(encryptedFilePath, encryptedImageBuffer);
          console.log(`Encrypted file saved: ${encryptedFileName}`);

          // Step 3: Compute SHA256 of encrypted file
          let sha256;
          try {
            sha256 = await fileHashSHA256(encryptedFilePath);
          } catch (hashErr) {
            try { await unlinkAsync(filePath); } catch (_) {}
            try { await unlinkAsync(encryptedFilePath); } catch (_) {}
            return res.status(500).json({
              error: `Failed to hash encrypted ${originalName}: ${hashErr.message || hashErr}`,
            });
          }

          // Step 4: Prepare metadata for Pinata
          const pinataMetadata = {
            patientName: patientName,
            patientId: patientId,
            type: scanType,
            organ: organ,
            condition: condition,
            severityIndex: severityIndex,
            fileSize: String(encryptedImageBuffer.length)
          };

          console.log('Pinata metadata:', pinataMetadata);

          // Step 5: Upload encrypted file to Pinata
          let uploadResponse;
          try {
            uploadResponse = await uploadFileToPinataViaAxios(
              encryptedFilePath,
              encryptedFileName,
              pinataMetadata
            );
            console.log(`Pinata upload successful for: ${encryptedFileName}`);
          } catch (pinErr) {
            console.error("Pinata upload failed for encrypted file", encryptedFileName, pinErr && (pinErr.response?.data || pinErr.message || pinErr));
            try { await unlinkAsync(filePath); } catch (_) {}
            try { await unlinkAsync(encryptedFilePath); } catch (_) {}
            return res.status(500).json({
              error: `Failed to upload encrypted ${originalName} to Pinata: ${pinErr?.message || JSON.stringify(pinErr)}`,
            });
          }

          // Extract CID from Pinata response
          const cid =
            uploadResponse?.IpfsHash ||
            uploadResponse?.cid ||
            uploadResponse?.hash ||
            null;

          if (!cid) {
            console.error("Pinata returned no CID for encrypted file", encryptedFileName, uploadResponse);
            try { await unlinkAsync(filePath); } catch (_) {}
            try { await unlinkAsync(encryptedFilePath); } catch (_) {}
            return res.status(500).json({ error: `Pinata did not return CID for encrypted ${originalName}` });
          }

          // Step 6: Append to processedFiles (used later for multichain + DB)
          processedFiles.push({
            originalName,
            encryptedName: encryptedFileName,
            storagePath: encryptedFilePath,
            originalSize: size,
            encryptedSize: encryptedImageBuffer.length,
            sha256,
            cid,
            encryptionKey,
            patientName,
            patientId,
            type: scanType,
            organ,
            condition,
            severityIndex,
            urgencyZone,
            description,
            isEncrypted: true
          });

          // Cleanup original unencrypted file
          try {
            await unlinkAsync(filePath);
            console.log(`Original file cleaned up: ${originalName}`);
          } catch (cleanupErr) {
            console.warn("Failed to delete original temp file", filePath, cleanupErr.message);
          }
        } catch (encryptionErr) {
          console.error("Encryption process failed for file", originalName, encryptionErr.message || encryptionErr);
          try { await unlinkAsync(f.path); } catch (_) {}
          if (encryptionErr.response && encryptionErr.response.status === 422) {
            console.error("FastAPI 422 Error - likely missing required fields");
          }
          return res.status(500).json({
            error: `Failed to encrypt ${originalName}: ${encryptionErr.message || encryptionErr}`,
            details: encryptionErr.response?.status === 422 ? "Missing required fields for encryption service" : undefined
          });
        }
      } // end for files

      // === NEW STEP: Persist scan metadata to MongoDB using Scan model ===
      try {
        const scanDocs = processedFiles.map((pf) => ({
          patientId: pf.patientId,
          originalName: pf.originalName,
          encryptedName: pf.encryptedName,
          cid: pf.cid,
          encryptionKey: pf.encryptionKey,
          isEncrypted: !!pf.isEncrypted,
          timestamp: new Date()
        }));

        // Insert into DB and wait for completion before continuing
        const inserted = await Scan.insertMany(scanDocs, { ordered: true });
        console.log(`Persisted ${inserted.length} scan records to DB`);
      } catch (dbErr) {
        console.error("Failed to persist scan metadata to DB", dbErr);
        // Attempt cleanup of encrypted temp files
        for (const pf of processedFiles) {
          try { await unlinkAsync(pf.storagePath); } catch (_) {}
        }
        return res.status(500).json({
          error: "Failed to persist scan metadata to database",
          details: dbErr && dbErr.message ? dbErr.message : String(dbErr)
        });
      }

      // Step 7: Build scanData for MultiChain with complete metadata
      const scanData = {
        json: {
          patientId,
          patientName,
          scanType,
          type: scanType,
          organ,
          condition,
          severityIndex,
          urgencyZone,
          description,
          isEncrypted: true,
          encryptionMethod: 'quantum-aes-gcm',
          files: processedFiles.map((pf) => ({
            originalName: pf.originalName,
            encryptedName: pf.encryptedName,
            originalSize: pf.originalSize,
            encryptedSize: pf.encryptedSize,
            sha256: pf.sha256,
            cid: pf.cid,
            encryptionKey: pf.encryptionKey,
            patientName: pf.patientName,
            patientId: pf.patientId,
            type: pf.type,
            organ: pf.organ,
            condition: pf.condition,
            severityIndex: pf.severityIndex,
            urgencyZone: pf.urgencyZone,
            description: pf.description,
            isEncrypted: pf.isEncrypted
          })),
          timestamp: new Date().toISOString(),
        },
      };

      // Step 8: Publish to MultiChain
      let txId;
      try {
        txId = await multiChainPromise("publish", [
          "patient_scans_stream",
          patientId,
          scanData,
        ]);
      } catch (mcErr) {
        console.error("MultiChain publish failed", mcErr);
        // Cleanup encrypted temp files on MultiChain failure
        for (const pf of processedFiles) {
          try { await unlinkAsync(pf.storagePath); } catch (_) {}
        }
        return res.status(500).json({
          error: `Failed to publish to MultiChain: ${mcErr.message || mcErr}`,
        });
      }

      // Step 9: Final cleanup of temporary encrypted files
      for (const pf of processedFiles) {
        try {
          await unlinkAsync(pf.storagePath);
        } catch (cleanupErr) {
          console.warn("Failed to delete encrypted temp file", pf.storagePath, cleanupErr && cleanupErr.message);
        }
      }

      return res.status(201).json({
        message: "Encrypted scan added successfully",
        transactionId: txId,
        files: scanData.json.files,
        encryptionInfo: {
          method: "quantum-aes-gcm",
          filesEncrypted: processedFiles.length,
        },
        pinataInfo: {
          fieldsUsed: 10,
          maxAllowed: 10,
          status: "optimized"
        }
      });

    } catch (err) {
      console.error("add-scan error", err && (err.stack || err));
      return res
        .status(500)
        .json({ error: err && err.message ? err.message : "Server error" });
    }
  }
);

router.post(
  "/create-patient",
  // auth(['receptionist']),
  async (req, res) => {
    try {
      // accept either `username` or `name` from client
      const {
        patientId,
        username,
        name,
        password,
        age,
        dob,
        gender,
        address,
        bloodGroup,
      } = req.body;

      // choose username: prefer username, then name, then patientId as last resort
      const finalUsername = username || name || patientId || "";

      // basic validation (password required by your schema)
      if (!patientId || !finalUsername || !password) {
        return res.status(400).json({
          error:
            "Missing required fields. Required: patientId, username (or name), password.",
        });
      }

      // prepare patient record as a flat object (suitable for both Multichain and Mongoose)
      const patientRecord = {
        patientId: String(patientId),
        username: String(finalUsername),
        password: String(password),
        age: age != null ? Number(age) : undefined,
        dob: dob ? new Date(dob) : undefined,
        gender: gender || undefined,
        address: address || undefined,
        bloodGroup: bloodGroup || undefined,
        role: "patient",
        timestamp: new Date().toISOString(),
      };

      // publish to MultiChain (wrap the patientRecord in { json: ... } as your chain expects)
      let result;
      try {
        result = await multiChainPromise("publish", [
          "patient_basic_stream",
          patientRecord.patientId,
          { json: patientRecord },
        ]);
      } catch (mcErr) {
        console.error("MultiChain publish failed", mcErr);
        return res
          .status(500)
          .json({
            error: `Failed to publish to MultiChain: ${mcErr.message || mcErr}`,
          });
      }

      // persist to MongoDB — pass the flat patientRecord (not wrapped in { json: ... })
      try {
        const newPatient = new User(patientRecord);
        await newPatient.save();

        const patientSchemeRecord = {
          ...patientRecord,
          user: newPatient._id, // Link to the created user
        };

        const patientScheme = new Patient(patientSchemeRecord);
        await patientScheme.save();
      } catch (saveErr) {
        if (saveErr && saveErr.code === 11000) {
          const dupField = Object.keys(saveErr.keyValue || {}).join(", ");
          return res.status(409).json({
            error: `Duplicate key error: ${dupField}. A user with that value already exists.`,
            details: saveErr.keyValue,
          });
        }
        console.error("Failed to save patient to DB:", saveErr);
        return res
          .status(500)
          .json({ error: saveErr.message || "Failed to save patient" });
      }

      return res.status(201).json({
        message: "Patient created successfully",
        transactionId: result,
      });
    } catch (error) {
      console.error("create-patient error", error);
      return res.status(500).json({ error: error.message || "Server error" });
    }
  }
);

module.exports = router;
