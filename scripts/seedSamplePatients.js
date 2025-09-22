// scripts/syncPatientsFromUsers.js
// Synchronize User (role='patient') -> Patient documents (one-time run).
//
// Usage:
//   MONGO_URI="mongodb://localhost:27017/yourdb" node scripts/syncPatientsFromUsers.js

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/testdb';
const CHUNK_SIZE = 500;        // bulkWrite chunk size
const WATCHDOG_MS = 5 * 60 * 1000; // 5 minutes

if (!MONGO_URI) {
  console.error('Please provide MONGO_URI');
  process.exit(1);
}

async function loadOrFallbackModel(path, fallbackFactory) {
  try {
    return require(path);
  } catch (err) {
    // fallback: create model using factory function
    return fallbackFactory();
  }
}

async function main() {
  console.log('Connecting to', MONGO_URI);
  await mongoose.connect(MONGO_URI); // no deprecated options

  // attempt to load real app models, fall back to minimal schemas if not present
  const User = (function () {
    try {
      // try to require your project's User model
      return require('../models/User');
    } catch (e) {
      // fallback minimal model (reads from 'users' collection, flexible)
      const schema = new mongoose.Schema({}, { strict: false, collection: 'users' });
      return mongoose.model('User_fallback_for_sync', schema);
    }
  })();

  const Patient = (function () {
    try {
      return require('../models/Patient');
    } catch (e) {
      // fallback patient model (collection 'patients')
      const Schema = mongoose.Schema;
      const PatientSchema = new Schema({
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        patientId: { type: String, required: true, index: true },
        username: { type: String, required: true },
        role: { type: String, default: 'patient' },
        region: Schema.Types.Mixed,
        hospital: Schema.Types.Mixed,
        hospitalName: String,
        walletAddress: String,
        age: Number,
        dob: Date,
        gender: String,
        address: String,
        bloodGroup: String,
        email: String,
        phone: String,
        assignedDoctors: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        appointmentScheduled: { type: Boolean, default: false },
        appointments: { type: Array, default: [] },
        lastScan: {
          scanTypeLabel: { type: String, default: '' },
          scanDateString: { type: String, default: '' },
          statusLabel: { type: String, default: '' },
          urgencyLabel: { type: String, default: '' },
          cvfScoreLabel: { type: String, default: '' },
          assignedDoctorName: { type: String, default: '' }
        },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
        active: { type: Boolean, default: true },
        timestamp: { type: Date, default: Date.now }
      }, { timestamps: true, collection: 'patients' });

      return mongoose.model('Patient_fallback_for_sync', PatientSchema);
    }
  })();

  // watchdog to avoid infinite hang
  const wd = setTimeout(() => {
    console.error(`Watchdog fired after ${WATCHDOG_MS}ms — forcing exit.`);
    // Attempt graceful disconnect then exit
    mongoose.disconnect().finally(() => process.exit(2));
  }, WATCHDOG_MS);

  try {
    console.log('Starting sync: scanning users with role="patient" via cursor...');

    // Stream users (lean + cursor) to avoid long-running memory usage
    const cursor = User.find({ role: 'patient' }).lean().cursor();

    let ops = [];
    let processed = 0;
    for await (const u of cursor) {
      // build mirrored set object (only defined fields)
      const mirrorFields = [
        'patientId', 'username', 'role', 'region', 'hospital', 'hospitalName', 'walletAddress',
        'age', 'dob', 'gender', 'address', 'bloodGroup', 'email', 'phone'
      ];
      const setObj = {};

      for (const k of mirrorFields) {
        if (u[k] !== undefined && u[k] !== null) setObj[k] = u[k];
      }

      // ensure patientId and username exist
      setObj.patientId = setObj.patientId || (u.patientId ? u.patientId : String(u._id));
      setObj.username = setObj.username || (u.username ? u.username : `user-${String(u._id).slice(-6)}`);
      setObj.role = 'patient'; // enforce role
      setObj.active = (u.active !== undefined) ? !!u.active : true;
      setObj.createdBy = u._id; // mark who created (mirror)
      setObj.timestamp = new Date();

      ops.push({
        updateOne: {
          filter: { user: u._id },
          update: {
            $set: setObj,
            $setOnInsert: { user: u._id }
          },
          upsert: true
        }
      });

      processed++;

      if (ops.length >= CHUNK_SIZE) {
        // flush chunk
        console.log(`Flushing bulkWrite chunk (${ops.length}) — processed so far: ${processed}`);
        const res = await Patient.bulkWrite(ops, { ordered: false });
        console.log('Chunk result:', {
          matchedCount: res.matchedCount ?? res.nMatched ?? undefined,
          modifiedCount: res.modifiedCount ?? res.nModified ?? undefined,
          upsertedCount: (res.upserted || []).length
        });
        ops = [];
      }
    }

    // flush remaining ops
    if (ops.length > 0) {
      console.log(`Flushing final bulkWrite chunk (${ops.length}) — total processed: ${processed}`);
      const res = await Patient.bulkWrite(ops, { ordered: false });
      console.log('Final chunk result:', {
        matchedCount: res.matchedCount ?? res.nMatched ?? undefined,
        modifiedCount: res.modifiedCount ?? res.nModified ?? undefined,
        upsertedCount: (res.upserted || []).length
      });
    }

    const totalPatients = await Patient.countDocuments().exec();
    console.log(`Sync finished. Processed users: ${processed}. Patient docs total: ${totalPatients}`);

    clearTimeout(wd);
  } catch (err) {
    console.error('Sync failed with error:', err);
    clearTimeout(wd);
    throw err;
  } finally {
    try {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB.');
    } catch (e) {
      console.warn('Error disconnecting mongoose:', e);
    }
  }
}

// Run once and exit
main()
  .then(() => {
    console.log('syncPatientsFromUsers completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('syncPatientsFromUsers encountered an error:', err);
    process.exit(1);
  });
