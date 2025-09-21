require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Import routes
const authRoutes = require('./routes/auth');
// In your server.js
const apiRoutes = require('./routes/utils');
const userRoutes = require('./routes/user'); // Import the new user router
const healthDeptRoutes = require('./routes/healthDept');
const regionRoutes = require('./routes/region');
const hospitalRoutes = require('./routes/hospital');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/healthchain', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.log('MongoDB connection error:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes); // Mount the user router
app.use('/api/health-dept', healthDeptRoutes);
app.use('/api/region', regionRoutes);
app.use('/api/hospital', hospitalRoutes);
app.use('/api/api', apiRoutes); // General API routes

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));