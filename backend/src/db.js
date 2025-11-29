// backend/src/db.js
// Responsible for connecting/disconnecting mongoose.
// Exports: { connect, disconnect, mongoose }

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB = process.env.MONGO_DB || undefined;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI not set in .env');
}

/** internal flag to avoid re-connecting during hot reload */
let connected = false;

async function connect() {
  if (connected && mongoose.connection && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (!MONGO_URI) {
    throw new Error('MONGO_URI missing');
  }

  try {
    await mongoose.connect(MONGO_URI, {
      dbName: MONGO_DB,
      // mongoose options are set automatically on modern mongoose releases
      // add any options you need here
    });
    connected = true;
    console.log(`🍃 MongoDB connected${MONGO_DB ? ` (db: ${MONGO_DB})` : ''}`);
    return mongoose;
  } catch (err) {
    console.error('❌ Mongoose connection error:', err && err.message);
    throw err;
  }
}

async function disconnect() {
  try {
    if (mongoose.connection && mongoose.connection.readyState) {
      await mongoose.connection.close(false);
      connected = false;
      console.log('✅ Mongoose disconnected');
    }
  } catch (err) {
    console.error('❌ Error while disconnecting mongoose:', err && err.message);
    // swallow; caller handles process exit
  }
}

module.exports = { connect, disconnect, mongoose };
