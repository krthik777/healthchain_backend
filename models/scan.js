const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { 
        type: String, 
        enum: ['health_department', 'region_admin', 'hospital_admin', 'receptionist', 'doctor'],
        required: true 
    },
    region: { type: mongoose.Schema.Types.ObjectId, ref: 'Region' },
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    walletAddress: { type: String } // MultiChain wallet address
});

UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

module.exports = mongoose.model('User', UserSchema);