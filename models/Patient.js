// models/Patient.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Minimal Appointment subdocument (kept flexible to match existing doc)
 */
const AppointmentSchema = new Schema({
  date: { type: Date },
  doctor: { type: Schema.Types.ObjectId, ref: 'User' },
  reason: { type: String },
  status: { type: String, enum: ['scheduled', 'completed', 'cancelled', 'no-show'], default: 'scheduled' },
  notes: { type: String }
}, { _id: true });

/**
 * Patient schema modeled after the provided document:
 * {
 *   "_id": ...,
 *   "user": ObjectId,
 *   "active": true,
 *   "appointmentScheduled": false,
 *   "appointments": [],
 *   "assignedDoctors": [],
 *   "bloodGroup": "Unknown",
 *   "createdAt": ISODate(...),
 *   "createdBy": ObjectId,
 *   "gender": "unknown",
 *   "patientId": "...",
 *   "role": "patient",
 *   "timestamp": ISODate(...),
 *   "updatedAt": ISODate(...),
 *   "username": "newuser",
 *   "walletAddress": "0x123..."
 * }
 */
const PatientSchema = new Schema({
  // link to canonical User document
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // identity
  patientId: { type: String, required: true, index: true }, // mirrors your example value
  username: { type: String, required: true, index: true },

  // role and flags
  role: { type: String, default: 'patient', index: true },
  active: { type: Boolean, default: true },

  // appointments / scheduling
  appointmentScheduled: { type: Boolean, default: false },
  appointments: { type: [AppointmentSchema], default: [] },

  // relations
  assignedDoctors: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },

  // clinical / contact fields
  bloodGroup: { type: String, default: 'Unknown' },
  gender: { type: String, enum: ['male', 'female', 'other', 'unknown'], default: 'unknown' },
  walletAddress: { type: String, default: '' },

  // provenance
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },

  // lightweight timestamp (mirrors your "timestamp" field)
  timestamp: { type: Date, default: Date.now },

  // allow arbitrary notes, future extension
  notes: { type: String, default: '' }
}, {
  timestamps: true // auto manages createdAt and updatedAt
});

// unique constraint for same user/patientId where user exists
PatientSchema.index(
  { user: 1, patientId: 1 },
  { unique: true, partialFilterExpression: { user: { $exists: true } } }
);

module.exports = mongoose.model('Patient', PatientSchema);
