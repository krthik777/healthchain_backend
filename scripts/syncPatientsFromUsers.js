// scripts/syncPatientsFromUsers.js
/**
 * Usage:
 *   MONGO_URI='mongodb://...' node scripts/syncPatientsFromUsers.js
 *
 * Options:
 *   Set USE_TXN=false to avoid transactions (for standalone mongod).
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Patient = require('../models/Patient');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/yourdb';
const USE_TXN = process.env.USE_TXN !== 'false';

async function main() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to Mongo');

  const users = await User.find({ role: 'patient' }).lean();
  console.log(`Found ${users.length} users with role=patient.`);

  if (users.length === 0) {
    await mongoose.disconnect();
    console.log('Done.');
    return;
  }

  // Build bulk operations (idempotent upserts)
  const ops = users.map(u => {
    // fields to copy; keep consistent with Patient.schema.mirrorableFromUser
    const doc = {
      user: u._id,
      patientId: u.patientId || u._id.toString(),
      username: u.username || u.name || u.patientId || u._id.toString(),
      role: 'patient',
      region: u.region,
      hospital: u.hospital,
      walletAddress: u.walletAddress,
      age: typeof u.age !== 'undefined' ? u.age : undefined,
      dob: u.dob ? new Date(u.dob) : undefined,
      gender: u.gender,
      address: u.address,
      bloodGroup: u.bloodGroup,
      email: u.email,
      phone: u.phone,
      createdBy: u._id, // mark createdBy as user for migration; adjust if needed
      timestamp: new Date().toISOString()
    };

    // remove undefined fields (so we don't overwrite existing with undefined)
    Object.keys(doc).forEach(k => doc[k] === undefined && delete doc[k]);

    return {
      updateOne: {
        filter: { user: u._id },
        update: { $set: doc, $setOnInsert: { active: true } },
        upsert: true
      }
    };
  });

  // Run ops in chunks (to avoid overload)
  const CHUNK = 500;
  try {
    if (USE_TXN && mongoose.connection.readyState === 1) {
      // Try transaction if possible (must be replica set)
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          for (let i = 0; i < ops.length; i += CHUNK) {
            const chunk = ops.slice(i, i + CHUNK);
            await Patient.bulkWrite(chunk, { session });
            console.log(`Upserted chunk ${i}..${i + chunk.length}`);
          }
        });
        console.log('Transaction committed. Migration complete.');
      } finally {
        session.endSession();
      }
    } else {
      // Fallback: no transactions
      for (let i = 0; i < ops.length; i += CHUNK) {
        const chunk = ops.slice(i, i + CHUNK);
        await Patient.bulkWrite(chunk);
        console.log(`Upserted chunk ${i}..${i + chunk.length}`);
      }
      console.log('Bulk upserts complete (no transaction).');
    }
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
