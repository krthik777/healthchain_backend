// models/Scan.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const ScanSchema = new Schema({
  patientId: { type: String, required: true, index: true },
  originalName: { type: String, required: true },
  encryptedName: { type: String, required: true },
  type: { type: String, required: true },
  cid: { type: String, required: true, index: true },
  encryptionKey: { type: String, required: true }, // NOTE: in prod store securely (KMS)
  isEncrypted: { type: Boolean, default: true },
  timestamp: { type: Date, default: Date.now }
}, {
  timestamps: true
});

module.exports = mongoose.model('Scan', ScanSchema);
