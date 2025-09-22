const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TrainingQueueSchema = new Schema({
  patientName: {
    type: String,
    required: true,
    trim: true,
    minlength: 1
  },
  type: {
    type: String,
    required: true,
    enum: ['MRI', 'CT', 'X-Ray', 'Ultrasound', 'PET']
  },
  cvfScore: {
    type: Number,
    required: true,
    min: 0
  },
  date: {
    type: Date,
    required: true
  },
  assignedTo: {
    type: String,
    required: false, // Allow field to be optional
    trim: true,
    default: "" // Default to empty string for unassigned
  },
  severity: {
    type: String,
    required: true,
    enum: ['Low', 'Medium', 'High', 'Critical']
  }
}, { _id: true });

const PatientStatusBoardSchema = new Schema({
  patientName: {
    type: String,
    required: true,
    trim: true,
    minlength: 1
  },
  type: {
    type: String,
    required: true,
    enum: ['MRI', 'CT', 'X-Ray', 'Ultrasound', 'PET']
  },
  date: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['Pending', 'Reviewing', 'Complete']
  }
}, { _id: true });

const ReceptionSchema = new Schema({
  trainingQueue: [TrainingQueueSchema],
  patientStatusBoard: [PatientStatusBoardSchema]
}, { timestamps: true });

module.exports = mongoose.model('Reception', ReceptionSchema);