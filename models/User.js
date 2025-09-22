const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema({
  // identity / credentials
  patientId: { type: String, required: false, unique: true, index: true }, // patient identifier
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  appointmentScheduled: { type: String, required: false },

  // role + relations
  role: {
    type: String,
    enum: [
      "health_department",
      "region_admin",
      "hospital_admin",
      "receptionist",
      "reception",
      "doctor",
      "patient"            // <-- added patient role
    ],
    required: true,
  },
  region: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
  hospital: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital" },
  walletAddress: { type: String }, // MultiChain wallet address

  // --- patient-specific fields (non-required unless role === 'patient') ---
  
  age: {
    type: Number,
    min: 0,
    required: function () { return this.role === 'patient'; },
  },
  dob: {
    type: Date,
    required: function () { return this.role === 'patient'; },
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    required: function () { return this.role === 'patient'; },
  },
  address: { type: String },
  bloodGroup: {
    type: String,
    enum: ['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'],
  },

  // bookkeeping / provenance
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who created the patient record
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' }, // mirrors backend patient.hospitalId
  timestamp: { type: Date, default: Date.now },

}, {
  timestamps: true, // adds createdAt / updatedAt
});

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

module.exports = mongoose.model("User", UserSchema);
