const mongoose = require('mongoose');

const hospitalSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    address: {
        type: String,
        required: true,
        trim: true
    },
    region: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Region',
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt field before saving
hospitalSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Index for better query performance
hospitalSchema.index({ region: 1, name: 1 });

module.exports = mongoose.model('Hospital', hospitalSchema);